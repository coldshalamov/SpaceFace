/**
 * ev_meteor_passage — a wild rock crosses the pocket the player is in.
 *
 * Seconds-scale contract test for the traffic-owned environmental roll: spawn spec,
 * one-at-a-time guard, scheduler cadence, ballistic integration, and save clock.
 * Does not touch goldens or render.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
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

function bootMeteorHarness({ simTime = 10, playerPos = { x: 0, z: 0 } } = {}) {
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
  };
  traffic.init({ state, bus, helpers, registry: null });
  return { state, traffic, bus, player, spawned };
}

test('a due roll spawns one ballistic asteroid on a chord past the player', () => {
  const { state, traffic, player, spawned } = bootMeteorHarness();
  state.traffic.nextMeteorPassAt = state.simTime;
  traffic._stepPocketMeteorPass(1 / 60, state);
  assert.equal(spawned.length, 1, 'one meteor per due roll');

  const rock = spawned[0];
  assert.equal(rock.type, 'asteroid');
  assert.equal(rock.data.meteorPassage, true);
  assert.equal(rock.physicsBody && rock.physicsBody.dynamic, true,
    'dynamic body — movables/spatial lanes + Rapier linvel + despawn sweep membership');
  assert.equal(rock.collides, true);

  const speed = Math.hypot(rock.vel.x, rock.vel.z);
  assert.ok(speed >= 120 && speed <= 170, `3-4x traffic read, got ${speed}`);
  const entryDist = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
  assert.ok(entryDist >= 2400 && entryDist <= 2900,
    `entry on the pocket-edge band, got ${entryDist}`);
  // The chord passes inside the miss band of the player's own lane.
  const miss = Math.abs((player.pos.x - rock.pos.x) * rock.vel.z
    - (player.pos.z - rock.pos.z) * rock.vel.x) / speed;
  assert.ok(miss <= 900, `chord aims past where the player is looking, miss ${miss}`);

  // Mineable on the way through, transient by construction.
  assert.ok(rock.data.oreHP > 0 && rock.data.oreHP === rock.data.oreHPMax);
  assert.ok(rock.data.yieldU >= 3);
  assert.equal(rock.data.typeId, 'ast_common_rock');
  assert.equal(rock.data.fieldId, undefined, 'no field — no durable resource body');
  assert.equal(rock.data.asteroidSlotId, undefined);
  assert.equal(rock.data.activityObjectSlotId, undefined);
  const travelS = 2 * 2600 / speed;
  assert.ok(rock.data.despawnAt > state.simTime + travelS
    && rock.data.despawnAt <= state.simTime + travelS + 6.1,
    'the ordinary despawn sweep owns the exit leg');
  assert.ok(traffic._meteorPass && traffic._meteorPass.rockId === rock.id);
});

test('one pass at a time: a live rock blocks the next roll until it is gone', () => {
  const { state, traffic, spawned } = bootMeteorHarness();
  const first = traffic._spawnPocketMeteor(state);
  assert.ok(first, 'first roll spawns');
  assert.equal(traffic._spawnPocketMeteor(state), null,
    'a live meteor blocks a second concurrent pass');
  assert.equal(spawned.length, 1);

  first.alive = false;
  const second = traffic._spawnPocketMeteor(state);
  assert.ok(second && second.id !== first.id, 'a dead rock frees the slot for the next pass');
  assert.equal(spawned.length, 2);
});

test('the scheduler waits, fires once on its due tick, and re-arms the clock', () => {
  const { state, traffic, spawned } = bootMeteorHarness();
  // Boot step: no clock yet → the roll initializes the schedule without spawning.
  traffic._stepPocketMeteorPass(1 / 60, state);
  assert.ok(Number.isFinite(state.traffic.nextMeteorPassAt));
  assert.ok(state.traffic.nextMeteorPassAt > state.simTime, 'first pass is scheduled, not forced');
  assert.equal(spawned.length, 0);

  const due = state.traffic.nextMeteorPassAt;
  state.simTime = due - 1;
  traffic._stepPocketMeteorPass(1 / 60, state);
  assert.equal(spawned.length, 0, 'no spawn before the due tick');
  state.simTime = due;
  traffic._stepPocketMeteorPass(1 / 60, state);
  assert.equal(spawned.length, 1, 'the due tick fires the pass');
  assert.ok(state.traffic.nextMeteorPassAt > due, 'the clock re-arms into the future');

  // While the pass lives, a due roll re-arms without spawning a second rock.
  state.simTime = state.traffic.nextMeteorPassAt + 1;
  traffic._stepPocketMeteorPass(1 / 60, state);
  assert.equal(spawned.length, 1, 'still one rock while the pass lives');
});

test('the spawned rock integrates ballistically and spins on its own tumble', () => {
  const { state, traffic, spawned } = bootMeteorHarness();
  const rock = traffic._spawnPocketMeteor(state);
  assert.ok(rock);
  const x0 = rock.pos.x;
  const z0 = rock.pos.z;
  const r0 = rock.rot;
  physics.integrate(1 / 60, state);
  const moved = Math.hypot(rock.pos.x - x0, rock.pos.z - z0);
  const speed = Math.hypot(rock.vel.x, rock.vel.z);
  assert.ok(Math.abs(moved - speed / 60) < 1e-6,
    `compat integrator moves it exactly vel*dt, moved ${moved}`);
  assert.ok(rock.rot !== r0, 'angVel tumbles it');
  assert.equal(spawned.length, 1);
});

test('the sky clock round-trips a save; a stale save re-rolls', () => {
  const { state, traffic } = bootMeteorHarness();
  traffic._stepPocketMeteorPass(1 / 60, state);
  const due = state.traffic.nextMeteorPassAt;
  const saved = traffic.serialize();
  assert.equal(saved.nextMeteorPassAt, due, 'the schedule is on the save envelope');

  const h2 = bootMeteorHarness();
  h2.traffic.deserialize(saved);
  assert.equal(h2.state.traffic.nextMeteorPassAt, due, 'Continue keeps the roll');

  const h3 = bootMeteorHarness();
  h3.traffic.deserialize({ schema: 'spaceface.ceresMinerHaulerHandoff.v1' });
  assert.equal(h3.state.traffic.nextMeteorPassAt, undefined,
    'an older save without the clock simply re-rolls');
});
