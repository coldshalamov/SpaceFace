/**
 * CR-FEED (build_map §23.2) — "a machine rhythmically chews a feed: a scrap chunk drifts
 * in, the mouth bites, ore spills out."
 *
 * Seconds-scale contract test for the traffic-owned feed roll against the REAL authored
 * kill machine (the Claim Cracker at sector_helios_prime): the chunk enters inside the
 * machine's own intake volume on a drift aimed at the mouth, holds in the jaws through
 * warning/calm, and bursts into ore pickups only on the machine's surge tick. Pins the
 * spawn geometry, the minable chunk, the rhythm gate, the product spit, the guard, and
 * the persisted cadence. Deterministic seed 4242.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import {
  killMachinesForSector,
  killMachinePhase,
  pointInsideMachineField,
  STARTER_FIELD_MACHINE,
} from '../src/data/environmentalMachinery.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';
const MACHINE = STARTER_FIELD_MACHINE;

function bootFeedHarness({ simTime = 10 } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: {},
  };
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
    _breakerFeed: null,
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

test('a due roll feeds a minable scrap chunk into the machine\'s own intake', () => {
  const { state, traffic, spawned } = bootFeedHarness();
  state.traffic.nextBreakerFeedAt = state.simTime;
  traffic._stepBreakerFeed(1 / 60, state);

  assert.equal(spawned.length, 1, 'one chunk per roll — a feed, not a spill');
  const chunk = spawned[0];
  assert.equal(chunk.type, 'asteroid');
  assert.equal(chunk.data.breakerFeed, true);
  assert.equal(chunk.data.breakerMachineId, MACHINE.id);
  assert.equal(chunk.collides, true);
  assert.equal(chunk.physicsBody && chunk.physicsBody.dynamic, true);
  assert.ok(chunk.data.oreHP > 0 && chunk.data.yieldU >= 2,
    'the feed is minable on the way in — steal the chew');
  assert.ok(chunk.data.despawnAt > state.simTime, 'a lost feed self-cleans');

  // Inside the machine's own intake volume — the field's real force can take it.
  assert.ok(pointInsideMachineField(MACHINE, MACHINE.fields[0], chunk.pos),
    'the chunk enters inside the authored intake, not outside it');

  // Aimed at the mouth.
  const mx = MACHINE.globalPos.x - chunk.pos.x;
  const mz = MACHINE.globalPos.z - chunk.pos.z;
  const mDist = Math.hypot(mx, mz);
  const vLen = Math.hypot(chunk.vel.x, chunk.vel.z);
  const dot = (chunk.vel.x * mx + chunk.vel.z * mz) / (vLen * mDist);
  assert.ok(dot > 0.99, `drift aimed at the mouth, dot ${dot}`);

  assert.ok(traffic._breakerFeed && traffic._breakerFeed.chunkId === chunk.id);
  assert.equal(traffic._breakerFeed.machineId, MACHINE.id);
});

test('the chunk waits in the jaws through calm and bursts on the surge tick', () => {
  const { state, traffic, spawned } = bootFeedHarness({ simTime: 0 });
  const chunk = traffic._spawnBreakerFeed(state);
  assert.ok(chunk, 'feed spawned');
  assert.equal(killMachinePhase(MACHINE, 0).phase, 'warning', 'fixture starts in warning');

  // Walk it to the rim during warning — it must hold, not burst.
  const rim = (MACHINE.mouth.radius || 18) + chunk.radius + 2;
  chunk.pos.x = MACHINE.globalPos.x - rim;
  chunk.pos.z = MACHINE.globalPos.z;
  traffic._stepBreakerFeed(1 / 60, state);
  assert.equal(chunk.alive, true, 'warning is not the bite');
  assert.equal(chunk.vel.x, 0, 'the feed holds in the jaws');

  // Calm — still waiting.
  state.simTime = 8; // calm band (2+3.5=5.5 .. 12)
  assert.equal(killMachinePhase(MACHINE, 8).phase, 'calm');
  traffic._stepBreakerFeed(1 / 60, state);
  assert.equal(chunk.alive, true, 'calm is not the bite');

  // Surge — the machine's own tick chews it into product pickups.
  state.simTime = 3;
  assert.equal(killMachinePhase(MACHINE, 3).phase, 'surge');
  const before = spawned.length;
  traffic._stepBreakerFeed(1 / 60, state);
  assert.equal(chunk.alive, false, 'the surge is the bite');
  assert.equal(traffic._breakerFeed, null, 'the feed record retires');

  const products = spawned.slice(before);
  assert.ok(products.length >= 2 && products.length <= 4,
    `ore spills out — 2-4 pieces, got ${products.length}`);
  for (const p of products) {
    assert.equal(p.type, 'pickup');
    assert.equal(p.data.kind, 'ore');
    assert.equal(p.data.commodityId, 'cmdty_scrap_metal', 'the chew product is scrap');
    assert.equal(p.data.breakerProduct, true);
    assert.ok(p.data.despawnAt > state.simTime, 'the product is a bounded pickup');
    const speed = Math.hypot(p.vel.x, p.vel.z);
    assert.ok(speed > 1, 'the mouth spits it back out');
  }
});

test('one feed at a time; a lost chunk frees the slot', () => {
  const { state, traffic, spawned } = bootFeedHarness();
  const first = traffic._spawnBreakerFeed(state);
  assert.ok(first);
  state.traffic.nextBreakerFeedAt = state.simTime;
  traffic._stepBreakerFeed(1 / 60, state);
  assert.equal(spawned.length, 1, 'the live feed blocks the roll');

  state.entities.get(first.id).alive = false;
  state.traffic.nextBreakerFeedAt = state.simTime;
  traffic._stepBreakerFeed(1 / 60, state);
  assert.equal(spawned.length, 2, 'a gone feed re-arms the roll');
});

test('a sector with no machine feeds nothing', () => {
  const { state, traffic, spawned } = bootFeedHarness();
  state.world.currentSectorId = 'sector_no_machines';
  state.traffic.nextBreakerFeedAt = state.simTime;
  traffic._stepBreakerFeed(1 / 60, state);
  assert.equal(spawned.length, 0);
  assert.equal(traffic._breakerFeed, null);
  assert.ok(killMachinesForSector('sector_no_machines').length === 0, 'fixture sanity');
});

test('the feed clock round-trips a save; a stale save re-rolls', () => {
  const { state, traffic } = bootFeedHarness();
  traffic._stepBreakerFeed(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextBreakerFeedAt), 'clock self-seeded');
  const clock = state.traffic.nextBreakerFeedAt;

  const saved = traffic.serialize();
  assert.equal(saved.nextBreakerFeedAt, clock);

  const { state: s2, traffic: t2 } = bootFeedHarness();
  t2.deserialize(saved);
  assert.equal(s2.traffic.nextBreakerFeedAt, clock, 'clock survives a Continue');
  assert.equal(t2._breakerFeed, null, 'live feed never serializes');

  const { state: s3, traffic: t3 } = bootFeedHarness();
  t3.deserialize({ freighters: [] });
  assert.equal(s3.traffic.nextBreakerFeedAt, undefined, 'no phantom clock');
  t3._stepBreakerFeed(1 / 60, s3);
  assert.ok(Number.isFinite(s3.traffic.nextBreakerFeedAt), 'first step re-seeds it');
});
