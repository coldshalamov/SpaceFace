/**
 * CR-WEIR (build_map §23.2) — "the toll that runs itself": a hauler threading the customs
 * weir pays its toll in kind. One token pod of STATION-OWNED freight slips off at the
 * crossing and settles almost still — the till piles where the lane pays; when the pile
 * fills, the booth banks the oldest pod. The player who snatches one answers the
 * owned-cargo read against the customs station.
 *
 * Seconds-scale contract test against the REAL Helios corridor weir: crossing detection,
 * toll placement and near-still settle, station ownership, the embargo beat, the booth's
 * banking pass, the moving-only rule, and lifecycle resets. Deterministic seed 4242.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import { HELIOS_CUSTOMS_WEIR, pointInsideCustomsWeir } from '../src/world/customsWeir.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';
const WEIR = HELIOS_CUSTOMS_WEIR;

function makeShip(id, data = {}, pos, vel = { x: 0, z: 30 }) {
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

function bootWeirHarness({ simTime = 100, haulers = [] } = {}) {
  const player = makeShip(1, {}, { x: 0, z: 0 }, { x: 0, z: 0 });
  player.isPlayer = true;
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  const freighters = [];
  for (const h of haulers) {
    entities.set(h.id, h);
    entityList.push(h);
    freighters.push({ id: h.id, role: 'hauler', targetId: null });
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
    _weirInside: new Set(),
    _weirTill: [],
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

function tollHauler(id, pos) {
  return makeShip(id, { jobId: `job:${id}` }, pos, { x: 0, z: 30 });
}

test('a hauler crossing the weir sheds one station-owned toll pod that settles', () => {
  const inside = { x: WEIR.center.x, z: WEIR.center.z };
  assert.ok(pointInsideCustomsWeir(WEIR, inside), 'fixture: the spawn sits inside the weir');
  const hauler = tollHauler(42, inside);
  const { state, traffic, spawned } = bootWeirHarness({ haulers: [hauler] });

  // Inside one tick — no toll yet.
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(spawned.length, 0, 'inside is not a crossing');

  // Out the gap — still making way. The toll slips off where the lane paid.
  hauler.pos.z = WEIR.center.z + WEIR.halfLength + 40;
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(spawned.length, 1, 'one token pod per crossing');
  const pod = spawned[0];
  assert.equal(pod.data.tollPaid, true);
  assert.equal(pod.data.tollWeirId, 'helios_customs_weir');
  assert.equal(pod.data.shedFromJobId, 'job:42');
  assert.equal(pod.data.commodityId, 'cmdty_scrap_metal');
  assert.equal(pod.data.amount, 1, 'a token, not a load');
  assert.equal(pod.data.ownerId, 'station_helios',
    'the till is station freight — snatching it answers to the booth');
  assert.equal(pod.data.pickupEmbargoUntil, state.simTime + 20,
    'the paying hull clears before the pod is takeable');
  const drift = Math.hypot(pod.vel.x, pod.vel.z);
  assert.ok(drift < 10, `the pod settles almost still, drift ${drift}`);
  assert.equal(pod.type, 'payload', 'a real jettisoned-cargo body');
  assert.equal(pod.pos.x, hauler.pos.x);
  assert.equal(pod.pos.z, hauler.pos.z);
  assert.deepEqual([...traffic._weirTill], [pod.id]);
});

test('a held or crawling hull pays nothing — the toll is on the crossing, not the stop', () => {
  const inside = { x: WEIR.center.x, z: WEIR.center.z };
  const held = tollHauler(7, inside);
  held.vel = { x: 0, z: 2 }; // below the crossing line — a hull held under the beam
  const { state, traffic, spawned } = bootWeirHarness({ haulers: [held] });
  traffic._stepWeirTill(1 / 60, state);
  held.pos.z = WEIR.center.z + WEIR.halfLength + 40;
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(spawned.length, 0, 'a slow exit is a hold, not a crossing');
});

test('no toll outside a weir sector and no double-toll on re-crossing detection', () => {
  const hauler = tollHauler(42, { x: WEIR.center.x, z: WEIR.center.z });
  const { state, traffic, spawned } = bootWeirHarness({ haulers: [hauler] });
  traffic._stepWeirTill(1 / 60, state);
  hauler.pos.z = WEIR.center.z + WEIR.halfLength + 40;
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(spawned.length, 1);
  // Next tick outside — already tallied, no second pod for the same crossing.
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(spawned.length, 1, 'the crossing edge fires once');

  // A sector without a weir clears the detector and pays nothing.
  state.world.currentSectorId = 'sector_no_weir';
  hauler.pos = { x: WEIR.center.x, z: WEIR.center.z };
  traffic._stepWeirTill(1 / 60, state);
  hauler.pos.z += 500;
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(spawned.length, 1, 'no weir, no toll');
});

test('the booth banks the oldest pod when the till fills', () => {
  const inside = { x: WEIR.center.x, z: WEIR.center.z };
  const hauler = tollHauler(42, inside);
  const { state, traffic, spawned } = bootWeirHarness({ haulers: [hauler] });

  const payOnce = () => {
    hauler.pos.z = WEIR.center.z; // back inside the corridor
    hauler.pos.x = WEIR.center.x;
    traffic._stepWeirTill(1 / 60, state);
    hauler.pos.z = WEIR.center.z + WEIR.halfLength + 40; // out the gap
    traffic._stepWeirTill(1 / 60, state);
  };
  for (let i = 0; i < 7; i++) payOnce();
  assert.equal(spawned.length, 7, 'seven crossings, seven tolls');

  // Till cap is 6: the oldest pod was banked by the booth, the pile holds at six live.
  const liveTill = spawned.filter((e) => e.alive !== false);
  assert.equal(liveTill.length, 6, 'the till breathes — the booth banks the overflow');
  assert.equal(spawned[0].alive, false, 'the oldest toll was banked');
  assert.equal(traffic._weirTill.length, 6);
  assert.ok(!traffic._weirTill.includes(spawned[0].id), 'banked pod left the ledger');
});

test('a player-snatched pod leaves the ledger; lifecycle resets clear the detector', () => {
  const inside = { x: WEIR.center.x, z: WEIR.center.z };
  const hauler = tollHauler(42, inside);
  const { state, traffic, spawned } = bootWeirHarness({ haulers: [hauler] });
  traffic._stepWeirTill(1 / 60, state);
  hauler.pos.z = WEIR.center.z + WEIR.halfLength + 40;
  traffic._stepWeirTill(1 / 60, state);
  const pod = spawned[0];
  pod.alive = false; // the player snatched the till pod
  traffic._stepWeirTill(1 / 60, state);
  assert.equal(traffic._weirTill.length, 0, 'taken freight leaves the till ledger');

  traffic.newGame();
  assert.equal(traffic._weirInside.size, 0, 'new run clears the crossing detector');
  assert.equal(traffic._weirTill.length, 0, 'new run clears the banking ledger');
});
