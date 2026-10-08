// Veil Step picture.
// Hold: a shadow of the hull stands ahead of a cut that is already open, and broken
// filaments run from a nose-wound to that cut. Release: an opaque black-purple cloud
// blows out of the cut and is swallowed back in, ribbons do the same on a stagger,
// and a slit zips shut like a tear in the dark. The far end is the same poof around
// the place the hull now is. Nothing here writes the sim.

import * as THREE from 'three';
import { cloneMaterialPreservingShaderHooks } from './materialClone.js';
import {
  ARRIVE_DUR,
  DEPART_DUR,
  DRAIN_DUR,
  accessFlags,
  cloudBody,
  integrateClock,
  pickSlot,
  sampleAim,
  sampleArrival,
  sampleDeparture,
  sampleDrain,
  wantedRange,
} from './phaseBlinkLifecycle.js';

const SHADOW = new THREE.Color('#24101f');
const RIFT_POOL = 6;
const NOSE = 9;

const DROP = new Set([
  '__spacefaceShadowCasterPolicyV1',
  '__spacefaceDepthStageSelfDirty',
  'sfDepthUndrawableCycles',
  'sfDepthMark',
  'shadowMeshNotes',
  'renderPackageInstance',
  'presentationEntityId',
  'sfBoundEntityId',
  'sfStableEntityKey',
  'sfHiddenFrozen',
  'lod',
  'sfMatrixFrozen',
  'animated',
  'hlod',
  'spacefaceSocket',
  'spacefaceSharedAsset',
  'keepSeparate',
  'admissionStandInPending',
  'authoredAdmissionSubstrate',
  'resolvingMarker',
  'weapons',
  'turretHead',
  'shieldBubble',
]);

const VERT = /* glsl */`
attribute float aAlong;
attribute float aSide;
attribute float aRibbon;
uniform float uKind;
uniform float uPass;
uniform float uMode;
uniform float uLength;
uniform float uOpen;
uniform float uSpread;
uniform float uZip;
uniform float uExtrude;
uniform float uSuck;
uniform float uDetach;
uniform float uFlow;
uniform float uSeed;
varying float vAlong;
varying float vSide;
varying float vMask;
varying float vParcel;
varying float vFold;
varying float vDead;
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  float ribbon = aRibbon;
  float along = aAlong;
  float side = aSide;
  bool filament = uKind > 0.5;
  bool corePass = uPass < 0.5;
  vDead = 0.0;
  if (!filament && corePass && ribbon > 0.5) vDead = 1.0;
  if (!filament && !corePass && ribbon < 0.5) vDead = 1.0;

  vec3 pos = vec3(0.0);
  float mask = 0.0;
  float parcel = 1.0;
  float fold = 0.0;
  vec3 normal = vec3(0.0, 1.0, 0.0);

  if (vDead < 0.5 && filament) {
    float phase = fract(ribbon * 0.173 + uSeed);
    float span = max(uLength, 0.001);
    float lateral = (ribbon - 3.5) * 0.85;
    float wave = sin(along * 9.0 + uFlow * 1.6 + phase * 6.28318) * (0.85 + phase);
    if (uSuck > 0.2) wave *= 1.0 - uSuck * along * 0.45;
    float width = (0.72 + phase * 0.55) * (1.0 - along * 0.35);
    float y = sin(along * 3.14159) * (0.4 + 1.35 * phase);
    float reach = along * (1.0 - uSuck * 0.92);
    pos = vec3(reach * span, y + side * 0.04, lateral + wave + side * width);
    float s = fract(along * 2.4 - uFlow * 0.35 + phase);
    if (s > 0.62 && s < 0.88) parcel = 0.0;
    else if (s < 0.08) parcel = s / 0.08;
    else if (s > 0.54) parcel = clamp((0.62 - s) / 0.08, 0.0, 1.0);
    else parcel = 1.0;
    mask = (1.0 - uDetach * along) * (0.45 + 0.55 * sin(along * 3.14159));
    fold = pow(0.5 + 0.5 * sin(along * 21.0 - uFlow * 2.5 + phase * 4.0), 2.0);
    normal = normalize(vec3(-cos(along * 9.0 + uFlow) * 0.35, 1.0, side * 0.2));
  } else if (vDead < 0.5) {
    float phase = ribbon < 1.5 ? 0.0 : fract((ribbon - 2.0) * 0.173 + uSeed);
    float delay = ribbon < 1.5 ? 0.0 : (ribbon - 2.0) * 0.17 * 0.22;
    float reach = abs(along - 0.5) * 2.0;
    float born = uMode > 0.5
      ? smoothstep(0.0, 0.14, uSpread * 1.16 - (1.0 - along))
      : smoothstep(0.0, 0.14, uSpread * 1.16 - reach);
    float zipDist = uMode > 0.5 ? (1.0 - along) : reach;
    float shut = smoothstep(0.0, 0.16, uZip * 1.16 - zipDist);
    float slit = born * (1.0 - shut);
    float lens = sin(along * 3.14159);
    float ragged = 0.84 + 0.16 * sin(along * 11.0 + uSeed * 6.28318);
    if (ribbon < 1.5) {
      float slitHalf = uOpen * lens * slit * ragged * (ribbon < 0.5 ? 2.2 : 2.65);
      float lip = ribbon < 0.5 ? abs(side) * 0.22 * slit : pow(abs(side), 2.0) * 1.25 * slit;
      pos = vec3(along * max(uLength, 0.001), lip, side * slitHalf);
      mask = slit * max(lens, 0.0);
      fold = ribbon < 0.5 ? 0.15 : pow(0.5 + 0.5 * sin(along * 34.0 - uFlow * 3.2 + uSeed * 5.0), 2.0);
    } else {
      float sideSign = mod(ribbon, 2.0) < 0.5 ? 1.0 : -1.0;
      float supplied = clamp((uExtrude - delay) / 0.55, 0.0, 1.0);
      float full = 8.0 + phase * 7.5;
      float distOut;
      if (uMode > 0.5) {
        float base = mix(full * 0.18, full, along);
        float sucked = mix(base, base * 0.14 + 0.3, uSuck * mix(0.15, 1.0, along));
        distOut = sucked + uDetach * along * along * (5.5 + phase * 4.0);
      } else {
        float blown = mix(0.45, full, supplied);
        float pulled = mix(blown, 0.35 + along * 0.4, uSuck);
        distOut = pulled + uDetach * along * (3.4 + phase * 2.2);
      }
      float root = 1.0 - uDetach * (1.0 - along) * (uMode > 0.5 ? 0.25 : 1.0);
      float curl = sin(along * 5.2 + uFlow * 1.35 + phase * 6.28318) * (1.15 + phase * 1.5);
      float y = sin(along * 3.14159) * (0.55 + 2.1 * max(supplied, uMode > 0.5 ? 0.7 : 0.0)) * (0.4 + phase);
      float width = (1.25 + 0.5 * phase) * (1.0 - smoothstep(0.58, 1.0, along));
      float anchor = (0.16 + phase * 0.66) * uLength;
      pos = vec3(anchor + curl * 0.7 + along * 1.4, y + side * 0.08, sideSign * (1.2 + distOut) + side * width);
      mask = uMode > 0.5 ? root * max(slit, 0.0) : root * smoothstep(0.0, 0.22, supplied);
      fold = pow(0.5 + 0.5 * sin(along * 16.0 - uFlow * 2.4 + phase * 3.7), 2.0);
      normal = normalize(vec3(-curl * 0.18, 1.0, sideSign * 0.25));
    }
  }

  vAlong = along;
  vSide = side;
  vMask = vDead > 0.5 ? 0.0 : mask;
  vParcel = parcel;
  vFold = fold;
  vNormal = normal;
  vec4 world = modelMatrix * vec4(vDead > 0.5 ? vec3(0.0) : pos, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG_CORE = /* glsl */`
precision highp float;
varying float vAlong;
varying float vSide;
varying float vMask;
varying float vParcel;
varying float vFold;
varying float vDead;
varying vec3 vWorld;
varying vec3 vNormal;
uniform float uFade;
uniform float uWarn;
void main() {
  if (vDead > 0.5 || vMask < 0.03) discard;
  float across = abs(vSide);
  float body = 1.0 - smoothstep(0.02, 0.92, across);
  float alpha = body * vMask * uFade * 0.92;
  if (alpha < 0.03) discard;
  vec3 ink = vec3(0.012, 0.003, 0.018);
  vec3 bruise = vec3(0.11, 0.025, 0.14);
  vec3 col = mix(ink, bruise, body);
  if (uWarn > 0.5) col = mix(col, vec3(0.22, 0.08, 0.015), 0.7);
  gl_FragColor = vec4(col, alpha);
}
`;

const FRAG_LIGHT = /* glsl */`
precision highp float;
varying float vAlong;
varying float vSide;
varying float vMask;
varying float vParcel;
varying float vFold;
varying float vDead;
varying vec3 vWorld;
varying vec3 vNormal;
uniform float uFade;
uniform float uWarn;
uniform float uHot;
uniform vec3 uCamPos;
void main() {
  if (vDead > 0.5 || vMask < 0.02 || vParcel < 0.02) discard;
  float across = clamp(abs(vSide), 0.0, 1.0);
  float rim = smoothstep(0.28, 0.96, across);
  float channel = smoothstep(0.08, 0.72, vFold);
  vec3 viewDir = normalize(uCamPos - vWorld);
  float facing = abs(dot(normalize(vNormal), viewDir));
  float graze = clamp(1.0 / max(facing, 0.3), 1.0, 2.15);
  vec3 mid = vec3(0.16, 0.035, 0.34);
  vec3 edge = vec3(0.78, 0.42, 1.35);
  vec3 hot = vec3(1.35, 1.12, 1.55);
  vec3 col = mix(mid, edge, rim);
  col = mix(col, hot, rim * uHot * channel);
  if (uWarn > 0.5) col = mix(col, vec3(1.2, 0.58, 0.18), 0.78);
  col *= (0.32 + channel * 1.7) * (0.5 + uHot * 1.15);
  float alpha = (0.16 + rim * 0.78) * mix(0.55, 1.0, channel) * vMask * vParcel * uFade;
  alpha = min(alpha * min(graze, 1.65), 1.0);
  if (alpha < 0.03) discard;
  gl_FragColor = vec4(col * (0.8 + graze * 0.35), alpha);
}
`;

function plain(value, depth) {
  if (value == null) return value;
  const type = typeof value;
  if (type !== 'object') return type === 'function' || type === 'symbol' ? undefined : value;
  if (depth > 3) return undefined;
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
      const entry = plain(value[i], depth + 1);
      if (entry !== undefined) out.push(entry);
    }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const entry = plain(value[keys[i]], depth + 1);
    if (entry !== undefined) out[keys[i]] = entry;
  }
  return out;
}

function projectUserData(data) {
  const out = {};
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i += 1) {
    if (DROP.has(keys[i])) continue;
    const entry = plain(data[keys[i]], 0);
    if (entry !== undefined) out[keys[i]] = entry;
  }
  return out;
}

function tintShadow(material) {
  if (!material || typeof material.clone !== 'function') return material;
  const original = material.userData;
  if (original) material.userData = projectUserData(original);
  let next;
  try {
    next = cloneMaterialPreservingShaderHooks(material);
  } finally {
    if (original) material.userData = original;
  }
  next.transparent = true;
  next.depthWrite = false;
  next.polygonOffset = true;
  next.polygonOffsetFactor = -1;
  next.polygonOffsetUnits = -1;
  if (next.color && typeof next.color.lerp === 'function') next.color.lerp(SHADOW, 0.62);
  const base = Number.isFinite(next.opacity) ? next.opacity : 1;
  next.opacity = Math.min(0.5, Math.max(0.28, base * 0.5));
  next.userData = next.userData || {};
  next.userData._veilBase = next.opacity;
  if (next.emissive && typeof next.emissive.set === 'function') {
    next.emissive.set('#6d28d9');
    if ('emissiveIntensity' in next) next.emissiveIntensity = 0.72;
  }
  next.needsUpdate = true;
  return next;
}

function sheetGeometry() {
  const ribbons = 8;
  const stations = 22;
  const across = 3;
  const count = ribbons * stations * across;
  const along = new Float32Array(count);
  const side = new Float32Array(count);
  const ribbon = new Float32Array(count);
  const position = new Float32Array(count * 3);
  const index = [];
  let v = 0;
  for (let r = 0; r < ribbons; r += 1) {
    const base = v;
    for (let s = 0; s < stations; s += 1) {
      for (let k = 0; k < across; k += 1) {
        along[v] = s / (stations - 1);
        side[v] = k - 1;
        ribbon[v] = r;
        v += 1;
      }
    }
    for (let s = 0; s < stations - 1; s += 1) {
      for (let k = 0; k < across - 1; k += 1) {
        const a = base + s * across + k;
        index.push(a, a + across, a + 1, a + 1, a + across, a + across + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aRibbon', new THREE.BufferAttribute(ribbon, 1));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(120, 0, 0), 280);
  return geo;
}

function uniforms() {
  return {
    uKind: { value: 0 },
    uPass: { value: 0 },
    uMode: { value: 0 },
    uLength: { value: 16 },
    uOpen: { value: 0 },
    uSpread: { value: 0 },
    uZip: { value: 0 },
    uExtrude: { value: 0 },
    uSuck: { value: 0 },
    uDetach: { value: 0 },
    uFlow: { value: 0 },
    uSeed: { value: 0 },
    uWarn: { value: 0 },
    uHot: { value: 0 },
    uFade: { value: 1 },
    uCamPos: { value: new THREE.Vector3(0, 70, 40) },
  };
}

function watchCamera(material) {
  material.onBeforeRender = (_renderer, _scene, camera) => {
    if (camera && camera.position && material.uniforms && material.uniforms.uCamPos) {
      material.uniforms.uCamPos.value.copy(camera.position);
    }
  };
}

function makeMaterial(kind, pass) {
  const params = uniforms();
  params.uKind.value = kind;
  params.uPass.value = pass;
  const light = pass === 1;
  const material = new THREE.ShaderMaterial({
    uniforms: params,
    vertexShader: VERT,
    fragmentShader: light ? FRAG_LIGHT : FRAG_CORE,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: light ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
  watchCamera(material);
  return material;
}

function applySample(material, sample, extra) {
  const u = material.uniforms;
  u.uOpen.value = sample.open;
  u.uSpread.value = sample.spread;
  u.uZip.value = sample.zip;
  u.uExtrude.value = sample.extrude;
  u.uSuck.value = sample.suck;
  u.uDetach.value = sample.detach;
  u.uHot.value = sample.hot;
  u.uFade.value = sample.fade;
  u.uWarn.value = sample.warn || 0;
  if (!extra) return;
  if (extra.kind != null) u.uKind.value = extra.kind;
  if (extra.mode != null) u.uMode.value = extra.mode;
  if (extra.length != null) u.uLength.value = extra.length;
  if (extra.flow != null) u.uFlow.value = extra.flow;
  if (extra.seed != null) u.uSeed.value = extra.seed;
}

function hash2(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const LOBES = [
  { r: 3.6, x: 0.15, y: 0.2, z: 0.05, lag: 0 },
  { r: 2.6, x: 0.55, y: 1.15, z: 2.05, lag: 0.1 },
  { r: 2.8, x: -0.25, y: -0.85, z: -2.25, lag: 0.16 },
  { r: 2.0, x: 2.15, y: 0.45, z: -0.55, lag: 0.22 },
  { r: 2.3, x: -1.65, y: 1.25, z: 0.85, lag: 0.06 },
];

const CLOUD_INK = ['#10040e', '#1a0820', '#0c0614', '#220a28', '#140818'];

function makeCloudPack(geos) {
  const root = new THREE.Group();
  root.frustumCulled = false;
  root.matrixAutoUpdate = true;
  const lobes = [];
  const mats = [];
  for (let i = 0; i < LOBES.length; i += 1) {
    const spec = LOBES[i];
    const mat = new THREE.MeshStandardMaterial({
      color: CLOUD_INK[i],
      emissive: new THREE.Color('#3b0764'),
      emissiveIntensity: i === 0 ? 0.22 : 0.45,
      roughness: 0.94,
      metalness: 0.02,
      transparent: true,
      opacity: i === 0 ? 0.94 : 0.8,
      depthWrite: i === 0,
      side: THREE.DoubleSide,
    });
    mat.userData._peak = mat.opacity;
    const mesh = new THREE.Mesh(i === 0 ? geos.dense : geos.coarse, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.userData.lobe = spec;
    root.add(mesh);
    lobes.push(mesh);
    mats.push(mat);
  }
  const blipMat = new THREE.MeshBasicMaterial({
    color: '#f3e8ff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const blip = new THREE.Mesh(geos.blip, blipMat);
  blip.frustumCulled = false;
  blip.renderOrder = 6;
  blip.visible = false;
  root.add(blip);
  mats.push(blipMat);
  return { root, lobes, blip, blipMat, mats };
}

function poseClouds(pack, sample, flags, flow) {
  if (!pack) return;
  const body = cloudBody(sample);
  const hot = flags.flashReduce ? 0 : (Number(sample.hot) || 0);
  for (let i = 0; i < pack.lobes.length; i += 1) {
    const mesh = pack.lobes[i];
    const spec = mesh.userData.lobe;
    const lagged = flags.motionReduce
      ? body
      : Math.min(1, Math.max(0, (body - spec.lag) / Math.max(0.2, 1 - spec.lag)));
    const reach = lagged;
    mesh.position.set(
      spec.x * (0.3 + reach * 2.5),
      spec.y * (0.3 + reach * 1.7),
      spec.z * (0.3 + reach * 2.7),
    );
    const wobble = flags.motionReduce ? 1 : 1 + 0.06 * Math.sin(flow * 1.6 + i * 1.3);
    const s = (0.18 + reach * (0.95 + (i % 3) * 0.16)) * wobble;
    mesh.scale.set(s * (1.05 + (i % 2) * 0.12), s * (0.7 + 0.22 * (1 - reach)), s);
    const peak = mesh.material.userData._peak || 0.8;
    mesh.material.opacity = peak * (Number(sample.fade) || 0) * (0.18 + 0.82 * reach);
    mesh.visible = mesh.material.opacity > 0.04;
  }
  pack.blip.visible = hot > 0.05;
  pack.blip.scale.setScalar(0.55 + hot * 6.2);
  pack.blipMat.opacity = Math.min(1, hot);
}

function headingOf(rot) {
  const r = Number.isFinite(rot) ? rot : 0;
  return { x: Math.cos(r), z: Math.sin(r) };
}

export function createPhaseBlinkPresentation() {
  let scene = null;
  let unlisten = null;
  let ghost = null;
  let clonedFrom = null;
  let ghostMaterials = [];
  let sheet = null;
  let lobeGeos = null;
  const owned = [];
  const rifts = [];
  const queue = [];
  const localA = { x: 0, z: 0 };
  const localB = { x: 0, z: 0 };
  const worldScratch = new THREE.Vector3();
  let clockPrev = null;
  let wasAiming = false;
  let aimFlow = 0;
  const drain = {
    alive: false,
    age: 0,
    flow: 0,
    x: 0,
    z: 0,
    rot: 0,
    length: 0,
    seed: 0.2,
    y: 0,
  };
  const swallow = {
    alive: false,
    age: 0,
    flow: 0,
    x: 0,
    z: 0,
    tx: 0,
    tz: 0,
    seed: 0.4,
    y: 0,
  };
  let nose = null;
  let dest = null;
  let filaments = null;

  function place(toLocal, x, z, scratch) {
    try {
      if (typeof toLocal === 'function') {
        const out = toLocal({ x, z }, scratch);
        if (out && Number.isFinite(out.x) && Number.isFinite(out.z)) return out;
      }
    } catch { /* raw world position is still a picture */ }
    scratch.x = Number.isFinite(x) ? x : 0;
    scratch.z = Number.isFinite(z) ? z : 0;
    return scratch;
  }

  function meshAnchor(playerMesh) {
    if (!playerMesh || !scene || typeof playerMesh.getWorldPosition !== 'function') return null;
    playerMesh.getWorldPosition(worldScratch);
    if (typeof scene.worldToLocal === 'function') scene.worldToLocal(worldScratch);
    return {
      x: worldScratch.x,
      y: worldScratch.y,
      z: worldScratch.z,
    };
  }

  function hideGhost() {
    if (ghost) ghost.visible = false;
  }

  function hideAim() {
    if (nose) nose.root.visible = false;
    if (dest) dest.root.visible = false;
    if (filaments) filaments.root.visible = false;
  }

  function disposeGhost() {
    if (ghost && ghost.parent) ghost.parent.remove(ghost);
    for (let i = 0; i < ghostMaterials.length; i += 1) {
      const mat = ghostMaterials[i];
      if (mat && typeof mat.dispose === 'function') {
        try { mat.dispose(); } catch { /* best effort */ }
      }
    }
    ghostMaterials = [];
    ghost = null;
    clonedFrom = null;
  }

  function ensureGhost(playerMesh) {
    if (!playerMesh || typeof playerMesh.clone !== 'function') return;
    if (playerMesh.userData && (playerMesh.userData.phaseBlinkGhost || playerMesh.userData.crucibleGhost)) return;
    if (ghost && clonedFrom === playerMesh) return;
    disposeGhost();
    const marked = [];
    playerMesh.traverse((obj) => {
      if (!obj) return;
      const data = obj.userData || (obj.userData = {});
      if (data.shieldBubble || obj.isLight || obj.isSprite || obj.isPoints || obj.isCamera) {
        data.__veilSkip = 1;
        marked.push(obj);
      }
    });
    const originals = [];
    playerMesh.traverse((obj) => {
      if (!obj || !obj.userData) return;
      originals.push([obj, obj.userData]);
      obj.userData = projectUserData(obj.userData);
    });
    try {
      ghost = playerMesh.clone(true);
    } catch {
      ghost = null;
    } finally {
      for (let i = 0; i < originals.length; i += 1) originals[i][0].userData = originals[i][1];
      for (let i = 0; i < marked.length; i += 1) delete marked[i].userData.__veilSkip;
    }
    if (!ghost) return;
    const skipped = [];
    ghost.traverse((obj) => {
      if (obj && obj.userData && obj.userData.__veilSkip) skipped.push(obj);
    });
    for (let i = 0; i < skipped.length; i += 1) {
      if (skipped[i].parent) skipped[i].parent.remove(skipped[i]);
    }
    ghost.matrixAutoUpdate = true;
    ghost.frustumCulled = false;
    ghost.renderOrder = 3;
    ghost.traverse((obj) => {
      if (!obj) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      obj.renderOrder = 3;
      if (!obj.material) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((mat) => {
          const next = tintShadow(mat);
          if (next && next !== mat) ghostMaterials.push(next);
          return next;
        });
      } else {
        const next = tintShadow(obj.material);
        if (next && next !== obj.material) ghostMaterials.push(next);
        obj.material = next;
      }
    });
    ghost.userData = ghost.userData || {};
    ghost.userData.phaseBlinkGhost = true;
    clonedFrom = playerMesh;
    if (scene) scene.add(ghost);
  }

  function pair(kind) {
    const root = new THREE.Group();
    root.visible = false;
    root.frustumCulled = false;
    root.matrixAutoUpdate = true;
    const core = new THREE.Mesh(sheet, makeMaterial(kind, 0));
    const light = new THREE.Mesh(sheet, makeMaterial(kind, 1));
    core.frustumCulled = false;
    light.frustumCulled = false;
    core.renderOrder = 4;
    light.renderOrder = 5;
    root.add(core);
    root.add(light);
    owned.push(core.material, light.material);
    return { root, core, light };
  }

  function ensureSheets() {
    if (!sheet) sheet = sheetGeometry();
    if (!nose) {
      nose = pair(0);
      if (scene) scene.add(nose.root);
    }
    if (!dest) {
      dest = pair(0);
      if (scene) scene.add(dest.root);
    }
    if (!filaments) {
      filaments = { root: new THREE.Group(), mesh: null };
      filaments.root.visible = false;
      filaments.root.frustumCulled = false;
      filaments.root.matrixAutoUpdate = true;
      filaments.mesh = new THREE.Mesh(sheet, makeMaterial(1, 1));
      filaments.mesh.frustumCulled = false;
      filaments.mesh.renderOrder = 5;
      filaments.root.add(filaments.mesh);
      owned.push(filaments.mesh.material);
      if (scene) scene.add(filaments.root);
    }
    if (rifts.length === 0) {
      if (!lobeGeos) {
        lobeGeos = {
          dense: new THREE.IcosahedronGeometry(1, 1),
          coarse: new THREE.IcosahedronGeometry(1, 0),
          blip: new THREE.IcosahedronGeometry(0.85, 1),
        };
      }
      for (let i = 0; i < RIFT_POOL; i += 1) {
        const body = pair(0);
        const clouds = makeCloudPack(lobeGeos);
        body.root.add(clouds.root);
        for (let m = 0; m < clouds.mats.length; m += 1) owned.push(clouds.mats[m]);
        rifts.push({
          ...body,
          clouds,
          alive: false,
          age: 0,
          dur: ARRIVE_DUR,
          mode: 0,
          seed: 0,
          flow: 0,
          x: 0,
          z: 0,
          rot: 0,
          y: 0,
          length: 18,
        });
        if (scene) scene.add(body.root);
      }
    }
  }

  function mountAll() {
    if (!scene) return;
    ensureSheets();
    const roots = [nose.root, dest.root, filaments.root];
    for (let i = 0; i < rifts.length; i += 1) roots.push(rifts[i].root);
    if (ghost) roots.push(ghost);
    for (let i = 0; i < roots.length; i += 1) {
      if (roots[i] && roots[i].parent !== scene) scene.add(roots[i]);
    }
  }

  function poseGroup(group, x, y, z, rot) {
    group.position.set(x, y, z);
    group.rotation.set(0, -rot, 0);
    group.visible = true;
  }

  function paint(body, sample, extra) {
    applySample(body.core.material, sample, extra);
    applySample(body.light.material, sample, extra);
  }

  function retire(rift) {
    rift.alive = false;
    rift.age = 0;
    rift.root.visible = false;
  }

  function clearResidue(dropFresh) {
    for (let i = 0; i < rifts.length; i += 1) {
      if (dropFresh || rifts[i].age > 0) retire(rifts[i]);
    }
    drain.alive = false;
    if (nose) nose.root.visible = false;
    if (dest) dest.root.visible = false;
    if (filaments) filaments.root.visible = false;
    if (dropFresh || swallow.age > 0) swallow.alive = false;
  }

  function spawnRift(mode, x, z, rot, y) {
    ensureSheets();
    const slot = pickSlot(rifts);
    const rift = rifts[slot];
    if (!rift) return;
    rift.alive = true;
    rift.age = 0;
    rift.mode = mode === 'depart' ? 1 : 0;
    rift.dur = mode === 'depart' ? DEPART_DUR : ARRIVE_DUR;
    rift.seed = hash2(x, z);
    rift.flow = rift.seed * 2;
    rift.x = x;
    rift.z = z;
    rift.rot = Number.isFinite(rot) ? rot : 0;
    rift.y = Number.isFinite(y) ? y : 0;
    rift.length = mode === 'depart' ? 16 : 20;
    rift.root.visible = true;
    return rift;
  }

  function stepRift(rift, step, flags, toLocal) {
    rift.age += step;
    if (rift.age >= rift.dur) {
      retire(rift);
      return;
    }
    if (!flags.motionReduce) rift.flow += step * (1.25 + rift.seed * 0.8);
    const t = rift.dur > 0 ? rift.age / rift.dur : 1;
    const sample = rift.mode > 0.5
      ? sampleDeparture(t, flags.motionReduce, flags.flashReduce)
      : sampleArrival(t, flags.motionReduce, flags.flashReduce);
    const at = place(toLocal, rift.x, rift.z, localA);
    poseGroup(rift.root, at.x, rift.y + 0.45, at.z, rift.rot);
    paint(rift, sample, {
      kind: 0,
      mode: rift.mode,
      length: rift.length,
      flow: flags.motionReduce ? rift.seed * 2 : rift.flow,
      seed: rift.seed,
    });
    poseClouds(rift.clouds, sample, flags, rift.flow);
  }

  function ghostOpacity(charge, blocked) {
    const c = Math.min(1, Math.max(0, Number(charge) || 0));
    for (let i = 0; i < ghostMaterials.length; i += 1) {
      const mat = ghostMaterials[i];
      if (!mat) continue;
      const base = Number(mat.userData && mat.userData._veilBase) || 0.36;
      const appear = Math.min(1, Math.max(0, c * 1.2 - (i % 7) * 0.045));
      mat.opacity = base * (0.42 + 0.58 * appear) * (blocked ? 0.62 : 1);
    }
  }

  return {
    attach(nextScene, bus) {
      scene = nextScene || null;
      ensureSheets();
      mountAll();
      if (unlisten) unlisten();
      unlisten = null;
      if (bus && typeof bus.on === 'function') {
        const handler = (payload) => {
          if (payload && payload.from && payload.to) queue.push(payload);
        };
        bus.on('ship:phaseBlink', handler);
        unlisten = () => {
          if (typeof bus.off === 'function') bus.off('ship:phaseBlink', handler);
        };
      }
    },
    detach() {
      const roots = [];
      if (ghost) roots.push(ghost);
      if (nose) roots.push(nose.root);
      if (dest) roots.push(dest.root);
      if (filaments) roots.push(filaments.root);
      for (let i = 0; i < rifts.length; i += 1) roots.push(rifts[i].root);
      for (let i = 0; i < roots.length; i += 1) {
        if (roots[i] && roots[i].parent) roots[i].parent.remove(roots[i]);
      }
    },
    sync(state, playerMesh, toLocal, dt) {
      const flags = accessFlags(state);
      const clock = integrateClock(clockPrev, state && state.simTime, dt);
      clockPrev = clock.next;
      if (clock.rewind) {
        clearResidue(true);
        queue.length = 0;
        wasAiming = false;
        hideGhost();
        hideAim();
        return;
      }
      if (clock.drop) clearResidue(false);
      ensureSheets();
      const step = clock.drop || clock.rewind ? 0 : clock.step;
      for (let i = 0; i < rifts.length; i += 1) {
        if (rifts[i].alive) stepRift(rifts[i], step, flags, toLocal);
      }
      let committed = false;
      if (queue.length) {
        const pending = queue.splice(0, queue.length);
        const anchor = meshAnchor(playerMesh);
        const y = anchor ? anchor.y : 0;
        for (let i = 0; i < pending.length; i += 1) {
          const ev = pending[i];
          if (!ev || !ev.from || !ev.to) continue;
          const rot = Number(ev.rot) || 0;
          const fx = Number(ev.from.x);
          const fz = Number(ev.from.z);
          const tx = Number(ev.to.x);
          const tz = Number(ev.to.z);
          if (!Number.isFinite(fx) || !Number.isFinite(fz) || !Number.isFinite(tx) || !Number.isFinite(tz)) continue;
          const apart = Math.hypot(tx - fx, tz - fz);
          const depart = spawnRift('depart', fx, fz, rot, y);
          if (depart) stepRift(depart, 0, flags, toLocal);
          if (apart > 4) {
            const arrive = spawnRift('arrive', tx, tz, rot, y);
            if (arrive) stepRift(arrive, 0, flags, toLocal);
            swallow.alive = true;
            swallow.age = 0;
            swallow.x = fx;
            swallow.z = fz;
            swallow.tx = tx;
            swallow.tz = tz;
            swallow.y = y;
            swallow.flow = aimFlow;
            swallow.seed = hash2(fx, fz);
            drain.alive = false;
          }
          committed = true;
        }
      }
      if (!flags.motionReduce) aimFlow += step * 1.4;
      const player = state && state.entities && state.playerId != null && state.entities.get
        ? state.entities.get(state.playerId)
        : null;
      const aim = player && player._phaseBlink;
      const aiming = !!(aim && aim.aiming === true && playerMesh);
      if (!aiming) {
        hideAim();
        hideGhost();
        if (wasAiming && !committed) {
          drain.alive = true;
          drain.age = 0;
          drain.flow = aimFlow;
        }
        wasAiming = false;
      } else {
        drain.alive = false;
        swallow.alive = false;
        wasAiming = true;
        const anchor = meshAnchor(playerMesh);
        const y = anchor ? anchor.y : 0;
        const charge = Number(aim.charge) || 0;
        const want = wantedRange(charge);
        const blocked = aim.active !== true || (Number(aim.dist) + 1.5 < want);
        const head = headingOf(aim.rot);
        const hull = anchor || place(toLocal, player.pos ? player.pos.x : 0, player.pos ? player.pos.z : 0, localA);
        const noseX = hull.x + head.x * NOSE;
        const noseZ = hull.z + head.z * NOSE;
        const at = aim.active === true ? place(toLocal, aim.x, aim.z, localB) : null;
        const sample = sampleAim(charge, blocked && aim.active !== true ? true : blocked, flags.motionReduce, flags.flashReduce);
        poseGroup(nose.root, noseX, y + 0.4, noseZ, Number(aim.rot) || 0);
        paint(nose, {
          ...sample,
          open: sample.open * 0.55,
          spread: Math.min(1, sample.spread * 0.7),
          extrude: 0.06,
        }, {
          kind: 0,
          mode: 1,
          length: 11,
          flow: flags.motionReduce ? 0.4 : aimFlow,
          seed: 0.31,
        });
        const showDest = aim.active === true && at;
        if (showDest) {
          poseGroup(dest.root, at.x, y + 0.5, at.z, Number(aim.rot) || 0);
          paint(dest, sample, {
            kind: 0,
            mode: 0,
            length: 12 + 10 * Math.min(1, charge),
            flow: flags.motionReduce ? 0.6 : aimFlow * 0.8,
            seed: hash2(aim.x, aim.z),
          });
          ensureGhost(playerMesh);
          if (ghost) {
            ghost.visible = true;
            ghost.position.set(at.x, y, at.z);
            ghost.rotation.copy(playerMesh.rotation);
            ghost.rotation.y = -(Number(aim.rot) || 0);
            ghostOpacity(charge, blocked);
          }
          const dx = at.x - noseX;
          const dz = at.z - noseZ;
          const len = Math.hypot(dx, dz);
          if (len > 3) {
            poseGroup(filaments.root, noseX, y + 0.35, noseZ, Math.atan2(dz, dx));
            applySample(filaments.mesh.material, {
              open: 1, spread: 1, zip: 0, extrude: 1, suck: blocked ? 0.35 : 0,
              detach: 0, hot: sample.hot, fade: sample.fade, warn: blocked ? 1 : 0,
            }, {
              kind: 1,
              mode: 0,
              length: len,
              flow: flags.motionReduce ? 0.2 : aimFlow,
              seed: 0.47,
            });
          } else {
            filaments.root.visible = false;
          }
        } else {
          dest.root.visible = false;
          hideGhost();
          poseGroup(filaments.root, noseX, y + 0.35, noseZ, Number(aim.rot) || 0);
          applySample(filaments.mesh.material, {
            open: 1, spread: 1, zip: 0, extrude: 0.2, suck: 0.55,
            detach: 0.2, hot: 0, fade: 0.8, warn: 1,
          }, {
            kind: 1,
            mode: 0,
            length: 7,
            flow: flags.motionReduce ? 0 : aimFlow,
            seed: 0.12,
          });
        }
        drain.x = noseX;
        drain.z = noseZ;
        drain.y = y;
        drain.rot = Number(aim.rot) || 0;
        drain.length = showDest && at ? Math.hypot(at.x - noseX, at.z - noseZ) : 7;
        drain.seed = 0.47;
      }
      if (drain.alive) {
        drain.age += step;
        if (drain.age >= DRAIN_DUR) {
          drain.alive = false;
          hideAim();
        } else {
          const t = drain.age / DRAIN_DUR;
          const sample = sampleDrain(t, flags.motionReduce);
          if (!flags.motionReduce) drain.flow -= step * 1.6;
          poseGroup(nose.root, drain.x, drain.y + 0.4, drain.z, drain.rot);
          paint(nose, sample, {
            kind: 0,
            mode: 1,
            length: 11,
            flow: flags.motionReduce ? 0.4 : drain.flow,
            seed: 0.31,
          });
          if (drain.length > 3) {
            poseGroup(filaments.root, drain.x, drain.y + 0.35, drain.z, drain.rot);
            applySample(filaments.mesh.material, sample, {
              kind: 1,
              mode: 0,
              length: drain.length,
              flow: flags.motionReduce ? 0.2 : drain.flow,
              seed: drain.seed,
            });
          }
        }
      }
      if (swallow.alive && filaments) {
        swallow.age += step;
        if (swallow.age >= DEPART_DUR) {
          swallow.alive = false;
          if (!drain.alive) filaments.root.visible = false;
        } else {
          const t = swallow.age / DEPART_DUR;
          const sample = sampleDeparture(t, flags.motionReduce, flags.flashReduce);
          const from = place(toLocal, swallow.x, swallow.z, localA);
          const to = place(toLocal, swallow.tx, swallow.tz, localB);
          const dx = to.x - from.x;
          const dz = to.z - from.z;
          const len = Math.hypot(dx, dz);
          if (!flags.motionReduce) swallow.flow += step * 0.7;
          if (len > 2) {
            poseGroup(filaments.root, from.x, swallow.y + 0.35, from.z, Math.atan2(dz, dx));
            applySample(filaments.mesh.material, {
              open: sample.open,
              spread: sample.spread,
              zip: sample.zip,
              extrude: sample.extrude,
              suck: flags.motionReduce ? 0 : sample.suck,
              detach: sample.detach,
              hot: sample.hot * 0.35,
              fade: sample.fade,
              warn: 0,
            }, {
              kind: 1,
              mode: 0,
              length: len,
              flow: flags.motionReduce ? swallow.seed : swallow.flow,
              seed: swallow.seed,
            });
          }
        }
      }
    },
    dispose() {
      if (unlisten) unlisten();
      unlisten = null;
      disposeGhost();
      const roots = [];
      if (nose) roots.push(nose.root);
      if (dest) roots.push(dest.root);
      if (filaments) roots.push(filaments.root);
      for (let i = 0; i < rifts.length; i += 1) roots.push(rifts[i].root);
      for (let i = 0; i < roots.length; i += 1) {
        if (roots[i] && roots[i].parent) roots[i].parent.remove(roots[i]);
      }
      for (let i = 0; i < owned.length; i += 1) {
        try { owned[i].dispose(); } catch { /* best effort */ }
      }
      owned.length = 0;
      if (sheet) {
        sheet.dispose();
        sheet = null;
      }
      if (lobeGeos) {
        lobeGeos.dense.dispose();
        lobeGeos.coarse.dispose();
        lobeGeos.blip.dispose();
        lobeGeos = null;
      }
      rifts.length = 0;
      queue.length = 0;
      nose = null;
      dest = null;
      filaments = null;
      scene = null;
    },
  };
}
