// SpaceFace — Asteroid 3D tumble, mining laser reaction, and impact wobble presentation.
//
// In an A-list space title, asteroids are living celestial bodies, not frozen plastic props:
//   1. Multi-axis Zero-G Tumble: Every asteroid in the sector rotates with realistic 3-axis
//      angular momentum determined deterministically from its unique entity ID.
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
// PURE RENDER-ONLY PRESENTATION: Never alters physics positions/radii, zero per-frame garbage.

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

    // 1. Advance 3-axis tumble
    if (!reducedMotion) {
      rec.rotX += rec.spinX * dt;
      rec.rotY += rec.spinY * dt;
      rec.rotZ += rec.spinZ * dt;
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

    // 5. Crack-axis strain swell. Materials are shared/instanced, so the fracture reads through
    //    transforms only: a ≤2.5% ellipsoid swell along the deterministic vein axis plus a slow
    //    thermal breathing. Base scale is captured per body object and re-applied absolutely —
    //    never multiplied — so mesh recreation and repeated frames cannot drift. Bodies without
    //    a scale interface (minimal test doubles) simply skip the swell.
    if (body.scale && typeof body.scale.set === 'function') {
      if (rec.scaleBodyRef !== body) {
        rec.scaleBodyRef = body;
        rec.baseScaleX = body.scale.x;
        rec.baseScaleY = body.scale.y;
        rec.baseScaleZ = body.scale.z;
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
  };
}

export const globalAsteroidMotion = createAsteroidMotionTracker();
