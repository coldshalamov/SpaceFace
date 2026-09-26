import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bombs,
  setBombsEmptyQuietLatchForBench,
  getBombsEmptyQuietLatchForBench,
  BOMB_TYPE,
} from '../src/systems/bombs.js';

function makeState(opts = {}) {
  const ships = [];
  const n = opts.ships || 32;
  for (let i = 0; i < n; i++) {
    ships.push({
      id: i + 1,
      type: 'ship',
      alive: true,
      isPlayer: i === 0,
      pos: { x: i * 40, z: i * 13 },
      vel: { x: 0, z: 0 },
      rot: 0,
      flags: {},
      data: {},
    });
  }
  const bombsList = Array.isArray(opts.bombs) ? opts.bombs : [];
  const entities = new Map(ships.map((s) => [s.id, s]));
  for (const b of bombsList) entities.set(b.id, b);
  return {
    mode: 'flight',
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: [...ships, ...bombsList],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: opts.version == null ? 1 : opts.version,
      ships,
      bombs: bombsList,
      projectiles: [],
      drones: [],
      stations: [],
      asteroids: [],
      wrecks: [],
      pickups: [],
      payloads: [],
    },
    input: { actions: {} },
    ui: { screenStack: [] },
    bombs: null,
  };
}

function makeHost(state) {
  const host = Object.create(bombs);
  host.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {},
    registry: null,
  });
  host.state = state;
  return host;
}

function step(host, state) {
  state.tick++;
  state.simTime += 1 / 60;
  host.update(1 / 60, state);
  return state.bombsRuntime;
}

test('quiet latch engages when typed bombs bucket is empty', () => {
  setBombsEmptyQuietLatchForBench(true);
  assert.equal(getBombsEmptyQuietLatchForBench(), true);
  const state = makeState();
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, true);
  assert.ok(host._bombsQuiet);
  const rt2 = step(host, state);
  assert.equal(rt2.quietLatched, true);
});

test('membership bump wakes empty quiet latch', () => {
  setBombsEmptyQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.bombsRuntime.quietLatched, true);
  const armed = host._bombsQuiet.armedTick;
  state.entityIndex.version++;
  step(host, state);
  // Rescan arms a fresh latch (still empty) but must observe the bump (new armedTick).
  assert.equal(state.bombsRuntime.quietLatched, true);
  assert.notEqual(host._bombsQuiet.armedTick, armed);
  assert.equal(host._bombsQuiet.membership, state.entityIndex.version);
});

test('dropBomb edge refuses latch and consumes edge', () => {
  setBombsEmptyQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.bombsRuntime.quietLatched, true);
  // Dry the rack so drop takes the toast path (no spawn) while still proving the edge wakes.
  state.bombs.rack.cells = state.bombs.rack.cells.map(() => null);
  state.bombs.selectedId = null;
  state.input.actions.dropBomb = true;
  step(host, state);
  assert.equal(state.input.actions.dropBomb, false);
  // Toast path still clears latch for the edge tick.
  assert.equal(state.bombsRuntime.quietLatched, false);
});

test('live bomb in bucket refuses latch', () => {
  setBombsEmptyQuietLatchForBench(true);
  const bomb = {
    id: 900,
    type: BOMB_TYPE,
    alive: true,
    pos: { x: 10, z: 10 },
    vel: { x: 0, z: 0 },
    rot: 0,
    prevPos: { x: 10, z: 10 },
    data: { bombId: 'bomb_frag', phase: 'drift', ownerId: 1, spinRadS: 0 },
  };
  const state = makeState({ bombs: [bomb] });
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
  assert.equal(host._bombsQuiet, null);
});

test('bench toggle OFF keeps quietLatched false on empty', () => {
  setBombsEmptyQuietLatchForBench(false);
  const state = makeState();
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
  assert.equal(host._bombsQuiet, null);
  setBombsEmptyQuietLatchForBench(true);
});

test('without ready bombs bucket latch refuses', () => {
  setBombsEmptyQuietLatchForBench(true);
  const state = makeState();
  delete state.entityIndex.bombs;
  state.entityIndex.ready = true;
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, false);
});
