/**
 * CR-CHAIN (build_map §23.2) — "a hitch on a working miner": braid jobs x cargo.
 *
 * Seconds-scale contract test for the traffic-owned shed roll: a loaded hauler under way
 * drops one real cargo pod of its own manifest off the stern. The pod keeps the hauler's
 * owner identity (taking it answers the owned-cargo read, it is not a free find), spawns
 * behind the hull on the hauler's own velocity, and obeys the ordinary jettisoned-cargo
 * cap. Pins the candidate pick, stern placement, ownership stamps, cadence persistence,
 * the one-loose-hitch guard, and save/newGame lifecycle. Deterministic seed 4242.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

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

function bootHitchHarness({ simTime = 100, haulers = [] } = {}) {
  const player = makeShip(1, {}, { x: 0, z: 0 }, { x: 0, z: 0 });
  player.isPlayer = true;
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  const freighters = [];
  for (const h of haulers) {
    entities.set(h.id, h);
    entityList.push(h);
    freighters.push({ id: h.id, role: 'hauler', targetId: null, manifest: h.data.cargoManifest || null });
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
    _hitchShed: null,
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

function workingHauler(id, pos = { x: 500, z: 500 }, vel = { x: 30, z: 0 }) {
  return makeShip(id, {
    jobId: `job:${id}`,
    cargoManifest: { lines: [{ commodityId: 'ore_iron', qty: 12 }], totalQty: 12 },
    originStationId: 'station_ceres',
    destStationId: 'station_helios',
  }, pos, vel);
}

test('a due roll sheds one real cargo pod off a working hauler\'s stern', () => {
  const hauler = workingHauler(42);
  const { state, traffic, spawned } = bootHitchHarness({ haulers: [hauler] });
  state.traffic.nextHitchShedAt = state.simTime;
  traffic._stepHitchShed(1 / 60, state);

  assert.equal(spawned.length, 1, 'one pod per roll — a piece, not a jettison');
  const pod = spawned[0];
  assert.equal(pod.data.hitchShed, true, 'the pod is stamped as this truck\'s hitch');
  assert.equal(pod.data.shedFromJobId, 'job:42');
  assert.equal(pod.data.commodityId, 'ore_iron', 'the shed is of its own manifest line');
  assert.ok(pod.data.amount >= 1 && pod.data.amount <= 3, `a piece, got ${pod.data.amount}`);
  assert.ok((pod.data.amount || 0) < 12, 'a piece off the manifest, not the load');

  // Stern placement: behind the hull on its own velocity minus a back-off.
  const relX = pod.pos.x - hauler.pos.x;
  const relZ = pod.pos.z - hauler.pos.z;
  const fwdX = hauler.vel.x / Math.hypot(hauler.vel.x, hauler.vel.z);
  const fwdZ = hauler.vel.z / Math.hypot(hauler.vel.x, hauler.vel.z);
  assert.ok(relX * fwdX + relZ * fwdZ < 0, 'the pod drops behind, not ahead');
  assert.ok(pod.vel.x < hauler.vel.x, 'the shed lags the truck — it slips back into the lane');

  // Ownership: it is that truck's freight — the owned-cargo read, not a free find.
  assert.equal(pod.data.ownerId, hauler.id);
  assert.equal(pod.data.originId, 'station_ceres');
  assert.equal(pod.data.destinationId, 'station_helios');
  assert.equal(pod.type, 'payload', 'a real cargo pod through the physical pipeline');

  assert.ok(traffic._hitchShed && traffic._hitchShed.podId === pod.id);
  assert.equal(traffic._hitchShed.haulerId, hauler.id);
});

test('an empty/docked/unmanifested roster sheds nothing', () => {
  const idle = makeShip(7, { jobId: 'job:7' }, { x: 100, z: 100 }, { x: 2, z: 0 }); // too slow
  const empty = makeShip(8, { jobId: 'job:8', cargoManifest: { lines: [] } }, { x: 200, z: 200 });
  const offJob = makeShip(9, { cargoManifest: { lines: [{ commodityId: 'ore_iron', qty: 5 }] } },
    { x: 300, z: 300 });
  const { state, traffic, spawned } = bootHitchHarness({ haulers: [idle, empty, offJob] });
  state.traffic.nextHitchShedAt = state.simTime;
  traffic._stepHitchShed(1 / 60, state);
  assert.equal(spawned.length, 0, 'nothing working-and-loaded, nothing shed');
  assert.equal(traffic._hitchShed, null);
});

test('a loose hitch blocks the next shed until it is gone', () => {
  const hauler = workingHauler(42);
  const { state, traffic, spawned } = bootHitchHarness({ haulers: [hauler] });
  state.traffic.nextHitchShedAt = state.simTime;
  traffic._stepHitchShed(1 / 60, state);
  assert.equal(spawned.length, 1);
  traffic._stepHitchShed(1 / 60, state);
  assert.equal(spawned.length, 1, 'the last pod still loose — no second shed');

  state.entities.get(spawned[0].id).alive = false;
  state.traffic.nextHitchShedAt = state.simTime;
  traffic._stepHitchShed(1 / 60, state);
  assert.equal(spawned.length, 2, 'a gone hitch frees the slot');
});

test('the cadence persists across save/load and resets on new game', () => {
  const hauler = workingHauler(42);
  const { state, traffic } = bootHitchHarness({ haulers: [hauler] });
  traffic._stepHitchShed(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextHitchShedAt), 'clock self-seeded');
  const clock = state.traffic.nextHitchShedAt;

  const saved = traffic.serialize();
  assert.equal(saved.nextHitchShedAt, clock, 'the shed clock serializes');

  const { state: s2, traffic: t2 } = bootHitchHarness({ haulers: [workingHauler(42)] });
  t2.deserialize(saved);
  assert.equal(s2.traffic.nextHitchShedAt, clock, 'clock survives a Continue');
  assert.equal(t2._hitchShed, null, 'live record never serializes');

  t2.newGame();
  t2._stepHitchShed(1 / 60, s2);
  assert.ok(Number.isFinite(s2.traffic.nextHitchShedAt)
    && s2.traffic.nextHitchShedAt !== clock || s2.traffic.nextHitchShedAt > s2.simTime,
    'a new run re-rolls the clock');
});

test('a stale save without the clock normalizes to a fresh roll', () => {
  const { state, traffic } = bootHitchHarness();
  traffic.deserialize({ freighters: [] });
  assert.equal(state.traffic.nextHitchShedAt, undefined, 'no phantom clock from a stale save');
  traffic._stepHitchShed(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextHitchShedAt), 'first step re-seeds it');
});
