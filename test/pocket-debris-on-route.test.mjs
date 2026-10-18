/**
 * ev_debris_on_route — a cluster of real debris pickups crosses the pocket on one shared
 * slow drift vector (microevent catalog, accident).
 *
 * Seconds-scale contract test for the traffic-owned environmental roll: cluster spawn spec,
 * shared-vector constellation, collectable pickup shape, one-at-a-time guard, scheduler
 * cadence, and save clock. Does not touch goldens or render.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';

function makeEntity(id, type, data = {}, pos = { x: 0, z: 0 }) {
  return {
    id,
    type,
    alive: true,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    homeSectorId: SECTOR,
    data: { sectorId: SECTOR, homeSectorId: SECTOR, ...data },
  };
}

function bootDebrisHarness({ simTime = 10, playerPos = { x: 0, z: 0 } } = {}) {
  const player = makeEntity(1, 'ship', {}, playerPos);
  player.isPlayer = true;
  const state = {
    mode: 'flight',
    tick: 60,
    simTime,
    meta: { seed: SEED },
    playerId: 1,
    world: { currentSectorId: SECTOR, records: { byId: {} } },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    traffic: {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
      appliedJobActionIds: [],
      rngSeed: 0x5eed0424,
    },
  };
  const bus = createBus();
  let nextId = 500;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        id: nextId++,
        alive: true,
        rot: 0,
        prevPos: spec.pos ? { ...spec.pos } : undefined,
        ...spec,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
      return true;
    },
  };
  const traffic = {
    ...trafficBase,
    state: null,
    bus: null,
    helpers: null,
    _registry: null,
    _active: [],
    _ceresCausal: null,
    _meteorPass: null,
    _debrisField: null,
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

test('a due roll spawns a constellation of collectable scrap on one shared drift vector', () => {
  const { state, traffic, player, spawned } = bootDebrisHarness();
  state.traffic.nextDebrisFieldAt = state.simTime;
  traffic._stepPocketDebrisField(1 / 60, state);
  assert.ok(spawned.length >= 8 && spawned.length <= 12,
    `8-12 pieces per the catalog, got ${spawned.length}`);

  const pieces = spawned.filter((e) => e.data && e.data.debrisOnRoute === true);
  assert.equal(pieces.length, spawned.length, 'every piece carries the event stamp');

  // One shared slow drift — the constellation moves as one.
  const speeds = pieces.map((p) => Math.hypot(p.vel.x, p.vel.z));
  for (const s of speeds) assert.ok(s >= 8 && s <= 20, `slow drift read, got ${s}`);
  const units = pieces.map((p, i) => ({ x: p.vel.x / speeds[i], z: p.vel.z / speeds[i] }));
  const meanX = units.reduce((a, u) => a + u.x, 0) / units.length;
  const meanZ = units.reduce((a, u) => a + u.z, 0) / units.length;
  const norm = Math.hypot(meanX, meanZ);
  for (const u of units) {
    const dot = u.x * meanX + u.z * meanZ;
    assert.ok(dot / norm > 0.90,
      `parallel tracks — worst-case jitter atan(4.3/11)≈21° → dot ≥ 0.933, got ${dot / norm}`);
  }

  // Every piece is a standard scrap pickup — the catalog's "collect the debris yourself".
  for (const p of pieces) {
    assert.equal(p.type, 'pickup');
    assert.equal(p.data.kind, 'ore');
    assert.equal(p.data.commodityId, 'cmdty_scrap_metal');
    assert.ok(p.data.amount >= 1 && p.data.amount <= 3, 'a small piece, not a jackpot');
    assert.equal(p.collides, true);
    assert.ok(p.data.despawnAt > state.simTime, 'the despawn sweep owns the exit leg');
  }

  // Entry on the pocket-edge band aimed across the player's route.
  for (const p of pieces) {
    const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
    assert.ok(d >= 2000 && d <= 3200, `ribbon enters at the pocket edge, got ${d}`);
  }
  assert.ok(traffic._debrisField && traffic._debrisField.pieceIds.length === pieces.length);
});

test('one field at a time: a live constellation blocks the next roll', () => {
  const { state, traffic, spawned } = bootDebrisHarness();
  const first = traffic._spawnPocketDebrisField(state);
  assert.ok(first && first.length > 0, 'first roll spawns');
  assert.equal(traffic._spawnPocketDebrisField(state), null,
    'a live field blocks a second concurrent spawn');
  const count = spawned.length;
  for (const e of spawned) e.alive = false;
  const second = traffic._spawnPocketDebrisField(state);
  assert.ok(second && second.length > 0, 'a gone field frees the slot for the next roll');
  assert.ok(spawned.length > count);
});

test('the scheduler waits, fires once on its due tick, and re-arms the clock', () => {
  const { state, traffic, spawned } = bootDebrisHarness();
  traffic._stepPocketDebrisField(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextDebrisFieldAt));
  assert.ok(state.traffic.nextDebrisFieldAt > state.simTime, 'first field is scheduled, not forced');
  assert.equal(spawned.length, 0);

  const due = state.traffic.nextDebrisFieldAt;
  state.simTime = due - 1;
  traffic._stepPocketDebrisField(1 / 60, state);
  assert.equal(spawned.length, 0, 'no spawn before the due tick');
  state.simTime = due;
  traffic._stepPocketDebrisField(1 / 60, state);
  assert.ok(spawned.length >= 8, 'the due tick fires the field');
  assert.ok(state.traffic.nextDebrisFieldAt > due, 'the clock re-arms into the future');
});

test('collecting every piece retires the live-field record', () => {
  const { state, traffic, spawned } = bootDebrisHarness();
  const ids = traffic._spawnPocketDebrisField(state);
  assert.ok(ids && traffic._debrisField);
  for (const e of spawned) e.alive = false; // the player ate the constellation
  traffic._stepPocketDebrisField(1 / 60, state);
  assert.equal(traffic._debrisField, null, 'a harvested field retires its guard');
});

test('the debris clock round-trips a save; a stale save re-rolls', () => {
  const { state, traffic } = bootDebrisHarness();
  traffic._stepPocketDebrisField(1 / 60, state);
  const due = state.traffic.nextDebrisFieldAt;
  const saved = traffic.serialize();
  assert.equal(saved.nextDebrisFieldAt, due, 'the schedule is on the save envelope');

  const h2 = bootDebrisHarness();
  h2.traffic.deserialize(saved);
  assert.equal(h2.state.traffic.nextDebrisFieldAt, due, 'Continue keeps the roll');

  const h3 = bootDebrisHarness();
  h3.traffic.deserialize({ schema: 'spaceface.ceresMinerHaulerHandoff.v1' });
  assert.equal(h3.state.traffic.nextDebrisFieldAt, undefined,
    'an older save without the clock simply re-rolls');
});
