// Pure Massline swing-trace state and geometry writes.
//
// While a tethered body is being swung, this module keeps a small ring buffer of where that body
// has just been (world XZ) and writes a fading luminous ribbon through those positions. It is the
// swing's TRAIL — the arc the flail head has already swept — which is a different object from the
// release annulus (the predictor's "if you cut now" ring) and from any projectile trail.
//
// The module deliberately owns no Three.js objects and reads no GameState directly. The VFX
// adapter supplies presented anchor positions each frame and binds the returned typed arrays to a
// BufferGeometry once at init. Simulation, physics, and tether ownership stay with their modules.

const MAX_INDEXED_QUADS = 16383; // 4 vertices each, the Uint16 index ceiling.

export const MASSLINE_SWING_TRACE_CAPACITY = 96;
export const MASSLINE_SWING_TRACE_LIFE_S = 1.35;   // how long a swept point stays luminous
export const MASSLINE_SWING_TRACE_MIN_STEP_WU = 0.9; // ignore micro-samples; the trail is a sweep
// Below this tangential read the body is being towed, not swung — no arc to show.
export const MASSLINE_SWING_TRACE_MIN_TANGENTIAL = 12;

/** Allocate once at VFX init. Never call from the frame update. */
export function createMasslineSwingTrace(sampleCapacity = MASSLINE_SWING_TRACE_CAPACITY) {
  const capacity = clampInteger(sampleCapacity, 8, 512);
  return {
    capacity,
    // Ring buffer of world XZ samples, oldest → head.
    xs: new Float32Array(capacity),
    zs: new Float32Array(capacity),
    times: new Float32Array(capacity),
    head: 0,        // next write slot (oldest sample once full)
    count: 0,
    targetId: null,
    fade: 0,        // 1 while sampling; decays after release so the arc dissolves, not pops
  };
}

/** Forget a previous tether's trail. Called on latch/release/break/sector change. */
export function resetMasslineSwingTrace(trace) {
  if (!trace) return trace;
  trace.head = 0;
  trace.count = 0;
  trace.targetId = null;
  trace.fade = 0;
  return trace;
}

/**
 * Record the attached body's presented world position for this frame. Purely a ring-buffer
 * write; the caller decides when sampling is on (tether active + body swinging).
 */
export function pushMasslineSwingSample(trace, x, z, timeS) {
  if (!trace || !Number.isFinite(x) || !Number.isFinite(z)) return trace;
  const n = trace.count;
  if (n > 0) {
    const last = (trace.head + trace.capacity - 1) % trace.capacity;
    const dx = x - trace.xs[last];
    const dz = z - trace.zs[last];
    if (dx * dx + dz * dz < MASSLINE_SWING_TRACE_MIN_STEP_WU * MASSLINE_SWING_TRACE_MIN_STEP_WU) {
      // Body barely moved — refresh the newest sample's age instead of spending a slot, so a
      // nearly-stationary hold does not stack the whole buffer on one dot.
      trace.times[last] = finite(timeS, 0);
      return trace;
    }
  }
  trace.xs[trace.head] = x;
  trace.zs[trace.head] = z;
  trace.times[trace.head] = finite(timeS, 0);
  trace.head = (trace.head + 1) % trace.capacity;
  if (trace.count < trace.capacity) trace.count += 1;
  return trace;
}

/** Allocate the indexed quad pool. Indices are fixed; only positions/colors/draw count move. */
export function createMasslineSwingTraceGeometry(segmentCapacity = MASSLINE_SWING_TRACE_CAPACITY) {
  const capacity = clampInteger(segmentCapacity, 8, MAX_INDEXED_QUADS);
  const positions = new Float32Array(capacity * 4 * 3);
  const colors = new Float32Array(capacity * 4 * 3);
  const indices = new Uint16Array(capacity * 6);
  for (let segment = 0; segment < capacity; segment += 1) {
    const vertex = segment * 4;
    const offset = segment * 6;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 1;
    indices[offset + 2] = vertex + 2;
    indices[offset + 3] = vertex + 1;
    indices[offset + 4] = vertex + 3;
    indices[offset + 5] = vertex + 2;
  }
  return { segmentCapacity: capacity, positions, colors, indices, indexCount: 0 };
}

/**
 * Write the fading sweep ribbon. Each consecutive pair of samples becomes one quad perpendicular
 * to the local chord; brightness falls with sample age (oldest → invisible) and with the
 * post-release fade envelope. World-space XZ writes; the caller's mesh is frame-local via
 * frustumCulled=false, so no local conversion is needed here — same contract as the release arc.
 */
export function writeMasslineSwingTraceGeometry(out, trace, opts) {
  if (!out) return out;
  out.indexCount = 0;
  if (!out.segmentCapacity || !trace || trace.count < 2) return out;
  const nowS = finite(opts && opts.nowS, 0);
  const lifeS = Math.max(0.05, finite(opts && opts.lifeS, MASSLINE_SWING_TRACE_LIFE_S));
  const fade = clamp01(opts && opts.fade);
  if (!(fade > 0)) return out;
  const y = finite(opts && opts.y, 1.35);
  const width = Math.max(0.2, finite(opts && opts.width, 2.6));
  const gain = clamp01(opts && opts.brightness != null ? opts.brightness : 0.4);
  const colorR = finite(opts && opts.colorR, 0.49);
  const colorG = finite(opts && opts.colorG, 0.89);
  const colorB = finite(opts && opts.colorB, 1);

  const positions = out.positions;
  const colors = out.colors;
  const cap = Math.min(trace.count - 1, out.segmentCapacity);
  // Walk newest→oldest so a full buffer keeps the freshest arc when capacity clips.
  let emitted = 0;
  for (let k = 0; k < cap; k += 1) {
    const i1 = (trace.head - 1 - k + trace.capacity * 2) % trace.capacity;
    const i0 = (trace.head - 2 - k + trace.capacity * 2) % trace.capacity;
    const x0 = trace.xs[i0], z0 = trace.zs[i0];
    const x1 = trace.xs[i1], z1 = trace.zs[i1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    // Age of the segment's OLDER endpoint drives its brightness — the tail dies first.
    const age = nowS - trace.times[i0];
    const a = clamp01(1 - age / lifeS);
    if (a <= 0) continue;
    const px = (-dz / len) * width * 0.5;
    const pz = (dx / len) * width * 0.5;
    const g = a * a * fade * gain;
    const offset = emitted * 12;
    positions[offset] = x0 - px; positions[offset + 1] = y; positions[offset + 2] = z0 - pz;
    positions[offset + 3] = x0 + px; positions[offset + 4] = y; positions[offset + 5] = z0 + pz;
    positions[offset + 6] = x1 - px; positions[offset + 7] = y; positions[offset + 8] = z1 - pz;
    positions[offset + 9] = x1 + px; positions[offset + 10] = y; positions[offset + 11] = z1 + pz;
    // A soft core/sheath split across the width: inner vertices carry ~60% of the segment's
    // luminance so the trail reads as an energy wake, not a painted line.
    colors[offset] = colorR * g * 0.62; colors[offset + 1] = colorG * g * 0.62; colors[offset + 2] = colorB * g * 0.62;
    colors[offset + 3] = colorR * g; colors[offset + 4] = colorG * g; colors[offset + 5] = colorB * g;
    colors[offset + 6] = colorR * g * 0.62; colors[offset + 7] = colorG * g * 0.62; colors[offset + 8] = colorB * g * 0.62;
    colors[offset + 9] = colorR * g; colors[offset + 10] = colorG * g; colors[offset + 11] = colorB * g;
    emitted += 1;
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
