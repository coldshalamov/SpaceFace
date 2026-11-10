// inf-gate-emergence — the far gate answers the crossing.
//
// The player story: I charge the gate, the drive bites, the tunnel takes me (the departure
// gate plays its swell/collapse — infrastructureMotion, inf-gate-departure) — and then I am
// OUT, at a ring I have never seen, and that gate does nothing. The crossing's biggest stage
// forgets me the instant I land: jump:arrive only KILLS the departure pulse. Now the gate you
// emerged from answers: the throat you were spat out of rebounds — a discharge ring beat
// snapping off the aperture, then slower settle rings shedding outward while the swirl eases
// home — so the far gate reads as the door you just used, not set dressing you happen to be
// near. A drive jump emerges in open space: no gate within the emergence radius, no read —
// the picture never pretends a door was there.
//
// Truth read: the jump:arrive payload the sim already publishes (toPos, sectorId) and the
// sector's own gate entities (data.isGate) — the same geometric law the sim's gate-safe
// spawn zone uses. No rng, no wall time: every plan hashes simTime and the arm's own stamp,
// so a frozen sim freezes the rebound with the world. Reduced motion thins each ring, never
// to zero; the rebound keeps a floor. Transform-free by law: this layer only plans particles
// and one pooled event light — the gate mesh's aperture transforms stay owned by
// infrastructureMotion.js (a committed subject, consumed here, never modified).
//
// Companion to the departure pulse, not a copy of it: the departure gate swells and collapses
// over 1.2 s + settle while the hull is IN the tunnel; this is the far side's 0.5 s rebound +
// 1.2 s shed after the hull is out — shorter, sharper, outward.

/** The emergence radius: the player lands ~0.04·worldRadius from the far gate (gates sit at
 *  0.82·wr, the entry point at 0.78·wr on the same bearing); a drive jump lands at the sector
 *  origin, far past this. Just past the sim's own hostile-clear radius (400). */
export const GATE_EMERGENCE_RADIUS_WU = 480;
/** The rebound: the throat snapping shut right after the hull is out. */
export const GATE_EMERGENCE_REBOUND_S = 0.5;
/** The settle: slower discharge rings shedding outward while the swirl eases home. */
export const GATE_EMERGENCE_SETTLE_S = 1.2;
/** Discharge ring batches across the window (rebound beats first, settle ease after). */
export const GATE_EMERGENCE_BATCHES = 7;
/** Particles per ring batch at full motion. */
export const GATE_EMERGENCE_RING_COUNT = 7;
export const GATE_EMERGENCE_REDUCED_MUL = 0.5;

/** The aperture discharge: cool ion blue — no dock holo-green, no hazard hue. */
export const GATE_EMERGENCE_HUE = 0x8fd4ff;
/** A wormhole's discharge shifts violet — the same door, a stranger throat. */
export const GATE_EMERGENCE_WORMHOLE_HUE = 0xb48fff;

function hash(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function clamp01(value) {
  return Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;
}

/**
 * The gate the player emerged from, by the payload's own geometry. `gates` is the sector's
 * gate list ({ id, pos:{x,z}, wormhole } — the runtime mirror the sim already keeps). Null
 * when no gate sits within the emergence radius: a drive jump, a wormhole whose mouth is
 * elsewhere — the picture stays honest about doors that were not used.
 */
export function resolveGateEmergenceGate(payload, gates) {
  if (!payload || !payload.toPos
    || !Number.isFinite(payload.toPos.x) || !Number.isFinite(payload.toPos.z)) return null;
  if (!Array.isArray(gates)) return null;
  const px = payload.toPos.x;
  const pz = payload.toPos.z;
  let best = null;
  let bestSq = GATE_EMERGENCE_RADIUS_WU * GATE_EMERGENCE_RADIUS_WU;
  for (const gate of gates) {
    if (!gate || !gate.pos
      || !Number.isFinite(gate.pos.x) || !Number.isFinite(gate.pos.z)) continue;
    const dx = gate.pos.x - px;
    const dz = gate.pos.z - pz;
    const distSq = dx * dx + dz * dz;
    if (distSq <= bestSq) {
      bestSq = distSq;
      best = gate;
    }
  }
  return best
    ? { gateId: best.id != null ? String(best.id) : null, x: best.pos.x, z: best.pos.z,
      wormhole: best.wormhole === true, distSq: bestSq }
    : null;
}

/**
 * Arm the emergence read. Pure: the arm record carries the gate's position and the sim stamp
 * the caller latches. Returns null when no gate serves the arrival.
 */
export function gateEmergenceArm(payload, gates, simTime) {
  const gate = resolveGateEmergenceGate(payload, gates);
  if (!gate) return null;
  return {
    ...gate,
    t0: Number.isFinite(simTime) ? simTime : 0,
    hue: gate.wormhole ? GATE_EMERGENCE_WORMHOLE_HUE : GATE_EMERGENCE_HUE,
    windowS: GATE_EMERGENCE_REBOUND_S + GATE_EMERGENCE_SETTLE_S,
  };
}

/**
 * One discharge-ring batch, or null outside the window / on a consumed tick (`lastStep` is
 * the caller's latch). The rebound batches (early) are tight, fast and bright; the settle
 * batches ease wider, slower, longer. Deterministic per (arm stamp, batch).
 */
export function gateEmergenceTickPlan(arm, simTime, reducedMotion = false, lastStep = null) {
  if (!arm || !(arm.windowS > 0)) return null;
  const now = Number(simTime);
  if (!Number.isFinite(now)) return null;
  const elapsed = now - arm.t0;
  if (elapsed < 0 || elapsed > arm.windowS) return null;
  const step = Math.floor(elapsed / (arm.windowS / GATE_EMERGENCE_BATCHES));
  if (step === lastStep || step >= GATE_EMERGENCE_BATCHES) return null;
  const u = step / (GATE_EMERGENCE_BATCHES - 1);
  const rebound = clamp01(1 - elapsed / GATE_EMERGENCE_REBOUND_S);
  const seed = hash(`gate-emerge:${arm.gateId}:${Math.round(arm.t0 * 4)}:${step}`);
  const countMul = reducedMotion ? GATE_EMERGENCE_REDUCED_MUL : 1;
  const count = Math.max(3, Math.round(GATE_EMERGENCE_RING_COUNT * countMul));
  const angles = [];
  const phase0 = ((seed % 6283) / 1000);
  for (let k = 0; k < count; k++) {
    angles.push(phase0 + (k / count) * Math.PI * 2 + ((seed >>> (k % 8)) & 15) / 15 * 0.24);
  }
  return {
    step,
    x: arm.x,
    z: arm.z,
    hue: arm.hue,
    wormhole: arm.wormhole,
    count,
    // The shed: each ring starts inside the throat and runs outward as the window opens.
    radiusU: 0.3 + u * 1.6,
    radialSpeed: 26 - u * 12,
    lifeS: 0.45 + u * 0.5,
    rebound, // 1 → 0 across the rebound beat: the caller keys the light and opacity to it
    angles,
    seed,
  };
}
