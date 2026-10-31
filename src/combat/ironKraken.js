import { ironKrakenProfileFor } from '../data/ironKraken.js';

/**
 * The aperture is a timed directional target on the existing head body. Only an actual
 * direct impact on its front can earn the bonus; an attacker standing in front, an AoE
 * centre, or a status tick cannot impersonate an aperture hit. No new collider is needed.
 */
export function ironKrakenCoreDamageMultiplier(state, target, input) {
  const p = ironKrakenProfileFor(target);
  const marker = target?.data?.ironKraken;
  if (!p || !marker || marker.variant !== p.variant || typeof marker.fightId !== 'string'
    || input?.attackerId == null || input.attackerId === target.id) return 1;
  const fight = state?.capitalBossEncounters?.fights?.[marker.fightId];
  if (!fight || fight.bossId !== target.id || fight.encounterId !== p.scoreId
    || fight.terminal || fight.suspended || fight.phase !== 'recovery') return 1;
  const packet = input.packet;
  const kind = input.origin?.kind;
  if ((kind !== 'weapon' && kind !== 'legacy') || !packet
    || packet.flags?.shieldOnly || packet.flags?.area || packet.flags?.splash
    || (packet.source?.kind && packet.source.kind !== 'weapon')) return 1;
  const pos = packet.hit?.pos;
  if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.z)
    || !Number.isFinite(target.pos?.x) || !Number.isFinite(target.pos?.z)
    || !Number.isFinite(target.rot)) return 1;
  const dx = pos.x - target.pos.x, dz = pos.z - target.pos.z;
  const c = Math.cos(target.rot), s = Math.sin(target.rot);
  const front = dx * c + dz * s, side = -dx * s + dz * c;
  // The visible frontal aperture spans the inner two-thirds of the mantle. A centre-only
  // or outside-the-hull report carries insufficient hit evidence and routes neutrally.
  if (front < p.coreRadius * 0.35 || Math.abs(side) > p.coreRadius * 0.66
    || dx * dx + dz * dz > (p.coreRadius * 1.3) ** 2) return 1;
  const approach = packet.hit?.approach;
  if (approach && (!Number.isFinite(approach.x) || !Number.isFinite(approach.z)
    || approach.x * c + approach.z * s >= -1e-6)) return 1;
  return p.coreDamageMultiplier;
}
