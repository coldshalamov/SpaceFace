import * as THREE from 'three';
import { createStructuredBurstGeometry } from './structuredBurstGeometry.js';
import { createTransientDensityTexture, createTransientVfxMaterial } from './transientVfxMaterials.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

const SPRITE_POSITION = 0;
const SPRITE_SCALE = 1;
const SPRITE_ROLL = 2;
const SPRITE_COLOR = 3;
const SPRITE_OPACITY = 4;

const SPRITE_PHASE = 5;
const SPRITE_AXIS = 6;

// Public names are retained for the admission/pooling contract; no bucket is a billboard.
export function createInstancedSpriteBuckets(
  scene,
  capacity,
  glowTexture,
  ringTexture,
  smokeTexture = glowTexture,
  combustionTexture = glowTexture,
) {
  const safeCapacity = Math.max(1, Math.floor(capacity || 1));
  const densityTexture = createTransientDensityTexture();
  const glow = createBucket(scene, 'glow', safeCapacity, glowTexture, THREE.AdditiveBlending, 1.7);
  const ring = createBucket(scene, 'ring', safeCapacity, ringTexture, THREE.AdditiveBlending, 1.45);
  const smoke = createBucket(scene, 'smoke', safeCapacity, densityTexture, THREE.NormalBlending, 1.0);
  const combustion = createBucket(
    scene, 'combustion', safeCapacity, densityTexture, THREE.AdditiveBlending, 1.6,
  );
  scene.add(glow.mesh, ring.mesh, smoke.mesh, combustion.mesh);
  return { glow, ring, smoke, combustion, capacity: safeCapacity };
}

export function resetInstancedSpriteBuckets(buckets) {
  if (!buckets) return;
  assertDynamicBufferOwnerWritable(buckets.glow.dynamicBufferOwner);
  assertDynamicBufferOwnerWritable(buckets.ring.dynamicBufferOwner);
  assertDynamicBufferOwnerWritable(buckets.smoke.dynamicBufferOwner);
  assertDynamicBufferOwnerWritable(buckets.combustion.dynamicBufferOwner);
  buckets.glow.writeCount = 0;
  buckets.ring.writeCount = 0;
  buckets.smoke.writeCount = 0;
  buckets.combustion.writeCount = 0;
}

export function writeInstancedSprite(buckets, bucketKind, sprite) {
  return writeInstancedSpriteFields(
    buckets,
    bucketKind,
    sprite.x,
    sprite.y,
    sprite.z,
    sprite.scale,
    sprite.scaleX,
    sprite.scaleY,
    sprite.roll,
    sprite.r,
    sprite.g,
    sprite.b,
    sprite.opacity,
    sprite.phase,
    sprite.seed,
    sprite.axis,
  );
}

/**
 * Allocation-free hot-path writer. Callers integrating resident sprite state should use this
 * positional form instead of constructing a temporary object for every live instance each frame.
 * Saturated buckets drop the excess write and preserve the already-authored instances.
 */
export function writeInstancedSpriteFields(
  buckets,
  bucketKind,
  x,
  y,
  z,
  scaleValue,
  scaleX,
  scaleY,
  roll,
  r,
  g,
  b,
  opacity,
  progress = 0,
  seed = 0,
  axis = roll,
) {
  const bucket = bucketKind === 'smoke'
    ? buckets.smoke
    : (bucketKind === 'combustion' ? buckets.combustion : (bucketKind ? buckets.ring : buckets.glow));
  const index = bucket.writeCount;
  if (index >= bucket.capacity) return false;
  assertDynamicBufferOwnerWritable(bucket.dynamicBufferOwner);
  bucket.writeCount = index + 1;
  bucket.position.setXYZ(index, Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0);
  const scale = Math.max(0.01, Number.isFinite(scaleValue) ? scaleValue : 0.01);
  bucket.scale.setXY(
    index,
    Math.max(0.01, Number.isFinite(scaleX) ? scaleX : scale),
    Math.max(0.01, Number.isFinite(scaleY) ? scaleY : scale),
  );
  bucket.roll.setX(index, Number.isFinite(roll) ? roll : 0);
  bucket.color.setXYZ(index, Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0);
  bucket.opacity.setX(index, Math.max(0, Number.isFinite(opacity) ? opacity : 0));
  bucket.phase.setXY(index, Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)),
    Number.isFinite(seed) ? seed - Math.floor(seed) : 0);
  bucket.axis.setX(index, Number.isFinite(axis) ? axis : 0);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_POSITION, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_SCALE, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_ROLL, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_COLOR, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_OPACITY, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_PHASE, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_AXIS, index);
  return true;
}

export function commitInstancedSpriteBuckets(buckets) {
  if (!buckets) return;
  commitBucket(buckets.glow);
  commitBucket(buckets.ring);
  commitBucket(buckets.smoke);
  commitBucket(buckets.combustion);
}

function createBucket(scene, id, capacity, texture, blending, radiance = 1.0) {
  const volume = id === 'smoke' || id === 'combustion';
  const geometry = volume ? new THREE.BoxGeometry(1, 1, 1) : createStructuredBurstGeometry(id);
  const position = dynamicAttribute(capacity * 3, 3);
  const scale = dynamicAttribute(capacity * 2, 2);
  const roll = dynamicAttribute(capacity, 1);
  const color = dynamicAttribute(capacity * 3, 3);
  const opacity = dynamicAttribute(capacity, 1);
  const phase = dynamicAttribute(capacity * 2, 2);
  const axis = dynamicAttribute(capacity, 1);
  geometry.setAttribute('aSpritePosition', position);
  geometry.setAttribute('aSpriteScale', scale);
  geometry.setAttribute('aSpriteRoll', roll);
  geometry.setAttribute('aSpriteColor', color);
  geometry.setAttribute('aSpriteOpacity', opacity);
  geometry.setAttribute('aSpritePhase', phase);
  geometry.setAttribute('aSpriteAxis', axis);

  const material = createTransientVfxMaterial(id, radiance, volume ? texture : null);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `SF_VFX_${id}_sprite_instances`;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.spacefaceVfxSpriteBatch = true;
  mesh.userData.spriteBucket = id;
  mesh.userData.spacefaceStructuredTransient = material.userData.spacefaceTransientTechnique;
  if (volume) {
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      material.uniforms.uWorldToClip.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      material.uniforms.uObjectToWorld.value.copy(mesh.matrixWorld);
    };
  }
  const dynamicBufferOwner = registerDynamicBufferOwner(scene, {
    id: `combat-sprite-${id}`,
    mesh,
    attributes: [
      { name: 'position', attribute: position },
      { name: 'scale', attribute: scale },
      { name: 'roll', attribute: roll },
      { name: 'color', attribute: color },
      { name: 'opacity', attribute: opacity },
      { name: 'phase', attribute: phase },
      { name: 'axis', attribute: axis },
    ],
  });
  return {
    id,
    capacity,
    mesh,
    position,
    scale,
    roll,
    color,
    opacity,
    phase,
    axis,
    dynamicBufferOwner,
    writeCount: 0,
  };
}

function dynamicAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function commitBucket(bucket) {
  if (bucket.dynamicBufferOwner) {
    commitDynamicBufferOwner(bucket.dynamicBufferOwner, bucket.writeCount);
    return;
  }
  bucket.mesh.count = bucket.writeCount;
  bucket.position.needsUpdate = true;
  bucket.scale.needsUpdate = true;
  bucket.roll.needsUpdate = true;
  bucket.color.needsUpdate = true;
  bucket.opacity.needsUpdate = true;
  bucket.phase.needsUpdate = true;
  bucket.axis.needsUpdate = true;
}
