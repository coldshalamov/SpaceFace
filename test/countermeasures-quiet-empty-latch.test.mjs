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

test('mid-life interest change without a membership bump unlatches on rescan', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.countermeasureRuntime.quietLatched, true);
  // bountyHunt-style silent stamp: cm timer appears with no spawn and no index version bump.
  const npc = state.entityIndex.ships[5];
  npc.data.cm = { cooldownT: 0, effectT: 1.4, effect: { cfg: { kind: 'ecm' } } };
  for (let i = 0; i < 29; i++) step(host, state);
  assert.equal(state.countermeasureRuntime.quietLatched, true,
    'still inside the 30-tick rescan window');
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false, 'the 0.5 s rescan services the silent stamp');
  assert.equal(host._cmQuiet, null);
});

test('game:new drops an armed latch and republishes the flag', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState();
  const handlers = new Map();
  const host = Object.create(countermeasures);
  host.init({
    state,
    bus: { emit() {}, on(n, fn) { handlers.set(n, [...(handlers.get(n) || []), fn]); return () => {}; } },
    helpers: {},
  });
  host.state = state;
  step(host, state);
  assert.equal(state.countermeasureRuntime.quietLatched, true);
  for (const fn of handlers.get('game:new') || []) fn();
  assert.equal(host._cmQuiet, null);
  assert.equal(state.countermeasureRuntime.quietLatched, false);
});

test('unversioned index never arms the latch', () => {
  setCountermeasuresQuietLatchForBench(true);
  const state = makeState();
  delete state.entityIndex.version;
  const host = makeHost(state);
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
