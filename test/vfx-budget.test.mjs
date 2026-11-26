import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { VFX_BUDGET, isLowOrIntegratedVfxTarget, isVfxBudgetActive } from '../src/render/vfx/vfxBudget.js';
import { createGasSystem } from '../src/render/combat/gas/gasVolumeField.js';
import { SparkField, sparkSpec, SPARK_SHAPE, SPARK_ADD, SPARK_MATTER } from '../src/render/vfx/kit/sparkField.js';
import { WeaponRibbonPool } from '../src/render/weapons/ribbonPool.js';
import {
  commitInstancedSpriteBuckets,
  createInstancedSpriteBuckets,
  resetInstancedSpriteBuckets,
  writeInstancedSpriteFields,
} from '../src/render/combat/instancedSpritePool.js';
import { QuarksVfxSystem } from '../src/render/vfx/quarksSystem.js';

function withRfx(overrides, fn) {
  const prev = globalThis.__sfRfx;
  globalThis.__sfRfx = { ...(prev || {}), ...overrides };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.__sfRfx;
    else globalThis.__sfRfx = prev;
  }
}

test('vfxBudget activates only on integrated/software/low targets and respects ?rfx=-vfxBudget live', () => {
  const discrete = { render: { gpu: { tier: 'discrete' } }, settings: { video: { qualityPreset: 'high' } } };
  const integrated = { render: { gpu: { tier: 'integrated' } }, settings: { video: { qualityPreset: 'medium' } } };
  const lowPreset = { render: { gpu: { tier: 'discrete' } }, settings: { video: { qualityPreset: 'low' } } };

  assert.equal(isLowOrIntegratedVfxTarget(discrete), false);
  assert.equal(isLowOrIntegratedVfxTarget(integrated), true);
  assert.equal(isLowOrIntegratedVfxTarget(lowPreset), true);

  withRfx({ vfxBudget: true }, () => {
    assert.equal(isVfxBudgetActive(discrete), false);
    assert.equal(isVfxBudgetActive(integrated), true);
    assert.equal(isVfxBudgetActive(lowPreset), true);
  });
  withRfx({ vfxBudget: false }, () => {
    assert.equal(isVfxBudgetActive(integrated), false);
    assert.equal(isVfxBudgetActive(lowPreset), false);
  });
});

test('GasVolumeField caps raymarch steps and overlapping volumes under vfxBudget and restores live', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 5000);
  camera.position.set(0, 140, 0);
  const gas = createGasSystem(scene);
  for (let i = 0; i < 10; i++) gas.emitCombustion({ x: i * 10, y: 0, z: i * 50, scale: 8 });
  for (let i = 0; i < 10; i++) gas.emitFractureDust({ x: -i * 10, y: 0, z: i * 40, scale: 8 });

  gas.setBudgetActive(false);
  assert.equal(gas.material.uniforms.uStepRange.value.y, VFX_BUDGET.gasDefaultMaxSteps);
  const drawnOff = gas.update(1 / 60, camera);
  assert.equal(drawnOff, 20, 'full overlapping volumes drawn when budget is off');

  gas.setBudgetActive(true);
  assert.equal(gas.material.uniforms.uStepRange.value.x, VFX_BUDGET.gasMinSteps);
  assert.equal(gas.material.uniforms.uStepRange.value.y, VFX_BUDGET.gasMaxSteps);
  const drawnOn = gas.update(2 / 60, camera);
  assert.equal(drawnOn, VFX_BUDGET.gasMaxDrawn, 'drawn volumes capped to nearest gasMaxDrawn under budget');

  // Nearest volumes are kept (closest z around 0..100, farthest dropped) and still sorted far-to-near.
  const pose = gas.mesh.geometry.getAttribute('aGasPose');
  for (let i = 1; i < drawnOn; i++) {
    const dPrev = Math.hypot(pose.getX(i - 1), pose.getY(i - 1) - 140, pose.getZ(i - 1));
    const dCur = Math.hypot(pose.getX(i), pose.getY(i) - 140, pose.getZ(i));
    assert.ok(dCur <= dPrev + 1e-3, 'kept gas volumes remain sorted far-to-near');
  }
  gas.dispose();
});

test('SparkField trims dead tail and caps active ring and puff/glow overdraw under vfxBudget', () => {
  const scene = new THREE.Scene();
  const sparks = new SparkField(scene);
  sparks.setBudgetActive(true);
  const p = sparkSpec();
  p.birth = 0; p.life = 0.5; p.size0 = 60; p.size1 = 80; p.shape = SPARK_SHAPE.PUFF; p.blend = SPARK_MATTER;
  let acceptedPuffs = 0;
  for (let i = 0; i < 40; i++) {
    if (sparks.emit(p) >= 0) acceptedPuffs++;
  }
  assert.equal(acceptedPuffs, VFX_BUDGET.sparkMaxPuffsPerFrame, 'per-frame puff overdraw capped');
  assert.ok(sparks.arrays[2][0] <= VFX_BUDGET.sparkMaxPuffScale, 'puff scale clamped');

  // Emit 1200 streaks with short life: under budget ring stays within sparkMaxInstances.
  p.shape = SPARK_SHAPE.STREAK; p.blend = SPARK_ADD; p.size0 = 2; p.size1 = 1; p.life = 0.2;
  for (let i = 0; i < 1200; i++) sparks.emit(p);
  sparks.update(0.1, { budgetActive: true });
  assert.ok(sparks.geometry.instanceCount <= VFX_BUDGET.sparkMaxInstances,
    `submitted instances (${sparks.geometry.instanceCount}) bounded to ${VFX_BUDGET.sparkMaxInstances}`);

  // Once particles expire, trailing dead tail trims to 0 instead of sticking at 4096.
  sparks.update(1.0, { budgetActive: true });
  assert.equal(sparks.geometry.instanceCount, 0);
  sparks.dispose();
});

test('WeaponRibbonPool caps drawn wakes and upload bytes under vfxBudget', () => {
  const pool = new WeaponRibbonPool(null, { capacity: 64, segments: 24 });
  for (let i = 0; i < 60; i++) {
    pool.spawn({ entityId: i + 1, x: i, y: 0, z: 0, width: 0.4, linger: 0.2 });
    pool.pushHead(i + 1, i + 4, 0, 0);
    pool.pushHead(i + 1, i + 8, 0, 0);
  }
  pool.setBudgetActive(false);
  pool.update(1 / 60, { x: 0, y: 120, z: 0 });
  const offLive = pool.live;
  const offBytes = pool.uploadedBytesLastFrame;
  assert.equal(offLive, 60);

  // Clear updateRanges as Three does after upload, then run with budget ON.
  for (const attr of pool._dynamicAttributes) attr.clearUpdateRanges();
  pool.setBudgetActive(true);
  pool.update(1 / 60, { x: 0, y: 120, z: 0 });
  assert.equal(pool.live, VFX_BUDGET.ribbonMaxDrawn, 'drawn wakes capped under vfxBudget');
  // Next frame (after tail clear) uploads only the capped prefix.
  for (const attr of pool._dynamicAttributes) attr.clearUpdateRanges();
  pool.update(1 / 60, { x: 0, y: 120, z: 0 });
  assert.ok(pool.uploadedBytesLastFrame < offBytes * 0.6,
    `uploaded bytes dropped (${offBytes} -> ${pool.uploadedBytesLastFrame})`);
  pool.dispose();
});

test('InstancedSpritePool caps bucket counts, smoke scale, and per-frame overdraw area under vfxBudget', () => {
  const scene = new THREE.Scene();
  const tex = new THREE.Texture();
  const buckets = createInstancedSpriteBuckets(scene, 128, tex, tex, tex, tex);
  buckets.lodCam = { x: 0, y: 120, z: 0, k: 1 };
  buckets.budgetActive = true;
  resetInstancedSpriteBuckets(buckets);
  let smokeWritten = 0;
  for (let i = 0; i < 40; i++) {
    if (writeInstancedSpriteFields(buckets, 'smoke', 0, 0, 0, 50, 50, 50, 0, 0.5, 0.5, 0.5, 0.5, 0.2)) {
      smokeWritten++;
    }
  }
  commitInstancedSpriteBuckets(buckets);
  assert.ok(smokeWritten <= VFX_BUDGET.spriteBucketCaps.smoke, 'smoke count capped');
  assert.ok(smokeWritten >= 4, 'first 4 smoke sprites guaranteed visible');
  assert.ok(buckets.smoke.scale.getX(0) <= VFX_BUDGET.spriteMaxSmokeScale, 'smoke scale capped');
  assert.ok(buckets.budgetDropped > 0, 'excess overdraw sprites gracefully dropped');
});

test('QuarksVfxSystem scales burst counts and caps additive particles under vfxBudget', () => {
  const scene = new THREE.Scene();
  const q = new QuarksVfxSystem();
  q.attach(scene);
  q.setBudgetActive(true);
  for (let i = 0; i < 20; i++) q.spawnImpact(0, 0, 0, 0, 1, 0, false, 3);
  assert.ok(q.impactSpall.particleNum <= VFX_BUDGET.quarksAdditiveCaps.impactSpall,
    `impactSpall (${q.impactSpall.particleNum}) capped at ${VFX_BUDGET.quarksAdditiveCaps.impactSpall}`);
  for (let i = 0; i < 20; i++) q.spawnShieldBreak(0, 0, 0, 24);
  assert.ok(q.shieldShards.particleNum <= VFX_BUDGET.quarksAdditiveCaps.shieldShards,
    `shieldShards (${q.shieldShards.particleNum}) capped at ${VFX_BUDGET.quarksAdditiveCaps.shieldShards}`);
  q.dispose();
});
