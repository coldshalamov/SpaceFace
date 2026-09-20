// Hot contact sparks only: swept, tapered folds aligned with motion in the XZ play plane.
// Solid chips belong to the lit debris pools. A stable launch phase prevents moving sparks from
// re-rolling their shape every frame (the old position hash turned whole bursts into glitter).
import * as THREE from 'three';

// Dynamic-buffer owner binding contract. Names stay aligned with the packed particle channels the
// VFX system has always uploaded: world position, color, width, intensity envelope, heading, length.
export const SHARD_BUFFER_BINDINGS = Object.freeze([
  Object.freeze({ name: 'shard-position', key: 'aShardPos' }),
  Object.freeze({ name: 'color', key: 'aColor' }),
  Object.freeze({ name: 'width', key: 'aSize' }),
  Object.freeze({ name: 'alpha', key: 'aAlpha' }),
  Object.freeze({ name: 'trail-axis', key: 'aTrailAxis' }),
  Object.freeze({ name: 'trail-stretch', key: 'aTrailStretch' }),
]);

const SHARD_VERT = /* glsl */`
  attribute vec3 aShardPos;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aTrailAxis;
  attribute float aTrailStretch;

  varying vec2 vShardUv;
  varying vec3 vShardColor;
  varying float vShardAlpha;
  varying float vShardSeed;

  void main() {
    // uv.x runs 0 (tail end) .. 1 (head, at the particle position); uv.y runs across the streak.
    vShardUv = uv;
    vShardColor = aColor;
    vShardAlpha = aAlpha;
    vShardSeed = fract(aTrailAxis * 0.75487766 + aTrailStretch * 0.56984029);
    // Heading is the launch axis. Drag decelerates a shard without turning it, so the streak stays
    // on the flown path; length comes from aTrailStretch (speed at spawn), width from aSize.
    vec2 dir = vec2(cos(aTrailAxis), sin(aTrailAxis));
    vec2 perp = vec2(-dir.y, dir.x);
    float along = (uv.x - 1.0) * aTrailStretch * (0.3 + 0.7 * aAlpha);
    float side = position.y * aSize;
    vec2 planar = dir * along + perp * side;
    vec3 world = aShardPos + vec3(planar.x, position.z * aSize, planar.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const SHARD_FRAG = /* glsl */`
  precision mediump float;
  uniform float uTrailScroll;
  uniform float uTrailTime;

  varying vec2 vShardUv;
  varying vec3 vShardColor;
  varying float vShardAlpha;
  varying float vShardSeed;

  void main() {
    float along = vShardUv.x;
    float side = vShardUv.y * 2.0 - 1.0;

    // Continuous heat moving along a folded sliver, without a scrolling noise mask or white
    // pixels appearing/disappearing across its surface. The crease carries the hottest material.
    float flow = 0.88 + 0.12 * sin(along * 7.0 - uTrailTime * 9.0 + vShardSeed * 6.28);
    float crease = pow(max(0.0, 1.0 - abs(side)), 3.0);
    float edge = 1.0 - smoothstep(0.72, 1.0, abs(side));
    float envelope = smoothstep(vShardSeed * 0.18, 0.42, along)
      * (1.0 - smoothstep(0.92, 1.0, along));
    float intensity = flow * (0.22 + crease * 0.78) * edge * envelope * vShardAlpha;
    if (intensity < 0.006) discard;

    // Heat, not opacity: the core whitens and its radiance exceeds 1.0 so selective bloom catches
    // the hot front (B8). Cooling shrinks reach and heat with the age envelope in aAlpha.
    float hotTip = crease * smoothstep(0.65, 0.88, along) * pow(vShardAlpha, 3.0);
    vec3 hot = mix(vShardColor, vec3(1.0, 0.91, 0.72), hotTip * 0.45);
    float radiance = 0.65 + hotTip * 2.4;
    gl_FragColor = vec4(hot * intensity * radiance, intensity);
  }
`;

function createShardQuadGeometry(capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  // Four stations, each with two lips and a raised crease. Width grows toward the hot head
  // and closes at both ends; the silhouette is a sliver, never a luminous rectangular card.
  const positions = [], uvs = [], indices = [];
  const stations = [0, 0.36, 0.82, 1];
  const widths = [0, 0.20, 0.5, 0];
  for (let i = 0; i < stations.length; i++) {
    for (let j = 0; j < 3; j++) {
      positions.push(stations[i] - 0.5, (j - 1) * widths[i], j === 1 ? widths[i] * 0.36 : 0);
      uvs.push(stations[i], j * 0.5);
    }
    if (i === 0) continue;
    for (let j = 0; j < 2; j++) {
      const a = (i - 1) * 3 + j, b = i * 3 + j;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute('aShardPos', shardAttribute(capacity * 3, 3));
  geometry.setAttribute('aColor', shardAttribute(capacity * 3, 3));
  geometry.setAttribute('aSize', shardAttribute(capacity, 1));
  geometry.setAttribute('aAlpha', shardAttribute(capacity, 1));
  geometry.setAttribute('aTrailAxis', shardAttribute(capacity, 1));
  geometry.setAttribute('aTrailStretch', shardAttribute(capacity, 1));
  geometry.instanceCount = capacity;
  return geometry;
}

function shardAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function createShardMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
    },
    vertexShader: SHARD_VERT,
    fragmentShader: SHARD_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
}

/**
 * One instanced streak-quad cloud replacing the point-sprite spark cloud, one draw call at any
 * live count (mesh.count is the live instance count driven by the dynamic-buffer commit).
 */
export function createShardStreakCloud(scene, capacity) {
  const safeCapacity = Math.max(1, Math.floor(capacity || 1));
  const geometry = createShardQuadGeometry(safeCapacity);
  const material = createShardMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, safeCapacity);
  mesh.name = 'SF_VFX_ParticleShardStreaks';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.userData.spacefaceVfxSpriteBatch = false;
  scene.add(mesh);
  return {
    mesh,
    geometry,
    material,
    capacity: safeCapacity,
    position: geometry.getAttribute('aShardPos'),
    color: geometry.getAttribute('aColor'),
    size: geometry.getAttribute('aSize'),
    alpha: geometry.getAttribute('aAlpha'),
    trailAxis: geometry.getAttribute('aTrailAxis'),
    trailStretch: geometry.getAttribute('aTrailStretch'),
  };
}

/**
 * Rebuild the instance attributes of an existing cloud at a new capacity (particle-quality
 * migration). The mesh, material, and scene attachment stay stable; only the SoA buffers move.
 */
export function resizeShardStreakCloud(cloud, capacity) {
  const safeCapacity = Math.max(1, Math.floor(capacity || 1));
  const geometry = createShardQuadGeometry(safeCapacity);
  const oldGeometry = cloud.geometry;
  cloud.geometry = geometry;
  cloud.capacity = safeCapacity;
  cloud.position = geometry.getAttribute('aShardPos');
  cloud.color = geometry.getAttribute('aColor');
  cloud.size = geometry.getAttribute('aSize');
  cloud.alpha = geometry.getAttribute('aAlpha');
  cloud.trailAxis = geometry.getAttribute('aTrailAxis');
  cloud.trailStretch = geometry.getAttribute('aTrailStretch');
  if (oldGeometry && oldGeometry !== geometry && typeof oldGeometry.dispose === 'function') {
    oldGeometry.dispose();
  }
  return geometry;
}
