/**
 * CR-CHAIN (build_map §23.2) — "a volatile pod as a moving mine": the braid's second leg.
 *
 * Seconds-scale contract test: a working volatiles tanker under way sloughs ONE pod of its
 * own volatile manifest line off the stern — a drifting pressurized hazard, not a freight
 * find. Pins the tanker-role pick, the volatile-line filter (an inert manifest sheds
 * nothing), the hazard stamp the volatile machinery applies automatically, ownership,
 * stern placement, cadence persistence, the one-loose-slough guard, and stale-save
 * normalization. Deterministic seed 4242.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import { volatileClassOf } from '../src/data/commodityVolatileClasses.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';

function makeShip(id, data = {}, pos = { x: 0, z: 0 }, vel = { x: 30, z: 0 }) {
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 14,
    pos: { ...pos },
    vel: { ...vel },
    homeSectorId: SECTOR,
    factionId: 'faction_free',
    data: { sectorId: SECTOR, homeSectorId: SECTOR, ...data },
  };
}

function bootSloughHarness({ simTime = 100, haulers = [] } = {}) {
  const player = makeShip(1, {}, { x: 0, z: 0 }, { x: 0, z: 0 });
  player.isPlayer = true;
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  const freighters = [];
  for (const h of haulers) {
    entities.set(h.id, h);
    entityList.push(h);
    freighters.push({ id: h.id, role: 'tanker', targetId: null, manifest: h.data.cargoManifest || null });
  }
  const state = {
    mode: 'flight',
    tick: 60,
    simTime,
    meta: { seed: SEED },
    playerId: 1,
    world: { currentSectorId: SECTOR, records: { byId: {} } },
    entities,
    entityList,
    traffic: {
      freighters,
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
    _volatileSlough: null,
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

function workingTanker(id, lines, pos = { x: 500, z: 500 }, vel = { x: 30, z: 0 }) {
  return makeShip(id, {
    jobId: `job:${id}`,
    trafficRole: 'tanker',
    cargoManifest: { lines, totalQty: lines.reduce((a, l) => a + l.qty, 0) },
    originStationId: 'station_ceres',
    destStationId: 'station_helios',
  }, pos, vel);
}

test('a due roll sloughs one armed volatile pod off a working tanker\'s stern', () => {
  const tanker = workingTanker(42, [
    { commodityId: 'cmdty_ice_water', qty: 10 },
    { commodityId: 'ore_iron', qty: 4 },
  ]);
  const { state, traffic, spawned } = bootSloughHarness({ haulers: [tanker] });
  state.traffic.nextVolatileSloughAt = state.simTime;
  traffic._stepVolatileSlough(1 / 60, state);

  assert.equal(spawned.length, 1, 'one pod — a slough, not a dump');
  const pod = spawned[0];
  assert.equal(pod.data.volatileSlough, true, 'stamped as the slough');
  assert.equal(pod.data.shedFromJobId, 'job:42');
  assert.equal(pod.data.commodityId, 'cmdty_ice_water', 'the dominant volatile lot sheds');
  assert.equal(pod.data.amount, 1, 'one canister — a mine, not a load');
  assert.equal(pod.type, 'payload', 'a real jettisoned-cargo body');

  // The volatile machinery stamps the hazard automatically — lamp + slam class read.
  assert.equal(pod.data.volatileClass, 'cryogenic', 'hazard class stamped');
  assert.equal(pod.data.volatileLamp, 'cyan', 'the lamp reads through the render stamp');
  assert.equal(pod.data.volatileSilhouette, volatileClassOf('cmdty_ice_water').silhouetteNote);

  // Stern placement + lag — it drops into the lane behind, still loose and dangerous.
  const fwdX = tanker.vel.x / Math.hypot(tanker.vel.x, tanker.vel.z);
  const fwdZ = tanker.vel.z / Math.hypot(tanker.vel.x, tanker.vel.z);
  const relX = pod.pos.x - tanker.pos.x;
  const relZ = pod.pos.z - tanker.pos.z;
  assert.ok(relX * fwdX + relZ * fwdZ < 0, 'the mine slips off the stern, behind');
  assert.ok(pod.vel.x < tanker.vel.x, 'it lags the tanker into the lane');

  // Owned freight — it is that tanker's canister; the custody answer is unchanged.
  assert.equal(pod.data.ownerId, tanker.id);
  assert.equal(pod.data.originId, 'station_ceres');
  assert.equal(pod.data.destinationId, 'station_helios');

  assert.ok(traffic._volatileSlough && traffic._volatileSlough.podId === pod.id);
  assert.equal(traffic._volatileSlough.tankerId, tanker.id);
});

test('an inert manifest sheds nothing — the mine is the volatile lot, not any freight', () => {
  const inert = workingTanker(7, [{ commodityId: 'ore_iron', qty: 20 }]);
  const { state, traffic, spawned } = bootSloughHarness({ haulers: [inert] });
  state.traffic.nextVolatileSloughAt = state.simTime;
  traffic._stepVolatileSlough(1 / 60, state);
  assert.equal(spawned.length, 0, 'no volatile line, no slough');
  assert.equal(traffic._volatileSlough, null);
});

test('a hauler-role roster sheds nothing — only tankers carry the pressure load', () => {
  const { state, traffic, spawned } = bootSloughHarness({ haulers: [] });
  state.traffic.freighters = [{ id: 9, role: 'hauler', targetId: null }];
  const hauler = makeShip(9, {
    jobId: 'job:9',
    cargoManifest: { lines: [{ commodityId: 'cmdty_ice_water', qty: 8 }], totalQty: 8 },
  }, { x: 300, z: 300 });
  state.entities.set(9, hauler);
  state.entityList.push(hauler);
  state.traffic.nextVolatileSloughAt = state.simTime;
  traffic._stepVolatileSlough(1 / 60, state);
  assert.equal(spawned.length, 0, 'volatile freight on a non-tanker stays aboard');
});

test('a loose slough blocks the next roll until it is gone', () => {
  const tanker = workingTanker(42, [{ commodityId: 'cmdty_gas_hydrogen', qty: 6 }]);
  const { state, traffic, spawned } = bootSloughHarness({ haulers: [tanker] });
  state.traffic.nextVolatileSloughAt = state.simTime;
  traffic._stepVolatileSlough(1 / 60, state);
  assert.equal(spawned.length, 1);
  traffic._stepVolatileSlough(1 / 60, state);
  assert.equal(spawned.length, 1, 'one mine in the lane at a time');

  state.entities.get(spawned[0].id).alive = false;
  state.traffic.nextVolatileSloughAt = state.simTime;
  traffic._stepVolatileSlough(1 / 60, state);
  assert.equal(spawned.length, 2, 'a cleared lane re-arms the roll');
});

test('the slough clock round-trips a save; a stale save re-rolls', () => {
  const tanker = workingTanker(42, [{ commodityId: 'cmdty_volatiles', qty: 5 }]);
  const { state, traffic } = bootSloughHarness({ haulers: [tanker] });
  traffic._stepVolatileSlough(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextVolatileSloughAt), 'clock self-seeded');
  const clock = state.traffic.nextVolatileSloughAt;

  const saved = traffic.serialize();
  assert.equal(saved.nextVolatileSloughAt, clock, 'the clock serializes');

  const { state: s2, traffic: t2 } = bootSloughHarness({ haulers: [tanker] });
  t2.deserialize(saved);
  assert.equal(s2.traffic.nextVolatileSloughAt, clock, 'clock survives a Continue');
  assert.equal(t2._volatileSlough, null, 'live record never serializes');

  const { state: s3, traffic: t3 } = bootSloughHarness();
  t3.deserialize({ freighters: [] });
  assert.equal(s3.traffic.nextVolatileSloughAt, undefined, 'no phantom clock');
  t3._stepVolatileSlough(1 / 60, s3);
  assert.ok(Number.isFinite(s3.traffic.nextVolatileSloughAt), 'first step re-seeds it');
});
