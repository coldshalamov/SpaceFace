import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weapons,
  setWeaponsNpcQuietLatchForBench,
  getWeaponsNpcQuietLatchForBench,
} from '../src/systems/weapons.js';

function makeState(opts = {}) {
  const ships = [];
  const n = opts.ships || 24;
  for (let i = 0; i < n; i++) {
    ships.push({
      id: i + 1,
      type: 'ship',
      alive: true,
      isPlayer: i === 0,
      pos: { x: i * 40, z: i * 13 },
      vel: { x: 0, z: 0 },
      rot: 0,
      physicsSleeping: i === 0 ? false : true,
      flags: {},
      data: {
        ai: i !== 0,
        weapons: [{ defId: 'wpn_pulse', _cooldown: 0, _heat: 0 }],
        intent: { fire: false, moveX: 0, moveZ: 0, turnIntent: 0 },
      },
    });
  }
  const projectiles = Array.isArray(opts.projectiles) ? opts.projectiles : [];
  const vectorMines = Array.isArray(opts.vectorMines) ? opts.vectorMines : [];
  const entities = new Map(ships.map((s) => [s.id, s]));
  for (const p of projectiles) entities.set(p.id, p);
  for (const m of vectorMines) entities.set(m.id, m);
  return {
    mode: 'flight',
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: [...ships, ...projectiles, ...vectorMines],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: opts.version == null ? 1 : opts.version,
      ships,
      weaponShips: ships,
      shipLike: ships,
      projectiles,
      vectorMines,
      drones: [],
      stations: [],
      asteroids: [],
      wrecks: [],
      pickups: [],
      payloads: [],
      bombs: [],
    },
    input: { fire: false, aimAngle: 0, actions: {} },
    player: {},
    combat: { beams: [] },
    tacticalAiRuntime: opts.tacticalQuiet === false
      ? { quietLatched: false }
      : { quietLatched: true },
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHost(state) {
  state.meta = state.meta || { seed: 143 };
  const host = Object.create(weapons);
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity: () => null,
    hash32: () => 1,
    mulberry32,
  };
  host.init({
    state,
    bus: { on() { return () => {}; }, emit() {}, off() {} },
    helpers,
    registry: null,
  });
  host.state = state;
  host.helpers = helpers;
  if (!host._byId) host._byId = new Map();
  return host;
}

function step(host, state) {
  state.tick++;
  state.simTime += 1 / 60;
  host.update(1 / 60, state);
  return state.weaponRuntime;
}

test('bench toggle defaults ON and is readable', () => {
  setWeaponsNpcQuietLatchForBench(true);
  assert.equal(getWeaponsNpcQuietLatchForBench(), true);
  setWeaponsNpcQuietLatchForBench(false);
  assert.equal(getWeaponsNpcQuietLatchForBench(), false);
  setWeaponsNpcQuietLatchForBench(true);
});

test('quiet latch engages when NPCs sleep with empty projectile/mine lanes', () => {
  setWeaponsNpcQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  const rt = step(host, state);
  assert.equal(rt.quietLatched, true);
  assert.ok(host._weaponsQuiet);
  const rt2 = step(host, state);
  assert.equal(rt2.quietLatched, true);
});

test('membership bump re-arms latch with new armedTick', () => {
  setWeaponsNpcQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, true);
  const armed = host._weaponsQuiet.armedTick;
  state.entityIndex.version++;
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, true);
  assert.notEqual(host._weaponsQuiet.armedTick, armed);
  assert.equal(host._weaponsQuiet.membership, state.entityIndex.version);
});

test('tactical AI wake clears quiet latch', () => {
  setWeaponsNpcQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, true);
  state.tacticalAiRuntime.quietLatched = false;
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, false);
});

test('live projectile on typed lane refuses latch', () => {
  setWeaponsNpcQuietLatchForBench(true);
  const proj = {
    id: 900,
    type: 'projectile',
    alive: true,
    pos: { x: 1, z: 0 },
    vel: { x: 10, z: 0 },
    data: {},
  };
  const state = makeState({ projectiles: [proj] });
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, false);
});

test('bench OFF never latches', () => {
  setWeaponsNpcQuietLatchForBench(false);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, false);
  setWeaponsNpcQuietLatchForBench(true);
});

test('player fire while latched still services without clearing latch', () => {
  setWeaponsNpcQuietLatchForBench(true);
  const state = makeState();
  const host = makeHost(state);
  step(host, state);
  assert.equal(state.weaponRuntime.quietLatched, true);
  state.input.fire = true;
  step(host, state);
  // No projectile spawned (catalog empty) — lanes stay empty, latch remains.
  assert.equal(state.weaponRuntime.quietLatched, true);
});
