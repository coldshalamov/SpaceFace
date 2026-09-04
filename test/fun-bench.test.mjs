// test/fun-bench.test.mjs — PQ-173.00: The Fun Convergence Loop Bench tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeRunHash } from '../scripts/lib/bench/runHash.mjs';
import { simulateCrucibleSwarm } from '../scripts/lib/bench/crucibleBench.mjs';
import { runFlightBench } from '../scripts/lib/bench/flightBench.mjs';
import { runVerbBench } from '../scripts/lib/bench/verbBench.mjs';

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
  assert.equal(typeof run1.metrics.b13Met, 'boolean', 'B13 knock budget verdict is reported');
  assert.equal(run1.metrics.b13Met, run2.metrics.b13Met);
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

test('runVerbBench executes all 7 verb scenarios and hashes identically', async () => {
  const result1 = await runVerbBench({ seeds: [4242] });
  const result2 = await runVerbBench({ seeds: [4242] });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
  assert.equal(result1.runs.length, 7);

  for (let i = 0; i < result1.runs.length; i++) {
    const r1 = result1.runs[i];
    const r2 = result2.runs[i];
    assert.equal(r1.runHash, r2.runHash, `${r1.scenarioId} must produce identical hash on repeat`);
    assert.deepEqual(r1.metrics, r2.metrics, `${r1.scenarioId} metrics must match`);
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
  const run = await simulateCrucibleSwarm({
    arenaId: 'helios_core',
    loadoutId: 'energy_baseline',
    seed: 4242,
    tickCap: 180,
  });

  assert.ok(Array.isArray(run.eventTrace), 'run must expose an eventTrace array');
  assert.ok(run.eventTrace.length > 0, 'eventTrace must not be empty');
  assert.ok(
    run.eventTrace.some((e) => e.type === 'verb:used'),
    'real input.actions / axis transitions must be traced as verb:used',
  );
  assert.equal(run.knockSource, 'physics:impact');
  assert.equal(typeof run.metrics.b13Met, 'boolean', 'an honest false is allowed; never force B13 true');

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
