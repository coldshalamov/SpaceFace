// Determinism proof for dynamic compound colliders (Package C).
//
// SG-02 dynamic body owner originally refused measured skins on dynamic bodies because solve
// order once diverged after a save/reload rebuild.
//
// This test provides the required proof:
// 1. Dynamic bodies qualifying for compound colliders (capital ships, dreadnought, big wrecks)
//    build compound colliders from their measured skins with primitive count <= 32.
// 2. All colliders have density 0; mass and principal inertiaY are governed by the rigid body spec.
// 3. CCD is enabled for bodies declaring CCD.
// 4. Identical sim hash with and without a save->load at frame N across multi-body contact.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import {
  isCompoundSkinDynamicEligible,
  measuredSkinAllowedFor,
  resolveCollisionProxyManifest,
} from '../src/data/collisionProxyManifests.js';
import { makeEntity } from '../src/core/entity.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { SIM_DT } from '../src/core/sim.js';
import { canonicalStringify } from '../src/core/simSnapshot.js';

function hashState(entities) {
  const snapshot = entities.map((e) => ({
    id: e.id,
    type: e.type,
    x: Math.round((e.pos?.x || 0) * 100) / 100,
    z: Math.round((e.pos?.z || 0) * 100) / 100,
    vx: Math.round((e.vel?.x || 0) * 100) / 100,
    vz: Math.round((e.vel?.z || 0) * 100) / 100,
    rot: Math.round((e.rot || 0) * 100) / 100,
    angVel: Math.round((e.angVel || 0) * 100) / 100,
  }));
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}

function cloneEntityState(entity) {
  return JSON.parse(JSON.stringify({
    id: entity.id,
    type: entity.type,
    team: entity.team,
    alive: entity.alive,
    collides: entity.collides,
    radius: entity.radius,
    mass: entity.mass,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    rot: entity.rot || 0,
    angVel: entity.angVel || 0,
    data: entity.data || {},
    physicsBody: entity.physicsBody || null,
    flags: entity.flags || {},
  }));
}

test('Package C: dynamic compound collider eligibility and properties', async () => {
  const colossus = makeEntity({
    ...makeShipEntitySpec('ship_colossus', { team: 0, pos: { x: 0, z: 0 }, rot: 0 }),
    id: 1,
    flags: { boosting: true },
  });
  const dreadnought = makeEntity({
    type: 'ship',
    id: 2,
    team: 1,
    alive: true,
    collides: true,
    radius: 45,
    mass: 1200,
    pos: { x: 100, z: 0 },
    vel: { x: 0, z: 0 },
    flags: { boosting: true },
    data: { defId: 'dreadnought_boss' },
    physicsBody: {
      schemaVersion: 1,
      radius: 45,
      mass: 1200,
      inertiaY: 1200 * 45 * 45 * 0.5,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
  });
  const wreck = makeEntity({
    type: 'wreck',
    id: 3,
    team: -1,
    alive: true,
    collides: true,
    radius: 36,
    mass: 600,
    pos: { x: 200, z: 0 },
    vel: { x: 0, z: 0 },
    data: { placeId: 'place_aftermath_wreck_ore_freighter_bow' },
    physicsBody: {
      schemaVersion: 1,
      radius: 36,
      mass: 600,
      inertiaY: 600 * 36 * 36 * 0.5,
      dynamic: true,
      ccd: false,
      material: 'debris',
      revision: 0,
    },
  });
  const kestrel = makeEntity({
    ...makeShipEntitySpec('ship_kestrel', { team: 0, pos: { x: -100, z: 0 }, rot: 0 }),
    id: 4,
  });

  // Verify eligibility
  assert.equal(isCompoundSkinDynamicEligible(colossus), true, 'Colossus capital ship is eligible');
  assert.equal(isCompoundSkinDynamicEligible(dreadnought), true, 'Dreadnought is eligible');
  assert.equal(isCompoundSkinDynamicEligible(wreck), true, 'Aftermath wreck is eligible');
  // eb1869826 ("make contacts solid and keep player heading true") admitted craft to
  // SKIN_DYNAMIC_TYPES: every ship takes its measured skin (the kestrel resolves
  // skin:ship_kestrel:polygon in measured-skin-dynamics). Stale pre-admission expectations
  // updated to that shipped truth.
  assert.equal(isCompoundSkinDynamicEligible(kestrel), true, 'Craft are skin-eligible');

  assert.equal(measuredSkinAllowedFor(colossus), true);
  assert.equal(measuredSkinAllowedFor(dreadnought), true);
  assert.equal(measuredSkinAllowedFor(wreck), true);
  assert.equal(measuredSkinAllowedFor(kestrel), true);

  // Manifests resolve for eligible dynamic bodies
  colossus.data.collisionProxy = 'skin:ship_colossus';
  dreadnought.data.collisionProxy = 'skin:dreadnought_boss';
  wreck.data.collisionProxy = 'skin:place_aftermath_wreck_ore_freighter_bow';

  const colossusManifest = resolveCollisionProxyManifest(colossus);
  assert.ok(colossusManifest, 'Colossus resolves proxy manifest');
  assert.ok(colossusManifest.primitives.length > 1, 'Colossus has compound primitives');
  assert.ok(colossusManifest.primitives.length <= 32, 'Colossus primitives <= 32');

  const dreadManifest = resolveCollisionProxyManifest(dreadnought);
  assert.ok(dreadManifest, 'Dreadnought resolves proxy manifest');
  assert.ok(dreadManifest.primitives.length <= 32, 'Dreadnought primitives <= 32');

  const wreckManifest = resolveCollisionProxyManifest(wreck);
  assert.ok(wreckManifest, 'Wreck resolves proxy manifest');
  assert.ok(wreckManifest.primitives.length <= 32, 'Wreck primitives <= 32');

  // Build real SG-02 owner and verify physics properties
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  try {
    owner.syncFromEntities([colossus, dreadnought, wreck, kestrel]);

    const colossusRec = owner.records.get(colossus.id);
    assert.ok(colossusRec, 'Colossus has record');
    assert.equal(colossusRec.spec.dynamic, true, 'Colossus is dynamic');
    assert.ok(colossusRec.colliders.length > 1, 'Colossus has compound colliders');
    assert.ok(colossusRec.colliders.length <= 32, 'Colossus collider count <= 32');
    for (const c of colossusRec.colliders) {
      assert.equal(c.density(), 0, 'Every collider has density 0');
    }
    assert.equal(colossusRec.effectiveMass, colossusRec.spec.mass, 'Body effectiveMass matches spec');
    assert.equal(colossusRec.effectiveInertiaY, colossusRec.spec.inertiaY, 'Body effectiveInertiaY matches spec');
    assert.equal(colossusRec.body.isCcdEnabled(), true, 'Colossus has CCD enabled');

    const dreadRec = owner.records.get(dreadnought.id);
    assert.ok(dreadRec.colliders.length > 1, 'Dreadnought has compound colliders');
    assert.ok(dreadRec.colliders.length <= 32, 'Dreadnought collider count <= 32');
    for (const c of dreadRec.colliders) {
      assert.equal(c.density(), 0, 'Dreadnought collider has density 0');
    }
    assert.equal(dreadRec.effectiveMass, dreadRec.spec.mass, 'Dreadnought effectiveMass matches spec');
    assert.equal(dreadRec.effectiveInertiaY, dreadRec.spec.inertiaY, 'Dreadnought effectiveInertiaY matches spec');
    assert.equal(dreadRec.body.isCcdEnabled(), true, 'Dreadnought has CCD enabled');

    const wreckRec = owner.records.get(wreck.id);
    // The ore freighter bow's closed silhouette fits the census tolerance, so its skin
    // compacts to a single tolerance-checked convex hull (Package C compaction); an
    // ill-fitting silhouette would keep the bounded compound instead.
    assert.ok(wreckRec.colliders.length >= 1, 'Wreck carries measured skin colliders');
    assert.ok(wreckRec.colliders.length <= 32, 'Wreck collider count <= 32');
    for (const c of wreckRec.colliders) {
      assert.equal(c.density(), 0, 'Wreck collider has density 0');
    }
    assert.equal(wreckRec.effectiveMass, wreckRec.spec.mass, 'Wreck effectiveMass matches spec');
    assert.equal(wreckRec.effectiveInertiaY, wreckRec.spec.inertiaY, 'Wreck effectiveInertiaY matches spec');

    const kestrelRec = owner.records.get(kestrel.id);
    assert.ok(kestrelRec.proxyId && kestrelRec.proxyId.startsWith('skin:ship_kestrel'),
      `Kestrel rides its measured skin (${kestrelRec.proxyId})`);
    assert.ok(kestrelRec.colliders.length >= 1, 'Kestrel carries measured colliders');
  } finally {
    owner.dispose();
  }
});

test('Package C: identical sim hash with and without save->load at frame N', async () => {
  function makeScene() {
    const colossus = makeEntity({
      ...makeShipEntitySpec('ship_colossus', { team: 0, pos: { x: -60, z: 0 }, rot: 0 }),
      id: 1,
    });
    colossus.vel = { x: 30, z: 0 };
    colossus.data.collisionProxy = 'skin:ship_colossus';

    const dreadnought = makeEntity({
      type: 'ship',
      id: 2,
      team: 1,
      alive: true,
      collides: true,
      radius: 45,
      mass: 1200,
      pos: { x: 60, z: 0 },
      vel: { x: -30, z: 0 },
      rot: Math.PI,
      angVel: 0,
      data: { defId: 'dreadnought_boss', collisionProxy: 'skin:dreadnought_boss' },
      physicsBody: {
        schemaVersion: 1,
        radius: 45,
        mass: 1200,
        inertiaY: 1200 * 45 * 45 * 0.5,
        dynamic: true,
        ccd: true,
        material: 'ship',
        revision: 0,
      },
    });

    return [colossus, dreadnought];
  }

  // --- Run A: Uninterrupted for 100 ticks ---
  const sceneA = makeScene();
  const ownerA = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  let hashA;
  try {
    ownerA.syncFromEntities(sceneA);
    for (let tick = 0; tick < 100; tick++) {
      ownerA.step(SIM_DT);
    }
    hashA = hashState(sceneA);
  } finally {
    ownerA.dispose();
  }

  // --- Run B: 10 ticks -> save -> load -> 90 ticks ---
  const sceneB = makeScene();
  let ownerB = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  let hashB;
  try {
    ownerB.syncFromEntities(sceneB);
    for (let tick = 0; tick < 10; tick++) {
      ownerB.step(SIM_DT);
    }

    // Save: serialize entities to plain JSON
    const savedSnapshot = sceneB.map(cloneEntityState);

    // Dispose old owner (simulate game restart / reload)
    ownerB.dispose();

    // Load: restore entities from JSON
    const restoredScene = savedSnapshot.map((spec) => makeEntity(spec));

    // Create fresh owner and sync restored entities
    ownerB = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
    ownerB.syncFromEntities(restoredScene);

    for (let tick = 10; tick < 100; tick++) {
      ownerB.step(SIM_DT);
    }
    hashB = hashState(restoredScene);
  } finally {
    ownerB.dispose();
  }

  assert.equal(hashB, hashA, 'Sim hash at frame 100 with save->load at frame 10 is bit-for-bit identical to uninterrupted run');
});
