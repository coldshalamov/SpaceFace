// Wound-local smoke planning (inf-wound-smoke).
//
// The trail tick already knows a ship is hurt (`hull / hullMax`), and the scar book already
// knows WHERE it was opened: hull-local wound slots with a severity, a birth time, and the
// striking weapon's identity color. The old smoke read only the fraction and breathed a generic
// blob from the hull centre, so a ship hit twice on one flank smoked symmetrically and nothing
// on screen named the wound. This module is the decision layer that joins the two owners:
//
//   collectHullWounds — the hottest few scar slots for one hull, hottest first;
//   woundWorldPoint   — hull-local wound to play-plane world (the scar-line transform);
//   resolveWoundBeat  — per-wound emit plan: how hard it smokes, and whether it is still young
//                       enough to vent the striking weapon's own vapor before it greys.
//
// Pure: no THREE, no pools, no RNG, no sim reads. The caller owns drawing, budgets and
// accessibility. The scar book's slot shape is the live `effectsCause` interface read as-is;
// this module never writes to it.

// A fresh wound keeps venting the striking weapon's tinted vapor for this long before the
// smoke goes grey. Shorter than the scar's own weapon glow (SCAR_WEAPON_COOL_S 2.6 s): hot gas
// clears faster than hot metal cools.
export const WOUND_VENT_S = 1.4;

// Wounds half their smoke gain after this age. Old scars keep a ship smoking (persistence
// across a fight) but the newest wound always reads loudest.
export const WOUND_AGE_HALF_S = 9;

// Wounds planned per hull per query — the emitter walks them round-robin.
export const WOUND_SMOKE_MAX = 3;

function num(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Smoke gain of one wound: severity weighted by youth, 0..1. No allocation. */
export function woundHeat(slot, now) {
  if (!slot) return 0;
  const age = Math.max(0, num(now) - num(slot.born));
  const youth = 1 / (1 + age / WOUND_AGE_HALF_S);
  return clamp01(num(slot.severity)) * (0.45 + 0.55 * youth);
}

/**
 * The hottest wounds for one hull, hottest first, capped at WOUND_SMOKE_MAX.
 * Fills and returns `out` (a plain array is fine). Returns the shared empty array shape
 * for absent books or hulls with no recorded wounds, so the caller's fallback stays branch-free.
 */
export function collectHullWounds(book, hullId, now, out = []) {
  out.length = 0;
  if (!book || !Array.isArray(book.slots) || hullId == null) return out;
  const slots = book.slots;
  // Small n (scar book is capped at its own capacity), so a direct top-k insert is cheapest
  // and allocation-free beyond the caller's array.
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || slot.hullId !== hullId) continue;
    const heat = woundHeat(slot, now);
    if (heat <= 0.02) continue;
    if (out.length < WOUND_SMOKE_MAX) {
      out.push({ slot, heat });
      if (out.length === WOUND_SMOKE_MAX) out.sort(byHeatDesc);
      continue;
    }
    if (heat <= out[out.length - 1].heat) continue;
    out[out.length - 1] = { slot, heat };
    out.sort(byHeatDesc);
  }
  return out;
}

function byHeatDesc(a, b) {
  return b.heat - a.heat;
}

/**
 * Hull-local wound to world, the same transform the scar lines already draw with
 * (`scarWorldEnds`' maths, read-only here). Writes {x, z} into `out` and returns it,
 * or null when the hull cannot host a point.
 */
export function woundWorldPoint(slot, hull, out) {
  if (!slot || !hull || hull.alive === false || !hull.pos
    || !Number.isFinite(hull.pos.x) || !Number.isFinite(hull.pos.z)) return null;
  const rot = num(hull.rot);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const lx = num(slot.lx);
  const lz = num(slot.lz);
  out.x = hull.pos.x + c * lx - s * lz;
  out.z = hull.pos.z + s * lx + c * lz;
  return out;
}

/**
 * One wound's emit beat. Fields (all written, so a reused `out` never goes stale):
 *   heat       smoke gain 0..1 (caller scales puff size/count with it)
 *   vent01     1 just after a NAMED weapon struck, easing to 0 at WOUND_VENT_S; 0 without a
 *              named weapon — collisions and legacy scars never vent a color they do not have
 *   r, g, b    the vent tint: the wound's current scar draw color (weapon glow easing to the
 *              shared burn amber) scaled toward vapor luminance, so the tint reads as hot gas
 *              rather than a second light source
 */
export function resolveWoundBeat(slot, now, out = {}) {
  const heat = woundHeat(slot, now);
  out.heat = heat;
  out.vent01 = 0;
  out.r = 0.24;
  out.g = 0.24;
  out.b = 0.26;
  if (!slot || heat <= 0) return out;
  const age = Math.max(0, num(now) - num(slot.born));
  if (slot.wr == null || age >= WOUND_VENT_S) return out;
  out.vent01 = clamp01(1 - age / WOUND_VENT_S);
  // Vapor luminance band: bright enough to carry a hue at the chase camera, well under the
  // particle pool's spark band so tinted smoke never reads as a spark.
  const VAPOR_FLOOR = 0.30;
  const VAPOR_SPAN = 0.34;
  out.r = VAPOR_FLOOR + VAPOR_SPAN * clamp01(num(slot.wr));
  out.g = VAPOR_FLOOR + VAPOR_SPAN * clamp01(num(slot.wg));
  out.b = VAPOR_FLOOR + VAPOR_SPAN * clamp01(num(slot.wb));
  return out;
}

// Metal torn from a fresh named wound starts at the wound's own heat and cools on the authored
// dark track. Past this window the tear is burnt metal — the debris forgets again, exactly like
// the scar's own glow cools into shared burn amber.
export const WOUND_METAL_HEAT_S = 4.0;

/**
 * The breach-heat plan for solids torn out of one wound. Fields (all written):
 *   gain01    0..1 — how much of the wound's heat the torn edge still carries (0 when the wound
 *             is unnamed, burnt out, or the caller should keep the authored cold grey)
 *   colorHex  the heated-metal start color: incandescent steel carrying the striking weapon's
 *             tint, as 0xRRGGBB the burst writer can hand straight to the pool's color track
 *
 * Pure, allocation-free beyond `out`. No sim reads.
 */
export function resolveWoundMetalHeat(slot, now, out = {}) {
  out.gain01 = 0;
  out.colorHex = 0x94897b;
  if (!slot || slot.wr == null) return out;
  const age = Math.max(0, num(now) - num(slot.born));
  if (age >= WOUND_METAL_HEAT_S) return out;
  out.gain01 = clamp01(1 - age / WOUND_METAL_HEAT_S);
  // Incandescent base mixed toward the striking weapon's own color — the fragment is metal at
  // the breach's temperature, not painted glass, so the tint never owns more than half the mix.
  const r = 1.0 + (clamp01(num(slot.wr)) - 1.0) * 0.45;
  const g = 0.84 + (clamp01(num(slot.wg)) - 0.84) * 0.45;
  const b = 0.58 + (clamp01(num(slot.wb)) - 0.58) * 0.45;
  const ri = Math.round(Math.min(1, Math.max(0, r)) * 255);
  const gi = Math.round(Math.min(1, Math.max(0, g)) * 255);
  const bi = Math.round(Math.min(1, Math.max(0, b)) * 255);
  out.colorHex = (ri << 16) | (gi << 8) | bi;
  return out;
}
