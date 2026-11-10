// src/data/foldAberrant.js — The Unclosed. A Verge-Layer containment instrument whose
// fold procedure never received a termination condition. Pure data and pure geometry.
// The sim in src/systems/foldAberrant.js owns time; this module never reads a clock.

export const FOLD_SITE_ID = 'ashfall_unclosed';

export const FOLD = Object.freeze({
  siteId: FOLD_SITE_ID,
  sectorId: 'sector_ashfall_reach',
  // Sector-local, on the rim of the Ashfall ossuary rack (center -2000, -1200, r 600).
  // The empty slot. Not the rack center, and not a MACHINE_SITES machine.
  anchor: Object.freeze({ x: -1520, z: -1200 }),
  periodS: 12,
  hull: 300,
  radius: 22,
  leash: 640,
  standoff: 200,
  drift: 12,
  misrepairR: 160,
  shearLength: 160,
  shearDamage: 22,
  insideRadius: 120,
  cornerHull: 28,
  cornerMass: 24,
  cornerRadius: 6,
  cornerOrbit: 110,
  cornerDamage: 12,
  cornerRelease: 48,
  slide: 90,
  plateShedSpeed: 40,
  plateDampSpeed: 18,
  scarRadius: 70,
  scarFlipSpeed: 20,
  passPhase: 0.5,
  recoverEnd: 0.72,
});

/** Turns in [0, 1). One turn is one inside-out. */
export function foldPhase(simTime, periodS = FOLD.periodS) {
  const t = Number(simTime);
  if (!Number.isFinite(t) || !(periodS > 0)) return 0;
  let p = (t / periodS) % 1;
  if (p < 0) p += 1;
  return p;
}

export function foldIndex(simTime, periodS = FOLD.periodS) {
  const t = Number(simTime);
  if (!Number.isFinite(t) || !(periodS > 0)) return 0;
  return Math.floor(t / periodS);
}

/**
 * True only on the rising edge into the pass (phase 0.5). A wrap that jumps the
 * edge fires once. A wrap that lands before the pass does not. A tick that stays
 * above 0.5 does not fire again.
 */
export function foldRisingEdge(prevPhase, phase, pass = FOLD.passPhase) {
  const prev = Number(prevPhase);
  const now = Number(phase);
  if (!Number.isFinite(prev) || !Number.isFinite(now)) return false;
  if (now >= prev) return prev < pass && now >= pass;
  // Wrapped past 1. The edge was crossed if we had not yet fired this turn.
  return prev < pass;
}

/** 0 shear, 1 corner, 2 inside-out, 3 misrepair (falls back to shear if unearned). */
export function foldAttackKind(index) {
  const i = Math.abs(Math.floor(Number(index) || 0)) % 4;
  return i === 1 ? 'corner' : i === 2 ? 'inside' : i === 3 ? 'misrepair' : 'shear';
}

/**
 * 16 vertices of a tesseract after an XW scale-swap, perspective-stable.
 * Writes 48 floats (x, y, z per vertex) into `out`. Both shells stay axis-aligned
 * squares; the w=+1 shell and the w=-1 shell trade radius so the inside swallows
 * the outside without shearing into trapezoids. y is the thin vertical.
 */
export function projectTesseractInto(phase, out) {
  const t = foldPhase(phase, 1);
  const swell = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  const outerK = 1.05;
  const innerK = 0.42;
  const kOn = outerK + (innerK - outerK) * swell;
  const kOff = innerK + (outerK - innerK) * swell;
  for (let i = 0; i < 16; i += 1) {
    const x = (i & 1) ? 1 : -1;
    const y = (i & 2) ? 1 : -1;
    const z = (i & 4) ? 1 : -1;
    const k = (i & 8) ? kOn : kOff;
    const o = i * 3;
    out[o] = x * k;
    out[o + 1] = y * k * 0.22;
    out[o + 2] = z * k;
  }
  return out;
}

/** Same projection as arrays of [x, y, z], for tests and one-shot reads. */
export function projectTesseract(phase) {
  const buf = projectTesseractInto(phase, new Float64Array(48));
  const out = new Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = [buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]];
  return out;
}

export const TESSERACT_EDGES = (() => {
  const edges = [];
  for (let i = 0; i < 16; i += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      const j = i | (1 << bit);
      if (j !== i) edges.push([i, j]);
    }
  }
  return edges;
})();

/** The one seam that does not meet: edge between vertex 0 and vertex 1. */
export const TESSERACT_FAULT_EDGE = [0, 1];

/**
 * Signed distance to a finite chord, or 0 when the point is not alongside it.
 * Positive and negative are the two half-planes. 0 means "not on this chord".
 */
export function chordSide(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (!(len2 > 1e-6)) return 0;
  const along = ((px - ax) * abx + (pz - az) * abz) / len2;
  if (along < 0 || along > 1) return 0;
  const len = Math.sqrt(len2);
  const nx = -abz / len;
  const nz = abx / len;
  return (px - ax) * nx + (pz - az) * nz;
}

export function crossedChord(prevSide, side) {
  if (!(prevSide !== 0 && side !== 0)) return false;
  return (prevSide > 0) !== (side > 0);
}

/** Reflect only the component normal to the chord. Tangential velocity stays. */
export function reflectAcrossChord(vx, vz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len = Math.hypot(abx, abz) || 1;
  const nx = -abz / len;
  const nz = abx / len;
  const dot = vx * nx + vz * nz;
  return { x: vx - 2 * dot * nx, z: vz - 2 * dot * nz };
}

/** Negate the radial part. Tangential speed is unchanged. */
export function invertRadial(vx, vz, px, pz, ox, oz) {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-4)) return { x: -vx, z: -vz };
  const nx = dx / d;
  const nz = dz / d;
  const radial = vx * nx + vz * nz;
  return { x: vx - 2 * radial * nx, z: vz - 2 * radial * nz };
}

/**
 * Pull speed toward `target` without pinning a ship that is already slower,
 * and without deleting a boost that has already cleared the shed threshold.
 * `shed` is the caller's job (speed before damp).
 */
export function dampSpeed(vx, vz, target, dt) {
  const v = Math.hypot(vx, vz);
  if (!(v > target) || !(dt > 0)) return { x: vx, z: vz };
  const cut = Math.min(v - target, (v - target) * Math.min(1, dt * 1.4));
  const s = (v - cut) / v;
  return { x: vx * s, z: vz * s };
}

/** A chord of `length` that does not contain (px, pz). Prefer one the point is alongside. */
export function chordClearOf(ox, oz, heading, length, px, pz) {
  let face = heading;
  let fallback = null;
  for (let n = 0; n < 8; n += 1) {
    const ax = ox + Math.cos(face) * 18;
    const az = oz + Math.sin(face) * 18;
    const bx = ax + Math.cos(face + Math.PI / 2) * length;
    const bz = az + Math.sin(face + Math.PI / 2) * length;
    const side = chordSide(px, pz, ax, az, bx, bz);
    const chord = { ax, az, bx, bz, face };
    if (Math.abs(side) > 28) return chord;
    if (side === 0 && !fallback) fallback = chord;
    face += 0.55;
  }
  if (fallback) return fallback;
  const ax = ox + Math.cos(face) * 18;
  const az = oz + Math.sin(face) * 18;
  return {
    ax, az,
    bx: ax + Math.cos(face + Math.PI / 2) * length,
    bz: az + Math.sin(face + Math.PI / 2) * length,
    face,
  };
}
