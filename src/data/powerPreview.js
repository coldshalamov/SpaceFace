// Row 493 (CRAFT-POWERS): the held-key preview — a pure plan naming every body a held power
// would move and the direction it would go, one colour each. The render presenter draws the
// outline; this file only resolves the truth, so it stays deterministic and testable.
import { POWER_VERBS, resolveRigTarget } from '../systems/powerVerbs.js';

/** Per-power preview tint (05 §7.2 — the same colour the rail and Cluster use). */
export const POWER_PREVIEW_TINT = Object.freeze({
  pull: 'amber', shove: 'red', pin: 'blue', bomb: 'orange', rig: 'white',
});

/** Reach each power affects around the player's ship (matches the power kernels' own bands). */
export const POWER_PREVIEW_RANGE = Object.freeze({
  pull: 420, shove: 300, pin: 520, bomb: 340, rig: 640,
});

const SHOVE_CONE_COS = 0.55; // ~57° forward cone, matching the impulse-charge fan

/** The power currently held, or null. `state.input.actions[p].held` is the merged hold flag. */
export function powerHeld(state) {
  const acts = state && state.input && state.input.actions;
  if (!acts) return null;
  for (const p of POWER_VERBS) {
    const a = acts[p];
    if (a && (a.held === true || a === true)) return p;
  }
  return null;
}

function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function pushMove(out, e, dirX, dirZ, len) {
  const n = Math.hypot(dirX, dirZ) || 1;
  out.push({ id: e.id, x: e.pos.x, z: e.pos.z, radius: Number(e.radius) || 10,
    toX: e.pos.x + (dirX / n) * len, toZ: e.pos.z + (dirZ / n) * len });
}

/**
 * The preview plan for the held power: `{ power, tint, center, radius, moves }` or null.
 * `moves` lists {id, x, z, radius, toX, toZ} — outline at (x,z), predicted path to (toX,toZ).
 * Deterministic: entity iteration order and distance-sorted output, no rng.
 */
export function powerPreviewPlan(state, power) {
  const p = power === undefined ? powerHeld(state) : power;
  if (!p || !POWER_VERBS.includes(p)) return null;
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return null;
  const center = { x: player.pos.x, z: player.pos.z };
  const moves = [];
  const range = POWER_PREVIEW_RANGE[p];
  const rangeSq = range * range;
  const yaw = Number(player.yaw) || 0;
  const fwdX = Math.cos(yaw), fwdZ = Math.sin(yaw);

  if (p === 'rig') {
    const rig = resolveRigTarget(state);
    if (rig && rig.pos) {
      moves.push({ id: rig.id, x: rig.pos.x, z: rig.pos.z, radius: Number(rig.radius) || 12,
        toX: center.x, toZ: center.z });
    }
  } else {
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || e === player || !e.pos || e.id === state.playerId) continue;
      if (e.alive === false) continue;
      const d = dist2(e.pos, center);
      if (d > rangeSq) continue;
      const dx = e.pos.x - center.x, dz = e.pos.z - center.z;
      const dn = Math.sqrt(d) || 1;
      if (p === 'pull') pushMove(moves, e, -dx, -dz, Math.min(dn * 0.5, 160));
      else if (p === 'shove') {
        // forward cone only — bodies behind the hull are not in the shove fan
        if ((dx * fwdX + dz * fwdZ) / dn < SHOVE_CONE_COS) continue;
        pushMove(moves, e, dx, dz, 220);
      } else if (p === 'pin') pushMove(moves, e, 0, 0, 0);       // pin holds: path length zero = anchored
      else if (p === 'bomb') pushMove(moves, e, dx, dz, 180);    // radial blast away
    }
    moves.sort((a, b) => (a.id - b.id));
    moves.splice(24); // the preview highlights the 24 closest candidates, never the whole field
  }
  return Object.freeze({ power: p, tint: POWER_PREVIEW_TINT[p], center, radius: range, moves: Object.freeze(moves) });
}
