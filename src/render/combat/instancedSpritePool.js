import * as THREE from 'three';

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

  varying vec2 vSpriteUv;
  varying vec3 vSpriteColor;
  varying float vSpriteOpacity;

  void main() {
    vec4 sampleColor = texture2D(uSpriteMap, vSpriteUv);
    float alpha = sampleColor.a * vSpriteOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(sampleColor.rgb * vSpriteColor, alpha);
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
  const glow = createBucket('glow', safeCapacity, glowTexture, THREE.AdditiveBlending);
  const ring = createBucket('ring', safeCapacity, ringTexture, THREE.AdditiveBlending);
  const smoke = createBucket('smoke', safeCapacity, smokeTexture, THREE.NormalBlending);
  const combustion = createBucket('combustion', safeCapacity, combustionTexture, THREE.AdditiveBlending);
  scene.add(glow.mesh, ring.mesh, smoke.mesh, combustion.mesh);
  return { glow, ring, smoke, combustion, capacity: safeCapacity };
}

export function resetInstancedSpriteBuckets(buckets) {
  if (!buckets) return;
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
  return true;
}

export function commitInstancedSpriteBuckets(buckets) {
  if (!buckets) return;
  commitBucket(buckets.glow);
  commitBucket(buckets.ring);
  commitBucket(buckets.smoke);
  commitBucket(buckets.combustion);
}

function createBucket(id, capacity, texture, blending) {
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
    uniforms: { uSpriteMap: { value: texture } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
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
  return { id, capacity, mesh, position, scale, roll, color, opacity, writeCount: 0 };
}

function dynamicAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function commitBucket(bucket) {
  bucket.mesh.count = bucket.writeCount;
  bucket.position.needsUpdate = true;
  bucket.scale.needsUpdate = true;
  bucket.roll.needsUpdate = true;
  bucket.color.needsUpdate = true;
  bucket.opacity.needsUpdate = true;
}
