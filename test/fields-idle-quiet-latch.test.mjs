import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  fields,
  setFieldsIdleQuietLatchForBench,
  getFieldsIdleQuietLatchForBench,
} from '../src/systems/fields.js';

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  try {
    return fn();
  } finally {
    FIELD_FLAGS.enabled = prev;
  }
}

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
      rot: 0.1 * i,
      vel: { x: 0, z: 0 },
      flags: {},
      physicsSleeping: i > 2,
      data: {
        ai: { doctrine: 'patrol' },
        trafficRole: 'hauler',
        fittings: [],
      },
    });
  }
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
      aiShips: ships.slice(1),
      projectiles: [],
    },
    input: { actions: {} },
    ui: { screenStack: [] },
    planet: { player: { collectorOn: false } },
    fields: null,
  };
}

function makeHost(state) {
  const host = Object.create(fields);
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
  return state.fieldsRuntime;
}

test('quiet latch engages on idle flight with no field interest', () => {
  withFlag(true, () => {
    setFieldsIdleQuietLatchForBench(true);
    const state = makeState();
    const host = makeHost(state);
    const rt = step(host, state);
    assert.equal(rt.quietLatched, true);
    assert.ok(host._fieldsIdleQuiet);
    const rt2 = step(host, state);
    assert.equal(rt2.quietLatched, true);
  });
});

test('membership bump wakes idle quiet latch', () => {
  withFlag(true, () => {
    setFieldsIdleQuietLatchForBench(true);
    const state = makeState();
    const host = makeHost(state);
    step(host, state);
    assert.equal(state.fieldsRuntime.quietLatched, true);
    state.entityIndex.version++;
    const scavenger = {
      id: 900,
      type: 'ship',
      alive: true,
      pos: { x: 10, z: 10 },
      rot: 0,
      vel: { x: 0, z: 0 },
      flags: {},
      physicsSleeping: false,
      data: {
        ai: { doctrine: 'scavenger' },
        trafficRole: 'scavenger',
      },
    };
    state.entityIndex.ships.push(scavenger);
    state.entityIndex.aiShips.push(scavenger);
    state.entities.set(900, scavenger);
    state.entityList.push(scavenger);
    // Also drop loose mass so the scavenger plan can arm a cone and leave idle.
    const wreck = {
      id: 901,
      type: 'wreck',
      alive: true,
      pos: { x: 12, z: 10 },
      data: {},
    };
    state.entities.set(901, wreck);
    state.entityList.push(wreck);
    state.entityIndex.wrecks = [wreck];
    state.entityIndex.pickups = [];
    state.entityIndex.payloads = [];
    // Force discover cadence this tick.
    state.tick = 3; // next step → tick 4, % 4 === 0
    const rt = step(host, state);
    // Awake scavenger role refuses the idle latch so cadenced discover can arm a cone.
    assert.equal(host._fieldsIdleQuiet, null, 'scavenger interest must refuse latch');
    assert.equal(rt.quietLatched, false);
  });
});

test('player cone deploy leaves idle and clears latch', () => {
  withFlag(true, () => {
    setFieldsIdleQuietLatchForBench(true);
    const state = makeState();
    const host = makeHost(state);
    step(host, state);
    assert.equal(state.fieldsRuntime.quietLatched, true);
    // Toggle cone via runtime directly (input path is more involved).
    state.fields.coneActive = true;
    state.fields.coneFieldId = 'field_cone_test';
    // Register a cone in the kernel so idle snapshot sees kernelCount > 0 after sync paths.
    host._kernel.register({
      id: 'field_cone_test',
      kind: 'cone',
      center: { x: 0, z: 0 },
      dir: { x: 1, z: 0 },
      radius: 100,
      strength: 1,
      falloff: 1,
      halfAngleRad: 0.5,
      durationS: Infinity,
      sourceId: 1,
      ownerId: 1,
      createdAt: state.simTime,
    });
    const rt = step(host, state);
    assert.equal(rt.quietLatched, false);
    assert.equal(host._fieldsIdleQuiet, null);
  });
});

test('bench toggle restores always-walk idle path', () => {
  withFlag(true, () => {
    setFieldsIdleQuietLatchForBench(false);
    assert.equal(getFieldsIdleQuietLatchForBench(), false);
    const state = makeState();
    const host = makeHost(state);
    const rt = step(host, state);
    assert.equal(rt.quietLatched, false);
    assert.equal(host._fieldsIdleQuiet, null);
    setFieldsIdleQuietLatchForBench(true);
  });
});

test('latched idle skips discover until rescan window', () => {
  withFlag(true, () => {
    setFieldsIdleQuietLatchForBench(true);
    const state = makeState();
    const host = makeHost(state);
    step(host, state);
    assert.ok(host._fieldsIdleQuiet);
    const armed = host._fieldsIdleQuiet.armedTick;
    // Several quiet ticks keep the same armedTick.
    for (let i = 0; i < 10; i++) step(host, state);
    assert.equal(host._fieldsIdleQuiet.armedTick, armed);
    assert.equal(state.fieldsRuntime.quietLatched, true);
  });
});
