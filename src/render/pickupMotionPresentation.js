// SpaceFace — Pickup 3D tumbling and magnetic scoop vortex presentation.
//
// Solves flat, sterile pickup behavior:
//   1. 3D Tumbling Dynamics: Ore gems, credit chips, and freight canisters tumble across multiple
//      axes with natural buoyant zero-G angular momentum.
//   2. Magnetic Tractor Vortex: When pulled toward the ship's cargo bay, pickups accelerate their
//      tumble and spiral inward in a magnetic funnel, compressing into the intake scoop.
//   3. Transponder Warning Strobes: Rhythmic aviation-grade double-flash sequences on chits and canisters.
//
// PURE RENDER-ONLY PRESENTATION: Never modifies physical collection radii or sim cargo quantities.

function hashId(id) {
  const s = String(id || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

// --- Tractor-beam gravimetric vortex: pure math ---------------------------------------------
// The vortex is a presentation-only spiral layered on the pickup mesh; the sim's magnet pull
// (src/systems/mining.js) owns the real motion. These helpers are exported for the VFX funnel
// stream and for focused tests.

export const TRACTOR_MAGNET_RANGE_WU = 350;   // magnet attractor presentation range
export const TRACTOR_VORTEX_RANGE_WU = 200;   // inside this the spiral offset is visible
export const TRACTOR_VORTEX_MAX_RADIUS_WU = 6.0;
export const TRACTOR_MAGNETIZED_MIN_PULL = 0.1;

/** Pull factor in [0, 1): 0 at/ beyond magnet range, →1 at the scoop. NaN-safe. */
export function resolveTractorPullFactor(distanceWu) {
  const d = Number(distanceWu);
  if (!Number.isFinite(d) || d >= TRACTOR_MAGNET_RANGE_WU) return 0;
  return Math.max(0, 1 - d / TRACTOR_MAGNET_RANGE_WU);
}

export function isTractorMagnetized(pullFactor) {
  return pullFactor > TRACTOR_MAGNETIZED_MIN_PULL;
}

/** Angular rate (rad/s) of the vortex spiral: spins faster as the pull hardens. */
export function resolveTractorVortexRate(pullFactor) {
  const p = Number.isFinite(pullFactor) ? Math.min(1, Math.max(0, pullFactor)) : 0;
  return 8.0 + p * 12.0;
}

/**
 * Spiral offset for a pickup at `distanceWu` with accumulated `vortexAngle` (rad).
 * Writes { radius, x, z } into `out` (allocated when omitted). Radius collapses both at the
 * scoop (drop compresses into the intake) and at the vortex boundary (smooth onset).
 */
export function resolveTractorVortex(distanceWu, vortexAngle, out = null) {
  const rec = out || { radius: 0, x: 0, z: 0 };
  const d = Number(distanceWu);
  if (!Number.isFinite(d) || d >= TRACTOR_VORTEX_RANGE_WU) {
    rec.radius = 0;
    rec.x = 0;
    rec.z = 0;
    return rec;
  }
  const pull = resolveTractorPullFactor(d);
  const a = Number.isFinite(vortexAngle) ? vortexAngle : 0;
  const radius = Math.min(d * 0.15, TRACTOR_VORTEX_MAX_RADIUS_WU * (1 - pull));
  rec.radius = radius;
  rec.x = Math.cos(a) * radius;
  rec.z = Math.sin(a) * radius;
  return rec;
}

/** Cargo-bay compression: 1 outside 25 wu, easing to 0.15 at the scoop mouth. */
export function resolveTractorScaleTarget(distanceWu) {
  const d = Number(distanceWu);
  if (!Number.isFinite(d) || d >= 25) return 1.0;
  return Math.max(0.15, d / 25.0);
}

/**
 * Deterministic ambient funnel-mote stream phase for VFX: `cycle` runs 0 (drop rim) → 1 (scoop)
 * on a ~0.7 s loop keyed to sim time, `angle` precesses so motes describe the funnel wall.
 * Pure function of (seed, simTime) — safe for tests, no Math.random in the hot path.
 */
export function resolveFunnelMoteStream(seed, simTime, out = null) {
  const rec = out || { cycle: 0, angle: 0 };
  const h = hashId(seed);
  const phase = ((h & 0xffff) / 0xffff);
  const t = Number.isFinite(simTime) ? simTime : 0;
  rec.cycle = (t * 1.4 + phase) % 1;
  rec.angle = phase * Math.PI * 2 + t * (3.0 + (((h >>> 16) & 0xff) / 255) * 4.0);
  return rec;
}

export function createPickupMotionTracker() {
  const pickupStates = new Map();
  const vortexScratch = { radius: 0, x: 0, z: 0 };

  function getState(pickupId) {
    let rec = pickupStates.get(pickupId);
    if (!rec) {
      const h = hashId(pickupId);
      const phase = ((h & 0xff) / 255) * Math.PI * 2;
      const spinSpeed = 1.4 + (((h >> 8) & 0xff) / 255) * 1.8;
      const pitchSpin = 0.8 + (((h >> 16) & 0xff) / 255) * 1.2;
      const rollSpin = 0.5 + (((h >> 24) & 0x7f) / 127) * 0.9;

      rec = {
        phase,
        spinSpeed,
        pitchSpin,
        rollSpin,
        rotX: phase,
        rotY: phase * 0.5,
        rotZ: phase * 0.3,
        vortexAngle: phase,
        scaleRatio: 1.0,
      };
      pickupStates.set(pickupId, rec);
    }
    return rec;
  }

  function updatePickupMotion(entity, mesh, simTime, frameDt, playerEntity, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Check distance to player for tractor beam suction vortex
    let isMagnetized = false;
    let distToPlayer = 9999;
    let pullFactor = 0;

    if (playerEntity && playerEntity.pos && entity.pos) {
      const dx = playerEntity.pos.x - entity.pos.x;
      const dz = playerEntity.pos.z - entity.pos.z;
      distToPlayer = Math.hypot(dx, dz);

      pullFactor = resolveTractorPullFactor(distToPlayer);
      isMagnetized = isTractorMagnetized(pullFactor);
    }

    // Dynamic tumble acceleration under tractor pull
    const tumbleMultiplier = isMagnetized ? (1.0 + pullFactor * 3.5) : 1.0;
    if (!reducedMotion) {
      rec.rotX += rec.pitchSpin * tumbleMultiplier * dt;
      rec.rotY += rec.spinSpeed * tumbleMultiplier * dt;
      rec.rotZ += rec.rollSpin * tumbleMultiplier * dt;
    }

    // Magnetic spiral vortex offset
    let vortexOffsetX = 0;
    let vortexOffsetZ = 0;
    if (!reducedMotion && isMagnetized && distToPlayer < TRACTOR_VORTEX_RANGE_WU) {
      rec.vortexAngle += dt * resolveTractorVortexRate(pullFactor);
      const vortex = resolveTractorVortex(distToPlayer, rec.vortexAngle, vortexScratch);
      vortexOffsetX = vortex.x;
      vortexOffsetZ = vortex.z;
    }

    // Snapping scale compression into cargo bay
    const targetScale = resolveTractorScaleTarget(distToPlayer);
    rec.scaleRatio += (targetScale - rec.scaleRatio) * (1 - Math.exp(-12.0 * dt));

    // Vertical zero-G levitation bobbing
    const bob = reducedMotion ? 0 : Math.sin(simTime * 2.2 + rec.phase) * (isMagnetized ? 0.15 : 0.45);

    // Apply to mesh root / child group
    const targetObj = (mesh.userData && mesh.userData.gem)
      || (mesh.children && mesh.children[0])
      || mesh;

    targetObj.rotation.x = rec.rotX;
    targetObj.rotation.y = rec.rotY;
    targetObj.rotation.z = rec.rotZ;

    targetObj.position.x = vortexOffsetX;
    targetObj.position.y = bob;
    targetObj.position.z = vortexOffsetZ;

    if (rec.scaleRatio < 0.98) {
      targetObj.scale.setScalar(rec.scaleRatio);
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of pickupStates.keys()) {
      if (!activeEntityIds.has(id)) {
        pickupStates.delete(id);
      }
    }
  }

  return {
    updatePickupMotion,
    prune,
  };
}

export const globalPickupMotion = createPickupMotionTracker();
