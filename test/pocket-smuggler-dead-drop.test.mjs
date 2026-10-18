/**
 * ev_smuggler_dumps_cache — one dark contraband cache is dead-dropped beside a landmark
 * rock (microevent catalog, crime).
 *
 * Seconds-scale contract test for the traffic-owned roll: cache shape (contraband cargo,
 * unlit drop, slow creep, TTL), landmark anchoring, one-at-a-time guard, scheduler cadence,
 * and save clock. Does not touch goldens or render.
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

function bootCacheHarness({ simTime = 10, playerPos = { x: 0, z: 0 }, rocks = [] } = {}) {
  const player = makeEntity(1, 'ship', {}, playerPos);
  player.isPlayer = true;
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  for (const rock of rocks) {
    entities.set(rock.id, rock);
    entityList.push(rock);
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
    _smugglerCache: null,
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

test('a due roll dead-drops one unlit contraband cache beside a landmark rock', () => {
  const rock = makeEntity(7, 'asteroid', { typeId: 'ast_common_rock' }, { x: 900, z: 300 });
  const { state, traffic, spawned } = bootCacheHarness({ rocks: [rock] });
  state.traffic.nextSmugglerCacheAt = state.simTime;
  traffic._stepSmugglerDeadDrop(1 / 60, state);
  assert.equal(spawned.length, 1, 'one cache per due roll');

  const cache = spawned[0];
  assert.equal(cache.type, 'pickup');
  assert.equal(cache.data.smugglerCache, true);
  assert.equal(cache.data.unlitDrop, true, 'no strobe, no ring — catch it by silhouette');
  assert.equal(cache.data.kind, 'cargo');
  assert.equal(cache.data.commodityId, 'cmdty_stolen_goods',
    'real contraband-class cargo — taking it is the hot find');
  assert.equal(cache.data.legality, 'contraband');
  assert.ok(cache.data.amount >= 4 && cache.data.amount <= 8,
    `a worthwhile haul, got ${cache.data.amount}`);
  assert.equal(cache.collides, true);
  assert.ok(cache.data.despawnAt > state.simTime, 'the despawn sweep clears an unclaimed drop');

  // Beside the landmark — within the authored offset band of the rock.
  const d = Math.hypot(cache.pos.x - rock.pos.x, cache.pos.z - rock.pos.z);
  assert.ok(d >= 70 && d <= 140.5, `drops beside the landmark, got ${d}`);

  // A flyby shed: the cache creeps on the hull's release velocity, never parked.
  const speed = Math.hypot(cache.vel.x, cache.vel.z);
  assert.ok(speed > 0 && speed <= 4.5, `slow creep off the release leg, got ${speed}`);
  assert.ok(traffic._smugglerCache && traffic._smugglerCache.cacheId === cache.id);
});

test('with no rock in reach the drop still happens on a hashed bearing off the route', () => {
  const { state, traffic, spawned, player } = bootCacheHarness();
  state.traffic.nextSmugglerCacheAt = state.simTime;
  traffic._stepSmugglerDeadDrop(1 / 60, state);
  assert.equal(spawned.length, 1, 'the landmark is a cue, not a hard gate');
  const cache = spawned[0];
  const d = Math.hypot(cache.pos.x - player.pos.x, cache.pos.z - player.pos.z);
  assert.ok(d >= 400 && d <= 560, `dead drop lands off the lane, got ${d}`);
});

test('one cache at a time: a live dead drop blocks the next roll', () => {
  const { state, traffic, spawned } = bootCacheHarness();
  const first = traffic._spawnSmugglerDeadDrop(state);
  assert.ok(first, 'first roll drops');
  assert.equal(traffic._spawnSmugglerDeadDrop(state), null,
    'a live cache blocks a second concurrent drop');
  assert.equal(spawned.length, 1);
  first.alive = false;
  const second = traffic._spawnSmugglerDeadDrop(state);
  assert.ok(second && second.id !== first.id, 'a collected cache frees the slot');
  assert.equal(spawned.length, 2);
});

test('the scheduler waits, fires once on its due tick, and re-arms the clock', () => {
  const { state, traffic, spawned } = bootCacheHarness();
  traffic._stepSmugglerDeadDrop(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextSmugglerCacheAt));
  assert.ok(state.traffic.nextSmugglerCacheAt > state.simTime, 'first drop is scheduled');
  assert.equal(spawned.length, 0);

  const due = state.traffic.nextSmugglerCacheAt;
  state.simTime = due - 1;
  traffic._stepSmugglerDeadDrop(1 / 60, state);
  assert.equal(spawned.length, 0, 'no drop before the due tick');
  state.simTime = due;
  traffic._stepSmugglerDeadDrop(1 / 60, state);
  assert.equal(spawned.length, 1, 'the due tick drops the cache');
  assert.ok(state.traffic.nextSmugglerCacheAt > due, 'the clock re-arms into the future');
});

test('the cache clock round-trips a save; a stale save re-rolls', () => {
  const { state, traffic } = bootCacheHarness();
  traffic._stepSmugglerDeadDrop(1 / 60, state);
  const due = state.traffic.nextSmugglerCacheAt;
  const saved = traffic.serialize();
  assert.equal(saved.nextSmugglerCacheAt, due, 'the schedule is on the save envelope');

  const h2 = bootCacheHarness();
  h2.traffic.deserialize(saved);
  assert.equal(h2.state.traffic.nextSmugglerCacheAt, due, 'Continue keeps the roll');

  const h3 = bootCacheHarness();
  h3.traffic.deserialize({ schema: 'spaceface.ceresMinerHaulerHandoff.v1' });
  assert.equal(h3.state.traffic.nextSmugglerCacheAt, undefined,
    'an older save without the clock simply re-rolls');
});
