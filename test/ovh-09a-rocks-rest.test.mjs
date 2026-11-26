import assert from 'node:assert/strict';
import test from 'node:test';

import { makeEntity } from '../src/core/entity.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { world } from '../src/systems/world.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { SIM_TIER } from '../src/world/activityClassification.js';

const DT = 1 / 60;

// Minimal live state for the real world system's rock spawner — same seam the sector
// materializer calls: helpers.spawnEntity (makeEntity + insert), the rng streams, and a
// world bag the field shelf can own.
function liveWorldFixture() {
  const entities = new Map();
  const entityList = [];
  const state = {
    meta: { seed: 47 },
    simTime: 0,
    tick: 0,
    entities,
    entityList,
    entityIndex: null,
    world: {},
    playerId: null,
  };
  let nextId = 400;
  const helpers = {
    spawnEntity(spec) {
      const e = makeEntity(spec);
      e.id = ++nextId;
      e.occupantGeneration = 1;
      entities.set(e.id, e);
      entityList.push(e);
      return e;
    },
    hash32,
    mulberry32,
    entityIndex: () => null,
  };
  const sys = Object.create(world);
  sys.state = state;
  sys.helpers = helpers;
  return { state, helpers, sys };
}

test('OVH-09a: the field spawner births loose rocks at rest — zero linear velocity, asleep', () => {
  const { sys } = liveWorldFixture();
  const fdef = { id: 'f_rest_probe', type: 'ast_common_rock' };
  const params = { tierCap: 2, respawnSec: 120, _homeSectorId: 'sector_rest_probe' };
  const rng = mulberry32(47);

  // The ordinary scatter rock goes to the dormant shelf: the record the promotion path
  // later lifts into a live body must carry no drift.
  const shelf = sys._spawnAsteroid(
    fdef, params, { x: 4000, z: 4000 }, 450, rng,
    null, null, null, 0, null,
  );
  assert.ok(shelf, 'a scatter rock materialized');
  assert.equal(shelf.type, 'asteroid');
  assert.equal(shelf.fieldResident, true, 'ordinary rocks sit on the dormant shelf');
  assert.equal(shelf.vel.x, 0, 'shelf rock has zero linear velocity x');
  assert.equal(shelf.vel.z, 0, 'shelf rock has zero linear velocity z');

  // A keep-live rock (authored geology slot) is a live entity the moment it is born —
  // the R11 rest stamp must ride the entity itself.
  const live = sys._spawnAsteroid(
    fdef, params, { x: 4000, z: 4000 }, 450, rng,
    'place_rock_medium', null, null, 1, null,
  );
  assert.ok(live && live.alive !== false, 'a keep-live rock spawned as an entity');
  assert.equal(live.type, 'asteroid');
  assert.equal(live.vel.x, 0, 'live rock has zero linear velocity x');
  assert.equal(live.vel.z, 0, 'live rock has zero linear velocity z');
  assert.equal(live.physicsSleeping, true, 'live rock is born marked asleep');
  assert.ok(live.activity && live.activity.simTier === SIM_TIER.S3_DORMANT,
    'live rock is born dormant — sleep-eligible under the native owner');

  // Presentation-only spin stays: rest is a linear-velocity contract, not a freeze.
  assert.ok(Number.isFinite(live.angVel));
});

test('OVH-09a: a resting rock does not integrate until a hit wakes it', async () => {
  const { sys, state } = liveWorldFixture();
  const fdef = { id: 'f_rest_probe', type: 'ast_common_rock' };
  const params = { tierCap: 2, respawnSec: 120, _homeSectorId: 'sector_rest_probe' };
  const rock = sys._spawnAsteroid(
    fdef, params, { x: 4000, z: 4000 }, 450, mulberry32(7),
    'place_rock_medium', null, null, 2, null,
  );
  assert.ok(rock && rock.alive !== false);

  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(state.entityList);
    owner.step(DT, 0);
    const rec = owner.records.get(rock.id);
    assert.ok(rec && rec.body, 'the resting rock owns a native body');
    assert.equal(rec.body.isSleeping(), true, 'a rest rock is born asleep — not integrating');
    assert.equal(rock.physicsSleeping, true);

    // Untouched, it holds its exact pose: the calm world does not drift.
    const x0 = rock.pos.x, z0 = rock.pos.z;
    for (let t = 1; t <= 120; t++) owner.step(DT, t);
    assert.equal(rock.pos.x, x0, 'sleeping rock never translates');
    assert.equal(rock.pos.z, z0);
    assert.equal(rec.body.isSleeping(), true, 'idle ticks keep it asleep');

    // A hull barreling into it is the touch: contact wakes the island and the hit lands.
    const hitter = makeEntity({
      id: 900, type: 'ship', alive: true, collides: true,
      pos: { x: x0 - 90, z: z0 }, vel: { x: 240, z: 0 }, rot: 0,
      radius: 8, mass: 3000, hull: 100, hullMax: 100,
      physicsBody: { radius: 8, mass: 3000, dynamic: true, material: 'ship' },
      data: {},
    });
    hitter.occupantGeneration = 1;
    state.entityList.push(hitter);
    owner.syncFromEntities(state.entityList);
    const hitterRec = owner.records.get(hitter.id);
    assert.ok(hitterRec && hitterRec.body, 'the incoming hull owns a native body');

    let wokeTick = -1;
    for (let t = 121; t < 121 + 240 && wokeTick < 0; t++) {
      owner.step(DT, t);
      if (!rec.body.isSleeping()) wokeTick = t;
    }
    assert.ok(wokeTick >= 0, 'a body that touches the rock wakes it');
    assert.equal(rock.physicsSleeping, false, 'the entity mirror follows the wake');
    for (let t = wokeTick + 1; t < wokeTick + 30; t++) owner.step(DT, t);
    assert.ok(
      Math.abs(rock.pos.x - x0) > 1e-3 || Math.abs(rock.pos.z - z0) > 1e-3
      || Math.abs(rock.vel.x) > 1e-3 || Math.abs(rock.vel.z) > 1e-3,
      'the wake is physical — the touched rock carries the impact',
    );
  } finally { owner.dispose(); }
});

test('OVH-09a: the dormant shelf path stores zero-velocity records for every rock caller', () => {
  const { state } = liveWorldFixture();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 12, z: -5 },
    radius: 9,
    mass: 400,
    hull: 200,
    hullMax: 200,
    data: { typeId: 'ast_common_rock', oreHP: 200, oreHPMax: 200 },
  });
  assert.ok(rec, 'shelf record created');
  assert.equal(rec.vel.x, 0, 'shelf record born with zero linear velocity');
  assert.equal(rec.vel.z, 0);
  // A caller that still hands a velocity is the anomaly — the contract lives in the
  // spawners, which now never pass one; the record would integrate it honestly.
});
