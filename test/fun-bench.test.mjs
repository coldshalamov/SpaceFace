// test/fun-bench.test.mjs — PQ-173.00: The Fun Convergence Loop Bench tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeRunHash } from '../scripts/lib/bench/runHash.mjs';
import { simulateCrucibleSwarm, buildKnockEvents, verifyCrucibleDeterminism } from '../scripts/lib/bench/crucibleBench.mjs';
import { runFlightBench } from '../scripts/lib/bench/flightBench.mjs';
import { runVerbBench, listVerbScenarios, VERB_BENCH_SCENARIOS } from '../scripts/lib/bench/verbBench.mjs';

test('computeRunHash generates bit-identical SHA-256 hashes for identical inputs', () => {
  const payloadA = {
    config: { bench: 'crucible', ruleset: 'swarm', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, waveCount: 3 },
    waveCheckpoints: ['hash1', 'hash2', 'hash3'],
    eventTrace: [{ tick: 1, type: 'spawn', data: { x: 10, z: 20 } }],
    metrics: { kills: 71, vpm: 10.0, knockBudgetMet: true },
  };

  const payloadB = {
    config: { bench: 'crucible', ruleset: 'swarm', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, waveCount: 3 },
    waveCheckpoints: ['hash1', 'hash2', 'hash3'],
    eventTrace: [{ tick: 1, type: 'spawn', data: { x: 10, z: 20 } }],
    metrics: { kills: 71, vpm: 10.0, knockBudgetMet: true },
  };

  const resA = computeRunHash(payloadA);
  const resB = computeRunHash(payloadB);

  assert.equal(resA.runHash, resB.runHash, 'Hashes must be bit-identical');
  assert.equal(resA.runHash.length, 64, 'Run hash must be 64-character hex SHA-256');
  assert.deepEqual(resA.runManifest, resB.runManifest, 'Manifests must match');
});

test('simulateCrucibleSwarm is deterministic across duplicate runs of the same seed', { timeout: 120_000 }, async () => {
  const opts = { arenaId: 'helios_core', loadoutId: 'energy_baseline', seed: 4242, tickCap: 180 };
  const run1 = await simulateCrucibleSwarm(opts);
  const run2 = await simulateCrucibleSwarm(opts);

  assert.equal(
    run1.runHash,
    run2.runHash,
    'Crucible first: every combat number is tuned in the Crucible bench, and adventure inherits it.',
  );
  assert.deepEqual(run1.waveCheckpoints, run2.waveCheckpoints, 'Wave checkpoints must match');
  assert.ok(run1.metrics.b13Met === false || run1.metrics.b13Met === null, 'full B13 is false or undecidable, never a missing-evidence pass');
  assert.notEqual(run1.metrics.b13Met, true, 'headless Crucible cannot emit a full B13 pass');
  assert.equal(run1.metrics.b13Met, run2.metrics.b13Met);
  assert.equal(run1.metrics.jitterMeasured, false);
  assert.equal(run1.stopReason, run2.stopReason);
  assert.equal(run1.ticks, run2.ticks);
});

test('runFlightBench executes all 4 motion lab scenarios and hashes identically', async () => {
  const result1 = await runFlightBench({ seeds: [13502] });
  const result2 = await runFlightBench({ seeds: [13502] });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
  assert.equal(result1.runs.length, 4);

  for (let i = 0; i < result1.runs.length; i++) {
    const r1 = result1.runs[i];
    const r2 = result2.runs[i];
    assert.equal(r1.runHash, r2.runHash, `${r1.scenarioId} must produce identical hash on repeat`);
    assert.deepEqual(r1.metrics, r2.metrics, `${r1.scenarioId} metrics must match`);
  }
});

test('runVerbBench executes the inline verb scenarios and hashes identically; discovered modules append', async () => {
  // The inline scenarios run in milliseconds; discovered scenario modules (scripts/lib/bench/
  // scenarios/*.mjs) may boot the real runtime and take minutes, so the full default sweep is
  // not repeated here — the measurer's own end-to-end runs exercise it.
  const inlineIds = VERB_BENCH_SCENARIOS.map((s) => s.id);
  const result1 = await runVerbBench({ seeds: [4242], scenarioIds: inlineIds });
  const result2 = await runVerbBench({ seeds: [4242], scenarioIds: inlineIds });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
  assert.equal(result1.runs.length, inlineIds.length);

  for (let i = 0; i < result1.runs.length; i++) {
    const r1 = result1.runs[i];
    const r2 = result2.runs[i];
    assert.equal(r1.runHash, r2.runHash, `${r1.scenarioId} must produce identical hash on repeat`);
    assert.deepEqual(r1.metrics, r2.metrics, `${r1.scenarioId} metrics must match`);
  }

  // The drop-in seam: discovered modules merge over the inline list (override by id, new ids
  // append) with unique ids and a runnable seed entrypoint.
  const all = await listVerbScenarios();
  assert.ok(all.length >= inlineIds.length, 'discovered modules must never shrink the scenario list');
  assert.equal(new Set(all.map((s) => s.id)).size, all.length, 'scenario ids must stay unique');
  for (const scenario of all) {
    const runnable = typeof scenario.run === 'function' || inlineIds.includes(scenario.id);
    assert.ok(runnable, `${scenario.id} must expose run(seed) or be an inline scenario`);
  }
});

test('feel.knock_budget is deterministic: metrics deepEqual and identical runHash across repeats', async () => {
  const result1 = await runVerbBench({ seeds: [4242], scenarioIds: ['feel.knock_budget'] });
  const result2 = await runVerbBench({ seeds: [4242], scenarioIds: ['feel.knock_budget'] });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
  assert.equal(result1.runs.length, 1);
  assert.equal(result1.runs[0].scenarioId, 'feel.knock_budget');
  assert.equal(result1.runs[0].runHash.length, 64, 'Run hash must be 64-character hex SHA-256');
  assert.deepEqual(result1.runs[0].metrics, result2.runs[0].metrics, 'Knock metrics must match on repeat');
  assert.equal(
    result1.runs[0].runHash,
    result2.runs[0].runHash,
    'Knock scenario must hash identically on repeat (computeRunHash over identical trace+metrics)',
  );
});

test('feel.knock_budget metrics are finite, non-negative, and barMet matches the B13 threshold formula', async () => {
  const result = await runVerbBench({ seeds: [4242], scenarioIds: ['feel.knock_budget'] });
  const m = result.runs[0].metrics;

  for (const key of [
    'cruiseSpeed',
    'playerMass',
    'simSeconds',
    'contactEncounters',
    'knockEventsPerMinute',
    'maxKnockDeltaVFractionOfCruise',
    'headingChangeEvents',
  ]) {
    assert.equal(typeof m[key], 'number', `${key} must be a number`);
    assert.ok(Number.isFinite(m[key]), `${key} must be a finite number`);
  }
  // The suite runs the short knock module; the contract's ten-minute case is feel.knock_budget_10min.
  assert.ok(Number.isFinite(m.simSeconds) && m.simSeconds > 0, 'knock budget reports its simulated seconds');
  assert.ok(m.knockEventsPerMinute >= 0, 'knockEventsPerMinute must be >= 0');
  assert.ok(m.maxKnockDeltaVFractionOfCruise >= 0, 'maxKnockDeltaVFractionOfCruise must be >= 0');
  assert.ok(m.headingChangeEvents >= 0, 'headingChangeEvents must be >= 0');
  assert.equal(typeof m.barMet, 'boolean', 'barMet must be a boolean');
  assert.equal(
    m.barMet,
    m.knockEventsPerMinute <= 2 && m.maxKnockDeltaVFractionOfCruise <= 0.10 && m.headingChangeEvents === 0,
    'barMet must equal the pinned B13 threshold formula',
  );
});

test('simulateCrucibleSwarm exposes eventTrace derived from the real bus, not a stand-in', { timeout: 120_000 }, async () => {
  // tickCap is this assertion's observation window, not a bar. What is being pinned is the
  // provenance of the trace — it comes off the real bus, not a stand-in loop. PQ-137.03 halved the
  // flight speed table, which moved the scripted pilot's first traced verb from inside the old
  // 180-tick window out to tick 225 (`brake`, measured on this seed at HEAD). 300 ticks covers it
  // with margin. This is not a "verb within 3 s" bar: over 600 ticks this pilot emits exactly one
  // traced verb, so no such bar was ever being held here. The assertion can still fail — a
  // stand-in trace emits no verb:used at any cap.
  const run = await simulateCrucibleSwarm({
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    tickCap: 300,
  });

  assert.ok(Array.isArray(run.eventTrace), 'run must expose an eventTrace array');
  assert.ok(run.eventTrace.length > 0, 'eventTrace must not be empty');
  assert.ok(
    run.eventTrace.some((e) => e.type === 'verb:used'),
    'real input.actions / axis transitions must be traced as verb:used',
  );
  assert.equal(run.knockSource, 'physics:impact');
  assert.ok(run.metrics.b13Met === false || run.metrics.b13Met === null, 'an honest false/undecidable is allowed; never force B13 true');
  assert.notEqual(run.metrics.b13Met, true, 'headless jitter cannot full-pass B13');
  assert.equal(run.metrics.jitterMeasured, false, 'headless crucible does not claim a visible-jitter measurement');

  for (const event of run.eventTrace) {
    if (event.type === 'entity:killed') {
      assert.equal(typeof event.data.cause, 'string', 'kill cause is recorded, not pinned to a stand-in weapon loop');
    }
    if (event.type === 'collision:playerKnock') {
      assert.ok(Object.hasOwn(event.data, 'deltaV'));
      assert.ok(Object.hasOwn(event.data, 'deltaVFractionOfCruise'));
      assert.ok(Object.hasOwn(event.data, 'headingChangeRad'));
    }
  }
});

function knockReceipt(tick, data) {
  return { tick, type: 'collision:playerKnock', data };
}

function liveHostileData(playerId, actorId, extra = {}) {
  return {
    deltaV: 8,
    headingChangeRad: 0,
    causalActorId: actorId,
    actorLiveCohortHostile: true,
    actorInCohort: true,
    aiPhase: { tick: 18, phase: 'attack', maneuverKind: 'ram', targetId: playerId, doctrineId: 'ram' },
    aiTelegraph: {
      tick: 10, kind: 'ram', durationTicks: 30, targetId: playerId, phase: 'attack', doctrineId: 'ram',
    },
    ...extra,
  };
}

test('Rapier receipt ticks of one contact coalesce; a later intent snapshot cannot rewrite an earlier collision', () => {
  const playerId = 1;
  const actorId = 7;
  const cruiseSpeed = 100;
  const consecutive = buildKnockEvents([
    knockReceipt(10, { deltaV: 2, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: false }),
    knockReceipt(12, { deltaV: 3, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: false }),
    knockReceipt(13, { deltaV: 1, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: false }),
  ], { playerId, cruiseSpeed });
  assert.equal(consecutive.length, 1, 'receipts a few ticks apart are one physical contact');
  assert.equal(consecutive[0].receipts, 3);
  assert.equal(consecutive[0].deltaV, 6);
  assert.equal(consecutive[0].hostileInitiated, false, 'unattributed/non-engaging contact stays ambient');

  const farApart = buildKnockEvents([
    knockReceipt(10, { deltaV: 2, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: false }),
    knockReceipt(80, { deltaV: 2, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: false }),
  ], { playerId, cruiseSpeed });
  assert.equal(farApart.length, 2, 'a long quiet gap is a second contact, not one event');

  const engagingThenRetarget = buildKnockEvents([
    knockReceipt(20, liveHostileData(playerId, actorId)),
    knockReceipt(200, liveHostileData(playerId, actorId, {
      deltaV: 4,
      aiPhase: { tick: 180, phase: 'hold', maneuverKind: null, targetId: 99, doctrineId: 'hold' },
      aiTelegraph: { tick: 180, kind: 'hold', durationTicks: 20, targetId: 99, phase: 'hold' },
    })),
  ], { playerId, cruiseSpeed });
  assert.equal(engagingThenRetarget.length, 2);
  assert.equal(engagingThenRetarget[0].hostileInitiated, true, 'event-time engaging snapshot is a hostile ram');
  assert.equal(engagingThenRetarget[1].hostileInitiated, false, 'a later retarget must not rewrite the earlier ram, nor classify a later idle contact as a ram');

  const idleThenLaterEngage = buildKnockEvents([
    knockReceipt(20, {
      deltaV: 5, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: true,
      aiPhase: { tick: 5, phase: 'hold', targetId: null },
    }),
  ], { playerId, cruiseSpeed });
  assert.equal(idleThenLaterEngage[0].hostileInitiated, false, 'an idle snapshot at the event is ambient even if the actor later engages');

  const hole = buildKnockEvents([
    knockReceipt(10, { deltaV: null, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: false }),
  ], { playerId, cruiseSpeed });
  assert.equal(hole[0].missingDeltaV, true);
  assert.equal(hole[0].deltaVFractionOfCruise, null, 'a missing delta-V is a gap, not a flattering zero fraction');
});

test('dead, stale, mixed, and partially unknown receipts stay ambient; later intent cannot rewrite', () => {
  const playerId = 1;
  const actorId = 7;
  const cruiseSpeed = 100;

  const dead = buildKnockEvents([
    knockReceipt(20, liveHostileData(playerId, actorId, { actorLiveCohortHostile: false, actorInCohort: true })),
  ], { playerId, cruiseSpeed });
  assert.equal(dead[0].hostileInitiated, false, 'a dead/wreck actor that was once in the cohort stays ambient');

  const mixedActors = buildKnockEvents([
    knockReceipt(10, liveHostileData(playerId, actorId, { deltaV: 2 })),
    knockReceipt(12, liveHostileData(playerId, 99, { deltaV: 2 })),
  ], { playerId, cruiseSpeed });
  assert.equal(mixedActors.length, 1);
  assert.equal(mixedActors[0].hostileInitiated, false, 'mixed-actor coalesced contact stays ambient');
  assert.equal(mixedActors[0].causalActorId, actorId, 'first receipt identity is kept; later actor does not replace it');

  const partialUnknown = buildKnockEvents([
    knockReceipt(10, { deltaV: 2, headingChangeRad: 0, causalActorId: null, actorLiveCohortHostile: false }),
    knockReceipt(12, liveHostileData(playerId, actorId, { deltaV: 3 })),
  ], { playerId, cruiseSpeed });
  assert.equal(partialUnknown.length, 1);
  assert.equal(partialUnknown[0].hostileInitiated, false, 'partially unattributed contact stays ambient');
  assert.equal(partialUnknown[0].causalActorId, null, 'a later hostile receipt must not fill an earlier unknown actor');

  const laterIntent = buildKnockEvents([
    knockReceipt(10, {
      deltaV: 4, headingChangeRad: 0, causalActorId: actorId, actorLiveCohortHostile: true,
      aiPhase: { tick: 1, phase: 'hold', targetId: null },
    }),
    knockReceipt(12, liveHostileData(playerId, actorId, { deltaV: 4 })),
  ], { playerId, cruiseSpeed });
  assert.equal(laterIntent[0].hostileInitiated, false, 'later player-targeted intent cannot rewrite an earlier idle receipt');
  assert.equal(laterIntent[0].aiPhase && laterIntent[0].aiPhase.targetId, null);
});

test('a shoulder graze with forward held is NOT a slam the player chose; an aimed, held slam is', () => {
  // "A controllable mass, not a cursor." B13 exempts a deliberate big event — a slam the player
  // chose — and nothing else. A bare "the player was pushing somewhat that way" exemption would
  // wave through the exact contact the bar exists for: a graze past a rock with forward held.
  const playerId = 1;
  const cruiseSpeed = 100;
  const chosen = (tick, extra = {}) => knockReceipt(tick, {
    deltaV: 1,
    appliedDeltaV: 1,
    headingChangeRad: 0,
    causalActorId: playerId,
    actorLiveCohortHostile: false,
    otherId: 42,
    thrustIntoOther: 0.9,
    preSolveClosingSpeed: 1,
    ...extra,
  });
  const span = (ticks, extra) => {
    const out = [];
    for (let t = 0; t < ticks; t += 5) out.push(chosen(10 + t, extra));
    out.push(chosen(10 + ticks - 1, extra));
    return out;
  };

  // A shoulder graze: the player is going PAST the rock, not into it, and it lasts a moment.
  const graze = buildKnockEvents(span(10, { thrustIntoOther: 0.5 }), { playerId, cruiseSpeed });
  assert.equal(graze.length, 1);
  assert.equal(graze[0].playerInitiated, false, 'a graze past a rock with forward held is ordinary flight, not a chosen slam');
  assert.equal(graze[0].deliberateAudit.aimedAndHeld, false);
  assert.equal(graze[0].deliberateAudit.thrustIntoOtherDot, 0.5, 'the dot is published so the exemption is auditable');

  // Aimed straight at it, but let go after a few ticks: still not a slam.
  const brief = buildKnockEvents(span(10), { playerId, cruiseSpeed });
  assert.equal(brief[0].playerInitiated, false, 'aim without hold is a bump, not a slam the player chose');
  assert.equal(brief[0].deliberateAudit.ticks < 30, true);

  // Aimed straight at it and held for more than half a second: the player meant this.
  const slam = buildKnockEvents(span(40), { playerId, cruiseSpeed });
  assert.equal(slam.length, 1, 'receipts inside the bridge are one contact');
  assert.equal(slam[0].playerInitiated, true, 'aimed and held for half a second is a slam the player chose');
  assert.equal(slam[0].deliberateAudit.verdict, 'playerInitiated:aimed+held');

  // Fast enough that nothing else explains it: a chosen ram, whatever the stick was doing.
  const ram = buildKnockEvents(span(10, { thrustIntoOther: 0, preSolveClosingSpeed: 35 }), { playerId, cruiseSpeed });
  assert.equal(ram[0].playerInitiated, true, 'closing at 35 % of cruise is a ram the player flew');
  assert.equal(ram[0].deliberateAudit.verdict, 'playerInitiated:ram');
  assert.equal(ram[0].deliberateAudit.closingFractionOfCruise, 0.35);

  // Fail-closed: an aimed, held contact the player did not cause is still ambient.
  const notMine = buildKnockEvents(span(40, { causalActorId: 77 }), { playerId, cruiseSpeed });
  assert.equal(notMine[0].playerInitiated, false, 'a contact the player did not cause is never a slam they chose');
  assert.equal(notMine[0].deliberateAudit.allPlayerCaused, false);
});

test('same-tick heading is counted once; opposite per-tick rotations cannot cancel the heading clause', () => {
  const playerId = 1;
  const cruiseSpeed = 100;
  const sameTick = buildKnockEvents([
    knockReceipt(10, { deltaV: 1, headingChangeRad: 0.2, causalActorId: null }),
    knockReceipt(10, { deltaV: 1, headingChangeRad: 0.2, causalActorId: null }),
  ], { playerId, cruiseSpeed });
  assert.equal(sameTick.length, 1);
  assert.equal(sameTick[0].receipts, 2);
  assert.ok(Math.abs(sameTick[0].headingChangeRad - 0.2) < 1e-9, 'same-tick rotation is recorded once, not summed');
  assert.equal(sameTick[0].headingChanged, true);

  const opposite = buildKnockEvents([
    knockReceipt(10, { deltaV: 1, headingChangeRad: 0.25, causalActorId: null }),
    knockReceipt(12, { deltaV: 1, headingChangeRad: -0.25, causalActorId: null }),
  ], { playerId, cruiseSpeed });
  assert.equal(opposite.length, 1);
  assert.ok(Math.abs(opposite[0].headingChangeRad) < 1e-6, 'net wrapped rotation may cancel (informational)');
  assert.equal(opposite[0].headingChanged, true, 'any per-tick abs rotation above epsilon is a heading change');

  const missing = buildKnockEvents([
    knockReceipt(10, { deltaV: 1, headingChangeRad: 0, causalActorId: null }),
    knockReceipt(11, { deltaV: 1, headingChangeRad: null, causalActorId: null }),
  ], { playerId, cruiseSpeed });
  assert.equal(missing[0].missingHeading, true);
  assert.equal(missing[0].headingChanged, null);
  assert.equal(missing[0].headingChangeRad, null, 'missing heading on any constituent fails closed');
});

test('same candidate+seed+cell hashes identically across a fresh process', { timeout: 120_000 }, async () => {
  const result = await verifyCrucibleDeterminism({
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    tickCap: 80,
  });
  assert.equal(result.identical, true, `parent ${result.hashA} vs child ${result.hashB}`);
  assert.equal(result.hashA, result.hashB);
  assert.equal(result.ticksA, result.ticksB);
});
