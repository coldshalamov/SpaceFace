import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save } from '../src/save/saveSystem.js';
import { validateSaveJson } from '../src/save/saveWorker.js';

function makeVec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x || 0; this.y = pos.y || 0; this.z = pos.z || 0; return this; },
  };
}

function playerSpec() {
  return {
    type: 'ship',
    alive: true,
    pos: { x: 12, z: -4 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 40,
    hullMax: 100,
    shield: 10,
    shieldMax: 50,
    cap: 8,
    capMax: 20,
    data: { defId: 'ship_kestrel', weapons: [{ id: 'wep_cannon' }], fittings: [] },
  };
}

function envelopeData(overrides = {}) {
  const playerEntity = { ...playerSpec(), ...(overrides.playerEntity || {}) };
  return {
    meta: { seed: 44, playtimeS: 12, createdAt: 't', lastSavedAt: 't' },
    player: {
      credits: 123,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      hints: { firstCombat: true },
    },
    cargo: { items: {}, capVolume: 40, capMass: 40 },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_helios_prime' },
    entities: {
      player: playerEntity,
      persistent: [],
      simTime: 12,
      tick: 40,
    },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
    automation: {},
    crafting: { queues: {} },
    settings: {},
    ...overrides.data,
  };
}

function makeEnvelope(overrides = {}) {
  const data = envelopeData(overrides);
  return {
    fmt: 'spaceface-save',
    version: overrides.version == null ? CURRENT_VERSION : overrides.version,
    slot: 'integrity',
    checksum: fnv1a(JSON.stringify(data)),
    data,
  };
}

function installHarness(state) {
  const original = {
    state: save.state,
    bus: save.bus,
    helpers: save.helpers,
    registry: save.registry,
    restoring: save._restoring,
  };
  const events = [];
  let simTimeAtEnter = null;
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: state.nextEntityId++,
        ...spec,
        alive: spec.alive !== false,
        flags: Object.assign({}, spec.flags || {}),
        data: spec.data || {},
        pos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevPos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: makeVec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        rot: spec.rot || 0,
        prevRot: spec.rot || 0,
        hull: spec.hull,
        hullMax: spec.hullMax,
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save.state = state;
  save.bus = { emit(event, payload) { events.push({ event, payload }); } };
  save.helpers = helpers;
  save.registry = {
    get(name) {
      return {
        world: {
          deserialize(data) {
            state.world.currentSectorId = data && data.currentSectorId;
          },
          enterSector() { simTimeAtEnter = state.simTime; },
        },
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
      }[name] || null;
    },
  };
  return {
    events,
    getSimTimeAtEnter: () => simTimeAtEnter,
    restore() {
      save.state = original.state;
      save.bus = original.bus;
      save.helpers = original.helpers;
      save.registry = original.registry;
      save._restoring = original.restoring;
    },
  };
}

test('too-new save versions that overflow |0 are rejected before restore', () => {
  const live = { keep: true };
  const env = makeEnvelope({ version: 1e308 });
  const prepared = save._prepareEnvelope(env);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, 'newer_version');

  const worker = validateSaveJson(JSON.stringify(env), CURRENT_VERSION);
  assert.equal(worker.ok, false);
  assert.equal(worker.reason, 'newer_version');
  assert.equal(live.keep, true);
});

test('missing or non-positive save versions are rejected', () => {
  const missing = save._prepareEnvelope({
    fmt: 'spaceface-save',
    data: envelopeData(),
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'bad_format');

  const zero = save._prepareEnvelope(makeEnvelope({ version: 0 }));
  assert.equal(zero.ok, false);
  assert.equal(zero.reason, 'bad_format');
});

test('load restores sim clock before sector re-entry and clears leftover accumulator', () => {
  const state = createGameState(123);
  state.mode = 'menu';
  state.simTime = 9999;
  state.tick = 888;
  state.accumulator = 0.5;
  state.days = 16;
  createTimeEffects(state).set('fixture:menu', { scale: 0 });
  const harness = installHarness(state);
  try {
    const ok = save.loadEnvelope(makeEnvelope(), 'integrity');
    assert.equal(ok, true);
    assert.equal(harness.getSimTimeAtEnter(), 12, 'enterSector must see the saved clock, not the outgoing run');
    assert.equal(state.simTime, 12);
    assert.equal(state.tick, 40);
    assert.equal(state.accumulator, 0);
  } finally {
    harness.restore();
  }
});

test('a saved hull of 0 is restored as 0, not full hull', () => {
  const state = createGameState(7);
  state.mode = 'menu';
  createTimeEffects(state).set('fixture:menu', { scale: 0 });
  const harness = installHarness(state);
  try {
    const ok = save.loadEnvelope(makeEnvelope({
      playerEntity: { hull: 0, hullMax: 100, shield: 0, cap: 0 },
    }), 'integrity');
    assert.equal(ok, true);
    const player = state.entities.get(state.playerId);
    assert.ok(player);
    assert.equal(player.hull, 0);
    assert.equal(player.hullMax, 100);
  } finally {
    harness.restore();
  }
});

test('player nested defaults survive a partial save blob', () => {
  const state = createGameState(9);
  state.mode = 'menu';
  createTimeEffects(state).set('fixture:menu', { scale: 0 });
  const harness = installHarness(state);
  try {
    const ok = save.loadEnvelope(makeEnvelope(), 'integrity');
    assert.equal(ok, true);
    assert.equal(state.player.hints.firstCombat, true);
    assert.equal(state.player.hints.firstFlight, false, 'unmentioned hint flags must keep their defaults');
    assert.equal(state.player.massSeed.cooldownUntil, 0);
  } finally {
    harness.restore();
  }
});

test('autosave capture plan includes every serializeData key including entropy', () => {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    flags: {},
    data: { defId: 'ship_kestrel' },
  };
  const original = { state: save.state, registry: save.registry };
  save.state = {
    meta: { seed: 47, playtimeS: 1, createdAt: 'test' },
    save: { currentSlot: null },
    playerId: player.id,
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      hints: { firstFlight: false },
      massSeed: { cooldownUntil: 0 },
    },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1 },
    story: { beatIndex: 0 },
    automation: { drones: [], meta: {} },
    crafting: { queues: {} },
    settings: {},
    entityList: [player],
    entities: new Map([[player.id, player]]),
    simTime: 1,
    tick: 1,
    rng: { getState: () => ({ seed0: 47, state: 47, draws: 0 }) },
  };
  save.registry = { get: () => null };
  try {
    const data = save.serializeData();
    const planKeys = save._saveCapturePlan().map(([key]) => key);
    assert.deepEqual(planKeys, Object.keys(data));
    assert.ok(planKeys.includes('entropy'));
    assert.equal(data.entropy.core.seed0, 47);
  } finally {
    save.state = original.state;
    save.registry = original.registry;
  }
});

test('serialize still writes the current player when the wreck is dead', () => {
  const player = {
    id: 7,
    type: 'ship',
    alive: false,
    pos: { x: 10, z: -5 },
    vel: { x: 0, z: 0 },
    flags: {},
    data: { defId: 'ship_kestrel' },
  };
  const original = { state: save.state, registry: save.registry };
  save.state = {
    meta: { seed: 91, playtimeS: 5, createdAt: 'test' },
    save: { currentSlot: null },
    playerId: player.id,
    player: { credits: 0, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1 },
    story: { beatIndex: 0 },
    automation: { drones: [], meta: {} },
    crafting: { queues: {} },
    settings: {},
    entityList: [player],
    entities: new Map([[player.id, player]]),
    simTime: 12,
    tick: 4,
  };
  save.registry = { get: () => null };
  try {
    const entities = save.serializeData().entities;
    assert.ok(entities.player);
    assert.equal(entities.player._isPlayer, true);
    assert.equal(entities.player.alive, false);
  } finally {
    save.state = original.state;
    save.registry = original.registry;
  }
});
