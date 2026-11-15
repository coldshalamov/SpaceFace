// THROW-01 — GRIP GRACE. The body on the player's Line is the player's weapon: it must not evaporate
// from incidental splash before the throw. Incidental damage (explosions, cook-offs, charge darts,
// status ticks) on the held body takes the hammer scale (15%, capped at 20% of what it has left per
// hit); for the first GRIP_GRACE_TICKS after a latch nothing at all can drop it below 1 hull. Direct
// aimed gunfire is otherwise unchanged. Pure and deterministic: ticks and entity fields only.
import { massline2Flag } from '../data/featureFlags.js';

export const GRIP_GRACE_TICKS = 72;                 // 1.2 s at 60 Hz
export const GRIP_INCIDENTAL_SCALE = 0.15;
export const GRIP_INCIDENTAL_MAX_SHARE = 0.2;
export const INCIDENTAL_ORIGIN_KINDS = new Set([
  'detonator_dart', 'light_cookoff', 'impulse_charge', 'status', 'arc_wire',
]);

export function isHeldBody(state, target) {
  const t = state && state.player && state.player.tether;
  return !!(target && t && t.active && t.targetId === target.id && target.id !== state.playerId
    && massline2Flag('throw'));
}

/** Multiplier (0..1) for a damage packet of `rawTotal` aimed at `target`. 1 = untouched. */
export function heldBodyGripFactor(state, target, origin, rawTotal) {
  if (!(rawTotal > 0) || !isHeldBody(state, target)) return 1;
  const left = Math.max(0, (Number(target.hull) || 0) + (Number(target.shield) || 0));
  let allowed = rawTotal;
  if (origin && INCIDENTAL_ORIGIN_KINDS.has(origin.kind)) {
    allowed = Math.min(allowed * GRIP_INCIDENTAL_SCALE, left * GRIP_INCIDENTAL_MAX_SHARE);
  }
  const latched = Number(state.player.tether.latchedTick);
  if (Number.isFinite(latched) && state.tick - latched < GRIP_GRACE_TICKS) {
    allowed = Math.min(allowed, Math.max(0, left - 1));
  }
  return Math.max(0, Math.min(1, allowed / rawTotal));
}
