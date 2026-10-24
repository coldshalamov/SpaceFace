/** DOCKET pure rules: the delivery latch, the approach trim, the register lint. No state, no
 * events, no randomness. Shared by the live system and its tests. */
import { DOCKET as C } from '../data/docket.js';

export const finiteXZ = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const speedOf = e => (finiteXZ(e?.vel) ? Math.hypot(e.vel.x, e.vel.z) : Infinity);

// ---------- the register lint -------------------------------------------------------------
// Shipping paperwork: a stamp or a log line, never a feeling named aloud. 'thank' and 'please'
// stay legal — on a Fulfillment manifest they are courtesy stamps, not emotional states.
const FORBIDDEN = ['feel', 'felt', 'sorry', 'sad', 'happy', 'glad', 'afraid', 'fear', 'scared', 'angry', 'mad',
  'love', 'hate', 'hope', 'wish', 'proud', 'ashamed', 'shame', 'guilt', 'lonely', 'alone', 'regret', 'grief',
  'mourn', 'sadly', 'unfortunately', 'ironic', 'ironically', 'funny', 'joke', 'lol', 'haha'];
const FORBIDDEN_RE = new RegExp(`\\b(?:${FORBIDDEN.join('|')})\\b`, 'i');

/** Returns the list of register violations in a line (empty array = the line passes). */
export function violatesRegister(text) {
  const out = [];
  if (typeof text !== 'string' || !text.trim()) return ['empty'];
  if (/[!?]/.test(text)) out.push('exclamation-or-question');
  if (/\.{3}|…/.test(text)) out.push('ellipsis');
  if (/[-🿿☀-➿]/u.test(text)) out.push('emoji');
  const bad = text.match(FORBIDDEN_RE);
  if (bad) out.push(`forbidden-word:${bad[0].toLowerCase()}`);
  if (text.length > 260) out.push('too-long');
  return out;
}

// ---------- the delivery latch ------------------------------------------------------------
/** The parcel is delivered when it is inside the cradle AND at rest there. A fast pass through
 * the ring is transit, not delivery — the sim grants the latch only to what stops. */
export function deliveryCheck(body, depot = C.depot) {
  const speed = speedOf(body);
  const inZone = !!(finiteXZ(body?.pos) && distanceXZ(body.pos, depot) <= C.depotRadius);
  return { speed, inZone, arrived: inZone && speed <= C.arriveSpeed };
}

/** True while the body is inside the approach shelf but not yet parked — where the drone trims
 * its own final approach toward the address. */
export function inApproachShelf(body, depot = C.depot) {
  return !!(finiteXZ(body?.pos) && distanceXZ(body.pos, depot) <= C.approachShelf);
}

/** Bounded critically-damped servo. Returns a delta-v (never a position write) or null. The
 * approach trim and the anchor homing share it; caps differ per caller. */
export function boundedServo(entity, goal, dt, out = {}, accelCap, speedCap) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(entity?.vel) || !finiteXZ(goal)
      || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return null;
  let ax = (goal.x - entity.pos.x) * 1.7 - entity.vel.x * 2.4;
  let az = (goal.z - entity.pos.z) * 1.7 - entity.vel.z * 2.4;
  const n = Math.hypot(ax, az), scale = n > accelCap ? accelCap / n : 1;
  ax *= scale; az *= scale;
  let vx = entity.vel.x + ax * dt, vz = entity.vel.z + az * dt;
  const vn = Math.hypot(vx, vz);
  if (vn > speedCap) { const k = speedCap / vn; vx *= k; vz *= k; }
  out.x = vx - entity.vel.x; out.z = vz - entity.vel.z;
  return out;
}

/** The attachment kernel is authoritative for "the player holds a line on this body". */
export function playerHoldsLine(state, body) {
  const rows = state?.combat?.attachments?.byId;
  const player = state?.entities?.get(state.playerId);
  if (!rows || !body?.alive || !player?.alive || state.entities.get(body.id) !== body) return false;
  for (const key of Object.keys(rows)) {
    const a = rows[key];
    if (a?.state === 'active' && a.ownerId === state.playerId && a.targetId === body.id) return true;
  }
  return false;
}
