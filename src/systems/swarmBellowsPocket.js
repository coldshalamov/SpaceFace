// A finite shockwave pocket uses the room the pilot has actually left behind.
// The existing Bellows owns inflation, fuse, shove and credit. This only seats
// one owed Bellows and three owed mites beside a safe, surviving solid bank.
import { physicsBodyNativeReady, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmBellowsPocket(state, run, wave, plan, bellowsRadius, miteRadius) {
  if (![17, 19].includes(wave) || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || run.telemetry?.circuit
    || ![bellowsRadius, miteRadius].every(r => Number.isFinite(r) && r > 0)
    || (plan?.find(p => p.id === 'bellows')?.count || 0) < 1
    || (plan?.find(p => p.id === 'mite')?.count || 0) < 3) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (!(pilotRadius > 0)) return null;
  const solids = [...state.entities.values()].filter(e => e !== player && (
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(e?.type)
    || (e?.physicsBody?.schemaVersion === 1 && e.physicsBody.material !== 'massline_sensor')));
  const banks = [];
  for (const bank of solids) {
    if (!bank?.alive || bank.type !== 'asteroid'
      || bank.collides === false || bank.physicsBody === false || !physicsBodyNativeReady(bank)
      || !Number.isFinite(bank.pos?.x) || !Number.isFinite(bank.pos?.z)
      || !Number.isFinite(bank.vel?.x) || !Number.isFinite(bank.vel?.z)
      || Math.hypot(bank.vel.x, bank.vel.z) > 2
      || (state.player?.tether?.active && state.player.tether.targetId === bank.id)
      || (Number.isFinite(bank.data?.despawnAt) && bank.data.despawnAt <= (state.simTime || 0) + 30)) continue;
    const body = resolvePhysicsBodySpec(bank);
    if (!(bank.radius >= 18 && body?.radius >= 18 && body.mass >= 80) || PHYSICS_MATERIALS[body.material]?.ghost
      || ['sensor', 'massline_sensor'].includes(body.material)) continue;
    const distance = Math.hypot(bank.pos.x - player.pos.x, bank.pos.z - player.pos.z);
    const along = distance - Math.max(bank.radius * 1.05, body.radius) - 78;
    if (along < Math.max(130, pilotRadius + bellowsRadius + 30) || along > 240) continue;
    banks.push({ bank, distance, along });
  }
  banks.sort((a, b) => a.distance - b.distance || (String(a.bank.id) < String(b.bank.id) ? -1 : String(a.bank.id) > String(b.bank.id) ? 1 : 0));
  for (const { bank, distance, along } of banks) {
    const ux = (bank.pos.x - player.pos.x) / distance, uz = (bank.pos.z - player.pos.z) / distance;
    const at = (d, side = 0) => ({ x: player.pos.x + ux * d - uz * side,
      z: player.pos.z + uz * d + ux * side });
    const bellows = at(along), mites = [at(along + 56, -12), at(along + 56), at(along + 56, 12)];
    const reserved = [];
    if (![ { pos: bellows, radius: bellowsRadius }, ...mites.map(pos => ({ pos, radius: miteRadius })) ]
      .every(({ pos, radius }) => {
        if (!swarmPlacementIsClear(state, pos, radius, { clearance: 6, reservedClearance: 2, reserved })) return false;
        reserved.push({ alive: true, pos, radius }); return true;
      })) continue;
    // The player must be able to shoot the Bellows and leave its eventual blast.
    if (solids.some(e => sweptDiscsOverlap(player.pos, bellowsRadius, e,
      { horizon: 1, clearance: 2, velocity: { x: ux * along, z: uz * along } }))) continue;
    if (![1, -1].some(side => solids.concat(reserved).every(e =>
      !sweptDiscsOverlap(player.pos, pilotRadius, e, { horizon: 1, clearance: 4,
        velocity: { x: -uz * side * 100, z: ux * side * 100 } })))) continue;
    return { bellows, mites, bankId: bank.id };
  }
  return null;
}
