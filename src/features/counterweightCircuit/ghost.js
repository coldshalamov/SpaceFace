// Counterweight Circuit — personal-best ghost: bounded recording, decimation
// and presentation-only playback for the PLAYER SHIP ONLY.
//
// Hard contract:
//   • one best record per event — no global history, no leaderboard;
//   • ≤ GHOST_MAX_SAMPLES samples at ≤ GHOST_SAMPLE_HZ, decimated for long runs
//     with start/end/key events preserved;
//   • playback is a pure projection — it supplies poses to a muted presentation
//     mesh and NEVER supplies forces, collisions or success events;
//   • opt-in, and suppressed under reduced-motion unless explicitly allowed.

import { GHOST_MAX_SAMPLES, GHOST_SAMPLE_HZ } from './definition.js';

export const GHOST_VERSION = 1;
const SAMPLE_DT = 1 / GHOST_SAMPLE_HZ;
const KEY_KINDS = { attach: 1, release: 2, seat: 3, damage: 4, swing: 5, gate: 6 };

export const GHOST_MAX_MARKS = 256;

/** Online bounded recording. Times supplied by the sim are absolute; the first
 * sampled pose establishes the attempt timeline used by playback. */
export function createGhostRecorder(eventId, startPos, startRot = 0) {
  let points = [], marks = [], firstTime = null, lastSampleAt = -Infinity;
  let interval = SAMPLE_DT, invalid = false;
  const origin = { x: startPos ? startPos.x : 0, z: startPos ? startPos.z : 0 };
  const marked = new Set();

  function compact() {
    const protectedIndices = new Set([0, points.length - 1, ...marks.map(m => m.i)]);
    const kept = [], remap = new Map();
    let ordinary = 0;
    for (let i = 0; i < points.length; i++) {
      if (protectedIndices.has(i) || ordinary++ % 2 === 0) {
        remap.set(i, kept.length); kept.push(points[i]);
      }
    }
    if (kept.length === points.length) { invalid = true; return false; }
    marks = marks.map(m => ({ ...m, i: remap.get(m.i) }));
    points = kept; interval *= 2;
    return true;
  }
  function push(t, pos, rot) {
    if (invalid || !pos || !Number.isFinite(t) || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
    if (firstTime == null) firstTime = t;
    const elapsed = t - firstTime;
    if (elapsed < 0 || (points.length && Math.round(elapsed * 1000) < points.at(-1)[0])) { invalid = true; return false; }
    if (points.length >= GHOST_MAX_SAMPLES && !compact()) return false;
    points.push([Math.round(elapsed * 1000), Math.round((pos.x-origin.x)*100),
      Math.round((pos.z-origin.z)*100), ((Math.round((rot || 0)*128/Math.PI)%256)+256)%256]);
    return true;
  }
  return {
    sample(t, pos, rot) {
      if (!pos || invalid || !Number.isFinite(t)) return;
      if (t - lastSampleAt + 1e-9 < interval) return;
      if (push(t, pos, rot)) lastSampleAt = t;
    },
    // Repeated notices for the same semantic leg/role are one key event.
    mark(kind, pos, rot, t, role = '') {
      if (!Object.hasOwn(KEY_KINDS, kind) || invalid) return;
      const boundedRole = String(role).slice(0, 64);
      const semanticKey = `${kind}:${boundedRole}`;
      if (marked.has(semanticKey)) return;
      if (marks.length >= GHOST_MAX_MARKS) { invalid = true; return; }
      if (push(t, pos, rot)) {
        marked.add(semanticKey);
        marks.push({ i: points.length - 1, kind, ...(boundedRole ? { role: boundedRole } : {}) });
      }
    },
    end(endPos, endRot, t) {
      if (invalid || !push(t, endPos, endRot) || points.length < 2) return null;
      const samples = points.flat();
      return { version: GHOST_VERSION, eventId,
        origin: { x: Math.round(origin.x*100)/100, z: Math.round(origin.z*100)/100 },
        durationS: samples[samples.length-4]/1000, samples, marks: marks.map(m => ({...m})) };
    },
  };
}

/** Offline helper retains start, end and marked samples. Returns no tape if the
 * semantic keys alone exceed the budget; callers must not silently lose them. */
export function decimateGhostSamples(samples, marks, maxSamples = GHOST_MAX_SAMPLES) {
  const count = Math.floor(samples.length / 4);
  if (count <= maxSamples) return samples.slice();
  const keep = new Set([0, count - 1]);
  for (const m of marks || []) if (m.i >= 0 && m.i < count) keep.add(m.i);
  if (keep.size > maxSamples) return null;
  const slots = maxSamples - keep.size;
  const candidates = [];
  for (let i=0; i<count; i++) if (!keep.has(i)) candidates.push(i);
  for (let k=0; k<slots; k++) keep.add(candidates[Math.floor(k*candidates.length/slots)]);
  return [...keep].sort((a,b)=>a-b).flatMap(i=>samples.slice(i*4,i*4+4));
}

/** Sample i of a stored ghost → {t, x, z, rot} in world units. */
export function ghostSampleAt(ghost, i, out = { t: 0, x: 0, z: 0, rot: 0 }) {
  const s = ghost.samples, o = i * 4;
  out.t = s[o] / 1000;
  out.x = ghost.origin.x + s[o + 1] / 100;
  out.z = ghost.origin.z + s[o + 2] / 100;
  out.rot = s[o + 3] * Math.PI / 128;
  return out;
}

/**
 * Pure playback: interpolate the recorded ship pose at time t. Returns null
 * outside the recorded window. This is ALL a ghost can ever produce — a pose.
 * It is consumed by the presentation mesh and by nothing else.
 */
export function ghostPoseAt(ghost, t, out = { x: 0, z: 0, rot: 0 }) {
  if (!ghost || !Array.isArray(ghost.samples) || ghost.samples.length < 8) return null;
  const count = Math.floor(ghost.samples.length / 4);
  const tMs = t * 1000;
  const s = ghost.samples;
  if (tMs < s[0] || tMs > s[(count - 1) * 4]) return null;
  // Binary search for the enclosing sample pair.
  let lo = 0, hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid * 4] <= tMs) lo = mid; else hi = mid;
  }
  const a = lo * 4, b = hi * 4;
  const span = s[b] - s[a];
  const f = span > 0 ? (tMs - s[a]) / span : 0;
  out.x = ghost.origin.x + (s[a + 1] + (s[b + 1] - s[a + 1]) * f) / 100;
  out.z = ghost.origin.z + (s[a + 2] + (s[b + 2] - s[a + 2]) * f) / 100;
  let dr = s[b + 3] - s[a + 3];
  if (dr > 128) dr -= 256; else if (dr < -128) dr += 256;
  out.rot = (s[a + 3] + dr * f) * Math.PI / 128;
  return out;
}

/** Validate/normalize a stored ghost record (persistence boundary). */
export function normalizeGhost(raw, eventId) {
  if (!raw || typeof raw !== 'object' || raw.version !== GHOST_VERSION) return null;
  if (typeof raw.eventId !== 'string' || raw.eventId !== eventId) return null;
  const s = raw.samples;
  if (!Array.isArray(s) || s.length < 8 || s.length % 4 !== 0 || s.length / 4 > GHOST_MAX_SAMPLES) return null;
  if (!s.every((v) => Number.isFinite(v))) return null;
  const origin = raw.origin;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  if (Array.isArray(raw.marks) && raw.marks.length > GHOST_MAX_MARKS) return null;
  for (let i = 4; i < s.length; i += 4) if (s[i] < s[i - 4]) return null;
  const sourceMarks = Array.isArray(raw.marks) ? raw.marks : [];
  if (sourceMarks.some(m => !m || !Number.isInteger(m.i) || m.i < 0
    || m.i >= s.length / 4 || !Object.hasOwn(KEY_KINDS, m.kind))) return null;
  const marks = sourceMarks.map(m => ({ i:m.i, kind:m.kind,
    ...(typeof m.role === 'string' ? { role:m.role.slice(0, 64) } : {}) }));
  // Older candidate tapes used absolute sim time. Preserve their poses while
  // migrating the timeline to the relative playback contract.
  const base = s[0];
  const samples = s.slice();
  for (let i = 0; i < samples.length; i += 4) samples[i] -= base;
  return {
    version: GHOST_VERSION, eventId,
    origin: { x: origin.x, z: origin.z },
    durationS: Math.max(0, samples[samples.length - 4] / 1000),
    samples, marks,
  };
}

/** Reduced-motion gate: ghost playback is suppressed unless explicitly allowed. */
export function ghostAllowed(settings, reducedMotion) {
  if (!settings || settings.ghostEnabled !== true) return false;
  if (reducedMotion === true && settings.ghostReduceMotion !== true) return false;
  return true;
}
