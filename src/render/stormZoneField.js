// Storm zone field — the pure geometry layer for a hazard zone's own body.
//
// The player story: the chart marks hazard zones, the sim damages you inside them, and (since
// inf-storm-crossing) the boundary and the hull static read — but the ZONE itself still has no
// body. From two rings out, the Roaming Burn you are flying toward is empty air; you only meet
// it when your hull starts ticking damage. This layer gives every live hazard zone a visible
// body in the flight plane: two counter-rotating broken arc rings plus a handful of orbiting
// motes, tinted by the zone's family hue, whose arc count and brightness key on the zone's LIVE
// intensity — so when the Ashfall boss falls and the burn's aftermath thins 0.8 -> 0.35, the
// storm on screen visibly THINS with it. The world's answer rides live sim truth, not an event.
//
// Truth read: `state.world.activeSector.hazards` — the live records, with moving centers
// already stamped every tick by world.js `_resolveMovingHazards`. No rng, no wall time: churn
// phases hash the zone's own identity and rotate off simTime, so a frozen sim freezes the
// storm with the world. Reduced motion slows the churn but keeps every ring and mote lit —
// a hazard you cannot see is worse than one that sits still (the beacon-lamp floor law).
//
// Contract mirrors dockingCradle.js: no Three.js objects, no GameState reads, typed-array
// quads into caller-owned buffers, world-space XZ in / world-space out; the adapter localizes
// and binds one additive mesh. Family hues are the inf-storm-crossing table, so the zone's
// skin and the hull static never disagree about what is biting you.

import { STORM_ZONE_COLORS, resolveStormZoneColorHex } from './hazardStormRead.js';

/** Readability cull: past center+this the zone skin is sub-pixel; skip it. */
export const STORM_ZONE_MAX_RANGE_WU = 3200;
/** One mesh, one draw call; four live zones fit the biggest authored sector with margin. */
export const STORM_ZONE_CAP = 4;
export const STORM_ZONE_QUADS = 176;

/**
 * Allocate the indexed quad pool once (the dockingCradle contract). Indices are fixed;
 * the draw count moves. Never call from the frame update.
 */
export function createStormZoneGeometry(quadCapacity = STORM_ZONE_QUADS) {
  const capacity = Math.max(16, Math.trunc(Number.isFinite(quadCapacity) ? quadCapacity : STORM_ZONE_QUADS));
  const positions = new Float32Array(capacity * 4 * 3);
  const colors = new Float32Array(capacity * 4 * 3);
  const indices = new Uint16Array(capacity * 6);
  for (let quad = 0; quad < capacity; quad += 1) {
    const v = quad * 4, o = quad * 6;
    indices[o] = v; indices[o + 1] = v + 1; indices[o + 2] = v + 2;
    indices[o + 3] = v + 1; indices[o + 4] = v + 3; indices[o + 5] = v + 2;
  }
  return { quadCapacity: capacity, positions, colors, indices, indexCount: 0 };
}

/** Arc rings: counts key on live intensity, so a thinned storm visibly thins. */
export const STORM_RING1_BASE_ARCS = 4;
export const STORM_RING1_FULL_ARCS = 14;
export const STORM_RING2_BASE_ARCS = 3;
export const STORM_RING2_FULL_ARCS = 9;
/** Interior motes: the slow churn inside the ring line. */
export const STORM_ZONE_MOTES = 6;
/** Brightness floor: a thinned storm still reads as the thin thing it is, never dark. */
export const STORM_ZONE_FLOOR = 0.3;
export const STORM_ZONE_SKIN = 0.55; // share of full brightness at density 1.0
/** Ring churn rates at the reference clock (rad/s), signed — the rings counter-rotate. */
export const STORM_RING1_RATE = 0.11;
export const STORM_RING2_RATE = -0.17;
/** Reduced motion: churn rates are multiplied by this, never zeroed. */
export const STORM_REDUCED_CHURN_MUL = 0.35;

const TAU = Math.PI * 2;

function hash(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noise01(seed, index) {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97) >>> 0;
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

function clamp01(value) {
  return Number.isFinite(value) ? (value < 0 ? 0 : value > 1 ? 1 : value) : 0;
}

/**
 * Build the draw plans for the live zones. `zones` is state.world.activeSector.hazards (each
 * { type, center, radius, intensity }); `focus` is the camera focus { x, z }. The nearest
 * STORM_ZONE_CAP zones inside readability range win; each plan carries its family hue, live
 * density, churn phase (hashed from the zone identity), and per-mote orbit parameters.
 */
export function resolveStormZonePlans(zones, focus, simTime) {
  const list = Array.isArray(zones) ? zones : [];
  const fx = Number.isFinite(focus && focus.x) ? focus.x : 0;
  const fz = Number.isFinite(focus && focus.z) ? focus.z : 0;
  const candidates = [];
  for (let i = 0; i < list.length && candidates.length < 12; i++) {
    const zone = list[i];
    if (!zone || !zone.center || !Number.isFinite(zone.center.x) || !Number.isFinite(zone.center.z)) continue;
    const radius = Number.isFinite(zone.radius) && zone.radius > 0 ? zone.radius : 400;
    const dist = Math.hypot(zone.center.x - fx, zone.center.z - fz);
    if (dist > radius + STORM_ZONE_MAX_RANGE_WU) continue;
    candidates.push({ zone, dist, radius });
  }
  candidates.sort((a, b) => a.dist - b.dist);
  const plans = [];
  for (let i = 0; i < candidates.length && plans.length < STORM_ZONE_CAP; i++) {
    const { zone, radius } = candidates[i];
    const type = String(zone.type || '');
    const density = clamp01(Number(zone.intensity));
    const seed = hash(`storm-zone:${type}:${Number(zone.center.x).toFixed(0)},${Number(zone.center.z).toFixed(0)}`);
    const motes = [];
    for (let m = 0; m < STORM_ZONE_MOTES; m++) {
      motes.push({
        orbitFrac: 0.25 + noise01(seed, m) * 0.55,
        angle0: noise01(seed, m + 32) * TAU,
        rate: (0.12 + noise01(seed, m + 64) * 0.22) * (m % 2 ? 1 : -1),
        len: 0.06 + noise01(seed, m + 96) * 0.08, // arc length in radians — a short tangent streak
      });
    }
    plans.push({
      type,
      colorHex: resolveStormZoneColorHex(type),
      familyHasHue: Object.prototype.hasOwnProperty.call(STORM_ZONE_COLORS, type),
      cx: Number(zone.center.x),
      cz: Number(zone.center.z),
      radius,
      density,
      brightness: STORM_ZONE_FLOOR + (STORM_ZONE_SKIN - STORM_ZONE_FLOOR) * density,
      phase: (seed % 6283) / 1000,
      ring1Arcs: Math.round(STORM_RING1_BASE_ARCS
        + (STORM_RING1_FULL_ARCS - STORM_RING1_BASE_ARCS) * density),
      ring2Arcs: Math.round(STORM_RING2_BASE_ARCS
        + (STORM_RING2_FULL_ARCS - STORM_RING2_BASE_ARCS) * density),
      motes,
      seed,
    });
  }
  return plans;
}

function emitQuad(out, x0, z0, x1, z1, halfW, y, r, g, b, emitted) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5 || emitted >= out.quadCapacity) return emitted;
  const px = (-dz / len) * halfW, pz = (dx / len) * halfW;
  const o = emitted * 12;
  const positions = out.positions, colors = out.colors;
  positions[o] = x0 - px; positions[o + 1] = y; positions[o + 2] = z0 - pz;
  positions[o + 3] = x0 + px; positions[o + 4] = y; positions[o + 5] = z0 + pz;
  positions[o + 6] = x1 - px; positions[o + 7] = y; positions[o + 8] = z1 - pz;
  positions[o + 9] = x1 + px; positions[o + 10] = y; positions[o + 11] = z1 + pz;
  for (let v = 0; v < 4; v++) {
    colors[o + v * 3] = r; colors[o + v * 3 + 1] = g; colors[o + v * 3 + 2] = b;
  }
  return emitted + 1;
}

/**
 * Write the zone skins. `out` is a dockingCradle-style quad buffer; `plans` come from
 * resolveStormZonePlans; `simTime` drives the churn clock; `reducedMotion` slows it without
 * dimming or dropping anything. Returns out with indexCount set. World-space XZ at deck
 * height `y`.
 */
export function writeStormZoneGeometry(out, plans, simTime, reducedMotion = false, y = 0.22) {
  if (!out) return out;
  out.indexCount = 0;
  if (!out.quadCapacity || !Array.isArray(plans) || !plans.length) return out;
  const now = Number.isFinite(simTime) ? simTime : 0;
  const churn = reducedMotion ? STORM_REDUCED_CHURN_MUL : 1;
  let emitted = 0;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const br = plan.brightness;
    const r = ((plan.colorHex >> 16) & 255) / 255 * br;
    const g = ((plan.colorHex >> 8) & 255) / 255 * br;
    const b = (plan.colorHex & 255) / 255 * br;
    const { cx, cz, radius } = plan;

    // Outer broken ring: arcs spaced around the full circle, drifting with the churn clock.
    const r1 = radius * 0.94;
    const step1 = TAU / plan.ring1Arcs;
    const arcLen1 = step1 * 0.42;
    for (let k = 0; k < plan.ring1Arcs; k++) {
      const a0 = plan.phase + now * STORM_RING1_RATE * churn + k * step1;
      emitted = emitQuad(out,
        cx + Math.cos(a0) * r1, cz + Math.sin(a0) * r1,
        cx + Math.cos(a0 + arcLen1) * r1, cz + Math.sin(a0 + arcLen1) * r1,
        Math.max(0.6, radius * 0.012), y, r, g, b, emitted);
    }
    // Inner ring turns the other way — counter-rotation is the churn read.
    const r2 = radius * 0.7;
    const step2 = TAU / plan.ring2Arcs;
    const arcLen2 = step2 * 0.38;
    for (let k = 0; k < plan.ring2Arcs; k++) {
      const a0 = plan.phase * 1.35 + now * STORM_RING2_RATE * churn + k * step2;
      emitted = emitQuad(out,
        cx + Math.cos(a0) * r2, cz + Math.sin(a0) * r2,
        cx + Math.cos(a0 + arcLen2) * r2, cz + Math.sin(a0 + arcLen2) * r2,
        Math.max(0.5, radius * 0.01), y, r * 0.9, g * 0.9, b * 0.9, emitted);
    }
    // Interior motes: thin tangent streaks orbiting the center at hashed rates and bearings.
    for (let m = 0; m < plan.motes.length; m++) {
      const mote = plan.motes[m];
      const a = mote.angle0 + now * mote.rate * churn;
      const mr = radius * mote.orbitFrac;
      const mx = cx + Math.cos(a) * mr, mz = cz + Math.sin(a) * mr;
      const t = a + (Math.PI / 2) * Math.sign(mote.rate); // tangent to the orbit
      const half = Math.max(1.2, radius * mote.len);
      emitted = emitQuad(out,
        mx - Math.cos(t) * half, mz - Math.sin(t) * half,
        mx + Math.cos(t) * half, mz + Math.sin(t) * half,
        Math.max(0.45, radius * 0.008), y + 0.02, r * 0.8, g * 0.8, b * 0.8, emitted);
    }
  }
  out.indexCount = emitted * 6;
  return out;
}
