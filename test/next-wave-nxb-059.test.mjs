// NXB-059: one save is one moment. The slot card is that file, not whatever the
// live run did while the bytes were being written. A failed write keeps the previous file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save, slotCardFromEnvelopeData } from '../src/save/saveSystem.js';

const ORE_ID = 'ore_hold';
const HOME_ID = 'sector_home';
const LATER_ID = 'sector_later';

function makeVec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x || 0; this.y = pos.y || 0; this.z = pos.z || 0; return this; },
  };
}

function createStorage() {
  const values = new Map();
  let quota = false;
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) {
      if (quota) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      values.set(String(key), String(value));
    },
    removeItem(key) { values.delete(String(key)); },
    armQuota() { quota = true; },
    disarmQuota() { quota = false; },
  };
}

function momentOf(state) {
  const pile = state.player.cargo.items[ORE_ID];
  const body = state.claims.bodies[0];
  const vein = state.sites && state.sites.vein;
  return {
    credits: state.player.credits,
    ore: pile ? pile.qty : 0,
    delivered: !!(body && body.delivered),
    claimQty: body ? body.qty : 0,
    remaining: vein ? vein.remaining : 0,
    sectorId: state.world.currentSectorId,
    ship: (state.player.ownedShips[state.player.activeShipIndex] || {}).defId || '',
  };
}

function momentOfData(data) {
  const pile = data.cargo && data.cargo.items && data.cargo.items[ORE_ID];
  const body = data.claims && data.claims.bodies && data.claims.bodies[0];
  const vein = data.sites && data.sites.vein;
  const ships = data.player && data.player.ownedShips;
  const index = data.player && Number.isInteger(data.player.activeShipIndex) ? data.player.activeShipIndex : 0;
  const ship = ships && (ships[index] || ships[0]);
  return {
    credits: data.player.credits,
    ore: pile ? pile.qty : 0,
    delivered: !!(body && body.delivered),
    claimQty: body ? body.qty : 0,
    remaining: vein ? vein.remaining : 0,
    sectorId: data.world && data.world.currentSectorId,
    ship: ship && ship.defId || '',
  };
}

function payOut(state) {
  const pile = state.player.cargo.items[ORE_ID];
  const qty = pile ? pile.qty : 0;
  state.player.credits += qty + 1;
  state.player.cargo.items = {};
  state.claims.bodies[0].delivered = true;
  state.claims.bodies[0].qty = 0;
  state.sites.vein.remaining = 0;
  state.world.currentSectorId = LATER_ID;
  state.player.ownedShips[0].defId = 'ship_paid_' + state.meta.seed;
}

function install(seed) {
  const state = createGameState(seed);
  const heldQty = (seed % 5) + 3;
  state.mode = 'flight';
  state.tick = 40 + seed;
  state.simTime = 12;
  state.player.credits = seed * 10 + heldQty;
  state.player.cargo.items[ORE_ID] = { qty: heldQty, volume: 1 };
  state.player.ownedShips = [{ defId: 'ship_hold_' + seed, fittings: [] }];
  state.player.activeShipIndex = 0;
  state.world.currentSectorId = HOME_ID;
  state.world.sectors[HOME_ID] = { id: HOME_ID, name: 'Home Yard ' + seed };
  state.world.sectors[LATER_ID] = { id: LATER_ID, name: 'Later Reach ' + seed };
  state.claims = { bodies: [{ id: 'refinery-lot', delivered: false, qty: heldQty }] };
  state.sites = { vein: { id: 'vein-hold', remaining: heldQty } };
  const entity = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 4, z: -2 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 40,
    hullMax: 100,
    radius: 8,
    flags: { isPlayer: true },
    data: { defId: state.player.ownedShips[0].defId },
  };
  state.playerId = entity.id;
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  state.nextEntityId = 2;

  const storage = createStorage();
  const previousStorage = globalThis.localStorage;
  const original = {
    state: save.state,
    bus: save.bus,
    helpers: save.helpers,
    registry: save.registry,
    restoring: save._restoring,
    entropy: save._serializeEntropy,
    serialize: save.serialize,
  };
  const events = [];
  globalThis.localStorage = storage;
  save.state = state;
  save.bus = { emit(event, payload) { events.push({ event, payload }); } };
  save.helpers = {
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
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save.registry = {
    get(name) {
      return {
        world: {
          serialize() {
            return { currentSectorId: state.world.currentSectorId };
          },
          deserialize(data) {
            state.world.currentSectorId = data && data.currentSectorId;
          },
          enterSector(id) {
            state.world.currentSectorId = id;
          },
        },
        claims: {
          deserialize(data) {
            state.claims = data && typeof data === 'object' ? data : { bodies: [] };
          },
        },
        asteroidSites: {
          deserialize(data) {
            state.sites = data && typeof data === 'object' ? data : {};
          },
        },
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
      }[name] || null;
    },
  };
  save._restoring = false;
  return {
    state,
    storage,
    events,
    restore() {
      save.state = original.state;
      save.bus = original.bus;
      save.helpers = original.helpers;
      save.registry = original.registry;
      save._restoring = original.restoring;
      save._serializeEntropy = original.entropy;
      save.serialize = original.serialize;
      storage.disarmQuota();
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    },
  };
}

function storedMoment(storage) {
  const raw = storage.getItem('sf.save.quick');
  assert.equal(typeof raw, 'string');
  return { raw, moment: momentOfData(JSON.parse(raw).data) };
}

test('slot card is built from the written envelope, not a later sector', () => {
  const homeName = 'Frozen Hold ' + CURRENT_VERSION;
  const laterName = 'Later Reach ' + CURRENT_VERSION;
  const data = {
    player: {
      credits: CURRENT_VERSION * 3 + 1,
      ownedShips: [{ defId: 'ship_frozen' }],
      activeShipIndex: 0,
    },
    world: { currentSectorId: HOME_ID },
    cargo: { items: { [ORE_ID]: { qty: 4 } } },
  };
  const env = {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt: '2026-09-29T12:00:00.000Z',
    playtimeS: 12,
    slot: 'quick',
    data,
  };
  let asked = null;
  const card = slotCardFromEnvelopeData('quick', env, (sectorId) => {
    asked = sectorId;
    return sectorId === HOME_ID ? homeName : laterName;
  });
  assert.ok(card);
  assert.equal(asked, data.world.currentSectorId);
  assert.equal(card.credits, data.player.credits);
  assert.notEqual(card.credits, data.player.credits + data.cargo.items[ORE_ID].qty);
  assert.equal(card.sectorName, homeName);
  assert.notEqual(card.sectorName, laterName);
  assert.equal(card.shipName, data.player.ownedShips[0].defId);
  assert.equal(slotCardFromEnvelopeData('quick', { fmt: 'spaceface-save', version: CURRENT_VERSION }, () => laterName), null);
});

test('a sale during the save is stored as the earlier moment, and Continue restores that moment', () => {
  const rig = install(17);
  const { state, storage } = rig;
  const before = momentOf(state);
  const originalEntropy = save._serializeEntropy;
  // Entropy is the last owner in the capture. A sale here has already missed cargo,
  // credits, the claim, the vein, and the sector id, so the file must stay the earlier moment.
  save._serializeEntropy = function saleAfterOwnersWereCopied() {
    const snap = originalEntropy.call(this);
    payOut(state);
    return snap;
  };
  try {
    assert.deepEqual(momentOf(state), before);
    assert.equal(save.save('quick'), true);
    const live = momentOf(state);
    const file = storedMoment(storage);
    assert.deepEqual(file.moment, before);
    assert.notDeepEqual(file.moment, live);
    assert.notEqual(file.moment.credits, live.credits);
    assert.notEqual(file.moment.ore, live.ore);
    assert.equal(file.moment.delivered, false);
    assert.equal(live.delivered, true);
    assert.equal(file.moment.remaining, before.remaining);
    assert.equal(live.remaining, 0);
    const card = save.listSlots().quick;
    assert.ok(card);
    assert.equal(card.credits, file.moment.credits);
    assert.notEqual(card.credits, live.credits);
    assert.equal(card.sectorName, state.world.sectors[file.moment.sectorId].name);
    assert.notEqual(card.sectorName, state.world.sectors[live.sectorId].name);
    assert.equal(card.shipName, file.moment.ship);
    assert.notEqual(card.shipName, live.ship);
    assert.equal(save.load('quick'), true);
    assert.deepEqual(momentOf(state), file.moment);
  } finally {
    rig.restore();
  }
});

test('a sale that finishes before the save is stored entirely after, card included', () => {
  const rig = install(19);
  const { state, storage } = rig;
  try {
    const before = momentOf(state);
    payOut(state);
    const after = momentOf(state);
    assert.notDeepEqual(after, before);
    assert.equal(save.save('quick'), true);
    const file = storedMoment(storage);
    assert.deepEqual(file.moment, after);
    assert.notDeepEqual(file.moment, before);
    assert.equal(file.moment.delivered, true);
    assert.equal(file.moment.ore, 0);
    assert.notEqual(file.moment.credits, before.credits);
    const card = save.listSlots().quick;
    assert.equal(card.credits, file.moment.credits);
    assert.equal(card.sectorName, state.world.sectors[file.moment.sectorId].name);
    assert.equal(card.shipName, file.moment.ship);
    assert.notEqual(card.sectorName, state.world.sectors[before.sectorId].name);
  } finally {
    rig.restore();
  }
});

test('a failed capture or a failed storage write keeps the previous slot and does not report success', () => {
  const rig = install(23);
  const { state, storage, events } = rig;
  try {
    assert.equal(save.save('quick'), true);
    const kept = storedMoment(storage);
    const completed = events.filter((entry) => entry.event === 'save:completed').length;
    payOut(state);
    const live = momentOf(state);
    assert.notDeepEqual(live, kept.moment);
    storage.armQuota();
    assert.equal(save.save('quick'), false);
    storage.disarmQuota();
    assert.equal(storage.getItem('sf.save.quick'), kept.raw);
    assert.deepEqual(storedMoment(storage).moment, kept.moment);
    assert.deepEqual(momentOf(state), live);
    const card = save.listSlots().quick;
    assert.equal(card.credits, kept.moment.credits);
    assert.notEqual(card.credits, live.credits);
    assert.equal(card.sectorName, state.world.sectors[kept.moment.sectorId].name);
    const quotaError = events.filter((entry) => entry.event === 'save:error').pop();
    assert.ok(quotaError);
    assert.equal(quotaError.payload.ok, false);
    assert.equal(quotaError.payload.failure, 'quota');
    assert.equal(events.filter((entry) => entry.event === 'save:completed').length, completed);

    save.serialize = () => { throw new Error('capture failed'); };
    assert.equal(save.save('quick'), false);
    assert.equal(storage.getItem('sf.save.quick'), kept.raw);
    assert.deepEqual(momentOf(state), live);
    const captureError = events.filter((entry) => entry.event === 'save:error').pop();
    assert.equal(captureError.payload.ok, false);
    assert.equal(captureError.payload.failure, 'serialize_failed');
    assert.equal(events.filter((entry) => entry.event === 'save:completed').length, completed);
    assert.equal(save.listSlots().quick.credits, kept.moment.credits);
  } finally {
    rig.restore();
  }
});

test('a dataless envelope still lists the live summary, and a bad checksum is not a slot', () => {
  const rig = install(29);
  const { state, storage } = rig;
  try {
    const live = momentOf(state);
    save._updateIndex('quick', {
      fmt: 'spaceface-save',
      version: CURRENT_VERSION,
      savedAt: '2026-09-29T00:00:00.000Z',
      playtimeS: 2,
    });
    const drafted = JSON.parse(storage.getItem('sf.save.index')).quick;
    assert.equal(drafted.credits, live.credits);
    assert.equal(drafted.sectorName, state.world.sectors[live.sectorId].name);

    assert.equal(save.save('quick'), true);
    const env = JSON.parse(storage.getItem('sf.save.quick'));
    const forged = live.credits + env.data.cargo.items[ORE_ID].qty + 1;
    env.checksum = 'forged';
    env.data.player.credits = forged;
    storage.setItem('sf.save.quick', JSON.stringify(env));
    const idx = JSON.parse(storage.getItem('sf.save.index'));
    idx.quick.credits = forged;
    storage.setItem('sf.save.index', JSON.stringify(idx));
    const slots = save.listSlots();
    assert.equal(slots.quick, undefined);
    assert.equal(Object.values(slots).some((meta) => meta && meta.credits === forged), false);
  } finally {
    rig.restore();
  }
});

test('the write path publishes the envelope card and does not re-hash the save to do it', () => {
  const src = fs.readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  const start = src.indexOf('  _updateIndex(slot, envelope) {');
  const body = src.slice(start, src.indexOf('  _readIndex()', start));
  assert.ok(start > 0);
  assert.match(body, /slotCardFromEnvelopeData\(slot, envelope/);
  assert.match(body, /fromFile \|\| liveSlotSummary/);
  assert.equal(body.includes('fnv1a'), false);
  const scan = src.slice(src.indexOf('function slotMetaFromEnvelope'), src.indexOf('function readableMissionType'));
  assert.match(scan, /fnv1a\(safeStringify\(data\)\)/);
  assert.match(scan, /slotCardFromEnvelopeData\(slot, env, null\)/);
});
