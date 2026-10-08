// Veil Step picture. A translucent clone of the live hull sits where the sim
// published the shadow. On release, two rifts — one where the hull was, one
// where it is — blow a dark cloud and black-purple ribbons out and suck them
// back in. Presentation only: nothing here writes the sim.

import * as THREE from 'three';
import { cloneMaterialPreservingShaderHooks } from './materialClone.js';

const SHADOW = new THREE.Color('#14061f');
const RIBBON_DARK = new THREE.Color('#12040f');
const RIBBON_EDGE = new THREE.Color('#6d28d9');
const CLOUD = new THREE.Color('#16061a');
const CLOUD_EDGE = new THREE.Color('#2a1038');
const TEAR = new THREE.Color('#050208');
const TEAR_RIM = new THREE.Color('#c4b5fd');
const BLIP = new THREE.Color('#f5f3ff');

const RIFT_LIFE = 0.62;
const RIFT_LIFE_REDUCED = 0.3;
const RIFT_POOL = 6;
const RIBBON_COUNT = 8;
const RIBBON_SEGS = 11;

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
  if (next.color && typeof next.color.lerp === 'function') next.color.lerp(SHADOW, 0.82);
  const base = Number.isFinite(next.opacity) ? next.opacity : 1;
  next.opacity = Math.min(0.42, base * 0.42);
  next.userData = next.userData || {};
  next.userData._veilBase = next.opacity;
  if (next.emissive && typeof next.emissive.set === 'function') {
    next.emissive.set('#3b0764');
    if ('emissiveIntensity' in next) next.emissiveIntensity = 0.4;
  }
  next.needsUpdate = true;
  return next;
}

function basic(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
}

function ribbonGeometry() {
  const positions = new Float32Array((RIBBON_SEGS + 1) * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const index = [];
  for (let i = 0; i < RIBBON_SEGS; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(index);
  return geo;
}

function writeRibbon(geo, angle, curl, puff) {
  const attr = geo.getAttribute('position');
  const arr = attr.array;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const px = -dz;
  const pz = dx;
  for (let i = 0; i <= RIBBON_SEGS; i += 1) {
    const u = i / RIBBON_SEGS;
    const len = (2.2 + 13.5 * puff) * u;
    const side = Math.sin(u * Math.PI * curl) * 2.4 * puff * (1 - u * 0.35);
    const up = Math.sin(u * Math.PI) * 2.6 * puff;
    const half = Math.sin(u * Math.PI) * (0.15 + 0.85 * puff) * 0.55 + 0.04;
    const cx = dx * len + px * side;
    const cz = dz * len + pz * side;
    const o = i * 6;
    arr[o] = cx + px * half;
    arr[o + 1] = up;
    arr[o + 2] = cz + pz * half;
    arr[o + 3] = cx - px * half;
    arr[o + 4] = up * 0.65;
    arr[o + 5] = cz - pz * half;
  }
  attr.needsUpdate = true;
  geo.computeBoundingSphere();
}

function puffOf(t) {
  if (t < 0.28) return Math.sin((t / 0.28) * Math.PI * 0.5);
  const u = (t - 0.28) / 0.72;
  return Math.max(0, Math.cos(Math.min(1, u) * Math.PI * 0.5));
}

function makeRift() {
  const root = new THREE.Group();
  root.visible = false;
  root.frustumCulled = false;
  root.matrixAutoUpdate = true;
  const clouds = [];
  const shells = [
    { geo: new THREE.IcosahedronGeometry(1.15, 1), mat: basic(CLOUD, 0.9), scale: 1 },
    { geo: new THREE.IcosahedronGeometry(1.7, 0), mat: basic(CLOUD_EDGE, 0.55), scale: 1.35 },
    { geo: new THREE.IcosahedronGeometry(2.3, 0), mat: basic('#0c0412', 0.28), scale: 1.8 },
  ];
  for (let i = 0; i < shells.length; i += 1) {
    const mesh = new THREE.Mesh(shells[i].geo, shells[i].mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    root.add(mesh);
    clouds.push({ mesh, base: shells[i].scale, peak: shells[i].mat.opacity });
  }
  const ribbons = [];
  for (let i = 0; i < RIBBON_COUNT; i += 1) {
    const dark = i % 2 === 0;
    const mesh = new THREE.Mesh(
      ribbonGeometry(),
      basic(dark ? RIBBON_DARK : RIBBON_EDGE, dark ? 0.92 : 0.78),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.userData.angle = (i / RIBBON_COUNT) * Math.PI * 2 + (i % 2) * 0.18;
    mesh.userData.curl = i % 2 === 0 ? 1.35 : -1.15;
    root.add(mesh);
    ribbons.push(mesh);
  }
  const tear = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), basic(TEAR, 0.96));
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), basic(TEAR_RIM, 0.55));
  const blip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), basic(BLIP, 1));
  tear.frustumCulled = false;
  rim.frustumCulled = false;
  blip.frustumCulled = false;
  tear.renderOrder = 5;
  rim.renderOrder = 5;
  blip.renderOrder = 6;
  root.add(tear);
  root.add(rim);
  root.add(blip);
  return { root, clouds, ribbons, tear, rim, blip, life: 0, maxLife: RIFT_LIFE, rot: 0, alive: false };
}

function poseRift(rift, reduced) {
  const t = rift.maxLife > 0 ? Math.min(1, rift.life / rift.maxLife) : 1;
  const puff = puffOf(t);
  const flash = reduced ? 0 : (t < 0.14 ? 1 - t / 0.14 : 0);
  for (let i = 0; i < rift.clouds.length; i += 1) {
    const cloud = rift.clouds[i];
    const s = 0.25 + cloud.base * (0.45 + 2.4 * puff);
    cloud.mesh.scale.set(s * (1 + 0.08 * Math.sin(t * 9 + i)), s * 0.72, s);
    cloud.mesh.material.opacity = cloud.peak * (0.15 + 0.85 * puff);
    cloud.mesh.rotation.y = t * (i % 2 === 0 ? 1.4 : -1.1);
  }
  for (let i = 0; i < rift.ribbons.length; i += 1) {
    const mesh = rift.ribbons[i];
    if (reduced && i > 3) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = puff > 0.02;
    writeRibbon(mesh.geometry, mesh.userData.angle, mesh.userData.curl, puff);
    mesh.material.opacity = (i % 2 === 0 ? 0.9 : 0.72) * (0.2 + 0.8 * puff);
  }
  const slit = 0.35 + 8.5 * puff;
  const thick = 0.08 + 0.55 * puff * (1 - Math.abs(puff - 0.65));
  rift.tear.scale.set(thick, 0.55 + 3.4 * puff, slit);
  rift.rim.scale.set(thick + 0.22, 0.35 + 3.7 * puff, slit + 0.45);
  rift.tear.material.opacity = 0.96 * (0.2 + 0.8 * puff);
  rift.rim.material.opacity = (reduced ? 0.2 : 0.62) * puff;
  rift.root.rotation.y = -rift.rot;
  rift.blip.visible = flash > 0.02;
  rift.blip.scale.setScalar(0.35 + flash * 2.4);
  rift.blip.material.opacity = flash;
}

function reducedMotion(state) {
  const settings = state && state.settings;
  const video = settings && settings.video;
  const access = settings && settings.accessibility;
  return !!((video && (video.motionReduce || video.flashReduce)) || (access && access.flashReduce));
}

export function createPhaseBlinkPresentation() {
  let scene = null;
  let unlisten = null;
  let ghost = null;
  let clonedFrom = null;
  let ghostMaterials = [];
  let guide = null;
  let guideMat = null;
  const localA = { x: 0, z: 0 };
  const localB = { x: 0, z: 0 };
  const rifts = [];
  const queue = [];

  function hideGhost() {
    if (ghost) ghost.visible = false;
    if (guide) guide.visible = false;
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
    }
    if (!ghost) return;
    ghost.matrixAutoUpdate = true;
    ghost.frustumCulled = false;
    ghost.traverse((obj) => {
      if (!obj) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
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

  function ensureGuide() {
    if (guide) return;
    guideMat = basic('#4c1d95', 0.38);
    guide = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), guideMat);
    guide.frustumCulled = false;
    guide.renderOrder = 2;
    guide.visible = false;
    if (scene) scene.add(guide);
  }

  function place(toLocal, x, z, scratch) {
    const out = toLocal ? toLocal({ x, z }, scratch) : null;
    if (out && Number.isFinite(out.x) && Number.isFinite(out.z)) return out;
    scratch.x = x;
    scratch.z = z;
    return scratch;
  }

  function spawnRift(x, z, rot, reduced, toLocal) {
    let rift = null;
    for (let i = 0; i < rifts.length; i += 1) {
      if (!rifts[i].alive) { rift = rifts[i]; break; }
    }
    if (!rift) return;
    const at = place(toLocal, x, z, localA);
    rift.alive = true;
    rift.alive = true;
    rift.life = 0;
    rift.maxLife = reduced ? RIFT_LIFE_REDUCED : RIFT_LIFE;
    rift.rot = Number.isFinite(rot) ? rot : 0;
    rift.root.visible = true;
    rift.root.position.set(at.x, 0, at.z);
    poseRift(rift, reduced);
  }

  function drain(state, toLocal) {
    if (!queue.length) return;
    const reduced = reducedMotion(state);
    const pending = queue.splice(0, queue.length);
    for (let i = 0; i < pending.length; i += 1) {
      const ev = pending[i];
      if (!ev) continue;
      const rot = Number(ev.rot) || 0;
      if (ev.from) spawnRift(ev.from.x, ev.from.z, rot, reduced, toLocal);
      if (ev.to) spawnRift(ev.to.x, ev.to.z, rot, reduced, toLocal);
    }
  }

  return {
    attach(nextScene, bus) {
      scene = nextScene || null;
      if (ghost && scene && ghost.parent !== scene) scene.add(ghost);
      if (guide && scene && guide.parent !== scene) scene.add(guide);
      for (let i = rifts.length; i < RIFT_POOL; i += 1) {
        const rift = makeRift();
        rifts.push(rift);
        if (scene) scene.add(rift.root);
      }
      for (let i = 0; i < rifts.length; i += 1) {
        if (scene && rifts[i].root.parent !== scene) scene.add(rifts[i].root);
      }
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
      if (ghost && ghost.parent) ghost.parent.remove(ghost);
      if (guide && guide.parent) guide.parent.remove(guide);
      for (let i = 0; i < rifts.length; i += 1) {
        if (rifts[i].root.parent) rifts[i].root.parent.remove(rifts[i].root);
      }
    },
    sync(state, playerMesh, toLocal, dt) {
      const step = Number.isFinite(dt) ? dt : 0;
      const reduced = reducedMotion(state);
      for (let i = 0; i < rifts.length; i += 1) {
        const rift = rifts[i];
        if (!rift.alive) continue;
        rift.life += step;
        if (rift.life >= rift.maxLife) {
          rift.alive = false;
          rift.root.visible = false;
          continue;
        }
        poseRift(rift, reduced);
      }
      drain(state, toLocal);
      const player = state && state.entities && state.playerId != null && state.entities.get
        ? state.entities.get(state.playerId)
        : null;
      const aim = player && player._phaseBlink;
      if (!aim || aim.active !== true || !playerMesh) {
        hideGhost();
        return;
      }
      ensureGhost(playerMesh);
      ensureGuide();
      if (!ghost) return;
      const at = place(toLocal, aim.x, aim.z, localA);
      const y = playerMesh.position && Number.isFinite(playerMesh.position.y) ? playerMesh.position.y : 0;
      ghost.visible = true;
      ghost.position.set(at.x, y, at.z);
      ghost.rotation.y = -Number(aim.rot || 0);
      const pulse = 0.9 + 0.1 * Math.sin((Number(state && state.simTime) || 0) * 10);
      const fade = 0.55 + 0.45 * Math.min(1, Number(aim.charge) || 0);
      ghost.scale.setScalar(0.94 * pulse);
      for (let i = 0; i < ghostMaterials.length; i += 1) {
        const mat = ghostMaterials[i];
        if (!mat) continue;
        const base = Number(mat.userData && mat.userData._veilBase) || 0.36;
        mat.opacity = base * fade * pulse;
      }
      if (guide && player.pos) {
        const hull = place(toLocal, player.pos.x, player.pos.z, localB);
        const hx = hull.x;
        const hz = hull.z;
        const gx = at.x;
        const gz = at.z;
        const dx = gx - hx;
        const dz = gz - hz;
        const len = Math.hypot(dx, dz);
        if (len > 4) {
          guide.visible = true;
          guide.position.set((hx + gx) * 0.5, y + 0.2, (hz + gz) * 0.5);
          guide.scale.set(len, 0.16, 0.22);
          guide.rotation.y = -Math.atan2(dz, dx);
          guideMat.opacity = 0.22 + 0.2 * fade;
        } else {
          guide.visible = false;
        }
      }
    },
    dispose() {
      if (unlisten) unlisten();
      unlisten = null;
      disposeGhost();
      if (guide) {
        if (guide.parent) guide.parent.remove(guide);
        if (guide.geometry) guide.geometry.dispose();
        if (guideMat) guideMat.dispose();
      }
      guide = null;
      guideMat = null;
      for (let i = 0; i < rifts.length; i += 1) {
        const rift = rifts[i];
        if (rift.root.parent) rift.root.parent.remove(rift.root);
        rift.root.traverse((obj) => {
          if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
          if (obj.material && typeof obj.material.dispose === 'function') obj.material.dispose();
        });
      }
      rifts.length = 0;
      queue.length = 0;
      scene = null;
    },
  };
}
