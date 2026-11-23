import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { getAsteroidFieldRock, insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import {
  PROJECTILE_FLIGHT_SECONDS,
  PROJECTILE_LIVE_CAP,
  projectileFlightPlan,
  projectileTravelLimit,
  refreshFlightAfterBounce,
  reserveProjectileCapacity,
} from '../src/combat/projectileFlight.js';

function sweepHost(state, bus, helpers) {
  const host = Object.create(physics);
  host.init({ state, bus, helpers });
  return host;
}

test('a fired round outlives the engagement range and still ends', () => {
  const plan = projectileFlightPlan(240, 320);
  assert.ok(plan.seconds >= PROJECTILE_FLIGHT_SECONDS);
  assert.ok(plan.flightDistance >= 320 * PROJECTILE_FLIGHT_SECONDS);
  assert.equal(plan.ttl, plan.seconds);
  assert.equal(projectileTravelLimit({ maxDistance: 240, flightDistance: plan.flightDistance }), plan.flightDistance);
  assert.equal(projectileTravelLimit({ maxDistance: 240 }), 240);
  const slow = projectileFlightPlan(1400, 80);
  assert.ok(slow.flightDistance >= 1400, 'an authored range longer than the clock stays reachable');
});

test('the live cap retires the oldest rounds and keeps a bounded set', () => {
  const entityList = [];
  for (let i = 0; i < PROJECTILE_LIVE_CAP; i++) {
    entityList.push({ id: i, type: 'projectile', alive: true });
  }
  const state = { entityList };
  const retired = reserveProjectileCapacity(state, 1);
  assert.equal(retired, 1);
  assert.equal(entityList[0].alive, false);
  assert.equal(entityList[1].alive, true);
  assert.equal(reserveProjectileCapacity(state, 0), 0);
});

test('the indexed cap admits rounds past spent rows and still retires the oldest live one when full', () => {
  const projectiles = Array.from({ length: PROJECTILE_LIVE_CAP - 1 }, (_, id) =>
    ({ id, type: 'projectile', alive: id !== 0 }));
  const state = { entityIndex: { __spacefaceEntityIndexV1: true, projectiles } };

  assert.equal(reserveProjectileCapacity(state, 1), 0);
  projectiles.push({ id: PROJECTILE_LIVE_CAP - 1, type: 'projectile', alive: true });
  assert.equal(reserveProjectileCapacity(state, 1), 0);
  projectiles.push({ id: PROJECTILE_LIVE_CAP, type: 'projectile', alive: true });
  assert.equal(reserveProjectileCapacity(state, 1), 1);
  assert.equal(projectiles[1].alive, false);
  assert.equal(projectiles[2].alive, true);
});

test('the live-count memo agrees across repeated reserves and lane churn invalidates it', () => {
  const laneVersions = { projectiles: 7 };
  const projectiles = Array.from({ length: PROJECTILE_LIVE_CAP }, (_, id) =>
    ({ id, type: 'projectile', alive: true }));
  projectiles[0].alive = false;
  projectiles[1].alive = false;
  const state = { entityIndex: { __spacefaceEntityIndexV1: true, projectiles, laneVersions } };
  // CAP-2 live: two more fit exactly; a third overflows by one and retires the oldest live row.
  assert.equal(reserveProjectileCapacity(state, 2), 0);
  assert.equal(reserveProjectileCapacity(state, 2), 0, 'the memo path returns the same verdict');
  assert.equal(reserveProjectileCapacity(state, 3), 1);
  assert.equal(projectiles[2].alive, false);
  assert.equal(projectiles[3].alive, true);
  // The exact bound left by the scan serves the next reserve without a rescan.
  assert.equal(reserveProjectileCapacity(state, 3), 0);
  assert.equal(reserveProjectileCapacity(state, 4), 1);
  assert.equal(projectiles[3].alive, false);
  // A silent death only lowers the true count — the cached bound stays conservative.
  projectiles[4].alive = false;
  assert.equal(reserveProjectileCapacity(state, 4), 0);
  // A structural lane change (spawn push / corpse sweep analogue) forces a rescan.
  laneVersions.projectiles += 1;
  projectiles.push({ id: PROJECTILE_LIVE_CAP + 5, type: 'projectile', alive: true });
  assert.equal(reserveProjectileCapacity(state, 5), 1);
  assert.equal(projectiles[5].alive, false);
});

test('a bounce refreshes enough travel to come back, then stops refreshing', () => {
  const projectile = {
    pos: { x: 900, z: 0 },
    vel: { x: -320, z: 0 },
    ttl: 0.4,
    data: {
      spawnPos: { x: 0, z: 0 },
      maxDistance: 240,
      flightDistance: 240,
      bounceRefreshes: 0,
    },
  };
  assert.equal(refreshFlightAfterBounce(projectile, { x: 0, z: 0 }), true);
  assert.ok(projectile.ttl >= 0.4);
  assert.ok(projectile.data.flightDistance > 240);
  assert.deepEqual(projectile.data.spawnPos, { x: 900, z: 0 });
  projectile.data.bounceRefreshes = 3;
  const frozen = projectile.data.flightDistance;
  assert.equal(refreshFlightAfterBounce(projectile, { x: 0, z: 0 }), false);
  assert.equal(projectile.data.flightDistance, frozen);
});

test('engagement range no longer deletes a round that is still inside its flight budget', () => {
  const kept = makeEntity({
    id: 1,
    type: 'projectile',
    pos: { x: 300, z: 0 },
    vel: { x: 320, z: 0 },
    radius: 1,
    collides: true,
    data: { spawnPos: { x: 0, z: 0 }, maxDistance: 240, flightDistance: 4000 },
  });
  kept.prevPos.x = 280;
  kept.prevPos.z = 0;
  const spent = makeEntity({
    id: 2,
    type: 'projectile',
    pos: { x: 300, z: 4 },
    vel: { x: 320, z: 0 },
    radius: 1,
    collides: true,
    data: { spawnPos: { x: 0, z: 4 }, maxDistance: 240 },
  });
  spent.prevPos.x = 280;
  spent.prevPos.z = 4;
  const state = {
    tick: 1,
    simTime: 0,
    playerId: null,
    entityList: [kept, spent],
    entities: new Map([[1, kept], [2, spent]]),
  };
  const host = sweepHost(state, { emit() {} });
  host.sweepProjectiles(1 / 60, state);
  assert.equal(kept.alive, true, 'flight budget keeps the round past the engagement range');
  assert.equal(spent.alive, false, 'a round with only maxDistance still ends at that range');
});

test('a round hits a dormant field rock past the old engagement range', () => {
  const state = {
    tick: 1,
    simTime: 0,
    playerId: null,
    entityList: [],
    entities: new Map(),
    nextEntityId: 1,
    freeIds: [],
  };
  const spawnEntity = (spec) => {
    const entity = makeEntity(spec);
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const rock = insertAsteroidFieldRock(state, {
    pos: { x: 400, z: 0 },
    radius: 14,
    hull: 40,
    hullMax: 40,
  });
  const proj = spawnEntity({
    id: 50,
    type: 'projectile',
    pos: { x: 390, z: 0 },
    vel: { x: 400, z: 0 },
    radius: 1,
    collides: true,
    team: 0,
    ownerId: 90,
    data: { spawnPos: { x: 0, z: 0 }, maxDistance: 240, flightDistance: 8000, damage: 5 },
  });
  proj.prevPos.x = 360;
  proj.prevPos.z = 0;
  const hits = [];
  const host = sweepHost(state, {
    emit(name, payload) {
      if (name === 'projectile:hit') hits.push(payload);
    },
  }, { spawnEntity });
  host.sweepProjectiles(1 / 60, state);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].targetId, rock.id);
  assert.equal(proj.alive, false);
  assert.equal(getAsteroidFieldRock(state, rock.id), null, 'the rock leaves the dormant field when it is hit');
  const live = state.entities.get(rock.id);
  assert.equal(live && live.type, 'asteroid');
  assert.equal(live.alive !== false, true);
});

test('a sweep caps dormant-rock promotion and defers the overflow to later sweeps', () => {
  const state = {
    tick: 1,
    simTime: 0,
    playerId: null,
    entityList: [],
    entities: new Map(),
    nextEntityId: 1,
    freeIds: [],
  };
  const spawnEntity = (spec) => {
    const entity = makeEntity(spec);
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  // Rocks are 200 WU apart so each round's short segment admits exactly one — the promoted
  // set is the first-cap rows in deterministic union order, and nothing else can leak in.
  const rocks = [];
  for (let i = 0; i < 12; i++) {
    rocks.push(insertAsteroidFieldRock(state, {
      pos: { x: 400 + i * 200, z: 0 },
      radius: 14,
      hull: 40,
      hullMax: 40,
    }));
  }
  const projs = [];
  for (let i = 0; i < 12; i++) {
    const p = spawnEntity({
      id: 50 + i,
      type: 'projectile',
      pos: { x: 390 + i * 200, z: 0 },
      vel: { x: 400, z: 0 },
      radius: 1,
      collides: true,
      team: 0,
      ownerId: 90,
      data: { spawnPos: { x: 0, z: 0 }, maxDistance: 2400, flightDistance: 99999, damage: 5 },
    });
    p.prevPos.x = 360 + i * 200;
    p.prevPos.z = 0;
    projs.push(p);
  }
  const hits = [];
  const host = sweepHost(state, {
    emit(name, payload) {
      if (name === 'projectile:hit') hits.push(payload);
    },
  }, { spawnEntity });
  host.sweepProjectiles(1 / 60, state);
  const promoted = (i) => !getAsteroidFieldRock(state, rocks[i].id);
  // SWEEP_ADMIT_PROMOTE_CAP: at most 8 dormant bodies wake per sweep call.
  assert.equal(rocks.filter((_, i) => promoted(i)).length, 8, 'the sweep caps dormant promotion at 8');
  assert.equal(hits.length, 8, 'promoted rocks are hit in the same pass');
  for (let i = 0; i < 8; i++) {
    assert.equal(promoted(i), true, `rock ${i} is inside the first-cap promotion window`);
    assert.equal(projs[i].alive, false);
  }
  for (let i = 8; i < 12; i++) {
    assert.equal(promoted(i), false, `rock ${i} stays dormant past the cap`);
    assert.equal(projs[i].alive, true, 'its round keeps flying past the un-promoted rock');
  }
  // The survivors re-sweep next tick: the deferred four promote then.
  host.sweepProjectiles(1 / 60, state);
  assert.equal(rocks.filter((_, i) => promoted(i)).length, 12, 'deferred rocks promote on the next sweep');
});
