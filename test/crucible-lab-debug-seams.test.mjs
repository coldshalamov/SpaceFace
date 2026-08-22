import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  LOOP_FIXED_DT,
  createSimulationRunner,
} from '../src/core/simulationRunner.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';

function vec(x, z) {
  return { x, y: 0, z };
}

function makePlayer(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 10,
    hullMax: 100,
    armorHp: 3,
    armorMax: 40,
    shield: 4,
    shieldMax: 50,
    cap: 2,
    capMax: 20,
    heat: 8,
    pos: vec(0, 0),
    vel: vec(0, 0),
    flags: { invuln: false, docked: false },
    data: {
      weapons: [
        { defId: 'gun_a', _heat: 55 },
        { defId: 'gun_b', _heat: 12 },
      ],
    },
    ...overrides,
  };
}

function makeLabState(overrides = {}) {
  const player = overrides.player || makePlayer();
  const npc = overrides.npc || {
    id: 3,
    type: 'ship',
    alive: true,
    hull: 9,
    hullMax: 30,
    armorHp: 1,
    armorMax: 8,
    shield: 1,
    shieldMax: 6,
    cap: 1,
    capMax: 10,
    heat: 4,
    flags: { invuln: false },
    data: { weapons: [{ defId: 'npc_gun', _heat: 90 }] },
  };
  const entities = new Map([[player.id, player], [npc.id, npc]]);
  const state = {
    playerId: player.id,
    tick: 0,
    simTime: 5,
    timeScale: 1,
    accumulator: 0,
    mode: 'flight',
    meta: { seed: 7 },
    player: { heat: 0.42, credits: 100 },
    run: { kind: 'lab', phase: 'active', seed: 7, score: 0 },
    entities,
    entityList: [player, npc],
    entityIndex: { ships: [player, npc] },
    combat: {},
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      actions: {},
    },
    ...overrides.state,
  };
  if (overrides.run !== undefined) state.run = overrides.run;
  return { state, player, npc };
}

function initCombat(state) {
  const bus = createBus();
  combat.init({
    state,
    bus,
    helpers: {},
    registry: { get() { return null; } },
  });
  return bus;
}

function initWeapons(state, bus) {
  weapons.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      getEntity(id) { return state.entities.get(id); },
    },
  });
}

function createRunnerState() {
  return {
    accumulator: 0,
    timeScale: 1,
    tick: 0,
    simTime: 0,
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
      actions: {},
    },
  };
}

function createRegistry(state, observed = []) {
  return {
    step(dt, tickBoundary) {
      state.tick++;
      state.simTime += dt;
      tickBoundary.publishInputCommand(state.input, state.tick);
      observed.push({ tick: state.tick, dt });
    },
  };
}

function bookkeeping(runner, state) {
  const diag = runner.getDiagnostics();
  const latest = {};
  const pending = runner.getPendingCompletedTickCount();
  // Do not consume — just copy diagnostics and a peek via pending count.
  return {
    tick: state.tick,
    simTime: state.simTime,
    timeScale: state.timeScale,
    pending,
    completedSequence: diag.completedSequence,
    inputSequence: diag.inputSequence,
    inputBoundaryCaptureCount: diag.inputBoundaryCaptureCount,
    capturedCount: diag.inputCommandSnapshots && diag.inputCommandSnapshots.capturedCount,
    consumedCount: diag.inputCommandSnapshots && diag.inputCommandSnapshots.consumedCount,
    latestTick: latest.tick || 0,
  };
}

test('debug:refillPlayer restores combat vitals and clears entity heat without changing maxima', () => {
  const { state, player, npc } = makeLabState();
  const bus = initCombat(state);
  initWeapons(state, bus);

  bus.emit('debug:refillPlayer', {});

  assert.equal(player.hull, 100);
  assert.equal(player.armorHp, 40);
  assert.equal(player.shield, 50);
  assert.equal(player.cap, 20);
  assert.equal(player.heat, 0);
  assert.equal(player.hullMax, 100);
  assert.equal(player.armorMax, 40);
  assert.equal(player.shieldMax, 50);
  assert.equal(player.capMax, 20);
  assert.equal(player.data.weapons[0]._heat, 0);
  assert.equal(player.data.weapons[1]._heat, 0);
  assert.equal(state.player.heat, 0.42, 'WANTED heat is not combat-owned');
  assert.equal(npc.hull, 9);
  assert.equal(npc.heat, 4);
  assert.equal(npc.data.weapons[0]._heat, 90);
});

test('debug:refillPlayer is a no-op without a live Lab session, player, or finite maxima', () => {
  const missingRun = makeLabState({ run: null });
  const busA = initCombat(missingRun.state);
  initWeapons(missingRun.state, busA);
  busA.emit('debug:refillPlayer', {});
  assert.equal(missingRun.player.hull, 10);
  assert.equal(missingRun.player.data.weapons[0]._heat, 55);

  const adventure = makeLabState({
    run: { kind: 'adventure', phase: 'active', seed: 1, score: 0 },
  });
  const busB = initCombat(adventure.state);
  initWeapons(adventure.state, busB);
  busB.emit('debug:refillPlayer', {});
  assert.equal(adventure.player.hull, 10);
  assert.equal(adventure.player.data.weapons[0]._heat, 55);

  const inactive = makeLabState({
    run: { kind: 'lab', phase: 'inactive', seed: 1, score: 0 },
  });
  const busC = initCombat(inactive.state);
  initWeapons(inactive.state, busC);
  busC.emit('debug:refillPlayer', {});
  assert.equal(inactive.player.hull, 10);

  const { state, player } = makeLabState();
  state.playerId = 99;
  const busD = initCombat(state);
  initWeapons(state, busD);
  busD.emit('debug:refillPlayer', {});
  assert.equal(player.hull, 10);

  const broken = makeLabState();
  broken.player.hullMax = NaN;
  broken.player.armorMax = Infinity;
  broken.player.shieldMax = undefined;
  broken.player.capMax = null;
  const hullBefore = broken.player.hull;
  const armorBefore = broken.player.armorHp;
  const shieldBefore = broken.player.shield;
  const capBefore = broken.player.cap;
  const busE = initCombat(broken.state);
  busE.emit('debug:refillPlayer', {});
  assert.equal(broken.player.hull, hullBefore);
  assert.equal(broken.player.armorHp, armorBefore);
  assert.equal(broken.player.shield, shieldBefore);
  assert.equal(broken.player.cap, capBefore);
});

test('debug:invulnerable { on: true } survives an expired _invulnUntil after combat.update', () => {
  const { state, player } = makeLabState();
  player.flags.invuln = false;
  player._invulnUntil = 1;
  state.simTime = 10;
  const bus = initCombat(state);

  bus.emit('debug:invulnerable', { on: true });
  assert.equal(player.flags.invuln, true);
  assert.equal(player._invulnUntil, Infinity);

  combat.update(LOOP_FIXED_DT, state);
  assert.equal(player.flags.invuln, true, 'Infinity sentinel must outlive the stale deadline');
  assert.equal(player._invulnUntil, Infinity);
});

test('debug:invulnerable { on: false } clears both the flag and the deadline', () => {
  const { state, player } = makeLabState();
  player.flags.invuln = true;
  player._invulnUntil = Infinity;
  const bus = initCombat(state);
  bus.emit('debug:invulnerable', { on: false });
  assert.equal(player.flags.invuln, false);
  assert.equal(player._invulnUntil, null);

  bus.emit('debug:invulnerable', { on: 'yes' });
  assert.equal(player.flags.invuln, false);
  assert.equal(player._invulnUntil, null);
});

test('debug:invulnerable is a no-op outside a live Lab session', () => {
  const { state, player } = makeLabState({
    run: { kind: 'adventure', phase: 'active', seed: 1, score: 0 },
  });
  player.flags.invuln = false;
  player._invulnUntil = 1;
  const bus = initCombat(state);
  bus.emit('debug:invulnerable', { on: true });
  assert.equal(player.flags.invuln, false);
  assert.equal(player._invulnUntil, 1);
});

test('stepOnce advances exactly one tick through the normal path and matches advance() bookkeeping', () => {
  const observedAdvance = [];
  const observedStep = [];
  const stateAdvance = createRunnerState();
  const stateStep = createRunnerState();
  const runnerAdvance = createSimulationRunner(stateAdvance, createRegistry(stateAdvance, observedAdvance));
  const runnerStep = createSimulationRunner(stateStep, createRegistry(stateStep, observedStep));

  const once = runnerStep.stepOnce();
  assert.equal(once, true);
  assert.equal(stateStep.tick, 1);
  assert.equal(stateStep.simTime, LOOP_FIXED_DT);
  assert.equal(runnerStep.getPendingCompletedTickCount(), 1);
  assert.equal(observedStep.length, 1);
  assert.equal(observedStep[0].dt, LOOP_FIXED_DT);

  runnerAdvance.advance(LOOP_FIXED_DT, 1);
  assert.deepEqual(bookkeeping(runnerStep, stateStep), bookkeeping(runnerAdvance, stateAdvance));

  const latestStep = {};
  const latestAdvance = {};
  assert.equal(runnerStep.consumeLatestCompletedTick(latestStep), 1);
  assert.equal(runnerAdvance.consumeLatestCompletedTick(latestAdvance), 1);
  assert.deepEqual(latestStep, latestAdvance);

  assert.equal(runnerStep.stepOnce(), true);
  runnerAdvance.advance(LOOP_FIXED_DT, 1);
  assert.equal(stateStep.tick, 2);
  assert.equal(stateAdvance.tick, 2);
  assert.deepEqual(bookkeeping(runnerStep, stateStep), bookkeeping(runnerAdvance, stateAdvance));
});

test('two stepOnce calls advance tick by exactly 2 and publish two snapshots', () => {
  const state = createRunnerState();
  const runner = createSimulationRunner(state, createRegistry(state));
  runner.stepOnce();
  runner.stepOnce();
  assert.equal(state.tick, 2);
  assert.equal(runner.getPendingCompletedTickCount(), 2);
  const diag = runner.getDiagnostics();
  assert.equal(diag.completedSequence, 2);
  assert.equal(diag.inputSequence, 2);
  assert.equal(diag.inputBoundaryCaptureCount, 2);
  assert.equal(diag.inputCommandSnapshots.capturedCount, 2);
});

test('stepOnce does not touch accumulator, timeScale, or emit through pause seams', () => {
  const state = createRunnerState();
  state.accumulator = LOOP_FIXED_DT * 0.375;
  state.timeScale = 0;
  const runner = createSimulationRunner(state, createRegistry(state));
  runner.stepOnce();
  assert.equal(state.tick, 1);
  assert.equal(state.accumulator, LOOP_FIXED_DT * 0.375);
  assert.equal(state.timeScale, 0);
});

test('stepOnce respects assertOpen', () => {
  const state = createRunnerState();
  const runner = createSimulationRunner(state, createRegistry(state));
  runner.close();
  assert.throws(() => runner.stepOnce(), /SimulationRunner is closed/);
  assert.equal(state.tick, 0);
});
