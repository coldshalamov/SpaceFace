import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_SIM_MODES,
  PRODUCTION_UPDATE_ORDER,
  SIM_MODE,
  getDeclaredSystemModeScope,
  getSystemModeScope,
  systemRunsInMode,
  validateSystemModeDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  getStepExecutionStats,
  partitionUpdateSystems,
  resolveActiveSimMode,
  shouldSkipSystemOnCatchup,
  shouldSkipSystemThisStep,
  updateQueueForThisStep,
} from '../src/core/catchupPolicy.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';

test('E3: validateSystemModeDeclarations validates all production update systems', () => {
  const violations = validateSystemModeDeclarations();
  assert.deepEqual(violations, [], 'Production update order must have zero mode declaration violations');
  assert.equal(PRODUCTION_UPDATE_ORDER.length, 220);
  // Only the two states the ordinary route actually steps are scheduling scopes.
  assert.deepEqual([...ALL_SIM_MODES], [SIM_MODE.FLIGHT, SIM_MODE.SWARM]);
});

test('E3: validateSystemModeDeclarations catches missing, invalid, or empty declarations', () => {
  // Test missing declaration
  const fakeUpdateOrder = [...PRODUCTION_UPDATE_ORDER, 'unregisteredMissingSystem'];
  const missingViolations = validateSystemModeDeclarations(fakeUpdateOrder);
  assert.ok(
    missingViolations.some((v) => v.includes('unregisteredMissingSystem') && v.includes('no declared mode scope')),
    'Should report missing declaration for unregistered system in update order',
  );

  // Non-manifest harness names get ALL_SIM_MODES fallback so test stubs work
  assert.equal(getDeclaredSystemModeScope('notARealSystem'), null);
  assert.deepEqual(getSystemModeScope('notARealSystem'), ALL_SIM_MODES);
});

test('E3: systemRunsInMode handles UNSCOPED and specific modes correctly', () => {
  // UNSCOPED mode allows all systems to run
  for (const id of PRODUCTION_UPDATE_ORDER) {
    assert.equal(systemRunsInMode(id, SIM_MODE.UNSCOPED), true);
  }

  // Swarm-only systems only run in SWARM
  assert.equal(systemRunsInMode('survivalArena', SIM_MODE.SWARM), true);
  assert.equal(systemRunsInMode('survivalArena', SIM_MODE.FLIGHT), false);
  assert.equal(systemRunsInMode('survivalArena', SIM_MODE.DOCKED), false);

  // Open flight combat systems run in Flight and Swarm
  assert.equal(systemRunsInMode('weapons', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('weapons', SIM_MODE.SWARM), true);
  assert.equal(systemRunsInMode('weapons', SIM_MODE.DOCKED), false);

  // Adventure economy/services run in flight, but NOT in swarm
  assert.equal(systemRunsInMode('stationServices', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('stationServices', SIM_MODE.SWARM), false);
  assert.equal(systemRunsInMode('missions', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('missions', SIM_MODE.SWARM), false);

  // DOCKED/YARD are frozen labels, not scheduling scopes: no queue runs for them.
  for (const frozen of [SIM_MODE.DOCKED, SIM_MODE.YARD]) {
    assert.equal(ALL_SIM_MODES.includes(frozen), false);
    assert.equal(systemRunsInMode('input', frozen), false);
    assert.equal(systemRunsInMode('physics', frozen), false);
    assert.equal(systemRunsInMode('save', frozen), false);
  }
});

test('E3: resolveActiveSimMode extracts active mode from state accurately', () => {
  // Unscoped / unconfigured
  assert.equal(resolveActiveSimMode(null), SIM_MODE.UNSCOPED);
  assert.equal(resolveActiveSimMode({}), SIM_MODE.UNSCOPED);
  assert.equal(resolveActiveSimMode({ seed: 1, tick: 10 }), SIM_MODE.UNSCOPED);

  // Swarm
  assert.equal(resolveActiveSimMode({ run: { kind: 'survival', phase: 'wave' } }), SIM_MODE.SWARM);
  assert.equal(resolveActiveSimMode({ mode: 'swarm' }), SIM_MODE.SWARM);

  // Docked / yard still resolve so a skip decision can name why nothing runs; neither is a
  // scheduling scope (ALL_SIM_MODES excludes them).
  assert.equal(resolveActiveSimMode({ ui: { docked: true } }), SIM_MODE.DOCKED);
  assert.equal(resolveActiveSimMode({ mode: 'docked' }), SIM_MODE.DOCKED);
  assert.equal(resolveActiveSimMode({ mode: 'shipbreakingYard' }), SIM_MODE.YARD);
  assert.equal(resolveActiveSimMode({ activeOccupation: 'shipbreakingYard' }), SIM_MODE.YARD);
  assert.equal(
    resolveActiveSimMode({ mode: 'flight', shipbreakingYard: { activeJobId: 'job_42' } }),
    SIM_MODE.YARD,
  );

  // Flight
  assert.equal(resolveActiveSimMode({ mode: 'flight' }), SIM_MODE.FLIGHT);
});

test('E3: partitionUpdateSystems pre-builds Flight and Swarm queues preserving relative order', () => {
  function makeStub(name) {
    return { name, update() {} };
  }
  const systems = PRODUCTION_UPDATE_ORDER.map(makeStub);
  const partitions = partitionUpdateSystems(systems);

  assert.ok(partitions.modePartitions, 'partitions must contain modePartitions');
  assert.ok(partitions.modePartitions[SIM_MODE.FLIGHT], 'Flight mode partition exists');
  assert.ok(partitions.modePartitions[SIM_MODE.SWARM], 'Swarm mode partition exists');
  assert.equal(partitions.modePartitions[SIM_MODE.DOCKED], undefined, 'Docked has no queue');
  assert.equal(partitions.modePartitions[SIM_MODE.YARD], undefined, 'Yard has no queue');

  // Swarm mode excludes adventure economy and open flight systems
  const swarmAll = partitions.modePartitions[SIM_MODE.SWARM].all;
  assert.ok(swarmAll.length < systems.length, 'Swarm queue must skip open adventure systems');
  assert.equal(swarmAll.some((s) => s.name === 'survivalWave'), true, 'Survival wave must run in swarm');
  assert.equal(swarmAll.some((s) => s.name === 'weapons'), true, 'Weapons must run in swarm');
  assert.equal(swarmAll.some((s) => s.name === 'missions'), false, 'Missions must not run in swarm');
  assert.equal(swarmAll.some((s) => s.name === 'factions'), false, 'Factions must not run in swarm');

  // Flight mode excludes swarm-only systems
  const flightAll = partitions.modePartitions[SIM_MODE.FLIGHT].all;
  assert.equal(flightAll.some((s) => s.name === 'survivalWave'), false, 'Survival wave must not run in flight');
  assert.equal(flightAll.some((s) => s.name === 'weapons'), true, 'Weapons run in flight');
  assert.equal(flightAll.some((s) => s.name === 'missions'), true, 'Missions run in flight');

  // Relative order verification: in each mode queue, indices must strictly increase vs master order
  for (const mode of ALL_SIM_MODES) {
    const queue = partitions.modePartitions[mode].all;
    let prevIndex = -1;
    for (const sys of queue) {
      const idx = PRODUCTION_UPDATE_ORDER.indexOf(sys.name);
      assert.ok(idx > prevIndex, `Relative order violated for ${sys.name} in mode ${mode}`);
      prevIndex = idx;
    }
  }
});

test('E3: updateQueueForThisStep reports telemetry; getStepExecutionStats stays pure', () => {
  function makeStub(name) {
    return { name, update() {} };
  }
  const systems = PRODUCTION_UPDATE_ORDER.map(makeStub);
  const partitions = partitionUpdateSystems(systems);

  const state = {
    mode: 'flight',
    runtime: { profileId: 'production' },
    tick: 10,
  };

  const queue = updateQueueForThisStep(partitions, state);
  assert.ok(queue.length > 0);
  assert.equal(state.simModeRuntime.mode, SIM_MODE.FLIGHT);
  assert.equal(state.simModeRuntime.activeCount, queue.length);
  assert.equal(state.simModeRuntime.totalCount, systems.length);
  assert.equal(state.simModeRuntime.skippedCount, systems.length - queue.length);

  const initialSimModeRuntimeRef = state.simModeRuntime;

  // The derivation agrees with the reported row, but does not write it.
  assert.deepEqual(getStepExecutionStats(partitions, state), state.simModeRuntime);
  const pureState = { mode: 'flight', runtime: { profileId: 'production' }, tick: 10 };
  const pureStats = getStepExecutionStats(partitions, pureState);
  assert.equal(pureState.simModeRuntime, undefined, 'stats must not create state.simModeRuntime');
  assert.equal(pureStats.mode, SIM_MODE.FLIGHT);
  assert.equal(pureStats.activeCount, queue.length);

  // Transition to Swarm
  state.mode = 'swarm';
  state.run = { kind: 'survival', phase: 'wave' };
  const swarmQueue = updateQueueForThisStep(partitions, state);
  assert.equal(state.simModeRuntime.mode, SIM_MODE.SWARM);
  assert.equal(state.simModeRuntime.activeCount, swarmQueue.length);
  assert.notEqual(swarmQueue.length, queue.length);
  // Verify in-place reuse of simModeRuntime object reference for zero allocation
  assert.equal(state.simModeRuntime, initialSimModeRuntimeRef);

  // Transition back to Flight
  delete state.run;
  state.mode = 'flight';
  const flightQueue = updateQueueForThisStep(partitions, state);
  assert.equal(state.simModeRuntime.mode, SIM_MODE.FLIGHT);
  assert.equal(state.simModeRuntime.activeCount, flightQueue.length);
  assert.equal(state.simModeRuntime, initialSimModeRuntimeRef);
});

test('E3: activity tier counters publish through state.activityRuntime, not a write-only simLOD mirror', () => {
  const state = {
    tick: 1,
    simTime: 1.0,
    playerId: 'p1',
    entities: new Map(),
    entityList: [],
    world: {
      farActors: {
        rows: [
          { id: 'far1', type: 'ship' },
          { id: 'far2', type: 'wreck' },
        ],
      },
    },
  };

  const player = {
    id: 'p1',
    alive: true,
    pos: { x: 0, y: 0 },
    radius: 10,
    type: 'ship',
  };
  state.entities.set('p1', player);
  state.entityList.push(player);

  ensureActivityClassified(state);
  assert.ok(state.activityRuntime, 'activity runtime must publish');
  assert.equal(state.activityRuntime.counts.s0, 1, 'the player is an exact-tier body');
  assert.equal(typeof state.activityRuntime.physicsDynamicCount, 'number');
  assert.equal(state.simLOD, undefined, 'the separate write-only LOD mirror is gone');
});

test('E3: step execution runs smoothly with dynamic mode switching', () => {
  const ran = [];
  function stub(name) {
    return {
      name,
      update(_dt, state) {
        ran.push({ name, mode: state.simModeRuntime?.mode, tick: state.tick | 0 });
      },
    };
  }

  const systems = [
    stub('input'),
    stub('weapons'),
    stub('stationServices'),
    stub('survivalWave'),
    stub('physics'),
  ];
  const partitions = partitionUpdateSystems(systems);
  const state = { runtime: { profileId: 'production' }, tick: 0 };

  // Step 1: flight mode
  state.mode = 'flight';
  let queue = updateQueueForThisStep(partitions, state);
  for (const s of queue) s.update(1 / 60, state);
  const step1Ran = ran.map((r) => r.name);
  assert.deepEqual(step1Ran, ['input', 'weapons', 'stationServices', 'physics'], 'Flight mode excludes survivalWave');

  // Step 2: swarm mode
  ran.length = 0;
  state.mode = 'swarm';
  state.run = { kind: 'survival', phase: 'wave' };
  queue = updateQueueForThisStep(partitions, state);
  for (const s of queue) s.update(1 / 60, state);
  const step2Ran = ran.map((r) => r.name);
  assert.deepEqual(step2Ran, ['input', 'weapons', 'survivalWave', 'physics'], 'Swarm mode excludes stationServices');

  // Step 3: back to flight
  ran.length = 0;
  delete state.run;
  state.mode = 'flight';
  queue = updateQueueForThisStep(partitions, state);
  for (const s of queue) s.update(1 / 60, state);
  assert.deepEqual(ran.map((r) => r.name), ['input', 'weapons', 'stationServices', 'physics']);
});

test('E3: a frozen or unknown mode has one policy — no queue and every system skipped', () => {
  function makeStub(name) {
    return { name, update() {} };
  }
  const systems = PRODUCTION_UPDATE_ORDER.map(makeStub);
  const partitions = partitionUpdateSystems(systems);

  const catchupDockedState = {
    mode: 'docked',
    simCatchupIndex: 1,
    tick: 15,
    runtime: { profileId: 'production' },
  };

  assert.deepEqual(updateQueueForThisStep(partitions, catchupDockedState), [],
    'a frozen/unknown mode dispatches nothing');
  assert.equal(getStepExecutionStats(partitions, catchupDockedState).activeCount, 0);
  // shouldSkip agrees with the empty queue for every system, including table/physics.
  for (const id of ['weapons', 'survivalWave', 'stationServices', 'physics', 'input']) {
    assert.equal(shouldSkipSystemOnCatchup(id, catchupDockedState), true, `${id} must be skipped`);
    assert.equal(shouldSkipSystemThisStep(id, catchupDockedState), true, `${id} must be skipped`);
  }

  // Flight catch-up still runs the full table clock.
  const catchupFlightState = { ...catchupDockedState, mode: 'flight' };
  const queue = updateQueueForThisStep(partitions, catchupFlightState);
  assert.ok(queue.length > 0);
  assert.equal(queue.some((s) => s.name === 'weapons'), true);
  assert.equal(queue.some((s) => s.name === 'survivalWave'), false);
  assert.equal(queue.some((s) => s.name === 'mining'), true);
  assert.equal(queue.some((s) => s.name === 'stationServices'), true);
  assert.equal(queue.some((s) => s.name === 'physics'), true);
  assert.equal(shouldSkipSystemOnCatchup('weapons', catchupFlightState), false);
  assert.equal(shouldSkipSystemOnCatchup('physics', catchupFlightState), false);
});

test('E3: a live Crucible run keeps the Line — combat-flight systems are not skipped in Swarm', () => {
  // Regression for the E3 review's critical finding: a survival run resolves to SWARM, and the
  // Crucible's whole weapon grammar (latch, tow, throw, slam) lives in the massline family. If
  // those are FLIGHT_ONLY they vanish from the arena while state.mode still reads "flight".
  const liveRun = {
    mode: 'flight',
    run: { kind: 'survival', phase: 'active' },
  };
  assert.equal(resolveActiveSimMode(liveRun), SIM_MODE.SWARM);
  for (const system of [
    'tetherGameplay', 'masslineTelemetry', 'masslineThreats', 'masslineImpacts',
    'masslineSnares', 'masslineThrow', 'masslineImpactDamage', 'lineHeads',
  ]) {
    assert.equal(systemRunsInMode(system, SIM_MODE.SWARM), true, `${system} must run in Swarm`);
    assert.equal(shouldSkipSystemThisStep(system, liveRun), false, `${system} must not be skipped`);
  }
  // Adventure-only verb stays out of the arena.
  assert.equal(shouldSkipSystemThisStep('mining', liveRun), true);
});

test('E3: a mode change is a clock discontinuity — the first resumed calendar call gets fixed dt', () => {
  // Regression for E3 review F2: a skipped Crucible run must not arrive at economy/automation
  // as one 5-minute dt, which would burst-catch-up ~60 economy ticks in a single step.
  const calls = [];
  const economy = { name: 'economy', update(dt) { calls.push(['economy', dt]); } };
  const automation = { name: 'automation', update(dt) { calls.push(['automation', dt]); } };
  const state = { mode: 'flight', runtime: { profileId: 'production' }, simTime: 0, tick: 10 };
  const partitions = partitionUpdateSystems([economy, automation], { state });
  const dt = 1 / 60;

  // Prime both calendar stamps on a normal Flight tick (the partition baseline is simTime 0).
  state.simTime = 0.5;
  updateQueueForThisStep(partitions, state);
  assert.equal(partitions.updateDt(economy, dt, state), 0.5);
  assert.equal(partitions.updateDt(automation, dt, state), 0.5);

  // Enter the Crucible. Neither owner is in the Swarm queue, so neither updateDt runs while the
  // round advances five simulated minutes.
  state.mode = 'flight';
  state.run = { kind: 'survival', phase: 'active' };
  state.tick += 1;
  updateQueueForThisStep(partitions, state);
  assert.deepEqual(updateQueueForThisStep(partitions, state), [], 'economy/automation are not in Swarm');
  state.tick += 5 * 60 * 60;
  state.simTime += 5 * 60;

  // Return to Flight. The first call for each owner is one fixed step, not the run duration.
  delete state.run;
  state.mode = 'flight';
  state.simTime += dt;
  state.tick += 1;
  updateQueueForThisStep(partitions, state);
  assert.equal(partitions.updateDt(economy, dt, state), dt, 'economy must resume at fixed dt');
  assert.equal(partitions.updateDt(automation, dt, state), dt, 'automation must resume at fixed dt');

  // The next real interval is the ordinary calendar clock, not the skipped run.
  state.simTime += 0.5;
  state.tick += 30;
  updateQueueForThisStep(partitions, state);
  assert.equal(partitions.updateDt(economy, dt, state), 0.5);
  assert.equal(partitions.updateDt(automation, dt, state), 0.5);

  // Dispatch through the ordinary queue path too: no owner receives a run-sized dt.
  for (const s of updateQueueForThisStep(partitions, state)) {
    s.update(partitions.updateDt(s, dt, state), state);
  }
  for (const [, seenDt] of calls) assert.ok(seenDt <= 0.5, `unexpected burst dt ${seenDt}`);
});
