// THROW-01 PLOUGH - a thrown body is a club that carries through a pack. From the moment the line lets
// go until it slows below PLOUGH_MIN_SPEED (or PLOUGH_FLIGHT_TICKS pass) the body takes the hammer-rule
// self-damage reduction so it survives its own impacts, and each kill it makes costs it a share of its
// speed, so a good throw through a pack takes a few hulls and a heavy body more. Struck bodies keep
// their normal bowling-pin fling. Deterministic: ticks and entity fields only; the record lives in the
// sim-only state.massline2.plough subtree (outside the snapshot whitelist and the save schema).
//
// PLOUGH-02 - the two edges of that carry, both measured on the real Rapier path before they were
// written (the traces are in the packet's receipt):
//
//   1. A hit on a body much heavier than the throw SPENDS the carry. The hand-back used to
//      re-accelerate a thrown Wasp straight back into whatever had stopped it: against a 2000-mass
//      capital hull (125x the 16-mass Wasp) the club met it at 150 WU/s, the carry took it back to
//      200 - its full throw speed - and it drove itself out the far side over 14 contacts. Speed
//      lost to a body you could never move is not speed to hand back, so once a heavy body has
//      stopped a ploughing body the carry is spent for the rest of the window. The plough itself
//      stays: the hammer-rule protection is the plough's own promise that a thrown body survives
//      its impacts, and a light thrown at a capital may still live and be thrown again.
//   2. The plough never accelerates a body back toward the THROWER. The hand-back pushes along the
//      body's own post-contact heading, so a rebound got its speed restored along a line that
//      pointed at the pilot: measured off a 400-mass body (25x - under the heavy ratio, so the
//      carry survives the hit) the club bounced at 164.6 WU/s and the carry took it to 199.98,
//      closing on the pilot at 48 WU/s. A body whose heading carries it at its thrower keeps
//      exactly what the bounce gave it.
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export const PLOUGH_FLIGHT_TICKS = 90;      // 1.5 s at 60 Hz
export const PLOUGH_MIN_SPEED = 40;         // WU/s: below this the throw is spent
export const PLOUGH_KILL_SPEED_COST = 0.30; // share of speed lost per kill
// A body this many times heavier than the thrown one cannot be ploughed through. 50x is the
// packet's own example (a boss-mass body): a thrown 16-mass Wasp keeps its carry off a 400-mass
// body (25x) and spends it against a 2000-mass capital hull (125x), a 36-t monolith or a station.
export const PLOUGH_HEAVY_MASS_RATIO = 50;
// Surface gap that still counts as being in contact with that heavy body. The solver resolves
// contacts inside this pad; beyond it the two bodies are merely near each other.
export const PLOUGH_CONTACT_PAD = 4;
// A kill can be published a tick or two after the contact that caused it (deferred craft contacts
// resolve at the tail of the tick or on the next one), so a kill this recent is still "this hit".
export const PLOUGH_KILL_GRACE_TICKS = 2;

function subtree(state) {
  const root = state.massline2 || (state.massline2 = {});
  return root.plough || (root.plough = {
    prevHeld: null, released: {}, speed: {}, spent: {}, killedAt: {},
  });
}

function entityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const direct = state.entities.get(id);
  if (direct) return direct;
  const numeric = Number(id);
  return Number.isNaN(numeric) ? null : state.entities.get(numeric) || null;
}

function planarSpeed(body) {
  return body && body.vel ? Math.hypot(Number(body.vel.x) || 0, Number(body.vel.z) || 0) : 0;
}

/** True while a live body at least PLOUGH_HEAVY_MASS_RATIO heavier is touching `body`. */
function heavyBodyInReach(state, body) {
  const mass = Number(body && body.mass) || 0;
  if (!(mass > 0)) return false;
  const list = Array.isArray(state.entityList) ? state.entityList : null;
  if (!list) return false;
  const limit = mass * PLOUGH_HEAVY_MASS_RATIO;
  const reach = (Number(body.radius) || 0) + PLOUGH_CONTACT_PAD;
  const bx = Number(body.pos && body.pos.x) || 0;
  const bz = Number(body.pos && body.pos.z) || 0;
  for (let i = 0; i < list.length; i++) {
    const other = list[i];
    if (!other || other === body || other.alive === false || other.collides === false) continue;
    if (!((Number(other.mass) || 0) >= limit)) continue;
    const dx = (Number(other.pos && other.pos.x) || 0) - bx;
    const dz = (Number(other.pos && other.pos.z) || 0) - bz;
    const gap = reach + (Number(other.radius) || 0);
    if (dx * dx + dz * dz <= gap * gap) return true;
  }
  return false;
}

/** True when the body's heading carries it at the body that threw it. */
function pointsAtThrower(body, thrower, vx, vz) {
  if (!thrower || !thrower.pos || !body || !body.pos) return false;
  const dx = (Number(thrower.pos.x) || 0) - (Number(body.pos.x) || 0);
  const dz = (Number(thrower.pos.z) || 0) - (Number(body.pos.z) || 0);
  return (vx * dx + vz * dz) > 0;
}

/** Call once per flight tick: marks a body as released the tick the player's line stops holding it. */
export function trackPloughReleases(state) {
  if (!state || !state.player) return;
  const t = state.player.tether;
  const held = t && t.active && t.targetId != null ? t.targetId : null;
  const rec = subtree(state);
  if (rec.prevHeld != null && rec.prevHeld !== held) {
    rec.released[rec.prevHeld] = state.tick;
    rec.speed[rec.prevHeld] = planarSpeed(entityById(state, rec.prevHeld));
    delete rec.spent[rec.prevHeld];
    delete rec.killedAt[rec.prevHeld];
  }
  if (held != null) {
    delete rec.released[held]; delete rec.speed[held]; delete rec.spent[held]; delete rec.killedAt[held];
  }
  rec.prevHeld = held;
  const thrower = entityById(state, state.playerId);
  // A ploughing body carries through its contacts: whatever speed a collision took is handed back,
  // up to the speed it was thrown at less what its kills cost it (see ploughKill). Heading is the
  // post-contact heading; nothing here aims the body.
  for (const id of Object.keys(rec.released)) {
    const body = entityById(state, id);
    if (!isPloughing(state, body)) continue;
    if (rec.spent[id]) continue;
    const vx = Number(body.vel.x) || 0, vz = Number(body.vel.z) || 0;
    const cur = Math.hypot(vx, vz), want = Number(rec.speed[id]) || 0;
    // Nothing took its speed this tick, so there is no carry to hand back. This gate is also what
    // keeps the heavy-body scan below off the open-flight path: it only runs on a tick where a
    // contact actually cost the body speed.
    if (!(want > 0) || !(cur < want)) continue;
    // PLOUGH-02 edge 1: something far heavier than the thrown body is what took that speed. Speed
    // lost to a body you could never move is not handed back, for the rest of the throw - unless
    // that contact was a kill (a kill is what the carry is for, and it already costs 30%).
    const killedAt = Number(rec.killedAt[id]);
    const killThisHit = Number.isFinite(killedAt) && state.tick - killedAt <= PLOUGH_KILL_GRACE_TICKS;
    if (!killThisHit && heavyBodyInReach(state, body)) {
      rec.spent[id] = true;
      delete rec.speed[id];
      continue;
    }
    if (!(cur > 1e-6)) continue;
    // PLOUGH-02 edge 2: the body is on its way back at the pilot. Handing back speed along that
    // heading would only drive it at them harder, so a rebound keeps exactly what it bounced with.
    if (pointsAtThrower(body, thrower, vx, vz)) continue;
    const m = Number(body.mass) || 0;
    queuePhysicsImpulse(body, { x: (vx / cur) * (want - cur) * m, z: (vz / cur) * (want - cur) * m },
      { tag: 'plough_carry', tick: state.tick, externalEffect: true });
  }
}

/** A kill by a ploughing body costs it a share of the speed it is allowed to carry. */
export function ploughKill(state, body) {
  const rec = state && state.massline2 && state.massline2.plough;
  if (!rec || !body || rec.speed[body.id] == null) return;
  rec.speed[body.id] *= (1 - PLOUGH_KILL_SPEED_COST);
  if (!rec.killedAt) rec.killedAt = {};
  rec.killedAt[body.id] = state.tick;
}

/** True while a released body is still ploughing (fast enough, inside the flight window). */
export function isPloughing(state, body) {
  if (!body || body.alive === false || !state || !state.massline2 || !state.massline2.plough) return false;
  const at = state.massline2.plough.released[body.id];
  if (at == null) return false;
  if (state.tick - at > PLOUGH_FLIGHT_TICKS) { delete state.massline2.plough.released[body.id]; return false; }
  const vx = Number(body.vel && body.vel.x) || 0, vz = Number(body.vel && body.vel.z) || 0;
  return Math.hypot(vx, vz) >= PLOUGH_MIN_SPEED;
}
