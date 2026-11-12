// Compose only the first ordinary Foundry Maw's existing finite ballast actors.
// This runs before issuance, never relocates a live body, and owns no reward or motion.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

const finitePose = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const solid = e => e?.alive !== false && (['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(e?.type)
  || (e?.physicsBody?.schemaVersion === 1 && e.physicsBody.material !== 'massline_sensor'));

export function planSwarmMawBallast(state, boss, encounter) {
  const run = state?.run;
  if (run?.kind !== 'survival' || run.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.wave !== 5 || run.arenaMutators?.length || run.telemetry?.circuit
    || encounter?.id !== 'capital_boss_hulk' || !boss?.alive || !finitePose(boss.pos)) return null;
  const player = state.entities?.get?.(state.playerId);
  if (!player?.alive || player === boss || !finitePose(player.pos)) return null;
  const offsets = encounter.score?.arena?.ballastOffsets;
  if (!offsets?.length) return null;
  const slots = [];
  const heading = Number.isFinite(boss.rot) ? boss.rot : 0, c = Math.cos(heading), s = Math.sin(heading);
  for (const actor of encounter.actors || []) {
    if (!actor || actor.role === 'capital_hull') continue;
    for (let index = 0; index < Math.max(1, actor.count || 1); index++) {
      const [x, z] = offsets[index % offsets.length];
      slots.push({ key: `${actor.role}/${index}`, radius: actor.radius || 12,
        throwable: actor.role === 'throw_mass' && actor.tetherable !== false && (actor.mass || 40) <= 220,
        proposed: { x: boss.pos.x + c * x - s * z, z: boss.pos.z + s * x + c * z } });
    }
  }
  const solids = [...state.entities.values()].filter(solid);
  const reserve = (slot, pos) => ({ alive: true, type: 'asteroid', pos, radius: slot.radius,
    vel: { x: 0, z: 0 } });
  const clear = (slot, pos, reserved) => swarmPlacementIsClear(state, pos, slot.radius,
    { clearance: 8, reserved, reservedClearance: 8 });
  function seat(slot, reserved) {
    if (clear(slot, slot.proposed, reserved)) return slot.proposed;
    // Nearby initial placement only. Do not search out to invisible kilometres.
    for (const radius of [24, 48, 72, 96]) for (let i = 0; i < 16; i++) {
      const angle = heading + i * Math.PI / 8;
      const pos = { x: slot.proposed.x + Math.cos(angle) * radius,
        z: slot.proposed.z + Math.sin(angle) * radius };
      if (clear(slot, pos, reserved)) return pos;
    }
    return null;
  }
  const dx = boss.pos.x - player.pos.x, dz = boss.pos.z - player.pos.z, distance = Math.hypot(dx, dz);
  const first = slots.find(slot => slot.throwable);
  const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (first && distance >= 215 && pilotRadius > 0) {
    const ux = dx / distance, uz = dz / distance;
    // When the pilot enters from outside the worn room, put the opportunity on
    // the approach to the Maw, not behind it. This is local clearance, not a
    // promise that the pilot can fly straight through intervening banks.
    const origins = [player.pos];
    if (distance > 335) origins.push({ x: boss.pos.x - ux * 220, z: boss.pos.z - uz * 220 });
    for (const origin of origins) {
    if (origin !== player.pos && !swarmPlacementIsClear(state, origin, pilotRadius, { clearance: 8 })) continue;
    for (const along of [70, 90, 50]) for (const side of [45, -45, 70, -70]) {
      const pos = { x: origin.x + ux * along - uz * side,
        z: origin.z + uz * along + ux * side };
      if (!clear(first, pos, [])) continue;
      // The whole ballast, not only a bullet, has an unobstructed initial route.
      if (solids.some(e => e !== player && e !== boss && sweptDiscsOverlap(pos, first.radius, e,
        { horizon: 1, clearance: 4, velocity: { x: boss.pos.x - pos.x, z: boss.pos.z - pos.z } }))) continue;
      // A pilot at this approach can catch without a bank across the line.
      if (solids.some(e => e !== player && sweptDiscsOverlap(origin, 2, e,
        { horizon: 1, clearance: 2, velocity: { x: pos.x - origin.x, z: pos.z - origin.z } }))) continue;
      const reserved = [reserve(first, pos)], result = { [first.key]: pos };
      for (const slot of slots) if (slot !== first) {
        const at = seat(slot, reserved); result[slot.key] = at;
        if (at) reserved.push(reserve(slot, at));
      }
      // Later seats must not close the route just proven against the old room.
      if (reserved.slice(1).some(e => sweptDiscsOverlap(pos, first.radius, e,
        { horizon: 1, clearance: 4, velocity: { x: boss.pos.x - pos.x, z: boss.pos.z - pos.z } })
        || sweptDiscsOverlap(origin, 2, e, { horizon: 1, clearance: 2,
          velocity: { x: pos.x - origin.x, z: pos.z - origin.z } }))) continue;
      // Opposite the loaded side is an actual short escape, including all new ballast.
      const sign = side > 0 ? -1 : 1;
      const velocity = { x: -uz * sign * 100, z: ux * sign * 100 };
      if (solids.concat(reserved).some(e => e !== player && sweptDiscsOverlap(origin, pilotRadius, e,
        { horizon: 1, clearance: 4, velocity }))) continue;
      return result;
    }
    }
  }
  // No composed throw lane: keep the ordinary fight, with only safely seated ballast.
  const reserved = [], result = {};
  for (const slot of slots) {
    const pos = seat(slot, reserved); result[slot.key] = pos;
    if (pos) reserved.push(reserve(slot, pos));
  }
  return result;
}
