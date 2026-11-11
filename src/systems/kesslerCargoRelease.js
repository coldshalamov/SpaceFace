// A stopped pilot can set their own freight down on the existing open scale deck.
// Cargo remains the writer. This read never spawns, moves, weighs or collects a body.
import { KESSLER_SCALE } from '../data/kessler.js';
import { kesslerPadPosition } from './kesslerScaleWorksite.js';

export function kesslerCargoRelease(state, player, radius, clearance, count = 1, firstSlot = 0) {
  if (!state || state.mode !== 'flight' || state.ui?.docked || state.player?.flags?.docked
      || state.physicsVenue?.active || !['adventure', 'campaign', undefined, null, ''].includes(state.run?.kind)
      || state.world?.currentSectorId !== KESSLER_SCALE.sectorId
      || !player?.alive || state.entities?.get(state.playerId) !== player
      || ![player.pos?.x, player.pos?.z, player.vel?.x, player.vel?.z, player.radius, radius, clearance].every(Number.isFinite)
      || player.radius < 0 || radius <= 0 || clearance < 0
      || Math.hypot(player.vel.x, player.vel.z) > 2) return null;
  const pad = kesslerPadPosition(), reach = player.radius + radius + clearance;
  // Keep the whole hull-side release and its two-second pickup embargo inside the
  // open measuring volume, irrespective of facing. Tight/oversized approaches refuse
  // rather than silently turning an expected gentle release into a fast dump.
  const distance = Math.hypot(player.pos.x - pad.x, player.pos.z - pad.z);
  if (distance > KESSLER_SCALE.padRadius) return null;
  if (distance + reach + radius + 10 > KESSLER_SCALE.padRadius) return { blocked: true, reason: 'clearance' };
  if (!Number.isSafeInteger(count) || count < 1 || count > 17
    || !Number.isSafeInteger(firstSlot) || firstSlot < 0 || firstSlot >= count) return { blocked: true };
  const rot = Number.isFinite(player.rot) ? player.rot : 0;
  const fx = Math.cos(rot), fz = Math.sin(rot);
  // Mixed rich/plain lots remain distinct pods. Fan them beside the aft release,
  // never at a common point or at the scale center. All slots are checked before
  // the cargo owner removes a single unit. Before each admission the owner checks
  // the remaining slots again, after synchronous cargo/spawn callbacks have run.
  // A tiny extra gap keeps diagonal world-coordinate roundoff from
  // making an already admitted neighbor appear inside the exact clearance edge.
  const spacing = radius * 2 + clearance + 1e-4;
  const positions = Array.from({ length: count }, (_, i) => {
    const across = (i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1)) * spacing;
    return { x: player.pos.x - fx * reach - fz * across, z: player.pos.z - fz * reach + fx * across };
  });
  const bodies = [...(state.entityList || []), ...(state.world?.dressing?.rows || [])];
  const blocked = positions.slice(firstSlot).some(pos => Math.hypot(pos.x - pad.x, pos.z - pad.z) + radius + 10 > KESSLER_SCALE.padRadius
    || bodies.some(e => e && e !== player && e.alive !== false && e.physicsBody !== false
      && (e.collides !== false || e.data?.jettisonedCargo === true)
      && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z) && Number.isFinite(e.radius) && e.radius > 0
      && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + radius + clearance));
  return { blocked, positions, ejectSpeed: 2 };
}
