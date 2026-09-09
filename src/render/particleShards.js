// Pooled spark/chip/ember presentation: one instanced streak-quad cloud in the shared
// luminous-fluid language (TRAIL_GLSL_LIB), replacing the retired gaussian point-sprite cloud.
// Each particle renders as a real world-space shard: a velocity-oriented streak quad on the play
// plane with a hot core line, a defined lateral cutoff, flowing internal structure, and a ragged
// per-shard runout — never a camera-facing gaussian dot.
import * as THREE from 'three';
import { TRAIL_GLSL_LIB } from './trailTexture.js';

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
    vShardSeed = fract(sin(dot(aShardPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
    // Heading is the launch axis. Drag decelerates a shard without turning it, so the streak stays
    // on the flown path; length comes from aTrailStretch (speed at spawn), width from aSize.
    vec2 dir = vec2(cos(aTrailAxis), sin(aTrailAxis));
    vec2 perp = vec2(-dir.y, dir.x);
    float along = (uv.x - 1.0) * aTrailStretch;
    float side = (uv.y - 0.5) * aSize;
    vec3 world = aShardPos + vec3(dir * along + perp * side, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const SHARD_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  uniform float uTrailScroll;
  uniform float uTrailTime;

  varying vec2 vShardUv;
  varying vec3 vShardColor;
  varying float vShardAlpha;
  varying float vShardSeed;

  void main() {
    float along = vShardUv.x;
    float side = vShardUv.y * 2.0 - 1.0;

    // Structure rides a travelling wave (position minus time) with a per-shard phase, so detail
    // flows through each streak instead of translating a frozen shape (B15/B16).
    float flow = fract(along * 1.35 + vShardSeed * 7.31 - uTrailTime * (0.9 + vShardSeed * 0.8));
    float body = trailSampleProcedural(flow, side, uTrailTime);

    // Defined cross-section: a white-hot core line plus a fast linear sheath and a hard lateral
    // cutoff. Not a gaussian-only falloff — the streak has an edge (B6).
    float core = exp(-side * side * 30.0);
    float sheath = max(0.0, 1.0 - abs(side) * 1.15);
    float lateral = core + sheath * 0.34;

    // Every shard runs out of material at its own distance before the geometry ends, so the far
    // edge of a burst dissolves raggedly instead of stopping at one plane (B9/B18).
    float reach = vShardSeed * 0.38;
    float envelope = smoothstep(0.0, 0.26, along) * smoothstep(reach, reach + 0.14, along);

    float intensity = body * lateral * envelope * vShardAlpha;
    if (intensity < 0.006) discard;

    // Heat, not opacity: the core whitens and its radiance exceeds 1.0 so selective bloom catches
    // the hot front (B8). Cooling shrinks reach and heat with the age envelope in aAlpha.
    vec3 hot = mix(vShardColor, vec3(1.0, 0.985, 0.92), clamp(core * 0.7, 0.0, 0.65));
    float radiance = 0.55 + vShardAlpha * (0.9 + body * 1.5);
    gl_FragColor = vec4(hot * intensity * radiance, intensity);
  }
`;

function createShardQuadGeometry(capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  // Two triangles on the play plane: position.x = along (-0.5 head side .. +0.5), position.y = side.
  const corners = new Float32Array([
    -0.5, -0.5, 0,
    -0.5, 0.5, 0,
    0.5, -0.5, 0,
    0.5, 0.5, 0,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(corners, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0,
    0, 1,
    1, 0,
    1, 1,
  ]), 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
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
