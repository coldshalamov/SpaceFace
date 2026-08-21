// Engine-trail surface factory — ribbon, streak mesh, particle trail shader (single contract).
import * as THREE from 'three';
import {
  TRAIL_GLSL_LIB,
  buildParticleTrailFrag,
  buildParticleTrailVert,
} from './trailTexture.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
} from './dynamicBufferRanges.js';

const TRAIL_MATRIX = 0;
const TRAIL_COLOR = 1;
const TRAIL_OPACITY = 2;

/**
 * Maximum history insertions a single delayed frame may request.
 *
 * Raised so a hitch at cruise/boost can still lay down equal-spacing samples rather than
 * equal-fraction chords that leave a multi-spacing gap between the live nozzle and history[1]
 * (the visible "skip behind the ship"). Still hard-capped; rebuild is already O(nSeg).
 */
export const RIBBON_TRAIL_INTERPOLATION_CAP = 32;

const PARTICLE_VERT_BASE = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * (uScale / max(-mv.z, 1.0)), 1.0, 64.0);
  }
`;

const PARTICLE_FRAG_BASE = `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    float fall = exp(-r * 14.0);
    if (fall < 0.012) discard;
    gl_FragColor = vec4(vColor * fall, vAlpha * fall);
  }
`;

export const PARTICLE_TRAIL_VERT = buildParticleTrailVert(PARTICLE_VERT_BASE);
export const PARTICLE_TRAIL_FRAG = buildParticleTrailFrag(PARTICLE_FRAG_BASE);

export function buildParticleTrailMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 520 },
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
    },
    vertexShader: PARTICLE_TRAIL_VERT,
    fragmentShader: PARTICLE_TRAIL_FRAG,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}

const RIBBON_TRAIL_VERT = /* glsl */`
  attribute vec2 aTrailUv;
  varying vec2 vTrailUv;
  void main() {
    vTrailUv = aTrailUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_TRAIL_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadiance;
  varying vec2 vTrailUv;
  void main() {
    // aTrailUv.x is physical history: 0 = live nozzle, 1 = oldest retained wake. Flow scroll is
    // independent so animation never re-lights the tail as a solid painted strip.
    float pathT = clamp(vTrailUv.x, 0.0, 1.0);
    float along = fract(pathT * 3.15 - uTrailScroll * 1.55);
    float side = vTrailUv.y * 2.0 - 1.0;
    float liquid = trailSampleProcedural(along, side, uTrailTime);
    // Hot core filament + forked side ribbons (liquid/electric edges, not a solid tube).
    float filament = exp(-side * side * 24.0);
    float ribbonOffA = 0.22 + 0.12 * sin(along * 11.0 + uTrailTime * 2.8);
    float ribbonOffB = 0.26 + 0.10 * cos(along * 8.5 - uTrailTime * 2.1);
    float ribbonA = exp(-pow(side - ribbonOffA, 2.0) * 32.0);
    float ribbonB = exp(-pow(side + ribbonOffB, 2.0) * 30.0);
    float ribbons = ribbonA * 0.62 + ribbonB * 0.55;
    // Soft sheath kept dim so the body does not fill into a solid cable.
    float sheath = exp(-side * side * 4.2);
    // Electric crackle along the fluid edges (reference: braided plasma arcs).
    float arcNoise = trailValueNoise(vec2(along * 22.0 - uTrailTime * 1.8, side * 5.0 + 0.6));
    float arcs = smoothstep(0.58, 0.92, arcNoise) * exp(-abs(side) * 2.4) * liquid;
    // Shorter physical wake: energy fades earlier so the trail is a jet, not a long tube.
    float tailEnvelope = 1.0 - smoothstep(0.38, 1.0, pathT);
    float headBoost = 1.0 - smoothstep(0.0, 0.12, pathT);
    float fluidNoise = trailValueNoise(vec2(along * 9.0, uTrailTime * 0.22));
    float threadNoise = trailValueNoise(vec2(along * 17.0 - uTrailTime * 0.31, side * 2.4 + 1.7));
    float brokenSheath = liquid * sheath * (0.42 + 0.58 * fluidNoise)
      * (0.72 + 0.28 * threadNoise);
    float alpha = min(1.0, uOpacity * tailEnvelope
      * (filament * 0.88 + ribbons * 0.72 + brokenSheath * 0.48 + sheath * 0.10 + arcs * 0.55)
      * (0.86 + headBoost * 0.28));
    if (alpha < 0.006) discard;
    vec3 whiteHot = vec3(1.0, 0.988, 0.94);
    vec3 coolSheath = mix(uColor, vec3(0.45, 0.82, 1.0), 0.36);
    float hotMix = clamp(filament * 0.78 + ribbons * 0.22 + headBoost * 0.20 + arcs * 0.18, 0.0, 1.0);
    vec3 radiance = mix(coolSheath, whiteHot, hotMix)
      * uRadiance * (0.72 + liquid * 0.78 + filament * 0.48 + ribbons * 0.28 + headBoost * 0.20 + arcs * 0.22);
    gl_FragColor = vec4(radiance, alpha);
  }
`;

export function createRibbonTrailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
      uColor: { value: new THREE.Color(color || '#7fe0ff') },
      uOpacity: { value: 0.62 },
      uRadiance: { value: 1.85 },
    },
    vertexShader: RIBBON_TRAIL_VERT,
    fragmentShader: RIBBON_TRAIL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const TRAIL_STREAK_VERT = /* glsl */`
  varying vec2 vTrailUv;
  void main() {
    vTrailUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_STREAK_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vTrailUv;
  void main() {
    float along = fract(vTrailUv.y + uTrailScroll);
    float side = vTrailUv.x * 2.0 - 1.0;
    float streak = trailSampleProcedural(along, side, uTrailTime);
    if (streak < 0.008) discard;
    gl_FragColor = vec4(uColor * (0.65 + streak * 0.55), uOpacity * streak);
  }
`;

const INSTANCED_TRAIL_STREAK_VERT = /* glsl */`
  attribute vec3 aTrailColor;
  attribute float aTrailOpacity;
  varying vec2 vTrailUv;
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  void main() {
    vTrailUv = uv;
    vTrailColor = aTrailColor;
    vTrailOpacity = aTrailOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const INSTANCED_TRAIL_STREAK_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  varying vec2 vTrailUv;
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  void main() {
    float along = fract(vTrailUv.y + uTrailScroll);
    float side = vTrailUv.x * 2.0 - 1.0;
    float streak = trailSampleProcedural(along, side, uTrailTime);
    if (streak < 0.008) discard;
    gl_FragColor = vec4(vTrailColor * (0.65 + streak * 0.55), vTrailOpacity * streak);
  }
`;

export function createTrailStreakMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
      uColor: { value: new THREE.Color(color || '#ffffff') },
      uOpacity: { value: 0.5 },
    },
    vertexShader: TRAIL_STREAK_VERT,
    fragmentShader: TRAIL_STREAK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createInstancedTrailStreakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
    },
    vertexShader: INSTANCED_TRAIL_STREAK_VERT,
    fragmentShader: INSTANCED_TRAIL_STREAK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

let _sharedStreakGeo = null;

export function createTrailStreakGeometry() {
  if (!_sharedStreakGeo) {
    _sharedStreakGeo = new THREE.PlaneGeometry(1, 1, 1, 4);
    _sharedStreakGeo.rotateX(-Math.PI / 2);
  }
  return _sharedStreakGeo;
}

/** One streak-mesh slot (procedural ShaderMaterial) — not a sprite. */
export function createTrailStreakSlot(scene) {
  const mesh = new THREE.Mesh(createTrailStreakGeometry(), createTrailStreakMaterial('#ffffff'));
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  scene.add(mesh);
  return mesh;
}

export function initTrailStreakPool(scene, cap) {
  const pool = createTrailStreakPool(cap);
  scene.add(pool.mesh);
  pool.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
    id: 'trail-streak-instances',
    mesh: pool.mesh,
    attributes: [
      { name: 'matrix', attribute: pool.mesh.instanceMatrix },
      { name: 'color', attribute: pool.colorAttribute },
      { name: 'opacity', attribute: pool.opacityAttribute },
    ],
  });
  return pool;
}

function createTrailStreakPool(cap) {
  const capacity = Math.max(1, Math.floor(cap || 1));
  const geometry = createTrailStreakGeometry().clone();
  const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const opacityAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  opacityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aTrailColor', colorAttribute);
  geometry.setAttribute('aTrailOpacity', opacityAttribute);

  const mesh = new THREE.InstancedMesh(geometry, createInstancedTrailStreakMaterial(), capacity);
  mesh.name = 'SF_TrailStreakInstances';
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;

  return {
    mesh,
    capacity,
    colorAttribute,
    opacityAttribute,
    _transform: new THREE.Object3D(),
  };
}

export function updateTrailStreakInstance(pool, index, {
  x, y, z, vx, vz, width, length, opacity, color,
}) {
  if (!pool || !pool.mesh || index < 0 || index >= pool.capacity || !Number.isInteger(index)) {
    throw new RangeError(`trail instance index ${index} exceeds pool capacity`);
  }
  assertDynamicBufferOwnerWritable(pool.dynamicBufferOwner);
  const transform = pool._transform;
  transform.position.set(x, y || 0.4, z);
  transform.rotation.set(0, Math.atan2(vz || 0, vx || 0) - Math.PI * 0.5, 0);
  transform.scale.set(Math.max(0.01, width), 1, Math.max(0.01, length));
  transform.updateMatrix();
  pool.mesh.setMatrixAt(index, transform.matrix);
  pool.colorAttribute.setXYZ(index,
    color && Number.isFinite(color.r) ? color.r : 1,
    color && Number.isFinite(color.g) ? color.g : 1,
    color && Number.isFinite(color.b) ? color.b : 1);
  pool.opacityAttribute.setX(index, Math.max(0, opacity));
  markDynamicBufferItems(pool.dynamicBufferOwner, TRAIL_MATRIX, index);
  markDynamicBufferItems(pool.dynamicBufferOwner, TRAIL_COLOR, index);
  markDynamicBufferItems(pool.dynamicBufferOwner, TRAIL_OPACITY, index);
}

export function commitTrailStreakInstances(pool, liveCount, { scroll, time } = {}) {
  if (!pool || !pool.mesh || liveCount < 0 || liveCount > pool.capacity || !Number.isInteger(liveCount)) {
    throw new RangeError(`trail live count ${liveCount} exceeds pool capacity`);
  }
  if (pool.dynamicBufferOwner) commitDynamicBufferOwner(pool.dynamicBufferOwner, liveCount);
  else {
    pool.mesh.count = liveCount;
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.colorAttribute.needsUpdate = true;
    pool.opacityAttribute.needsUpdate = true;
  }
  pool.mesh.visible = liveCount > 0;
  pool.mesh.material.uniforms.uTrailTime.value = time || 0;
  pool.mesh.material.uniforms.uTrailScroll.value = scroll || 0;
}

export function clearTrailStreakInstances(pool) {
  if (!pool || !pool.mesh) return;
  if (pool.dynamicBufferOwner) commitDynamicBufferOwner(pool.dynamicBufferOwner, 0);
  else pool.mesh.count = 0;
  pool.mesh.visible = false;
}

export function updateTrailStreakMesh(mesh, {
  x, y, z, vx, vz, width, length, opacity, scroll, time,
}) {
  mesh.visible = true;
  mesh.position.set(x, y || 0.4, z);
  mesh.rotation.y = Math.atan2(vz || 0, vx || 0) - Math.PI * 0.5;
  mesh.scale.set(Math.max(0.01, width), 1, Math.max(0.01, length));
  mesh.material.uniforms.uOpacity.value = Math.max(0, opacity);
  mesh.material.uniforms.uTrailTime.value = time || 0;
  mesh.material.uniforms.uTrailScroll.value = scroll || 0;
}

export function hideTrailStreakMesh(mesh) {
  if (mesh) mesh.visible = false;
}

export function isProceduralTrailMaterial(mat) {
  return !!(mat && mat.type === 'ShaderMaterial' && mat.fragmentShader
    && mat.fragmentShader.includes('trailSampleProcedural'));
}

/** Tapering ribbon trail for medium/large ships. */
export function createRibbonTrail(scene, color, nSeg, baseWidth) {
  nSeg = nSeg || 30;
  baseWidth = baseWidth || 5;
  const verts = nSeg * 2;
  const pos = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  uvAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailUv', uvAttr);
  // Three clears updateRanges after each upload. Keep one owner-held range object per attribute and
  // reattach it, avoiding addUpdateRange()'s per-frame object allocation on the hot path.
  const posUpdateRange = { start: 0, count: 0 };
  const uvUpdateRange = { start: 0, count: 0 };
  const markAttributeRange = (attribute, range, count) => {
    range.start = 0;
    range.count = count;
    attribute.updateRanges.length = 1;
    attribute.updateRanges[0] = range;
    attribute.needsUpdate = true;
  };
  const idx = [];
  for (let i = 0; i < nSeg - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  geo.setIndex(idx);
  const mat = createRibbonTrailMaterial(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  geo.setDrawRange(0, 0);
  scene.add(mesh);

  // The ring owns committed history only. The current nozzle pose is separate, so it can follow the
  // rendered socket every display frame without consuming history capacity or leaving a one-cadence
  // gap behind the ship. All storage is fixed at construction; follow()/rebuild() allocate nothing.
  const pts = new Float32Array(nSeg * 3);
  const centers = new Float32Array(nSeg * 3);
  let historyHead = 0;
  let historyCount = 0;
  let hasLive = false;
  let liveX = 0;
  let liveZ = 0;
  let liveRot = 0;
  let committedX = 0;
  let committedZ = 0;
  let committedRot = 0;
  let sampleElapsed = 0;
  let ownerIdentity = null;
  let lastUvCount = -1;
  let renderedCount = 0;
  let fullRebuildCount = 0;
  let headSyncCount = 0;
  let lastCadenceToken = null;

  const applyPresentation = (opacity, scroll, time, radiance) => {
    if (opacity != null) {
      mat.uniforms.uOpacity.value = Number.isFinite(opacity)
        ? Math.max(0, Math.min(1, opacity))
        : 0;
    }
    if (scroll != null) mat.uniforms.uTrailScroll.value = Number.isFinite(scroll) ? scroll : 0;
    if (time != null) mat.uniforms.uTrailTime.value = Number.isFinite(time) ? time : 0;
    if (radiance != null) {
      mat.uniforms.uRadiance.value = Number.isFinite(radiance)
        ? Math.max(0, Math.min(3.2, radiance))
        : 0;
    }
  };

  /**
   * Catmull-Rom sample of the ribbon centerline. Equal-spacing history alone still reads as
   * segmented chords under hard turns; a one-sample cubic through neighbours softens the path
   * without allocating, and falls back to the raw sample at the ends.
   */
  const sampleCenter = (i, count, out) => {
    if (count < 3 || i <= 0 || i >= count - 1) {
      out.x = centers[i * 3];
      out.z = centers[i * 3 + 1];
      out.rot = centers[i * 3 + 2];
      return out;
    }
    const i0 = i - 1;
    const i1 = i;
    const i2 = i + 1;
    const i3 = i + 2 < count ? i + 2 : i + 1;
    // Evaluate at the node itself with a light neighbour blend (t=0 on p1→p2, nudged by p0/p3).
    // Using the midpoint tangent estimate keeps the sample on the authored history while rounding
    // the normal used for width.
    const p0x = centers[i0 * 3]; const p0z = centers[i0 * 3 + 1];
    const p1x = centers[i1 * 3]; const p1z = centers[i1 * 3 + 1];
    const p2x = centers[i2 * 3]; const p2z = centers[i2 * 3 + 1];
    const p3x = centers[i3 * 3]; const p3z = centers[i3 * 3 + 1];
    // Catmull-Rom at t=0 is p1; use a tiny t toward p2 mixed back to keep the head exact and
    // only round interior curvature for the normal. Position stays on history (no drift).
    out.x = p1x;
    out.z = p1z;
    out.rot = centers[i1 * 3 + 2];
    // Store a smoothed tangent basis on the scratch so writeCenterPair can prefer it.
    out.tx = (p2x - p0x) * 0.5 + (p3x - p1x) * 0.15;
    out.tz = (p2z - p0z) * 0.5 + (p3z - p1z) * 0.15;
    return out;
  };
  const centerScratch = { x: 0, z: 0, rot: 0, tx: 0, tz: 0 };

  const writeCenterPair = (i, count) => {
    const t = i / Math.max(1, count - 1);
    sampleCenter(i, count, centerScratch);
    const px = centerScratch.x;
    const pz = centerScratch.z;
    const rot = centerScratch.rot;
    let tangentX;
    let tangentZ;
    if (count >= 3 && i > 0 && i < count - 1
      && (Math.abs(centerScratch.tx) + Math.abs(centerScratch.tz)) > 1e-8) {
      // Smoothed interior tangent (camera-parallel cross is not needed in XZ ribbon space).
      tangentX = centerScratch.tx;
      tangentZ = centerScratch.tz;
    } else {
      const near = i > 0 ? i - 1 : i;
      const far = i + 1 < count ? i + 1 : i;
      tangentX = centers[near * 3] - centers[far * 3];
      tangentZ = centers[near * 3 + 1] - centers[far * 3 + 1];
    }
    const tangentLength = Math.hypot(tangentX, tangentZ);
    const normalX = tangentLength > 1e-5 ? -tangentZ / tangentLength : Math.sin(rot);
    const normalZ = tangentLength > 1e-5 ? tangentX / tangentLength : -Math.cos(rot);
    // Soft nozzle open into a liquid sheath, then a long continuous taper — no hard width steps.
    const nozzleOpen = 0.52 + 0.48 * Math.min(1, t / 0.09);
    const body = Math.pow(Math.max(0, 1 - t), 0.55);
    const w = baseWidth * nozzleOpen * body;
    const ox = normalX * w;
    const oz = normalZ * w;
    const vi = i * 2;
    pos[vi * 3] = px + ox;
    pos[vi * 3 + 1] = 0.4;
    pos[vi * 3 + 2] = pz + oz;
    pos[(vi + 1) * 3] = px - ox;
    pos[(vi + 1) * 3 + 1] = 0.4;
    pos[(vi + 1) * 3 + 2] = pz - oz;
  };

  const appendHistory = (x, z, rot) => {
    pts[historyHead * 3] = x;
    pts[historyHead * 3 + 1] = z;
    pts[historyHead * 3 + 2] = rot;
    historyHead = (historyHead + 1) % nSeg;
    if (historyCount < nSeg - 1) historyCount++;
  };

  const seedLive = (x, z, rot, owner) => {
    historyHead = 0;
    historyCount = 0;
    hasLive = true;
    liveX = committedX = x;
    liveZ = committedZ = z;
    liveRot = committedRot = rot;
    sampleElapsed = 0;
    ownerIdentity = owner ?? null;
    renderedCount = 0;
    lastCadenceToken = null;
    mesh.visible = false;
    geo.setDrawRange(0, 0);
  };

  const clearHistory = () => {
    historyHead = 0;
    historyCount = 0;
    hasLive = false;
    sampleElapsed = 0;
    ownerIdentity = null;
    lastUvCount = -1;
    renderedCount = 0;
    lastCadenceToken = null;
    mesh.visible = false;
    geo.setDrawRange(0, 0);
  };

  return {
    // Compatibility/manual authoring seam. Samples are frame-local XZ.
    push(x, z, rot) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) {
        clearHistory();
        return false;
      }
      if (!hasLive) {
        seedLive(x, z, rot, null);
        return true;
      }
      appendHistory(liveX, liveZ, liveRot);
      committedX = liveX;
      committedZ = liveZ;
      committedRot = liveRot;
      liveX = x;
      liveZ = z;
      liveRot = rot;
      return true;
    },
    /**
     * Follow a live nozzle with a display-frame head and bounded equal-spacing history.
     *
     * owner is compared by identity so a replacement entity reusing an id cannot inherit the old
     * hull's wake. discontinuityWU rejects teleports/jumps.
     *
     * LAG/SKIP CONTRACT: the live head is always the current nozzle, and the most recent committed
     * history sample is always advanced so the first ribbon segment (live → history[1]) is at most
     * one sampleSpacingWU long. Equal-fraction subdivision capped at a small insert budget left a
     * multi-spacing first chord on delayed frames — that chord was the visible skip behind the ship.
     */
    follow(x, z, rot, dt, owner, sampleSpacingWU, discontinuityWU, samplePeriodS) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) {
        clearHistory();
        return false;
      }
      if (!hasLive || (owner != null && ownerIdentity !== owner)) {
        seedLive(x, z, rot, owner);
        return true;
      }

      const frameDx = x - liveX;
      const frameDz = z - liveZ;
      const frameDistance = Math.hypot(frameDx, frameDz);
      const discontinuity = Number.isFinite(discontinuityWU) && discontinuityWU > 0
        ? discontinuityWU
        : 240;
      if (!Number.isFinite(frameDistance) || frameDistance > discontinuity) {
        seedLive(x, z, rot, owner);
        return false;
      }

      const elapsed = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      sampleElapsed += elapsed;
      const spacing = Number.isFinite(sampleSpacingWU) && sampleSpacingWU > 0
        ? sampleSpacingWU
        : 3;
      const period = Number.isFinite(samplePeriodS) && samplePeriodS > 0
        ? samplePeriodS
        : 1 / 30;
      const dx = x - committedX;
      const dz = z - committedZ;
      const distance = Math.hypot(dx, dz);

      if (distance > spacing) {
        // Equal-spacing walk along the socket path, excluding the live endpoint. Each insert
        // advances exactly `spacing` toward the nozzle. If the per-frame budget runs out, a final
        // snap still places committed within one spacing of live so the first ribbon chord cannot
        // open into the visible skip/detach behind the ship.
        const maxInserts = Math.min(RIBBON_TRAIL_INTERPOLATION_CAP, Math.max(1, nSeg - 1));
        const startX = committedX;
        const startZ = committedZ;
        const startRot = committedRot;
        let deltaRot = rot - startRot;
        if (deltaRot > Math.PI) deltaRot -= Math.PI * 2;
        else if (deltaRot < -Math.PI) deltaRot += Math.PI * 2;
        const totalDist = distance;
        let inserts = 0;
        while (inserts < maxInserts) {
          const remX = x - committedX;
          const remZ = z - committedZ;
          const remaining = Math.hypot(remX, remZ);
          if (!(remaining > spacing)) break;
          const inv = spacing / remaining;
          const ix = committedX + remX * inv;
          const iz = committedZ + remZ * inv;
          const traveled = Math.hypot(ix - startX, iz - startZ);
          const pathT = totalDist > 0 ? Math.min(1, traveled / totalDist) : 1;
          const ir = startRot + deltaRot * pathT;
          appendHistory(ix, iz, ir);
          committedX = ix;
          committedZ = iz;
          committedRot = ir;
          inserts++;
        }
        // Budget-exhausted snap: keep live→history[1] ≤ spacing even when detail is lost.
        const remX = x - committedX;
        const remZ = z - committedZ;
        const remaining = Math.hypot(remX, remZ);
        if (remaining > spacing + 1e-6) {
          const snapT = 1 - spacing / remaining;
          const sx = committedX + remX * snapT;
          const sz = committedZ + remZ * snapT;
          const traveled = Math.hypot(sx - startX, sz - startZ);
          const pathT = totalDist > 0 ? Math.min(1, traveled / totalDist) : 1;
          const sr = startRot + deltaRot * pathT;
          appendHistory(sx, sz, sr);
          committedX = sx;
          committedZ = sz;
          committedRot = sr;
        }
        sampleElapsed = 0;
      } else if (sampleElapsed >= period) {
        // Slow movement still earns temporal history; commit the previous display-frame pose so the
        // separately-owned live head always remains the newest point.
        appendHistory(liveX, liveZ, liveRot);
        committedX = liveX;
        committedZ = liveZ;
        committedRot = liveRot;
        sampleElapsed %= period;
      }

      liveX = x;
      liveZ = z;
      liveRot = rot;
      return true;
    },
    // M2: shift stored samples on frame-origin rebase without dropping the trail history.
    reproject(dx, dz) {
      const ox = Number.isFinite(dx) ? dx : 0;
      const oz = Number.isFinite(dz) ? dz : 0;
      if (ox === 0 && oz === 0) return;
      for (let i = 0; i < nSeg; i++) {
        pts[i * 3] += ox;
        pts[i * 3 + 1] += oz;
      }
      if (hasLive) {
        liveX += ox;
        liveZ += oz;
        committedX += ox;
        committedZ += oz;
      }
    },
    /**
     * Keep a cadence-reduced NPC ribbon welded to its live nozzle without rebuilding all history.
     * Only the first vertex pair changes; the next full rebuild incorporates interpolated samples.
     */
    syncHead(opacity, scroll, time, radiance) {
      applyPresentation(opacity, scroll, time, radiance);
      if (!hasLive || renderedCount < 2 || !mesh.visible
        || mat.uniforms.uOpacity.value <= 0.001) return false;
      centers[0] = liveX;
      centers[1] = liveZ;
      centers[2] = liveRot;
      writeCenterPair(0, renderedCount);
      markAttributeRange(posAttr, posUpdateRange, 6);
      headSyncCount++;
      return true;
    },
    claimCadence(token) {
      if (lastCadenceToken === token) return false;
      lastCadenceToken = token;
      return true;
    },
    rebuild(opacity, scroll, time, radiance) {
      applyPresentation(opacity, scroll, time, radiance);
      const count = hasLive ? Math.min(nSeg, historyCount + 1) : 0;
      if (count < 2 || mat.uniforms.uOpacity.value <= 0.001) {
        renderedCount = 0;
        mesh.visible = false;
        geo.setDrawRange(0, 0);
        return;
      }

      centers[0] = liveX;
      centers[1] = liveZ;
      centers[2] = liveRot;
      for (let i = 1; i < count; i++) {
        const slot = ((historyHead - i) % nSeg + nSeg) % nSeg;
        centers[i * 3] = pts[slot * 3];
        centers[i * 3 + 1] = pts[slot * 3 + 1];
        centers[i * 3 + 2] = pts[slot * 3 + 2];
      }

      const updateUvs = count !== lastUvCount;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        writeCenterPair(i, count);
        const vi = i * 2;
        if (updateUvs) {
          uvs[vi * 2] = t;
          uvs[vi * 2 + 1] = 0.0;
          uvs[(vi + 1) * 2] = t;
          uvs[(vi + 1) * 2 + 1] = 1.0;
        }
      }
      markAttributeRange(posAttr, posUpdateRange, count * 6);
      if (updateUvs) {
        markAttributeRange(uvAttr, uvUpdateRange, count * 4);
        lastUvCount = count;
      }
      geo.setDrawRange(0, (count - 1) * 6);
      renderedCount = count;
      mesh.visible = true;
      fullRebuildCount++;
    },
    getMaterial() { return mat; },
    /** Owner-root accessor for measurement isolation (do not mutate topology). */
    getMesh() { return mesh; },
    inspect() {
      return {
        capacity: nSeg,
        historyCount,
        visiblePointCount: hasLive ? Math.min(nSeg, historyCount + 1) : 0,
        hasLive,
        ownerIdentity,
        liveX,
        liveZ,
        renderedCount,
        fullRebuildCount,
        headSyncCount,
      };
    },
    clear() { clearHistory(); },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}

export function createPrecompileTrailSurfaces() {
  // Use the live lazy-ribbon factory. A PlaneGeometry approximation carries standard normal/uv
  // attributes while production carries position/aTrailUv; Three includes those geometry defines
  // in the program key even though both materials share the same shader source.
  const ribbonStaging = new THREE.Group();
  const ribbonOwner = createRibbonTrail(ribbonStaging, '#7fe0ff', 30, 5);
  ribbonOwner.push(-3, 0, 0);
  ribbonOwner.push(3, 0, 0);
  ribbonOwner.rebuild(0.5, 0.17, 0.8);
  const ribbon = ribbonOwner.getMesh();
  ribbon.removeFromParent();
  ribbon.name = 'SF_Precompile_RibbonTrail';
  const streakPool = createTrailStreakPool(1);
  updateTrailStreakInstance(streakPool, 0, {
    x: 0, y: 0.4, z: 0, vx: 1, vz: 0,
    width: 1, length: 4, opacity: 0.8,
    color: new THREE.Color('#88aaff'),
  });
  commitTrailStreakInstances(streakPool, 1, { scroll: 0.17, time: 0.8 });
  const streak = streakPool.mesh;
  streak.name = 'SF_Precompile_TrailStreak';
  return { ribbon, streak };
}
