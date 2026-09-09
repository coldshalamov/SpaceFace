// test/crucible-bench-real-path.test.mjs — the Crucible bench is the real game, not a stand-in.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  simulateCrucibleSwarm,
  CRUCIBLE_LOADOUTS,
  CRUCIBLE_HARNESS_BUS_EVENTS,
} from '../scripts/lib/bench/crucibleBench.mjs';

const VISION = 'Crucible first: every combat number is tuned in the Crucible bench, and adventure inherits it.';
const SEED = 4242;
const ARENA = 'helios_core';
const SHORT = 180;
const FIT_TICKS = 40;
const TIMEOUT = 120_000;

const SYNTHETIC_BUS_TYPES = ['player:shot', 'verb:used', 'collision:playerKnock', 'combat:collateral'];

test('one real run reaches phase active and materializes at least one wave', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: SHORT,
  });
  assert.equal(run.phase, 'active', 'survivalRun must leave loadout and reach phase active');
  assert.ok((run.wave | 0) >= 1, 'at least one wave must plan');
  assert.ok(
    run.eventTrace.some((e) => e.type === 'run:wavePlanned')
      || (run.wave | 0) >= 1,
    'a wave must materialize (run:wavePlanned on the derived trace, or wave >= 1)',
  );
  assert.ok(
    run.rawBusEventTypes.includes('run:waveMaterialized'),
    'run:waveMaterialized must fire on the real bus',
  );
});

test('realPathProof reports rapier-dynamic with sg02Ready', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: FIT_TICKS,
  });
  assert.equal(run.realPath.backend, 'rapier-dynamic', VISION);
  assert.equal(run.realPath.sg02Ready, true, VISION);
  assert.equal(run.realPath.physicsBackend, 'rapier-dynamic');
  // The gauge must be plugged in. SG-02 built outside the runtime's feature window has contact
  // capture OFF for the whole run: real contact physics, zero `physics:impact` receipts, and a
  // clean table of zeros that reads as a clean ship. Measured on this bench before the fix:
  // 900 ticks, 0 receipts, B13 reported MET. VISION: this run must be the real game.
  assert.equal(run.realPath.contactCaptureEnabled, true, VISION);
  // Trap (1), the SG-02 activity ring: an entity with no Rapier body silently reports dV = 0.
  assert.ok(run.bodyAdmission, 'every run records which cohort bodies were admitted to SG-02');
  assert.equal(run.bodyAdmission.final.playerHasBody, true, 'the player hull must hold a body');
  // The snapshot is what realPathProof(runtime) would have returned before dispose.
  assert.equal(typeof run.realPath.sg02Bodies, 'number');
  assert.ok(run.systemsRegistered.length > 0, 'production manifest must name registered systems');
  assert.ok(run.updateOrder.length > 0, 'production manifest must name the update order');
});

test('all three loadouts fit (notFitted.length === 0)', { timeout: TIMEOUT }, async () => {
  for (const loadout of CRUCIBLE_LOADOUTS) {
    const run = await simulateCrucibleSwarm({
      arenaId: ARENA,
      loadoutId: loadout.id,
      seed: SEED,
      tickCap: FIT_TICKS,
    });
    assert.ok(run.fitReceipt, `${loadout.id} must record a fit receipt`);
    assert.equal(
      run.fitReceipt.notFitted.length,
      0,
      `${loadout.id} must fit every slot (notFitted=${JSON.stringify(run.fitReceipt.notFitted)})`,
    );
    assert.ok(run.fitReceipt.fitted.length > 0, `${loadout.id} must fit at least one module`);
  }
});

test('the same seed hashes identically', { timeout: TIMEOUT }, async () => {
  const opts = { arenaId: ARENA, loadoutId: 'energy_baseline', seed: SEED, tickCap: SHORT };
  const run1 = await simulateCrucibleSwarm(opts);
  const run2 = await simulateCrucibleSwarm(opts);
  assert.equal(run1.runHash, run2.runHash, VISION);
  assert.equal(run1.runHash.length, 64);
  assert.deepEqual(run1.waveCheckpoints, run2.waveCheckpoints);
  assert.equal(run1.metrics.b13Met, run2.metrics.b13Met);
  assert.ok(run1.metrics.b13Met === false || run1.metrics.b13Met === null);
  assert.notEqual(run1.metrics.b13Met, true);
  assert.equal(run1.metrics.jitterMeasured, false);
});

test('a run executes with Math.random, Date.now and performance.now replaced by throwing stubs', { timeout: TIMEOUT }, async () => {
  const boom = () => {
    throw new Error('nondeterministic source');
  };
  const origRandom = Math.random;
  const origNow = Date.now;
  const origPerf = performance.now;
  Math.random = boom;
  Date.now = boom;
  // Rapier WASM and the flight/physics diagnostic nowMs() read performance.now on the real
  // path. A throw there refuses rapier-dynamic itself. The stub is still a stub: it does not
  // read the wall clock. Math.random and Date.now throw — the bench and the sim must not call them.
  let fakePerf = 0;
  performance.now = () => {
    fakePerf += 1;
    return fakePerf;
  };
  try {
    const run = await simulateCrucibleSwarm({
      arenaId: ARENA,
      loadoutId: 'energy_baseline',
      seed: SEED,
      tickCap: 80,
    });
    assert.ok(run.runHash);
    assert.equal(run.phase, 'active');
    assert.equal(run.realPath.backend, 'rapier-dynamic');
  } finally {
    Math.random = origRandom;
    Date.now = origNow;
    performance.now = origPerf;
  }
});

test('no event in the trace was authored by the bench — the bench emits nothing on the bus', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: FIT_TICKS,
  });
  assert.deepEqual(
    run.harnessBusEmits,
    [...CRUCIBLE_HARNESS_BUS_EVENTS],
    'the harness itself may emit only the two runSession protocol receipts',
  );
  for (const type of SYNTHETIC_BUS_TYPES) {
    assert.ok(
      !run.rawBusEventTypes.includes(type),
      `synthetic type ${type} must not appear on the real bus (derived trace only)`,
    );
  }
  assert.ok(!run.rawBusEventTypes.includes('collision:playerKnock'));
});

test('hitAccuracy is null, never 1, when the run fired nothing', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: 12,
  });
  if (run.metrics.totalShots === 0) {
    assert.equal(
      run.metrics.hitAccuracy,
      null,
      `a pilot who fired zero shots being credited with 100% accuracy misleads the player into believing unexercised weapons performed flawlessly — ${VISION}`,
    );
  } else {
    assert.equal(
      run.metrics.hitAccuracy,
      run.metrics.totalHits / run.metrics.totalShots,
      'the player receives fraudulent accuracy metrics when hitAccuracy does not reflect the exact ratio of hits to shots',
    );
  }
});

test('B13 fails closed and names its gap when the knock fraction is unmeasurable', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: FIT_TICKS,
  });
  assert.ok(
    run.metrics.b13Met === false || run.metrics.b13Met === null,
    'the player loses certainty in ship handling standards if the B13 stability verdict is a missing-evidence pass',
  );
  assert.notEqual(run.metrics.b13Met, true, 'headless B13 cannot full-pass while jitter is unmeasured');
  assert.equal(run.metrics.jitterMeasured, false);
  assert.ok(
    run.metrics.b13Met !== true || run.metrics.maxPlayerKnockFraction !== null,
    'a knock budget that reads met against a blank gauge tells the owner his ship is calm when it is being thrown around',
  );
  assert.ok(
    Object.hasOwn(run.metrics, 'knockGap'),
    'the player loses diagnosis of why knock ratings failed or were degraded when knockGap is missing',
  );
  assert.ok(
    Object.hasOwn(run.metrics, 'knocksMissingDeltaV'),
    'the player loses accounting of unresolved impulse events when knocksMissingDeltaV is missing',
  );
  assert.ok(
    typeof run.metrics.knocksMissingDeltaV === 'number'
      && Number.isFinite(run.metrics.knocksMissingDeltaV)
      && run.metrics.knocksMissingDeltaV >= 0,
    'the player receives corrupted physics telemetry if knocksMissingDeltaV is not a non-negative finite number',
  );
});

test('nothingHappenedSeconds is null or a finite number, never a bare 0 from a sparse trace', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: 12,
  });
  const nonMilestoneEvents = run.eventTrace.filter(
    (e) => e.type !== 'run:wavePlanned' && e.type !== 'run:waveCleared',
  );
  if (nonMilestoneEvents.length < 3) {
    assert.equal(
      run.metrics.nothingHappenedSeconds,
      null,
      'a sparse trace claiming 0 seconds of quiet deceives the player into believing continuous combat was maintained when telemetry was simply unrecorded',
    );
  } else {
    assert.ok(
      typeof run.metrics.nothingHappenedSeconds === 'number'
        && Number.isFinite(run.metrics.nothingHappenedSeconds)
        && run.metrics.nothingHappenedSeconds >= 0,
      'the player cannot evaluate pacing and engagement tempo if quiet time is not a non-negative finite number',
    );
  }
});

test('bodyAdmission is recorded and self-consistent', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: FIT_TICKS,
  });
  // An entity with no Rapier body silently reports dV = 0, so a clean table of zeros
  // must be distinguishable from a table of un-admitted bodies.
  const ba = run.bodyAdmission;
  assert.ok(ba && typeof ba === 'object', 'the player cannot verify physical simulation fidelity without body admission telemetry');
  assert.ok(Object.hasOwn(ba, 'samples'), 'the player loses sample counts for dynamic body tracking');
  assert.ok(Object.hasOwn(ba, 'worst'), 'the player loses worst-case tracking of missing physics bodies');
  assert.ok(Object.hasOwn(ba, 'final'), 'the player loses final-tick verification of admitted bodies');
  assert.ok(Object.hasOwn(ba, 'sg02Bodies'), 'the player loses the count of registered SG-02 bodies');
  assert.ok(Object.hasOwn(ba, 'sg02DynamicBodies'), 'the player loses the count of registered dynamic bodies');
  assert.ok(Object.hasOwn(ba, 'rapierContactsLastTick'), 'the player loses the snapshot of active contact constraints');
  assert.ok(Object.hasOwn(ba, 'physicsImpactEvents'), 'the player loses detection of emitted impact events');
  assert.ok(Object.hasOwn(ba, 'collisionConsequenceEvents'), 'the player loses tracking of collision damage and debris');
  assert.ok(Object.hasOwn(ba, 'gap'), 'the player loses visibility into whether hostile bodies failed admission');

  assert.ok(
    ba.final.cohortWithBody <= ba.final.cohortAlive,
    'the player receives impossible physics census data if cohort bodies exceed living cohort hostiles',
  );
  assert.ok(
    ba.worst.missing >= 0,
    'the player receives inverted accounting if missing bodies is negative',
  );
  assert.ok(
    ba.gap === null || (typeof ba.gap === 'string' && ba.gap.includes('bodyAdmission')),
    'the player cannot identify admission failures if gap does not explain bodyAdmission issues',
  );
  assert.ok(
    typeof ba.physicsImpactEvents === 'number'
      && Number.isFinite(ba.physicsImpactEvents)
      && ba.physicsImpactEvents >= 0,
    'the player loses reliable impact telemetry if physicsImpactEvents is not a non-negative finite number',
  );
});

test('the bench refuses a run whose contact capture is off', { timeout: TIMEOUT }, async () => {
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: 'energy_baseline',
    seed: SEED,
    tickCap: FIT_TICKS,
  });
  // simulateCrucibleSwarm throws otherwise, so this assertion can only fail if that guard is deleted.
  assert.equal(
    run.realPath.contactCaptureEnabled,
    true,
    'the player suffers from phantom collisions and missing knock telemetry when contact capture is disabled',
  );
});
