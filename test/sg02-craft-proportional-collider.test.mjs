import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner, resolveCraftProportions } from '../src/core/sg02DynamicBodyOwner.js';

test('resolveCraftProportions resolves exact proportions for player and enemy ships', () => {
  const kestrelEnt = { id: 1, type: 'ship', radius: 14, data: { defId: 'ship_kestrel' } };
  const kestrelProp = resolveCraftProportions(kestrelEnt);
  assert.equal(kestrelProp.length, 1.35);
  assert.equal(kestrelProp.halfWidth, 0.42);

  const bastionEnt = { id: 2, type: 'ship', radius: 22, data: { shipId: 'ship_bastion' } };
  const bastionProp = resolveCraftProportions(bastionEnt);
  assert.equal(bastionProp.length, 1.55);
  assert.equal(bastionProp.halfWidth, 0.62);

  const droneEnt = { id: 3, type: 'drone', radius: 6, data: {} };
  const droneProp = resolveCraftProportions(droneEnt);
  assert.equal(droneProp.halfWidth, 0.45);
});

test('SG-02 creates oriented capsule colliders for ships matching real hull proportions', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  // Player starter ship: Hitch (ship_kestrel, radius 14, length 1.35, halfWidth 0.42)
  // Total wingspan = 2 * 0.42 * 14 = 11.76 wu (halfWidth = 5.88 wu)
  // Total length = 1.35 * 14 = 18.9 wu (halfLength = 9.45 wu)
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
  assert.equal(rec.colliders.length, 1, 'Single collider registered');

  // Verify the collider shape in Rapier is a Capsule (ShapeType = 2 in Rapier 3D)
  const collider = rec.collider;
  assert.ok(collider, 'Collider attached');
  assert.equal(collider.shapeType(), 2, 'Collider is Rapier Capsule (ShapeType.Capsule = 2)');
  assert.equal(Math.round(collider.radius() * 100) / 100, 5.88, 'Capsule radius matches Hitch half-width (0.42 * 14 = 5.88)');
  assert.equal(Math.round(collider.halfHeight() * 100) / 100, 3.57, 'Capsule halfHeight matches (length/2 - capRadius = 9.45 - 5.88 = 3.57)');

  // Verify step runs cleanly
  owner.step(1 / 60, entities);
  assert.equal(playerShip.pos.x, 0);
  assert.equal(playerShip.pos.z, 0);
});

test('Ship can fly through narrow asteroid gap where old circle collider would be wedged', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });

  // Place two static asteroids flanking the Z axis at Z = -8 and Z = +8 with radius 2.
  // The corridor clearance between rock surfaces is 16 - 4 = 12.0 wu.
  // Hitch wingspan is 11.76 wu (half-width 5.88 wu), so clearance on each side is (6.0 - 5.88) = 0.12 wu.
  // Under the old circle collider (radius 14.0 wu), the ship would overlap both asteroids by 8.0 wu!
  const asteroidTop = {
    id: 201,
    type: 'asteroid',
    radius: 2,
    mass: 1e6,
    pos: { x: 0, z: 8 },
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
    pos: { x: 0, z: -8 },
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

test('All 13 player ships build exact proportional capsule colliders', async () => {
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

    owner.syncFromEntities([ent]);
    const rec = owner.records.get(ent.id);
    assert.ok(rec, `Record created for ${shipDef.id}`);
    assert.equal(rec.collider.shapeType(), 2, `${shipDef.id} uses Capsule collider (type 2)`);

    const prop = shipDef.visuals.proportions;
    const expectedHalfWidth = prop.halfWidth * shipDef.collisionRadius;
    const expectedLength = prop.length * shipDef.collisionRadius;
    const expectedHalfHeight = Math.max(0, (expectedLength * 0.5) - expectedHalfWidth);

    assert.equal(
      Math.abs(rec.collider.radius() - expectedHalfWidth) < 1e-4,
      true,
      `${shipDef.id} cap radius ${rec.collider.radius()} matches expected half-width ${expectedHalfWidth}`
    );
    assert.equal(
      Math.abs(rec.collider.halfHeight() - expectedHalfHeight) < 1e-4,
      true,
      `${shipDef.id} half-height ${rec.collider.halfHeight()} matches expected ${expectedHalfHeight}`
    );
  }
});

test('All enemy archetypes and silhouettes build proportional colliders', async () => {
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

    owner.syncFromEntities([ent]);
    const rec = owner.records.get(ent.id);
    assert.ok(rec, `Record created for enemy ${enemy.id}`);
    assert.equal(rec.collider.shapeType(), 2, `Enemy ${enemy.id} uses Capsule collider`);
    assert.ok(rec.collider.radius() > 0, `Enemy ${enemy.id} has positive capsule radius`);
  }
});

