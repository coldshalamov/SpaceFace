import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  ALL_SIM_MODES,
  PRODUCTION_UPDATE_ORDER,
  SIM_MODE,
  SYSTEM_MODE_DECLARATIONS,
  getDeclaredSystemModeScope,
  getSystemModeScope,
  systemRunsInMode,
  validateSystemModeDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  getStepExecutionStats,
  partitionUpdateSystems,
  resolveActiveSimMode,
  shouldSkipSystemThisStep,
  updateQueueForThisStep,
} from '../src/core/catchupPolicy.js';
import {
  ensureActivityClassified,
  getSimulationLODTelemetry,
} from '../src/world/activityRuntime.js';

test('E3: validateSystemModeDeclarations validates all production update systems', () => {
  const violations = validateSystemModeDeclarations();
  assert.deepEqual(violations, [], 'Production update order must have zero mode declaration violations');
  assert.equal(PRODUCTION_UPDATE_ORDER.length, 220);
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

  // Open flight combat systems do not run when DOCKED
  assert.equal(systemRunsInMode('weapons', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('weapons', SIM_MODE.SWARM), true);
  assert.equal(systemRunsInMode('weapons', SIM_MODE.DOCKED), false);

  // Adventure economy/services run in flight and docked, but NOT in swarm
  assert.equal(systemRunsInMode('stationServices', SIM_MODE.DOCKED), true);
  assert.equal(systemRunsInMode('stationServices', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('stationServices', SIM_MODE.SWARM), false);
  assert.equal(systemRunsInMode('missions', SIM_MODE.DOCKED), true);
  assert.equal(systemRunsInMode('missions', SIM_MODE.SWARM), false);

  // Always-active authorities run across all modes
  assert.equal(systemRunsInMode('input', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('input', SIM_MODE.DOCKED), true);
  assert.equal(systemRunsInMode('input', SIM_MODE.SWARM), true);
  assert.equal(systemRunsInMode('input', SIM_MODE.YARD), true);
  assert.equal(systemRunsInMode('physics', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('physics', SIM_MODE.DOCKED), true);
  assert.equal(systemRunsInMode('physics', SIM_MODE.SWARM), true);
  assert.equal(systemRunsInMode('save', SIM_MODE.FLIGHT), true);
  assert.equal(systemRunsInMode('save', SIM_MODE.SWARM), true);
});

test('E3: resolveActiveSimMode extracts active mode from state accurately', () => {
  // Unscoped / unconfigured
  assert.equal(resolveActiveSimMode(null), SIM_MODE.UNSCOPED);
  assert.equal(resolveActiveSimMode({}), SIM_MODE.UNSCOPED);
  assert.equal(resolveActiveSimMode({ seed: 1, tick: 10 }), SIM_MODE.UNSCOPED);

  // Swarm
  assert.equal(resolveActiveSimMode({ run: { kind: 'survival', phase: 'wave' } }), SIM_MODE.SWARM);
  assert.equal(resolveActiveSimMode({ mode: 'swarm' }), SIM_MODE.SWARM);

  // Docked
  assert.equal(resolveActiveSimMode({ ui: { docked: true } }), SIM_MODE.DOCKED);
  assert.equal(resolveActiveSimMode({ mode: 'docked' }), SIM_MODE.DOCKED);

  // Shipbreaking Yard
  assert.equal(resolveActiveSimMode({ mode: 'shipbreakingYard' }), SIM_MODE.YARD);
  assert.equal(resolveActiveSimMode({ activeOccupation: 'shipbreakingYard' }), SIM_MODE.YARD);
  assert.equal(
    resolveActiveSimMode({ mode: 'flight', shipbreakingYard: { activeJobId: 'job_42' } }),
    SIM_MODE.YARD,
  );

  // Flight
  assert.equal(resolveActiveSimMode({ mode: 'flight' }), SIM_MODE.FLIGHT);
});

test('E3: partitionUpdateSystems pre-builds mode-scoped queues preserving relative order', () => {
  function makeStub(name) {
    return { name, update() {} };
  }
  const systems = PRODUCTION_UPDATE_ORDER.map(makeStub);
  const partitions = partitionUpdateSystems(systems);

  assert.ok(partitions.modePartitions, 'partitions must contain modePartitions');
  assert.ok(partitions.modePartitions[SIM_MODE.FLIGHT], 'Flight mode partition exists');
  assert.ok(partitions.modePartitions[SIM_MODE.DOCKED], 'Docked mode partition exists');
  assert.ok(partitions.modePartitions[SIM_MODE.SWARM], 'Swarm mode partition exists');
  assert.ok(partitions.modePartitions[SIM_MODE.YARD], 'Yard mode partition exists');

  // Verify counts:
  // Docked mode excludes flight-only and combat-flight systems
  const dockedAll = partitions.modePartitions[SIM_MODE.DOCKED].all;
  assert.ok(dockedAll.length < systems.length, 'Docked queue must skip flight/combat systems');
  assert.equal(dockedAll.some((s) => s.name === 'weapons'), false, 'Weapons must not run when docked');
  assert.equal(dockedAll.some((s) => s.name === 'mining'), false, 'Mining must not run when docked');
  assert.equal(dockedAll.some((s) => s.name === 'stationServices'), true, 'Station services must run when docked');
  assert.equal(dockedAll.some((s) => s.name === 'missions'), true, 'Missions must run when docked');

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

test('E3: updateQueueForThisStep and telemetry update cleanly during step', () => {
  function makeStub(name) {
    return { name, update() {} };
  }
  const systems = PRODUCTION_UPDATE_ORDER.map(makeStub);
  const partitions = partitionUpdateSystems(systems);

  const state = {
    mode: 'docked',
    runtime: { profileId: 'production' },
    tick: 10,
  };

  const queue = updateQueueForThisStep(partitions, state);
  assert.ok(queue.length > 0);
  assert.equal(state.simModeRuntime.mode, SIM_MODE.DOCKED);
  assert.equal(state.simModeRuntime.activeCount, queue.length);
  assert.equal(state.simModeRuntime.totalCount, systems.length);
  assert.equal(state.simModeRuntime.skippedCount, systems.length - queue.length);

  const stats = getStepExecutionStats(partitions, state);
  assert.deepEqual(stats, state.simModeRuntime);

  // Transition to Swarm
  state.mode = 'swarm';
  state.run = { kind: 'survival', phase: 'wave' };
  const swarmQueue = updateQueueForThisStep(partitions, state);
  assert.equal(state.simModeRuntime.mode, SIM_MODE.SWARM);
  assert.equal(state.simModeRuntime.activeCount, swarmQueue.length);
  assert.notEqual(swarmQueue.length, queue.length);

  // Transition back to Flight
  delete state.run;
  state.mode = 'flight';
  const flightQueue = updateQueueForThisStep(partitions, state);
  assert.equal(state.simModeRuntime.mode, SIM_MODE.FLIGHT);
  assert.equal(state.simModeRuntime.activeCount, flightQueue.length);
});

test('E3: Simulation LOD telemetry categorizes near, mid, far, and shelved entities', () => {
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
  const lod = getSimulationLODTelemetry(state);

  assert.ok(lod, 'LOD telemetry must be non-null');
  assert.equal(typeof lod.near, 'number');
  assert.equal(typeof lod.mid, 'number');
  assert.equal(typeof lod.far, 'number');
  assert.equal(lod.tiers.shelved, 2, 'Must report 2 shelved far-actor records');
  assert.equal(lod.far >= 2, true, 'Far band must include shelved far actors');
  assert.equal(state.simLOD, lod, 'state.simLOD must match getSimulationLODTelemetry');
});

test('E3: createSimulation runs smoothly with dynamic mode switching', () => {
  const ran = [];
  function stub(name) {
    return {
      name,
      update(_dt, state) {
        ran.push({ name, mode: state.simModeRuntime?.mode, tick: state.tick | 0 });
      },
    };
  }

  const sim = createSimulation({
    seed: 42,
    systems: [
      stub('input'),
      stub('weapons'),
      stub('stationServices'),
      stub('survivalWave'),
      stub('physics'),
    ],
  });
  sim.state.runtime = { profileId: 'production' };

  // Step 1: flight mode
  sim.state.mode = 'flight';
  sim.step(1 / 60);
  const step1Ran = ran.map((r) => r.name);
  assert.deepEqual(step1Ran, ['input', 'weapons', 'stationServices', 'physics'], 'Flight mode excludes survivalWave');

  // Step 2: docked mode
  ran.length = 0;
  sim.state.mode = 'docked';
  sim.step(1 / 60);
  const step2Ran = ran.map((r) => r.name);
  assert.deepEqual(step2Ran, ['input', 'stationServices', 'physics'], 'Docked mode excludes weapons and survivalWave');

  // Step 3: swarm mode
  ran.length = 0;
  sim.state.mode = 'swarm';
  sim.state.run = { kind: 'survival', phase: 'wave' };
  sim.step(1 / 60);
  const step3Ran = ran.map((r) => r.name);
  assert.deepEqual(step3Ran, ['input', 'weapons', 'survivalWave', 'physics'], 'Swarm mode excludes stationServices');

  sim.dispose();
});
