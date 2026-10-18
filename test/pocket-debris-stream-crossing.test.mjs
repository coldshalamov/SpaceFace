/**
 * ev_debris_stream_crossing — a ribbon of small fast debris rocks rakes the corridor on
 * parallel ballistic vectors (microevent catalog, environmental).
 *
 * Seconds-scale contract test for the traffic-owned environmental roll: rake spawn spec,
 * shared-heading ribbon, collidable/hazard shape, one-at-a-time guard, scheduler cadence,
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

function bootStreamHarness({ simTime = 10, playerPos = { x: 0, z: 0 } } = {}) {
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
    _debrisStream: null,
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

test('a due roll spawns a rake of fast collidable rocks on parallel headings', () => {
  const { state, traffic, player, spawned } = bootStreamHarness();
  state.traffic.nextDebrisStreamAt = state.simTime;
  traffic._stepPocketDebrisStream(1 / 60, state);
  assert.ok(spawned.length >= 8 && spawned.length <= 10,
    `8-10 rocks per the catalog, got ${spawned.length}`);

  const rocks = spawned.filter((e) => e.data && e.data.debrisStream === true);
  assert.equal(rocks.length, spawned.length, 'every rock carries the event stamp');

  // Fast and parallel — the "dangerous cousin": a strike, not a nudge.
  const speeds = rocks.map((r) => Math.hypot(r.vel.x, r.vel.z));
  for (const s of speeds) assert.ok(s >= 190 && s <= 310, `fast linear read, got ${s}`);
  const units = rocks.map((r, i) => ({ x: r.vel.x / speeds[i], z: r.vel.z / speeds[i] }));
  const meanX = units.reduce((a, u) => a + u.x, 0) / units.length;
  const meanZ = units.reduce((a, u) => a + u.z, 0) / units.length;
  const norm = Math.hypot(meanX, meanZ);
  for (const u of units) {
    const dot = u.x * meanX + u.z * meanZ;
    assert.ok(dot / norm > 0.99,
      `parallel vectors — heading jitter stays under ~8°, dot ${dot / norm}`);
  }

  // Small, collidable, dynamic, minable on the way through.
  for (const r of rocks) {
    assert.equal(r.type, 'asteroid');
    assert.equal(r.collides, true, 'a caught hull takes a real strike');
    assert.equal(r.physicsBody && r.physicsBody.dynamic, true);
    assert.ok(r.radius >= 2 && r.radius <= 4.5, `small rocks, got ${r.radius}`);
    assert.ok(r.data.oreHP > 0 && r.data.yieldU >= 2, 'thread or mine — both authored');
    assert.ok(r.data.despawnAt > state.simTime, 'the despawn sweep owns the exit');
  }

  // The rake crosses where the player is looking.
  for (const r of rocks) {
    const d = Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z);
    assert.ok(d >= 2000 && d <= 3300, `ribbon enters at the pocket edge, got ${d}`);
  }
  assert.ok(traffic._debrisStream && traffic._debrisStream.rockIds.length === rocks.length);
});

test('one stream at a time: a live rake blocks the next roll', () => {
  const { state, traffic, spawned } = bootStreamHarness();
  const first = traffic._spawnPocketDebrisStream(state);
  assert.ok(first && first.length > 0, 'first roll spawns');
  assert.equal(traffic._spawnPocketDebrisStream(state), null,
    'a live stream blocks a second concurrent rake');
  const count = spawned.length;
  for (const e of spawned) e.alive = false;
  const second = traffic._spawnPocketDebrisStream(state);
  assert.ok(second && second.length > 0, 'a gone stream frees the slot');
  assert.ok(spawned.length > count);
});

test('the scheduler waits, fires once on its due tick, and re-arms the clock', () => {
  const { state, traffic, spawned } = bootStreamHarness();
  traffic._stepPocketDebrisStream(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextDebrisStreamAt));
  assert.ok(state.traffic.nextDebrisStreamAt > state.simTime, 'first stream is scheduled');
  assert.equal(spawned.length, 0);

  const due = state.traffic.nextDebrisStreamAt;
  state.simTime = due - 1;
  traffic._stepPocketDebrisStream(1 / 60, state);
  assert.equal(spawned.length, 0, 'no stream before the due tick');
  state.simTime = due;
  traffic._stepPocketDebrisStream(1 / 60, state);
  assert.ok(spawned.length >= 8, 'the due tick fires the rake');
  assert.ok(state.traffic.nextDebrisStreamAt > due, 'the clock re-arms into the future');
});

test('the stream clock round-trips a save; a stale save re-rolls', () => {
  const { state, traffic } = bootStreamHarness();
  traffic._stepPocketDebrisStream(1 / 60, state);
  const due = state.traffic.nextDebrisStreamAt;
  const saved = traffic.serialize();
  assert.equal(saved.nextDebrisStreamAt, due, 'the schedule is on the save envelope');

  const h2 = bootStreamHarness();
  h2.traffic.deserialize(saved);
  assert.equal(h2.state.traffic.nextDebrisStreamAt, due, 'Continue keeps the roll');

  const h3 = bootStreamHarness();
  h3.traffic.deserialize({ schema: 'spaceface.ceresMinerHaulerHandoff.v1' });
  assert.equal(h3.state.traffic.nextDebrisStreamAt, undefined,
    'an older save without the clock simply re-rolls');
});
