import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { QuarksVfxSystem } from '../src/render/vfx/quarksSystem.js';
import { createSpindleGeometry } from '../src/render/weapons/projectileGeometries.js';
import { EnergyBoltPool } from '../src/render/weapons/energyBoltPool.js';

test('createSpindleGeometry produces 3D multi-planar vertices and indices', () => {
  const geo = createSpindleGeometry(3);
  assert.equal(geo.type, 'PlaneGeometry');
  assert.equal(geo.attributes.position.count, 12);
  assert.equal(geo.attributes.uv.count, 12);
  assert.equal(geo.index.count, 18);
});

test('EnergyBoltPool integrates 3D spindle geometry and non-billboard shader', () => {
  const pool = new EnergyBoltPool(null, { capacity: 4 });
  assert.equal(pool.geometry.attributes.position.count, 12);
  assert.ok(pool.material.vertexShader.includes('r1 * position.y + r2 * position.z'));
  assert.ok(!pool.material.vertexShader.includes('cross(axis, toCam)'), 'billboard cross-product must be removed');
  pool.dispose();
});

test('QuarksVfxSystem attaches to scene, spawns 3D particle bursts, and disposes cleanly', () => {
  const scene = new THREE.Scene();
  const quarks = new QuarksVfxSystem({ scene });

  assert.ok(quarks.renderer.parent === scene, 'renderer should be attached to scene');
  assert.ok(quarks.root.parent === scene, 'emitters root should be attached to scene');

  // 1. Spawn impact spall (hull hit)
  quarks.spawnImpact(5, 0, 10, 0, 0, 1, false, 2);
  quarks.update(0.016);
  assert.ok(quarks.impactSpall.particleNum > 0, 'impact spall particles should be live');

  // 2. Spawn shield shards (shield hit & break)
  quarks.spawnImpact(5, 0, 10, 0, 0, 1, true, 0);
  quarks.spawnShieldBreak(0, 0, 0, 24);
  quarks.update(0.016);
  assert.ok(quarks.shieldShards.particleNum > 0, 'shield shard particles should be live');

  // 3. Spawn muzzle sparks & casing ejection
  quarks.spawnMuzzle(0, 0, 0, 1, 0, 0, 2, true);
  quarks.update(0.016);
  assert.ok(quarks.muzzleSparks.particleNum > 0, 'muzzle sparks should be live');
  assert.ok(quarks.casingEjection.particleNum > 0, 'casing ejection particles should be live');

  // 4. Spawn backwards thruster cryogenic venting
  quarks.spawnRetroVenting(0, 0, 0, 0, 0, -1, 0.8);
  quarks.update(0.016);
  assert.ok(quarks.retroVenting.particleNum > 0, 'retro venting particles should be live');

  // 5. Spawn mining asteroid ejecta
  quarks.spawnMiningEjecta(10, 0, 10, 0, 1, 0, 8);
  quarks.update(0.016);
  assert.ok(quarks.miningEjecta.particleNum > 0, 'mining ejecta particles should be live');

  // 6. Spawn collision rock spall
  quarks.spawnCollisionSpall(2, 0, 4, 1, 0, 0, 12);
  quarks.update(0.016);
  assert.ok(quarks.collisionSpall.particleNum > 0, 'collision spall particles should be live');

  // 7. Spawn low-hull damage venting
  quarks.spawnDamageVenting(0, 0, 0, 0, 0, -1, 4);
  quarks.update(0.016);
  assert.ok(quarks.damageVenting.particleNum > 0, 'damage venting particles should be live');

  // 8. Spawn explosion shrapnel
  quarks.spawnExplosion(0, 0, 0, 20);
  quarks.update(0.016);
  assert.ok(quarks.shrapnel.particleNum > 0, 'shrapnel particles should be live');

  quarks.reset();
  assert.equal(quarks.impactSpall.particleNum, 0);
  assert.equal(quarks.shieldShards.particleNum, 0);
  assert.equal(quarks.muzzleSparks.particleNum, 0);
  assert.equal(quarks.casingEjection.particleNum, 0);
  assert.equal(quarks.retroVenting.particleNum, 0);
  assert.equal(quarks.miningEjecta.particleNum, 0);
  assert.equal(quarks.collisionSpall.particleNum, 0);
  assert.equal(quarks.damageVenting.particleNum, 0);
  assert.equal(quarks.shrapnel.particleNum, 0);

  quarks.dispose();
  assert.equal(quarks.scene, null);
});

test('QuarksVfxSystem families carry designed material languages, not flat primitives', () => {
  const scene = new THREE.Scene();
  const quarks = new QuarksVfxSystem({ scene });

  // Cold solid matter is scene-lit (M1), never self-glowing additive.
  assert.equal(quarks.collisionSpall.material.type, 'MeshStandardMaterial', 'rock spall must be lit solid matter');
  assert.equal(quarks.casingEjection.material.type, 'MeshStandardMaterial', 'casings must be lit solid matter');

  // Energy families keep HDR headroom: the generated batch material must not tone-map the
  // gradient stops back below 1.0 before bloom sees them (B8).
  const energySystems = [
    quarks.impactSpall, quarks.shieldShards, quarks.muzzleSparks,
    quarks.retroVenting, quarks.miningEjecta, quarks.damageVenting, quarks.shrapnel,
  ];
  for (const sys of energySystems) {
    const batchIndex = quarks.renderer.systemToBatchIndex.get(sys);
    const batch = quarks.renderer.batches[batchIndex];
    assert.equal(batch.material.toneMapped, false, 'energy batch must pass HDR through to bloom');
  }

  // Every family has a temporal envelope (ColorOverLife at minimum) so no burst is a uniform
  // shell fading on opacity alone (B10/B17/B18).
  for (const sys of [...energySystems, quarks.collisionSpall, quarks.casingEjection]) {
    assert.ok(sys.behaviors.some((b) => b.type === 'ColorOverLife'), 'family needs a temperature track');
  }

  // Debris-class families tumble; flat-faceted geometry carries the cut-material read.
  for (const sys of [quarks.shieldShards, quarks.miningEjecta, quarks.collisionSpall, quarks.shrapnel, quarks.casingEjection]) {
    assert.ok(sys.behaviors.some((b) => b.type === 'Rotation3DOverLife'), 'debris must tumble');
  }

  quarks.dispose();
});
