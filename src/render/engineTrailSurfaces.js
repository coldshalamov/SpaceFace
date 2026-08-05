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
  varying vec2 vTrailUv;
  void main() {
    float along = fract(vTrailUv.x + uTrailScroll);
    float side = vTrailUv.y * 2.0 - 1.0;
    float streak = trailSampleProcedural(along, side, uTrailTime);
    if (streak < 0.008) discard;
    gl_FragColor = vec4(uColor * (0.65 + streak * 0.55), uOpacity * streak);
  }
`;

export function createRibbonTrailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
      uColor: { value: new THREE.Color(color || '#7fe0ff') },
      uOpacity: { value: 0.5 },
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
  pool.mesh.material.uniforms.uTrailTime.value = time || 0;
  pool.mesh.material.uniforms.uTrailScroll.value = scroll || 0;
}

export function clearTrailStreakInstances(pool) {
  if (!pool || !pool.mesh) return;
  if (pool.dynamicBufferOwner) commitDynamicBufferOwner(pool.dynamicBufferOwner, 0);
  else pool.mesh.count = 0;
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
  scene.add(mesh);

  const pts = new Float32Array(nSeg * 3);
  let head = 0;
  let count = 0;
  let lastUvCount = -1;

  return {
    // Samples are frame-local XZ (callers project global→local before push).
    push(x, z, rot) {
      pts[head * 3] = x;
      pts[head * 3 + 1] = z;
      pts[head * 3 + 2] = rot;
      head = (head + 1) % nSeg;
      if (count < nSeg) count++;
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
    },
    rebuild(opacity, scroll, time) {
      if (opacity != null) mat.uniforms.uOpacity.value = opacity;
      if (scroll != null) mat.uniforms.uTrailScroll.value = scroll;
      if (time != null) mat.uniforms.uTrailTime.value = time;
      const updateUvs = count !== lastUvCount;
      for (let i = 0; i < nSeg; i++) {
        const t = i / Math.max(1, count - 1);
        const slot = ((head - 1 - i) % nSeg + nSeg) % nSeg;
        const px = pts[slot * 3];
        const pz = pts[slot * 3 + 1];
        const rot = pts[slot * 3 + 2];
        const w = baseWidth * Math.max(0, 1 - t * 0.97);
        const ox = Math.sin(rot) * w;
        const oz = -Math.cos(rot) * w;
        const vi = i * 2;
        pos[vi * 3] = px + ox;
        pos[vi * 3 + 1] = 0.4;
        pos[vi * 3 + 2] = pz + oz;
        pos[(vi + 1) * 3] = px - ox;
        pos[(vi + 1) * 3 + 1] = 0.4;
        pos[(vi + 1) * 3 + 2] = pz - oz;
        if (updateUvs) {
          uvs[vi * 2] = t;
          uvs[vi * 2 + 1] = 0.0;
          uvs[(vi + 1) * 2] = t;
          uvs[(vi + 1) * 2 + 1] = 1.0;
        }
      }
      posAttr.needsUpdate = true;
      if (updateUvs) {
        uvAttr.needsUpdate = true;
        lastUvCount = count;
      }
    },
    getMaterial() { return mat; },
    /** Owner-root accessor for measurement isolation (do not mutate topology). */
    getMesh() { return mesh; },
    clear() { count = 0; },
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
