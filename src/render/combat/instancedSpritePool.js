import * as THREE from 'three';
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

const VERTEX_SHADER = /* glsl */`
  attribute vec3 aSpritePosition;
  attribute vec2 aSpriteScale;
  attribute float aSpriteRoll;
  attribute vec3 aSpriteColor;
  attribute float aSpriteOpacity;

  varying vec2 vSpriteUv;
  varying vec3 vSpriteColor;
  varying float vSpriteOpacity;

  void main() {
    float c = cos(aSpriteRoll);
    float s = sin(aSpriteRoll);
    vec2 corner = position.xy * aSpriteScale;
    corner = mat2(c, -s, s, c) * corner;

    vec4 viewPosition = modelViewMatrix * vec4(aSpritePosition, 1.0);
    viewPosition.xy += corner;
    gl_Position = projectionMatrix * viewPosition;
    vSpriteUv = uv;
    vSpriteColor = aSpriteColor;
    vSpriteOpacity = aSpriteOpacity;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uSpriteMap;
  uniform float uRadiance;

  varying vec2 vSpriteUv;
  varying vec3 vSpriteColor;
  varying float vSpriteOpacity;

  void main() {
    vec4 sampleColor = texture2D(uSpriteMap, vSpriteUv);
    float alpha = sampleColor.a * vSpriteOpacity;
    if (alpha < 0.004) discard;
    // HDR headroom: hot energy families are authored above 1.0 so the bloom bright-pass has
    // something to catch (VFX standard B8); smoke stays at 1.0 under ordinary blending.
    gl_FragColor = vec4(sampleColor.rgb * vSpriteColor * uRadiance, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createInstancedSpriteBuckets(
  scene,
  capacity,
  glowTexture,
  ringTexture,
  smokeTexture = glowTexture,
  combustionTexture = glowTexture,
) {
  const safeCapacity = Math.max(1, Math.floor(capacity || 1));
  const glow = createBucket(scene, 'glow', safeCapacity, glowTexture, THREE.AdditiveBlending, 1.7);
  const ring = createBucket(scene, 'ring', safeCapacity, ringTexture, THREE.AdditiveBlending, 1.45);
  const smoke = createBucket(scene, 'smoke', safeCapacity, smokeTexture, THREE.NormalBlending, 1.0);
  const combustion = createBucket(
    scene, 'combustion', safeCapacity, combustionTexture, THREE.AdditiveBlending, 1.6,
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
) {
  const bucket = bucketKind === 'smoke'
    ? buckets.smoke
    : (bucketKind === 'combustion' ? buckets.combustion : (bucketKind ? buckets.ring : buckets.glow));
  const index = bucket.writeCount;
  if (index >= bucket.capacity) return false;
  assertDynamicBufferOwnerWritable(bucket.dynamicBufferOwner);
  bucket.writeCount = index + 1;
  bucket.position.setXYZ(index, x, y, z);
  const scale = Math.max(0.01, scaleValue || 0.01);
  bucket.scale.setXY(
    index,
    Math.max(0.01, Number.isFinite(scaleX) ? scaleX : scale),
    Math.max(0.01, Number.isFinite(scaleY) ? scaleY : scale),
  );
  bucket.roll.setX(index, roll || 0);
  bucket.color.setXYZ(index, r, g, b);
  bucket.opacity.setX(index, Math.max(0, opacity));
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_POSITION, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_SCALE, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_ROLL, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_COLOR, index);
  markDynamicBufferItems(bucket.dynamicBufferOwner, SPRITE_OPACITY, index);
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
  const geometry = new THREE.PlaneGeometry(1, 1);
  const position = dynamicAttribute(capacity * 3, 3);
  const scale = dynamicAttribute(capacity * 2, 2);
  const roll = dynamicAttribute(capacity, 1);
  const color = dynamicAttribute(capacity * 3, 3);
  const opacity = dynamicAttribute(capacity, 1);
  geometry.setAttribute('aSpritePosition', position);
  geometry.setAttribute('aSpriteScale', scale);
  geometry.setAttribute('aSpriteRoll', roll);
  geometry.setAttribute('aSpriteColor', color);
  geometry.setAttribute('aSpriteOpacity', opacity);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpriteMap: { value: texture },
      uRadiance: { value: radiance },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    // Additive HDR energy families opt out of tone mapping so their >1.0 cores reach the bloom
    // bright-pass intact (same contract as the HDR plume); normal-blended smoke stays tonemapped.
    ...(blending === THREE.AdditiveBlending ? { toneMapped: false } : {}),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `SF_VFX_${id}_sprite_instances`;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.spacefaceVfxSpriteBatch = true;
  mesh.userData.spriteBucket = id;
  const dynamicBufferOwner = registerDynamicBufferOwner(scene, {
    id: `combat-sprite-${id}`,
    mesh,
    attributes: [
      { name: 'position', attribute: position },
      { name: 'scale', attribute: scale },
      { name: 'roll', attribute: roll },
      { name: 'color', attribute: color },
      { name: 'opacity', attribute: opacity },
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
}
