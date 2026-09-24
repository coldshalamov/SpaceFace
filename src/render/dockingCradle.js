// Magnetic docking cradle (feature 14) — pure state and geometry writes.
//
// The sim-side dockingCorridor system already owns the capture assist and publishes a readout on
// state.dockingCorridor (phase, berth point, lane flags). This module is ONLY the hologram: a
// green geometric pad projected onto the bay floor at the berth — a ring, rotating acquisition
// brackets, and inbound chevrons that funnel the pilot down the corridor axis.
//
// Same contract as masslineSwingTrace.js: no Three.js objects, no GameState reads, typed-array
// geometry written into caller-owned buffers. The VFX adapter binds them to one additive mesh.

const MAX_INDEXED_QUADS = 16383; // 4 vertices each, the Uint16 index ceiling.

export const DOCKING_CRADLE_QUADS = 96;      // ring + brackets + chevrons + center pip
export const DOCKING_CRADLE_FADE_S = 0.28;   // ease in/out so the cradle never pops
const RING_SEGMENTS = 44;
const BRACKET_COUNT = 4;
const CHEVRON_COUNT = 3;

/** Allocate once at VFX init. Never call from the frame update. */
export function createDockingCradle() {
  return {
    visible01: 0,        // eased envelope — target comes from the corridor phase
    phase: 'none',
    berthX: 0, berthZ: 0,
    axisX: 1, axisZ: 0,  // outbound corridor axis; chevrons sit out along it pointing inbound
    radius: 14,          // pad radius in wu (from the capture lane half-width)
    pulseT: 0,
  };
}

/** Forget the current engagement (sector change, dock, station lost). */
export function resetDockingCradle(cradle) {
  if (!cradle) return cradle;
  cradle.visible01 = 0;
  cradle.phase = 'none';
  cradle.pulseT = 0;
  return cradle;
}

/**
 * Track the published corridor readout. `readout` is state.dockingCorridor; `proxy` is the
 * matching physicsRuntime.collisionProxies entry (for berth/axis/lane width), or null.
 */
export function updateDockingCradle(cradle, dt, readout, proxy) {
  if (!cradle) return cradle;
  const phase = readout && readout.phase || 'none';
  const engaged = phase !== 'none' && phase !== 'approach' && !!(readout && readout.berth);
  // Approach is still outside the mouth — keep a faint preview so the pad is discoverable,
  // but the envelope stays low until the corridor actually gates the ship in.
  const preview = phase === 'approach' && !!(readout && readout.berth);
  const target = engaged ? 1 : preview ? 0.38 : 0;
  const step = dt > 0 ? dt / DOCKING_CRADLE_FADE_S : 1;
  cradle.visible01 += clamp(target - cradle.visible01, -step, step);
  cradle.phase = phase;
  if (readout && readout.berth) {
    cradle.berthX = finite(readout.berth.x);
    cradle.berthZ = finite(readout.berth.z);
  }
  if (proxy) {
    const bearing = Number.isFinite(proxy.corridorBearingDeg) ? proxy.corridorBearingDeg * (Math.PI / 180) : null;
    const rot = finite(proxy.rot);
    if (bearing != null) {
      const a = rot + bearing;
      cradle.axisX = Math.cos(a);
      cradle.axisZ = Math.sin(a);
    }
    const lane = proxy.corridor && Number.isFinite(proxy.corridor.captureHalfWidth)
      ? proxy.corridor.captureHalfWidth : null;
    if (lane != null) cradle.radius = clamp(lane * 1.7, 6, 40);
  }
  cradle.pulseT += Math.max(0, dt);
  return cradle;
}

/** Allocate the indexed quad pool once. Indices are fixed; draw count moves. */
export function createDockingCradleGeometry(quadCapacity = DOCKING_CRADLE_QUADS) {
  const capacity = clampInteger(quadCapacity, 16, MAX_INDEXED_QUADS);
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

function emitQuad(out, emitted, x0, z0, x1, z1, halfW, y, r, g, b) {
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
 * Write the cradle hologram. World-space XZ at deck height `y`; the caller's mesh is frame-local
 * with frustumCulled=false — same contract as the swing trace and release arc.
 * opts: { y, reducedMotion, gain } — gain is the accessibility-scaled master brightness.
 */
export function writeDockingCradleGeometry(out, cradle, opts) {
  if (!out) return out;
  out.indexCount = 0;
  if (!out.quadCapacity || !cradle || !(cradle.visible01 > 0.004)) return out;
  const y = finite(opts && opts.y, 0.35);
  const reducedMotion = !!(opts && opts.reducedMotion);
  const gain = clamp01(opts && opts.gain != null ? opts.gain : 1);
  const vis = cradle.visible01;
  const phase = cradle.phase;
  const bx = cradle.berthX, bz = cradle.berthZ;
  const R = cradle.radius;
  const ax = cradle.axisX, az = cradle.axisZ;

  // Phase brightness: corridor is a soft guide, capture pulses with the lock, berthed holds solid.
  let level = phase === 'capture' ? 0.62 : phase === 'berthed' ? 0.95 : 0.42;
  let pulse = 1;
  if (phase === 'capture' && !reducedMotion) {
    pulse = 0.82 + 0.18 * Math.sin(cradle.pulseT * 7.2);
  }
  const master = level * vis * gain * pulse;
  // Holo green — reads as station tech, deliberately not the cyan of the player's own tools.
  const cr = 0.30, cg = 1.0, cb = 0.52;

  let emitted = 0;
  // --- Pad ring: thin annulus just inside the lane edge. -------------------------------
  const ringR = R, ringW = Math.max(0.5, R * 0.045);
  for (let s = 0; s < RING_SEGMENTS; s++) {
    const a0 = (s / RING_SEGMENTS) * Math.PI * 2;
    const a1 = ((s + 1) / RING_SEGMENTS) * Math.PI * 2;
    emitted = emitQuad(out, emitted,
      bx + Math.cos(a0) * ringR, bz + Math.sin(a0) * ringR,
      bx + Math.cos(a1) * ringR, bz + Math.sin(a1) * ringR,
      ringW, y, cr * master, cg * master, cb * master);
  }
  // --- Acquisition brackets: four short arcs at 45° that slowly sweep when not reduced. --
  const sweep = reducedMotion ? Math.PI / 4 : cradle.pulseT * 0.5;
  const brkR = R * 0.62, brkLen = 0.42; // arc length in radians
  for (let k = 0; k < BRACKET_COUNT; k++) {
    const base = sweep + (k / BRACKET_COUNT) * Math.PI * 2;
    emitted = emitQuad(out, emitted,
      bx + Math.cos(base) * brkR, bz + Math.sin(base) * brkR,
      bx + Math.cos(base + brkLen) * brkR, bz + Math.sin(base + brkLen) * brkR,
      Math.max(0.6, R * 0.06), y + 0.02, cr * master * 1.25, cg * master * 1.25, cb * master * 1.25);
  }
  // --- Inbound chevrons: three arrows along the outbound axis pointing at the pad. ------
  for (let k = 0; k < CHEVRON_COUNT; k++) {
    const d = R + 4 + k * (R * 0.42 + 3);
    const cx = bx + ax * d, cz = bz + az * d;
    const size = Math.max(1.4, R * 0.16) * (1 - k * 0.16);
    const fade = master * (1 - k * 0.24);
    // Apex points INBOUND (-axis): two arms back along ±45°.
    const tipX = cx - ax * size * 0.5, tipZ = cz - az * size * 0.5;
    const backX = cx + ax * size * 0.5, backZ = cz + az * size * 0.5;
    const sx = -az, sz = ax; // lateral
    emitted = emitQuad(out, emitted, tipX, tipZ, backX + sx * size, backZ + sz * size,
      0.45, y, cr * fade, cg * fade, cb * fade);
    emitted = emitQuad(out, emitted, tipX, tipZ, backX - sx * size, backZ - sz * size,
      0.45, y, cr * fade, cg * fade, cb * fade);
  }
  // --- Center pip: small ring marking the settle point. --------------------------------
  const pipR = Math.max(1.6, R * 0.14);
  for (let s = 0; s < 8; s++) {
    const a0 = (s / 8) * Math.PI * 2, a1 = ((s + 1) / 8) * Math.PI * 2;
    emitted = emitQuad(out, emitted,
      bx + Math.cos(a0) * pipR, bz + Math.sin(a0) * pipR,
      bx + Math.cos(a1) * pipR, bz + Math.sin(a1) * pipR,
      0.4, y + 0.03, cr * master * 1.3, cg * master * 1.3, cb * master * 1.3);
  }
  out.indexCount = emitted * 6;
  return out;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp01(value) {
  return clamp(value, 0, 1);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}
function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(finite(value, min))));
}
