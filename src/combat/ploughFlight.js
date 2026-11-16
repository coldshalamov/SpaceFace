// THROW-01 PLOUGH - a thrown body is a club that carries through a pack. From the moment the line lets
// go until it slows below PLOUGH_MIN_SPEED (or PLOUGH_FLIGHT_TICKS pass) the body takes the hammer-rule
// self-damage reduction so it survives its own impacts, and each kill it makes costs it a share of its
// speed, so a good throw through a pack takes a few hulls and a heavy body more. Struck bodies keep
// their normal bowling-pin fling. Deterministic: ticks and entity fields only; the record lives in the
// sim-only state.massline2.plough subtree (outside the snapshot whitelist and the save schema).
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export const PLOUGH_FLIGHT_TICKS = 90;      // 1.5 s at 60 Hz
export const PLOUGH_MIN_SPEED = 40;         // WU/s: below this the throw is spent
export const PLOUGH_KILL_SPEED_COST = 0.30; // share of speed lost per kill

function subtree(state) {
  const root = state.massline2 || (state.massline2 = {});
  return root.plough || (root.plough = { prevHeld: null, released: {}, speed: {} });
}

/** Call once per flight tick: marks a body as released the tick the player's line stops holding it. */
export function trackPloughReleases(state) {
  if (!state || !state.player) return;
  const t = state.player.tether;
  const held = t && t.active && t.targetId != null ? t.targetId : null;
  const rec = subtree(state);
  if (rec.prevHeld != null && rec.prevHeld !== held) {
    rec.released[rec.prevHeld] = state.tick;
    const body = state.entities && state.entities.get && state.entities.get(rec.prevHeld);
    rec.speed[rec.prevHeld] = body && body.vel ? Math.hypot(Number(body.vel.x) || 0, Number(body.vel.z) || 0) : 0;
  }
  if (held != null) { delete rec.released[held]; delete rec.speed[held]; }
  rec.prevHeld = held;
  // A ploughing body carries through its contacts: whatever speed a collision took is handed back,
  // up to the speed it was thrown at less what its kills cost it (see ploughKill). Heading is the
  // post-contact heading; nothing here aims the body.
  for (const id of Object.keys(rec.released)) {
    const body = state.entities && state.entities.get && state.entities.get(Number.isNaN(Number(id)) ? id : Number(id)) || (state.entities && state.entities.get && state.entities.get(id));
    if (!isPloughing(state, body)) continue;
    const vx = Number(body.vel.x) || 0, vz = Number(body.vel.z) || 0, cur = Math.hypot(vx, vz), want = rec.speed[id] || 0;
    if (cur > 1e-6 && cur < want) {
      const m = Number(body.mass) || 0;
      queuePhysicsImpulse(body, { x: (vx / cur) * (want - cur) * m, z: (vz / cur) * (want - cur) * m },
        { tag: 'plough_carry', tick: state.tick, externalEffect: true });
    }
  }
}

/** A kill by a ploughing body costs it a share of the speed it is allowed to carry. */
export function ploughKill(state, body) {
  const rec = state && state.massline2 && state.massline2.plough;
  if (!rec || !body || rec.speed[body.id] == null) return;
  rec.speed[body.id] *= (1 - PLOUGH_KILL_SPEED_COST);
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
