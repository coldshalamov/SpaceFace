import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countermeasures,
  setCountermeasuresQuietLatchForBench,
  getCountermeasuresQuietLatchForBench,
} from '../src/systems/countermeasures.js';

function makeState(opts = {}) {
  const ships = [];
  const n = opts.ships || 24;
  for (let i = 0; i < n; i++) {
    ships.push({
      id: i + 1,
      type: 'ship',
      alive: true,
      pos: { x: i * 10, z: i * 3 },
      data: { fittings: opts.playerCm && i === 0 ? ['mod_chaff_dispenser_m'] : ['mod_cargo_hold_s'], combat: {} },
    });
  }
  ships[0].isPlayer = true;
  const entities = new Map(ships.map((s) => [s.id, s]));
  return {
    mode: 'flight',
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: ships,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      ships,
      projectiles: [],
    },
    input: {},
    ui: { screenStack: [] },
    ships,
  };
}

function makeHost(state) {
  const host = Object.create(countermeasures);
  host.init({ state, bus: { emit() {} }, helpers: {} });
  host.state = state;
  return host;
}

function step(host, state) {
  state.tick++;
  state.simTime += 1 / 60;
  host.update(1 / 60, state);
  return state.countermeasureRuntime;
}

test('quiet latch engages when no CM/PDS interest', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, true);
  assert.ok(host._cmQuiet);
  const rt2 = step(host, state);
  assert.equal(rt2.quietLatched, true);
});

test('deploy edge wakes quiet latch', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.countermeasureRuntime.quietLatched, true);
  state.input.deployCountermeasure = true;
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
  assert.equal(host._cmQuiet, null);
});

test('membership + fitted CM wakes quiet latch', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.countermeasureRuntime.quietLatched, true);
  state.entityIndex.version++;
  const newbie = {
    id: 500,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    data: { fittings: ['mod_pds_servo_s'], combat: {}, pds: { cooldownT: 0 } },
  };
  state.entityIndex.ships.push(newbie);
  state.entities.set(500, newbie);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
  assert.equal(host._cmQuiet, null);
});

test('bench toggle restores always-walk', () => {
  setCountermeasuresQuietLatchForBench(false);
  assert.equal(getCountermeasuresQuietLatchForBench(), false);
  const state = makeState();
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
  setCountermeasuresQuietLatchForBench(true);
});

test('player with CM fitted never quiet-latches', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState({ playerCm: true });
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
});
