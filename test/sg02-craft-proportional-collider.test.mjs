import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner, resolveCraftProportions } from '../src/core/sg02DynamicBodyOwner.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';

// Collision contract, current form: an authored ship/enemy def resolves its measured hull skin
// (src/data/collisionProxyManifests.js → model truth) — a `:hull` skin is one convex piece, a
// `:polygon` skin is a bounded compound of convex pieces. Only defs with no measured row still
// take the proportional capsule built from resolveCraftProportions.

test('resolveCraftProportions resolves measured rows, overrides, and capsule fallbacks', () => {
  // An authored defId resolves the measured hull proportions row (model truth, not the
  // visuals.proportions display block — those numbers describe the rendered mesh outline).
  const kestrelEnt = { id: 1, type: 'ship', radius: 14, data: { defId: 'ship_kestrel' } };
  const kestrelProp = resolveCraftProportions(kestrelEnt);
  assert.equal(kestrelProp.length, 1.72);
  assert.equal(kestrelProp.halfWidth, 0.33);
  assert.equal(kestrelProp.height, 0.31);

  const bastionEnt = { id: 2, type: 'ship', radius: 22, data: { shipId: 'ship_bastion' } };
  const bastionProp = resolveCraftProportions(bastionEnt);
  assert.equal(bastionProp.length, 1.72);
  assert.equal(bastionProp.halfWidth, 0.35);

  // An explicit data.proportions override still wins over any resolved row.
  const override = resolveCraftProportions({
    id: 3, type: 'ship', radius: 10,
    data: { proportions: { length: 2, halfWidth: 1, height: 0.5 } },
  });
  assert.equal(override.length, 2);
  assert.equal(override.halfWidth, 1);

  // Unmeasured entities keep the authored capsule-fallback proportions.
  const droneProp = resolveCraftProportions({ id: 4, type: 'drone', radius: 6, data: {} });
  assert.equal(droneProp.halfWidth, 0.45);
  const unknownProp = resolveCraftProportions({ id: 5, type: 'ship', radius: 14, data: { defId: 'ship_unmeasured_fixture' } });
  assert.equal(unknownProp.length, 1.35);
  assert.equal(unknownProp.halfWidth, 0.42);
});

test('SG-02 registers an authored ship skin as a deterministic convex compound', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  // Player starter ship: Hitch (ship_kestrel) resolves skin:ship_kestrel:polygon — the measured
  // hull outline decomposed into a bounded set of convex pieces (Package C compound dynamics).
  const playerShip = {
    id: 101,
    type: 'ship',
    radius: 14,
    mass: 12,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: { defId: 'ship_kestrel' },
  };

  const entities = [playerShip];
  owner.syncFromEntities(entities);

  const rec = owner.records.get(101);
  assert.ok(rec, 'Record created');
  const manifest = resolveCollisionProxyManifest(playerShip);
  assert.equal(manifest && manifest.id, 'skin:ship_kestrel:polygon', 'the authored Kestrel resolves its measured polygon skin');
  assert.ok(rec.colliders.length > 1, 'a polygon skin decomposes into multiple convex pieces');
  for (const collider of rec.colliders) {
    assert.equal(collider.shapeType(), 9, 'every piece is a Rapier ConvexPolygon (ShapeType = 9)');
  }
  assert.equal(rec.collider, rec.colliders[0], 'the primary collider is the first piece');

  // Deterministic: a fresh owner registers the same piece count for the same def.
  const owner2 = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const twin = { ...playerShip, id: 102, data: { defId: 'ship_kestrel' } };
  owner2.syncFromEntities([twin]);
  assert.equal(owner2.records.get(102).colliders.length, rec.colliders.length,
    'same def registers the same collider count across owners');

  // Verify step runs cleanly
  owner.step(1 / 60, entities);
  assert.equal(playerShip.pos.x, 0);
  assert.equal(playerShip.pos.z, 0);
});

test('a ship def with no measured skin still builds the proportional capsule', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  // No model-truth row → capsule from resolveCraftProportions' fallback ({1.35, 0.42}):
  // wingspan = 2 * 0.42 * 14 = 11.76 wu (halfWidth 5.88), length = 1.35 * 14 = 18.9 wu.
  const fixtureShip = {
    id: 101,
    type: 'ship',
    radius: 14,
    mass: 12,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: { defId: 'ship_unmeasured_fixture' },
  };

  const entities = [fixtureShip];
  owner.syncFromEntities(entities);

  const rec = owner.records.get(101);
  assert.ok(rec, 'Record created');
  assert.equal(rec.colliders.length, 1, 'Single collider registered');

  const collider = rec.collider;
  assert.ok(collider, 'Collider attached');
  assert.equal(collider.shapeType(), 2, 'Collider is Rapier Capsule (ShapeType.Capsule = 2)');
  assert.equal(Math.round(collider.radius() * 100) / 100, 5.88, 'Capsule radius matches fallback half-width (0.42 * 14 = 5.88)');
  assert.equal(Math.round(collider.halfHeight() * 100) / 100, 3.57, 'Capsule halfHeight matches (length/2 - capRadius = 9.45 - 5.88 = 3.57)');

  owner.step(1 / 60, entities);
  assert.equal(fixtureShip.pos.x, 0);
  assert.equal(fixtureShip.pos.z, 0);
});

test('Ship can fly through narrow asteroid gap where old circle collider would be wedged', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  // Place two static asteroids flanking the Z axis at Z = -9 and Z = +9 with radius 2.
  // The corridor clearance between rock surfaces is 18 - 4 = 14.0 wu.
  // The measured Kestrel wing silhouette needs ~12.6 wu (±6.3), so clearance on each side is
  // ~0.7 wu. Under the old circle collider (radius 14.0 wu), the ship would overlap both
  // asteroids by 9.0 wu!
  const asteroidTop = {
    id: 201,
    type: 'asteroid',
    radius: 2,
    mass: 1e6,
    pos: { x: 0, z: 9 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: { dynamic: false, mass: 1e6, radius: 2 },
  };

  const asteroidBottom = {
    id: 202,
    type: 'asteroid',
    radius: 2,
    mass: 1e6,
    pos: { x: 0, z: -9 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: { dynamic: false, mass: 1e6, radius: 2 },
  };

  // Hitch ship flying straight forward (rot = 0, along X) through the gap at (0, 0)
  const hitchShip = {
    id: 301,
    type: 'ship',
    radius: 14,
    mass: 12,
    pos: { x: -10, z: 0 },
    vel: { x: 20, z: 0 },
    rot: 0,
    angVel: 0,
    data: { defId: 'ship_kestrel' },
  };

  const entities = [asteroidTop, asteroidBottom, hitchShip];
  owner.syncFromEntities(entities);

  // Advance simulation through the gap
  for (let i = 0; i < 30; i++) {
    hitchShip.pos.x += hitchShip.vel.x * (1 / 60);
    owner.syncFromEntities(entities);
    owner.step(1 / 60, entities);
  }

  // Ship should pass straight through without its Z position being deflected or getting stuck
  assert.equal(Math.abs(hitchShip.pos.z) < 0.1, true, 'Ship slipped straight through the narrow asteroid gap');
  assert.ok(hitchShip.pos.x > 0, 'Ship made forward progress through gap');
});

test('Every player ship resolves its measured skin and registers the matching collider set', async () => {
  const { SHIPS } = await import('../src/data/ships.js');
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  for (let i = 0; i < SHIPS.length; i++) {
    const shipDef = SHIPS[i];
    const ent = {
      id: 1000 + i,
      type: 'ship',
      radius: shipDef.collisionRadius,
      mass: shipDef.mass || 20,
      pos: { x: i * 100, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      angVel: 0,
      data: { defId: shipDef.id },
    };

    const manifest = resolveCollisionProxyManifest(ent);
    assert.ok(manifest && manifest.id.startsWith('skin:'),
      `${shipDef.id} resolves a measured skin manifest`);

    owner.syncFromEntities([ent]);
    const rec = owner.records.get(ent.id);
    assert.ok(rec, `Record created for ${shipDef.id}`);
    for (const collider of rec.colliders) {
      assert.equal(collider.shapeType(), 9, `${shipDef.id} pieces are convex polygons`);
    }
    // A compactHull skin registers one convex piece; a planarPolygon skin decomposes.
    if (manifest.compactHull) {
      assert.equal(rec.colliders.length, 1, `${shipDef.id} hull skin is a single convex collider`);
    } else {
      assert.ok(rec.colliders.length > 1, `${shipDef.id} polygon skin decomposes to multiple pieces`);
    }
  }
});

test('All enemy archetypes resolve measured skins and build convex collider sets', async () => {
  const { ENEMY_TYPES } = await import('../src/data/enemies.js');
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  for (let i = 0; i < ENEMY_TYPES.length; i++) {
    const enemy = ENEMY_TYPES[i];
    const ent = {
      id: 2000 + i,
      type: 'ship',
      radius: 16,
      mass: 20,
      pos: { x: i * 100, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      angVel: 0,
      data: { typeId: enemy.id, silhouette: enemy.silhouette, shipId: enemy.shipId },
    };

    const manifest = resolveCollisionProxyManifest(ent);
    owner.syncFromEntities([ent]);
    const rec = owner.records.get(ent.id);
    assert.ok(rec, `Record created for enemy ${enemy.id}`);
    assert.ok(rec.colliders.length >= 1, `Enemy ${enemy.id} registers at least one collider`);
    if (manifest && manifest.id.startsWith('skin:')) {
      for (const collider of rec.colliders) {
        assert.equal(collider.shapeType(), 9, `Enemy ${enemy.id} skin pieces are convex polygons`);
      }
    } else {
      assert.equal(rec.collider.shapeType(), 2, `Enemy ${enemy.id} without a skin keeps the capsule`);
      assert.ok(rec.collider.radius() > 0, `Enemy ${enemy.id} has positive capsule radius`);
    }
  }
});
