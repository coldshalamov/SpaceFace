// SpaceFace — Asteroid 3D tumble, mining laser reaction, and impact wobble presentation.
//
// In an A-list space title, asteroids are living celestial bodies, not frozen plastic props:
//   1. Multi-axis Zero-G Tumble: Every asteroid in the sector rotates with realistic 3-axis
//      angular momentum determined deterministically from its unique entity ID, size-scaled so
//      large rocks turn slower than pebbles (angular momentum, clamped for readability).
//   2. Mining Laser Thermal Reaction: When struck by an industrial mining laser or cutting beam,
//      the rock experiences high-frequency thermal micro-jitter and vein luminance agitation.
//   3. Impact Wobble: Projectile strikes and kinetic collisions impart rotational recoil wobble
//      that smoothly damps down over ~1.2s.
//   4. Thermal Fracture Strain: As the ore body depletes, the rock trembles harder under the beam
//      and swells a few percent along a deterministic crack axis (transforms only — asteroid
//      materials are shared/instanced). Yield shatter seeds each chunk's tumble kick.
//   5. Arrival Materialize: Rocks arriving mid-play (field regrowth, reinforcement spawns) settle
//      in with a fast scale ramp + tumble kick instead of popping into existence.
//   6. Rich-Core Breach & Charge Tremor: mining:richCoreExposed slams a sharp strain pulse through
//      the rock — the skin visibly breaches — and richCoreChargeStart builds an escalating tremor
//      until the charge resolves or fizzles.
//
//   7. Fracture Veins: as oreHP depletes, deterministic glowing fissures open across the rock —
//      jagged ember strips sphere-projected onto the body, brightening as each vein opens, so the
//      laser reads as physically cutting the rock apart before the final pop.
//
// PURE RENDER-ONLY PRESENTATION: Never alters physics positions/radii, zero per-frame garbage.

import * as THREE from 'three';

import { invalidateAsteroidInstancePool } from './asteroidInstancePool.js';

function hashId(id) {
  const s = String(id || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Max axis swell of a fully fractured rock (2.5% — a worked rock reads strained, never ballooned).
const FRACTURE_SWELL_MAX = 0.025;
const FRACTURE_VEIN_COUNT = 3;
const EMPTY_DATA = {};

/**
 * Size-scaled tumble factor. Angular momentum: a rock twice the reference radius turns at half
 * the rate for the same spin energy, so mountainous rocks drift stately while pebbles skitter.
 * Clamped so extremes stay readable; NaN- and sign-safe.
 */
export function resolveAsteroidSizeFactor(radius) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r <= 0) return 1;
  const f = 16 / r;
  return f < 0.35 ? 0.35 : f > 1.6 ? 1.6 : f;
}

/**
 * Pure ore-body fracture progress: 0 at full HP, 1 at depletion. NaN- and sign-safe.
 * Presentation is monotonic by contract — callers take `max(previous, this)` so a worked rock
 * never visibly heals.
 */
export function resolveFractureProgress(hp, maxHp) {
  const cur = Number(hp);
  const max = Number(maxHp);
  if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp01(1 - cur / max);
}

/**
 * Deterministic thermal-vein fracture pattern for a rock at a given fracture progress.
 * Vein angles are stable per asteroid id; each vein's `open` grows monotonically with fracture
 * (staggered thresholds, so cracks appear one after another). `axisAngle`/`swell` drive the
 * subtle transform-only strain presentation on shared-material rocks.
 * Pass `out` ({axisAngle, swell, veins:[{angle, open} x3]}) to stay allocation-free in hot paths.
 */
export function resolveVeinFracturePattern(id, fracture, out = null) {
  const h = hashId(id);
  const f = clamp01(Number.isFinite(fracture) ? fracture : 0);
  const rec = out || {
    axisAngle: 0,
    swell: 0,
    veins: Array.from({ length: FRACTURE_VEIN_COUNT }, () => ({ angle: 0, open: 0 })),
  };
  rec.axisAngle = (((h >>> 27) & 0x1f) / 31) * Math.PI;
  rec.swell = f * f;
  for (let i = 0; i < FRACTURE_VEIN_COUNT; i++) {
    const vein = rec.veins[i];
    vein.angle = (((h >>> (i * 8)) & 0xff) / 255) * Math.PI * 2;
    vein.open = clamp01(f * 1.6 - i * 0.3);
  }
  return rec;
}

/**
 * Deterministic yield-split pattern for a chunk calved off a parent rock: a bounded tumble kick
 * (rad/s) and a recoil wobble seed so fresh chunks read as newly shattered, never as clones
 * drifting in formation. Pure function of (parentId, chunkId).
 */
export function resolveYieldSplitPattern(parentId, chunkId) {
  const h = (hashId(parentId) ^ Math.imul(hashId(chunkId), 0x9e3779b1)) >>> 0;
  const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const mag = 0.25 + (((h >>> 16) & 0xff) / 255) * 0.45;
  return {
    kickAngle: a,
    spinX: Math.cos(a) * mag,
    spinY: (0.5 + (((h >>> 24) & 0xff) / 255)) * mag,
    spinZ: Math.sin(a) * mag,
    wobble: 0.08 + (((h >>> 8) & 0xff) / 255) * 0.12,
  };
}

// --- Fracture vein rig -------------------------------------------------------
// One lazily-built THREE.Group per worked rock, childed to the entity root (NOT to the body:
// the pooled instance leaf renders via InstancedMesh and its visible flag is off, which would
// hide children). The rig copies the body's transform each frame so cracks tumble with the rock.
// Each vein is a jagged ribbon sphere-projected at ~0.92R — embedded, so the skin occludes edges
// and the glow reads as light escaping through the fissure, never a sticker on top.

const VEIN_STATIONS = 7;
const VEIN_EMBER = 0xff9a3c;

// Pristine (pre-presentation) scale per body Object3D, recorded the FIRST time any tracker
// sees that body — before the swell writes to it. The strain swell re-applies `base × factors`
// absolutely, so releaseEntityMesh/releaseMesh and recycled ids must never recapture from the
// live (already swollen) scale: 2026-09-25 a common rock compounded to ±2e8 and its clearance
// box lifted the camera to y≈1.4e8. WeakMap keeps it module-shared across tracker instances
// and lets dead bodies collect.
const pristineBodyScales = new WeakMap();

function pristineScaleFor(body) {
  let p = pristineBodyScales.get(body);
  if (!p) {
    p = { x: body.scale.x, y: body.scale.y, z: body.scale.z };
    pristineBodyScales.set(body, p);
  }
  return p;
}

function buildVeinStrip(seed, radius) {
  const R = Math.max(2, Number.isFinite(radius) ? radius : 6);
  const dirAngle = ((seed & 0xffff) / 0xffff) * Math.PI * 2;
  const tilt = (((seed >>> 16) & 0xff) / 255 - 0.5) * 1.7;
  const axis = new THREE.Vector3(-Math.sin(dirAngle), 0, Math.cos(dirAngle));
  const dir = new THREE.Vector3(Math.cos(dirAngle), 0, Math.sin(dirAngle)).applyAxisAngle(axis, tilt);
  const nrm = new THREE.Vector3(0, 1, 0).applyAxisAngle(axis, tilt);
  const pdir = new THREE.Vector3().crossVectors(nrm, dir).normalize();
  const span = R * (0.62 + (((seed >>> 24) & 0xff) / 255) * 0.45);
  const lift = ((((seed >>> 8) & 0xff) / 255) - 0.5) * R * 0.55;
  const halfW = Math.max(0.22, R * 0.055);

  const centers = [];
  for (let i = 0; i < VEIN_STATIONS; i++) {
    const s = -1 + (2 * i) / (VEIN_STATIONS - 1);
    const jitter = (((Math.imul(seed >>> 8, i + 11) >>> 0) & 0xff) / 255 - 0.5) * span * 0.3;
    const c = new THREE.Vector3()
      .addScaledVector(dir, s * span)
      .addScaledVector(pdir, jitter)
      .addScaledVector(nrm, lift);
    c.normalize().multiplyScalar(R * 0.92); // sphere-project: the crack lives IN the surface
    centers.push(c);
  }
  const positions = new Float32Array(VEIN_STATIONS * 2 * 3);
  const indices = new Uint16Array((VEIN_STATIONS - 1) * 6);
  const t = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < VEIN_STATIONS; i++) {
    const prev = centers[Math.max(0, i - 1)];
    const next = centers[Math.min(VEIN_STATIONS - 1, i + 1)];
    t.subVectors(next, prev).normalize();
    const n = centers[i].clone().normalize();
    p.crossVectors(n, t).normalize();
    // Taper to points at both ends — a crack dies into the rock, it does not stop mid-face.
    const taper = Math.sin(Math.PI * (i + 0.5) / VEIN_STATIONS);
    const w = halfW * (0.25 + 0.75 * taper);
    const c = centers[i];
    const o = i * 6;
    positions[o] = c.x - p.x * w; positions[o + 1] = c.y - p.y * w; positions[o + 2] = c.z - p.z * w;
    positions[o + 3] = c.x + p.x * w; positions[o + 4] = c.y + p.y * w; positions[o + 5] = c.z + p.z * w;
    if (i < VEIN_STATIONS - 1) {
      const v = i * 2, e = i * 6;
      indices[e] = v; indices[e + 1] = v + 1; indices[e + 2] = v + 2;
      indices[e + 3] = v + 1; indices[e + 4] = v + 3; indices[e + 5] = v + 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

function ensureVeinRig(rec, mesh, entity) {
  if (rec.veinRig && rec.veinRig.parent === mesh) return rec.veinRig;
  const radius = Math.max(2, Number.isFinite(entity && entity.radius) ? entity.radius : 6);
  const rig = new THREE.Group();
  rig.name = 'sf-fracture-veins';
  const base = hashId(entity && entity.id);
  for (let i = 0; i < FRACTURE_VEIN_COUNT; i++) {
    const geo = buildVeinStrip((base ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0, radius);
    const mat = new THREE.MeshBasicMaterial({
      color: VEIN_EMBER,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      toneMapped: false,
    });
    const strip = new THREE.Mesh(geo, mat);
    strip.visible = false;
    strip.frustumCulled = false;
    rig.add(strip);
  }
  mesh.add(rig);
  rec.veinRig = rig;
  return rig;
}

function syncVeinRig(rec, mesh, body, entity, simTime) {
  const rig = rec.veinRig;
  if (!rig) return;
  const open = rec.fracture;
  if (open <= 0.01) {
    if (rig.visible) rig.visible = false;
    return;
  }
  rig.visible = true;
  // The rig shadows the body's own tumble/jitter/swell so cracks stay welded to the skin.
  if (body.rotation) rig.rotation.set(body.rotation.x, body.rotation.y, body.rotation.z);
  if (body.position) rig.position.set(body.position.x, body.position.y || 0, body.position.z);
  if (body.scale) rig.scale.copy(body.scale);
  const pattern = resolveVeinFracturePattern(entity.id, open, veinScratchForRig);
  const veins = rig.children;
  for (let i = 0; i < veins.length; i++) {
    const strip = veins[i];
    const o = pattern.veins[i] ? pattern.veins[i].open : 0;
    if (o <= 0.01) { strip.visible = false; continue; }
    strip.visible = true;
    // Heat shimmer: a worked crack pulses faintly while the beam is on it, steady otherwise.
    const shimmer = 0.82 + 0.18 * Math.sin(simTime * 11 + i * 2.1) * rec.miningAgitation;
    strip.material.opacity = Math.min(0.92, o * 0.85) * shimmer;
  }
}

const veinScratchForRig = {
  axisAngle: 0,
  swell: 0,
  veins: Array.from({ length: FRACTURE_VEIN_COUNT }, () => ({ angle: 0, open: 0 })),
};

export function createAsteroidMotionTracker() {
  const asteroidStates = new Map();
  let busSubscribers = [];
  let currentMinedTargetId = null;
  let lastSimTime = 0;
  const veinScratch = {
    axisAngle: 0,
    swell: 0,
    veins: Array.from({ length: FRACTURE_VEIN_COUNT }, () => ({ angle: 0, open: 0 })),
  };

  function getState(asteroidId) {
    let rec = asteroidStates.get(asteroidId);
    if (!rec) {
      const h = hashId(asteroidId);
      const rnd1 = ((h & 0xff) / 255) - 0.5;
      const rnd2 = (((h >> 8) & 0xff) / 255) - 0.5;
      const rnd3 = (((h >> 16) & 0xff) / 255) - 0.5;

      // Realistic slow space tumble rates (0.015 - 0.055 rad/s)
      const speedScale = 0.015 + ((h >> 24) & 0x7f) / 127 * 0.035;
      const spinX = (rnd1 < 0 ? -1 : 1) * (0.3 + Math.abs(rnd1)) * speedScale;
      const spinY = (rnd2 < 0 ? -1 : 1) * (0.3 + Math.abs(rnd2)) * speedScale;
      const spinZ = (rnd3 < 0 ? -1 : 1) * (0.3 + Math.abs(rnd3)) * speedScale;

      rec = {
        rotX: rnd1 * Math.PI,
        rotY: rnd2 * Math.PI,
        rotZ: rnd3 * Math.PI,
        spinX,
        spinY,
        spinZ,
        wobbleMag: 0,
        wobblePhase: 0,
        miningAgitation: 0,
        fracture: 0,
        materializeT0: -1,
        breachT0: -1,
        chargeT0: -1,
        shoveX: 0,
        shoveZ: 0,
        shoveVelX: 0,
        shoveVelZ: 0,
        mass: 0,
        px: 0,
        pz: 0,
        radius: 16,
        scaleBodyRef: null,
        baseScaleX: 1,
        baseScaleY: 1,
        baseScaleZ: 1,
        veinRig: null,
        lastTime: 0,
      };
      asteroidStates.set(asteroidId, rec);
    }
    return rec;
  }

  function onDamage(payload) {
    if (!payload || !payload.targetId) return;
    const rec = asteroidStates.get(payload.targetId);
    if (!rec) return;
    const dmg = Number(payload.damage) || 15;
    rec.wobbleMag = Math.min(0.22, rec.wobbleMag + dmg * 0.008);
  }

  // physics:impact — the payload carries real exchanged momentum (dp = impulse·impactScale),
  // the contact normal (axis A→B), and the contact point. A struck rock rings along the push
  // axis, takes a lever-arm tumble kick from where the hit landed, and keeps the generic
  // rotation wobble for bodies whose kinematics aren't cached yet.
  function onImpact(payload) {
    if (!payload) return;
    const aId = payload.aId || (payload.entityA && payload.entityA.id);
    const bId = payload.bId || (payload.entityB && payload.entityB.id);
    const dp = Number(payload.dp) || Math.abs(Number(payload.impulse)) || 0;
    let nx = Number(payload.normal && payload.normal.x);
    let nz = Number(payload.normal && payload.normal.z);
    const nLen = Math.hypot(nx, nz);
    if (!(nLen > 1e-8)) { nx = 0; nz = 0; } else { nx /= nLen; nz /= nLen; }
    const cx = Number(payload.pos && payload.pos.x);
    const cz = Number(payload.pos && payload.pos.z);

    const strike = (id, pushX, pushZ) => {
      if (id == null) return;
      const rec = asteroidStates.get(id);
      if (!rec) return;
      const mass = rec.mass > 0 ? rec.mass : 600;
      const dv = Math.min(40, dp / mass);
      rec.wobbleMag = Math.min(0.28, rec.wobbleMag + 0.03 + dv * 0.05);
      if (!(pushX || pushZ)) return;
      // Contact shudder: a small directional ring that springs back — the rock visibly takes
      // the hit on the struck side. Sim owns the real Δv; this is the surface ring, ≤0.5 wu.
      const kick = Math.min(3.2, 0.4 + dv * 0.9);
      rec.shoveVelX += pushX * kick;
      rec.shoveVelZ += pushZ * kick;
      // Lever-arm tumble kick: planar torque r×F rocks the spin axis the way a real off-center
      // hit would. Normalized by hull radius so rim hits turn harder than dead-center ones.
      if (Number.isFinite(cx) && Number.isFinite(cz)) {
        const r = rec.radius > 0 ? rec.radius : 16;
        const rx = Math.max(-r, Math.min(r, cx - rec.px)) / r;
        const rz = Math.max(-r, Math.min(r, cz - rec.pz)) / r;
        const torque = rx * pushZ - rz * pushX; // planar cross, + = spins the nose toward push
        rec.spinY += torque * dv * 0.045;
        rec.spinX += rz * dv * 0.02;
        rec.spinZ -= rx * dv * 0.02;
      }
    };
    strike(aId, -nx, -nz);
    strike(bId, nx, nz);
  }

  function onMiningContact(payload) {
    if (!payload) return;
    if (payload.targetId != null) currentMinedTargetId = payload.targetId;
  }

  function onMiningStop() {
    currentMinedTargetId = null;
  }

  // Fresh-calved chunk: deterministic tumble kick + recoil wobble so the shatter reads as
  // broken rock, never as a clone drifting in formation. Render-only; sim velocities untouched.
  function onAsteroidChunked(payload) {
    if (!payload || payload.chunkId == null) return;
    const rec = getState(payload.chunkId);
    const split = resolveYieldSplitPattern(payload.parentId, payload.chunkId);
    rec.spinX += split.spinX * 0.35;
    rec.spinY += split.spinY * 0.35;
    rec.spinZ += split.spinZ * 0.35;
    rec.wobbleMag = Math.min(0.3, Math.max(rec.wobbleMag, split.wobble + 0.12));
  }

  // Arrival materialize: a fresh rock calves in with a scale ramp plus a small deterministic
  // tumble kick — newly spawned stone never hangs motionless.
  function onSpawned(payload) {
    const entity = payload && payload.entity;
    const id = payload && payload.id != null ? payload.id : (entity && entity.id);
    const type = (payload && payload.type) || (entity && entity.type);
    if (id == null || type !== 'asteroid') return;
    const rec = getState(id);
    rec.materializeT0 = lastSimTime;
    const split = resolveYieldSplitPattern('field', id);
    rec.spinX += split.spinX * 0.2;
    rec.spinY += split.spinY * 0.2;
    rec.spinZ += split.spinZ * 0.2;
  }

  // Rich-core breach: the rock's skin visibly slams open when the core is exposed.
  function onRichCoreExposed(payload) {
    const id = payload && payload.asteroidId;
    if (id == null) return;
    const rec = getState(id);
    rec.breachT0 = lastSimTime;
    rec.wobbleMag = Math.min(0.3, Math.max(rec.wobbleMag, 0.16));
  }

  function onRichCoreChargeStart(payload) {
    const id = payload && payload.asteroidId;
    if (id == null) return;
    getState(id).chargeT0 = lastSimTime;
  }

  function onRichCoreDone(payload) {
    const id = payload && payload.asteroidId;
    if (id == null) return;
    const rec = asteroidStates.get(id);
    if (rec) rec.chargeT0 = -1;
  }

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
    busSubscribers.push(bus.on('combat:damage', onDamage));
    busSubscribers.push(bus.on('physics:impact', onImpact));
    // `mining:beamContact` is never emitted by the sim — the live beam lifecycle pair is
    // mining:start / mining:stop (src/systems/mining.js). Keep combat:beamStop as a failsafe.
    busSubscribers.push(bus.on('mining:start', onMiningContact));
    busSubscribers.push(bus.on('mining:stop', onMiningStop));
    busSubscribers.push(bus.on('combat:beamStop', onMiningStop));
    busSubscribers.push(bus.on('asteroid:chunked', onAsteroidChunked));
    busSubscribers.push(bus.on('entity:spawned', onSpawned));
    busSubscribers.push(bus.on('mining:richCoreExposed', onRichCoreExposed));
    busSubscribers.push(bus.on('mining:richCoreChargeStart', onRichCoreChargeStart));
    busSubscribers.push(bus.on('mining:richCoreCompleted', onRichCoreDone));
    busSubscribers.push(bus.on('mining:richCoreFizzle', onRichCoreDone));
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    asteroidStates.clear();
    currentMinedTargetId = null;
  }

  function updateAsteroidMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;
    lastSimTime = simTime;

    // Kinematics for lever-arm impact response: contact offset is measured from the body's
    // current sim position; mass converts exchanged momentum into a plausible Δv.
    if (entity.pos && Number.isFinite(entity.pos.x)) {
      rec.px = entity.pos.x;
      rec.pz = Number.isFinite(entity.pos.z) ? entity.pos.z : 0;
    }
    rec.mass = Number.isFinite(entity.mass) && entity.mass > 0 ? entity.mass : 0;
    if (Number.isFinite(entity.radius) && entity.radius > 0) rec.radius = entity.radius;

    // 1. Advance 3-axis tumble, size-scaled: big rocks carry their spin slowly.
    if (!reducedMotion) {
      const sizeFactor = resolveAsteroidSizeFactor(rec.radius);
      rec.rotX += rec.spinX * sizeFactor * dt;
      rec.rotY += rec.spinY * sizeFactor * dt;
      rec.rotZ += rec.spinZ * sizeFactor * dt;
    }

    // 2. Impact wobble spring decay
    let wobbleOffsetX = 0;
    let wobbleOffsetZ = 0;
    if (rec.wobbleMag > 0.001) {
      rec.wobblePhase += dt * 14.0;
      rec.wobbleMag *= Math.exp(-3.2 * dt);
      if (!reducedMotion) {
        wobbleOffsetX = Math.sin(rec.wobblePhase) * rec.wobbleMag;
        wobbleOffsetZ = Math.cos(rec.wobblePhase * 1.3) * rec.wobbleMag;
      }
    }

    // 3. Mining laser thermal agitation jitter
    let jitterX = 0;
    let jitterZ = 0;
    const isBeingMined = currentMinedTargetId === entity.id
      || !!(entity.data && entity.data.isBeingMined);

    if (isBeingMined) {
      rec.miningAgitation = Math.min(1.0, rec.miningAgitation + dt * 8.0);
    } else {
      rec.miningAgitation = Math.max(0, rec.miningAgitation - dt * 6.0);
    }

    // 4. Thermal fracture progression — monotonic: a worked rock never visibly heals.
    //    oreHP/oreHPMax is the sim's ore-body pool (hull/hullMax alias); render-only read.
    const data = entity.data || EMPTY_DATA;
    const frac = resolveFractureProgress(
      Number.isFinite(data.oreHP) ? data.oreHP : entity.hull,
      Number.isFinite(data.oreHPMax) ? data.oreHPMax : entity.hullMax,
    );
    if (frac > rec.fracture) rec.fracture = frac;

    if (!reducedMotion && rec.miningAgitation > 0.01) {
      const jitPhase = simTime * 95.0;
      // Fractured rock trembles harder under the beam — strain reads before the shatter.
      const mag = rec.miningAgitation * 0.05 * (1 + rec.fracture);
      jitterX = Math.sin(jitPhase) * mag;
      jitterZ = Math.cos(jitPhase * 1.25) * mag;
    }

    // 4b. Rich-core charge tremor — a lower, slower shudder that ramps with charge time and
    //     stops the instant the charge resolves or fizzles (chargeT0 cleared by the done events).
    if (!reducedMotion && rec.chargeT0 >= 0) {
      const ramp = Math.min(1, (simTime - rec.chargeT0) / 1.6);
      const cm = ramp * 0.035;
      jitterX += Math.sin(simTime * 63.0 + rec.rotY) * cm;
      jitterZ += Math.cos(simTime * 57.0 + rec.rotX) * cm;
    }

    // 4c. Arrival materialize + rich-core breach: transient scale envelopes multiplied onto the
    //     fracture swell base — absolute application, no drift.
    let scaleMul = 1;
    if (rec.materializeT0 >= 0) {
      const k = (simTime - rec.materializeT0) / 0.45;
      if (k >= 1) {
        rec.materializeT0 = -1;
      } else {
        const e = 1 - Math.pow(1 - k, 3);
        scaleMul *= (0.6 + 0.4 * e) * (1 + Math.sin(k * Math.PI) * 0.04);
      }
    }
    if (rec.breachT0 >= 0) {
      const k = (simTime - rec.breachT0) / 1.1;
      if (k >= 1) {
        rec.breachT0 = -1;
      } else {
        scaleMul *= 1 + Math.sin(k * Math.PI) * 0.055 * (1 - k * 0.4);
      }
    }

    // 4d. Contact shudder spring — the directional ring imparted by physics:impact. Stiff pull
    //     back to rest so the rock snaps off the blow and settles in ~0.3s; reduced motion
    //     collapses it to a single small displacement rather than a visible oscillation.
    if (Math.abs(rec.shoveX) > 1e-4 || Math.abs(rec.shoveZ) > 1e-4
      || Math.abs(rec.shoveVelX) > 1e-4 || Math.abs(rec.shoveVelZ) > 1e-4) {
      const kShove = 90;
      const cShove = 2 * Math.sqrt(kShove) * 0.85;
      rec.shoveVelX += (-kShove * rec.shoveX - cShove * rec.shoveVelX) * dt;
      rec.shoveVelZ += (-kShove * rec.shoveZ - cShove * rec.shoveVelZ) * dt;
      rec.shoveX = Math.max(-0.6, Math.min(0.6, rec.shoveX + rec.shoveVelX * dt));
      rec.shoveZ = Math.max(-0.6, Math.min(0.6, rec.shoveZ + rec.shoveVelZ * dt));
      if (Math.abs(rec.shoveX) < 1e-4 && Math.abs(rec.shoveVelX) < 1e-4) { rec.shoveX = 0; rec.shoveVelX = 0; }
      if (Math.abs(rec.shoveZ) < 1e-4 && Math.abs(rec.shoveVelZ) < 1e-4) { rec.shoveZ = 0; rec.shoveVelZ = 0; }
    }
    const shoveScale = reducedMotion ? 0.3 : 1;

    // Apply rotation and jitter to the main asteroid body mesh
    // Asteroid mesh is child 0 or userData.asteroidInstanceBody
    const body = (mesh.userData && mesh.userData.asteroidInstanceBody)
      || (mesh.children && mesh.children[0])
      || mesh;

    body.rotation.x = rec.rotX + wobbleOffsetX;
    body.rotation.y = rec.rotY;
    body.rotation.z = rec.rotZ + wobbleOffsetZ;

    body.position.x = jitterX + rec.shoveX * shoveScale;
    body.position.z = jitterZ + rec.shoveZ * shoveScale;

    // A body adopted into the pooled InstancedMesh only republishes leaf.matrixWorld while the
    // pool is dirty; with a still camera and clean records the submission fast-path skips the
    // publish and the tumble freezes mid-frame. Any write to an adopted leaf dirties the pool.
    if (body.userData && body.userData.asteroidInstanceAdopted === true) {
      invalidateAsteroidInstancePool(options.instancePool);
    }

    // 5. Crack-axis strain swell. Materials are shared/instanced, so the fracture reads through
    //    transforms only: a ≤2.5% ellipsoid swell along the deterministic vein axis plus a slow
    //    thermal breathing. Base scale is the body's PRISTINE scale (first seen, before any
    //    presentation write) held per body object — re-applied absolutely, never multiplied —
    //    so mesh release/reacquire, mesh recreation and repeated frames cannot drift or
    //    compound. Bodies without a scale interface (minimal test doubles) simply skip the swell.
    if (body.scale && typeof body.scale.set === 'function') {
      if (rec.scaleBodyRef !== body) {
        rec.scaleBodyRef = body;
        const pristine = pristineScaleFor(body);
        rec.baseScaleX = pristine.x;
        rec.baseScaleY = pristine.y;
        rec.baseScaleZ = pristine.z;
      }
      if (rec.fracture > 0.01) {
        const pattern = resolveVeinFracturePattern(entity.id, rec.fracture, veinScratch);
        const breathe = reducedMotion ? 0
          : Math.sin(simTime * 7.0 + rec.rotY) * 0.15 * rec.miningAgitation;
        const s = Math.min(1, pattern.swell + breathe * pattern.swell) * FRACTURE_SWELL_MAX;
        const ca = Math.cos(pattern.axisAngle);
        const sa = Math.sin(pattern.axisAngle);
        const along = 1 + s;
        const across = 1 - s * 0.4;
        body.scale.set(
          rec.baseScaleX * (along * ca * ca + across * sa * sa) * scaleMul,
          rec.baseScaleY * scaleMul,
          rec.baseScaleZ * (along * sa * sa + across * ca * ca) * scaleMul,
        );
      } else {
        body.scale.set(rec.baseScaleX * scaleMul, rec.baseScaleY * scaleMul, rec.baseScaleZ * scaleMul);
      }
    }

    // 6. Fracture veins — glowing fissures that open with ore depletion. Lazily attached once the
    //    rock is actually worked; plain-object test doubles (no .add) and pristine rocks skip it.
    if (typeof mesh.add === 'function' && entity && entity.id != null) {
      if (rec.fracture > 0.02 || rec.veinRig) {
        ensureVeinRig(rec, mesh, entity);
        syncVeinRig(rec, mesh, body, entity, simTime);
      }
    }
  }

  function nodeInsideTree(node, root) {
    for (let cur = node; cur; cur = cur.parent) {
      if (cur === root) return true;
    }
    return false;
  }

  // The asteroid survives its boundary: keep the tumble/motion state but release the
  // Object3D references (body + vein rig) so an evicted or disposed mesh tree can retire.
  function releaseEntityMesh(asteroidId) {
    const rec = asteroidStates.get(asteroidId);
    if (!rec) return;
    rec.veinRig = null;
    rec.scaleBodyRef = null;
  }

  // Recycled ids can leave a record keyed by a live-but-different entity while its body /
  // rig references still point into a dead mesh tree — release by mesh identity as well.
  function releaseMesh(mesh) {
    if (!mesh) return;
    for (const rec of asteroidStates.values()) {
      const rigHit = rec.veinRig && nodeInsideTree(rec.veinRig, mesh);
      const bodyHit = rec.scaleBodyRef && nodeInsideTree(rec.scaleBodyRef, mesh);
      if (rigHit || bodyHit) {
        rec.veinRig = null;
        rec.scaleBodyRef = null;
      }
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of asteroidStates.keys()) {
      if (!activeEntityIds.has(id)) {
        asteroidStates.delete(id);
      }
    }
  }

  function getFracture(asteroidId) {
    const rec = asteroidStates.get(asteroidId);
    return rec ? rec.fracture : 0;
  }

  return {
    bindEvents,
    unbindEvents,
    updateAsteroidMotion,
    onDamage,
    onImpact,
    getFracture,
    prune,
    releaseEntityMesh,
    releaseMesh,
  };
}

export const globalAsteroidMotion = createAsteroidMotionTracker();
