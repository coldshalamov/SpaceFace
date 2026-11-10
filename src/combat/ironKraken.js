import { ironKrakenProfileFor } from '../data/ironKraken.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const ease = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };

/**
 * A bounded swimming intent for the score's harmless intervals. World velocity is a request,
 * never a transform write. The held first second leaves the aperture punishable; the final
 * half second brakes before a new warning so its locked footprint does not trail a moving hull.
 * A missing old-save recovery record conservatively holds still until the next authored beat.
 */
export function ironKrakenTransitMotion(record, observation, tuning) {
  const boss = observation?.boss, target = observation?.target;
  const heading = record.recovery?.heading ?? boss?.rot ?? 0;
  const held = { forward: 0, brake: true, heading };
  if (!boss || !target || boss.disabled?.includes('subsystem_drive')
    || boss.disabled?.includes('subsystem_sensor')
    || boss.disabled?.includes('subsystem_power')
    || boss.blockedActionTags?.some(tag => tag === 'dash' || tag === 'sling')) return held;
  if (!['intro', 'transition', 'recovery'].includes(record.phase)) return held;
  const remaining = record.nextAt - record.clock;
  if (remaining <= 0) return held;
  let wake = 1;
  if (record.phase === 'recovery') {
    if (!record.recovery || record.clock < record.recovery.startedAt + tuning.recoveryHoldTicks) return held;
    wake = ease((record.clock - record.recovery.startedAt - tuning.recoveryHoldTicks) / 24);
  } else {
    wake = ease((record.clock - (record.phase === 'intro' ? 0 : record.actStartedAt)) / 24);
  }
  const settle = ease((remaining - tuning.settleTicks) / 24);
  const strength = wake * settle;
  if (strength <= 0) return held;
  const dx = target.pos.x - boss.pos.x, dz = target.pos.z - boss.pos.z;
  const distance = Math.hypot(dx, dz);
  const aim = distance > 1e-6 ? Math.atan2(dz, dx) : heading;
  const desiredRange = Math.max(tuning.preferredRange, (boss.radius + (target.radius || 0)) * 1.8);
  const radial = clamp((distance - desiredRange) / (desiredRange * .7), -.6, 1) * tuning.approachSpeed;
  // The broad lateral swim fades out on a distant approach and changes handedness by act,
  // not every frame. Even when the pilot holds still, the body explores a readable arc.
  const orbit = tuning.orbitSpeed * Math.max(0, 1 - Math.abs(distance - desiredRange) / (desiredRange * 1.5))
    * record.mirror * (record.actIndex === 1 ? -1 : 1);
  const c = Math.cos(aim), s = Math.sin(aim);
  return { forward: 0, brake: false, heading: aim,
    velocity: { x: (c * radial - s * orbit) * strength, z: (s * radial + c * orbit) * strength } };
}

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
