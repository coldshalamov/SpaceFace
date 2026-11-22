import * as THREE from 'three';
import { createVfxEventGeometry } from '../vfx/runtime/eventGeometry.js';
import { createTransientDensityTexture, createTransientVfxMaterial } from './transientVfxMaterials.js';
import { createFlipbookGeometry, createFlipbookMaterial, flipbooksAvailable, getFlipbookTexture } from './flipbookSprites.js';
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

const LOD_ROWS = 6;
const LOD_COLUMNS = 4;
// Projected diameter below this fraction of the view height uses the coarse carrier (~0.045 = 32 px at 720p).
export const LOD_SCREEN_FRACTION = 0.045;
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
  const buckets = { glow, ring, smoke, combustion, capacity: safeCapacity };
  // LOD (LOOK-05C): a small or distant event does not need 768 triangles. Same closed-volume
  // carrier, coarser tessellation (3 x 6 x 4 x 2 = 144 triangles); the vertex shader rebuilds the
  // surface from uv, so the silhouette follows the same analytic volume, just with fewer rows.
  // Instances are routed by projected size in writeInstancedSpriteFields.
  buckets.lo = {
    glow: createBucket(scene, 'glowLo', safeCapacity, glowTexture, THREE.AdditiveBlending, 1.7, null, { rows: LOD_ROWS, columns: LOD_COLUMNS }, glow.mesh.material),
    ring: createBucket(scene, 'ringLo', safeCapacity, ringTexture, THREE.AdditiveBlending, 1.45, null, { rows: LOD_ROWS, columns: LOD_COLUMNS }, ring.mesh.material),
  };
  scene.add(buckets.lo.glow.mesh, buckets.lo.ring.mesh);
  buckets.lodCam = { x: 0, y: 0, z: 0, k: 0 };
  buckets.lodOff = urlFlagOff('vfxLod');
  buckets.lodStats = { lo: 0, hi: 0, loTriangles: 0, hiTriangles: 0 };
  // Authored flipbooks (LOOK-05C): present only where a DOM can load the sheets. Each family
  // replaces the matching volume write; the volume buckets stay as the headless/fallback path.
  if (flipbooksAvailable() && !flipbooksDisabled()) {
    buckets.flip = {
      fire: createBucket(scene, 'flipFire', safeCapacity, getFlipbookTexture('fire'), THREE.AdditiveBlending, 1, 'fire'),
      smoke: createBucket(scene, 'flipSmoke', safeCapacity, getFlipbookTexture('smoke'), THREE.NormalBlending, 1, 'smoke'),
      ring: createBucket(scene, 'flipRing', safeCapacity, getFlipbookTexture('ring'), THREE.AdditiveBlending, 1, 'ring'),
      spark: createBucket(scene, 'flipSpark', safeCapacity, getFlipbookTexture('spark'), THREE.AdditiveBlending, 1, 'spark'),
      // One crackling Line arc at a time; a tiny bucket keeps its buffers negligible.
      wisp: createBucket(scene, 'flipWisp', 4, getFlipbookTexture('wisp'), THREE.AdditiveBlending, 1, 'wisp'),
    };
    for (const b of flipBucketList(buckets)) scene.add(b.mesh);
  }
  return buckets;
}

function urlFlagOff(name) {
  try {
    return typeof location !== 'undefined' && new RegExp('[?&]' + name + '=0(?:&|$)').test(location.search || '');
  } catch (_) { return false; }
}
function flipbooksDisabled() { return urlFlagOff('vfxFlip'); }
function flipBucketList(buckets) {
  const f = buckets && buckets.flip;
  return f ? [f.fire, f.smoke, f.ring, f.spark, f.wisp] : [];
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
  for (const b of flipBucketList(buckets)) { assertDynamicBufferOwnerWritable(b.dynamicBufferOwner); b.writeCount = 0; }
  if (buckets.lo) {
    for (const b of [buckets.lo.glow, buckets.lo.ring]) { assertDynamicBufferOwnerWritable(b.dynamicBufferOwner); b.writeCount = 0; }
    buckets.lodStats.lo = 0; buckets.lodStats.hi = 0;
  }
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
  const flip = buckets.flip;
  const bucket0 = bucketKind === 'flipFire' ? flip.fire
    : bucketKind === 'flipSmoke' ? flip.smoke
      : bucketKind === 'flipRing' ? flip.ring
        : bucketKind === 'flipSpark' ? flip.spark
          : bucketKind === 'flipWisp' ? flip.wisp
          : bucketKind === 'smoke'
            ? buckets.smoke
            : (bucketKind === 'combustion' ? buckets.combustion : (bucketKind ? buckets.ring : buckets.glow));
  let bucket = bucket0;
  if (buckets.lo && !buckets.lodOff && (bucket0 === buckets.glow || bucket0 === buckets.ring)) {
    const cam = buckets.lodCam;
    if (cam.k > 0) {
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-3;
      const extent = Math.max(scaleValue || 0, scaleX || 0, scaleY || 0);
      // projected diameter as a fraction of the view height
      if (extent * cam.k / dist < LOD_SCREEN_FRACTION) {
        bucket = bucket0 === buckets.glow ? buckets.lo.glow : buckets.lo.ring;
      }
    }
    if (bucket === bucket0) buckets.lodStats.hi++; else buckets.lodStats.lo++;
  }
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
  const glowVis = buckets.glow.writeCount > 0 || (buckets.lo?.glow?.writeCount || 0) > 0;
  const ringVis = buckets.ring.writeCount > 0 || (buckets.lo?.ring?.writeCount || 0) > 0;
  commitBucket(buckets.glow, glowVis);
  commitBucket(buckets.ring, ringVis);
  commitBucket(buckets.smoke);
  commitBucket(buckets.combustion);
  for (const b of flipBucketList(buckets)) commitBucket(b);
  if (buckets.lo) { commitBucket(buckets.lo.glow, glowVis); commitBucket(buckets.lo.ring, ringVis); }
}

function createBucket(scene, id, capacity, texture, blending, radiance = 1.0, flipFamily = null, geoOpts = null, sharedMaterial = null) {
  const volume = !flipFamily && (id === 'smoke' || id === 'combustion');
  const geometry = flipFamily ? createFlipbookGeometry() : (volume ? new THREE.BoxGeometry(1, 1, 1) : createVfxEventGeometry(geoOpts || {}));
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

  const material = sharedMaterial || (flipFamily ? createFlipbookMaterial(flipFamily) : createTransientVfxMaterial(id, radiance, volume ? texture : null));
  // The bucket owns this material exclusively. Keep empty batches out of Three's render list;
  // object.visible remains independent for VFX isolation and other scene-level owners.
  material.visible = false;
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `SF_VFX_${id}_sprite_instances`;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  // The coarse LOD twins share their parent's material and are not separate role buckets.
  if (sharedMaterial) mesh.userData.spacefaceVfxSpriteLod = true; else mesh.userData.spacefaceVfxSpriteBatch = true;
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
    // Keep the exact texture identity beside the bucket.  The density film is referenced only
    // through a ShaderMaterial uniform, so the context-loss provider cannot discover it by
    // traversing the bucket mesh without walking arbitrary uniform dictionaries.
    texture,
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

function commitBucket(bucket, materialVisible = null) {
  const visible = materialVisible !== null ? materialVisible : bucket.writeCount > 0;
  if (bucket.dynamicBufferOwner) {
    commitDynamicBufferOwner(bucket.dynamicBufferOwner, bucket.writeCount);
    bucket.mesh.material.visible = visible;
    return;
  }
  bucket.mesh.count = bucket.writeCount;
  bucket.mesh.material.visible = visible;
  bucket.position.needsUpdate = true;
  bucket.scale.needsUpdate = true;
  bucket.roll.needsUpdate = true;
  bucket.color.needsUpdate = true;
  bucket.opacity.needsUpdate = true;
  bucket.phase.needsUpdate = true;
  bucket.axis.needsUpdate = true;
}
