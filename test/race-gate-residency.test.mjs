import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';
import { stageRacingLaunch, completeRacingLaunch } from '../src/ui/racingLaunch.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';

const SEED = 2327391364;

async function bootProductionRace() {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: SEED,
  });
  const staged = stageRacingLaunch('contract_textile_qual');
  assert.ok(staged, 'the fixed-seed production route must stage the authored circuit');
  const registry = { get: name => runtime.getSystem(name) };
  const boot = await runNewGameSimBoot({
    state: runtime.state,
    helpers: runtime.getHelpers(),
    bus: runtime.bus,
    registry,
    opts: { seed: staged.seed, racingSession: true },
    awaitPhysicsPrep: true,
  });
  assert.equal(boot.ok, true);
  runtime.state.mode = 'flight';
  const launch = await completeRacingLaunch({
    state: runtime.state,
    bus: runtime.bus,
    registry,
    helpers: runtime.getHelpers(),
  });
  assert.equal(launch.ok, true);
  const mission = runtime.state.missions.active.find(row => row && row.type === 'race');
  assert.ok(mission, 'the production route must own an active race mission');
  return { runtime, mission };
}

function ownedRaceGates(state, missionId) {
  return state.entityList.filter(entity => entity && entity.alive !== false
    && entity.type === 'beacon'
    && entity.data?.physicalRole === 'race_gate'
    && String(entity.data?.missionTag) === String(missionId));
}

function dynamicBodyCount(state) {
  return ensureActivityClassified(state).physicsDynamics.length;
}

test('production race gates stay resident through retries and Continue-style repair', async () => {
  const { runtime, mission } = await bootProductionRace();
  const { state } = runtime;
  const missions = runtime.getSystem('missions');
  try {
    const initialGates = ownedRaceGates(state, mission.id);
    const initialIds = initialGates.map(entity => entity.id);
    const initialDynamicBodies = dynamicBodyCount(state);
    assert.equal(initialGates.length, 15, 'the authored closed circuit has 15 visible gates');
    assert.deepEqual(mission.targetEntityIds, initialIds);
    assert.ok(initialGates.every(entity => entity.physicsBody === false));

    // Missions retries run every 15 ticks. The old adoption path omitted beacons, adding a new
    // fifteen-body batch on every retry; this is a production route check over five seconds.
    runtime.runTicks(300, 1 / 60);
    const afterRetries = ownedRaceGates(state, mission.id);
    const finalDynamicBodies = dynamicBodyCount(state);
    assert.equal(afterRetries.length, 15);
    assert.deepEqual(afterRetries.map(entity => entity.id), initialIds,
      'retry adoption must preserve each gate identity');
    assert.deepEqual(mission.targetEntityIds, initialIds);
    assert.ok(afterRetries.every(entity => entity.physicsBody === false && entity._physicsPartition === 0),
      'race markers must stay out of the native body partition');
    assert.ok(finalDynamicBodies <= initialDynamicBodies + 64,
      `retry bodies grew from ${initialDynamicBodies} to ${finalDynamicBodies}`);

    // Simulate a Continue payload that clears the mission id list while world entities remain
    // materialized. The beacon domain must recover them without spawning replacements.
    mission.targetEntityIds = [];
    missions._ensureMissionTargets(mission);
    assert.deepEqual(mission.targetEntityIds, initialIds,
      'empty loaded target ids must reattach exact mission-tagged gates');
    assert.equal(ownedRaceGates(state, mission.id).length, 15);

    // A durable row can carry its world record while a legacy payload omitted identityKey. The
    // explicit raceGateIndex still occupies the slot, so this repair must not respawn its buoy.
    delete state.entities.get(initialIds[1]).data.identityKey;
    mission.targetEntityIds = [];
    missions._ensureMissionTargets(mission);
    assert.deepEqual(mission.targetEntityIds, initialIds);
    assert.equal(ownedRaceGates(state, mission.id).length, 15);

    // A malformed loaded duplicate is retired only when both missionTag and physicalRole match;
    // a foreign beacon at the same gate index remains a live world object.
    const canonical = state.entities.get(initialIds[0]);
    const duplicate = runtime.spawn({
      type: 'beacon',
      team: 2,
      pos: { ...canonical.pos },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: canonical.radius,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      collides: false,
      flags: { missionPinned: true, durable: true },
      data: {
        missionTag: mission.id,
        missionId: mission.id,
        physicalRole: 'race_gate',
        raceGateIndex: 0,
        gateCount: mission.params.gates.length,
      },
    });
    const foreign = runtime.spawn({
      type: 'beacon',
      team: 2,
      pos: { ...canonical.pos },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: canonical.radius,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      collides: false,
      physicsBody: false,
      flags: { missionPinned: true, durable: true },
      data: {
        missionTag: 'foreign-race',
        missionId: 'foreign-race',
        physicalRole: 'race_gate',
        raceGateIndex: 0,
        gateCount: mission.params.gates.length,
      },
    });
    mission.targetEntityIds = [canonical.id, duplicate.id];
    missions._ensureMissionTargets(mission);
    assert.equal(duplicate.alive, false, 'owned duplicate gate must be retired');
    assert.equal(state.entities.has(duplicate.id), false);
    assert.equal(foreign.alive, true, 'foreign beacon must not be retired by gate cleanup');
    assert.equal(state.entities.get(canonical.id), canonical);
    assert.equal(mission.targetEntityIds[0], canonical.id);
    assert.equal(ownedRaceGates(state, mission.id).length, 15);
  } finally {
    runtime.dispose();
  }
});
