// Round nine: the guard pair is already in play. One finite Cyst precedes the
// rest of its family, with three familiar bodies to make its shove readable.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningCyst(state, run, wave, plan, cystRadius, miteRadius) {
  if (wave !== 9 || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || run.telemetry?.circuit
    || ![cystRadius, miteRadius].every(r => Number.isFinite(r) && r > 0)
    || (plan?.find(p => p.id === 'lantern_cyst')?.count || 0) < 1
    || (plan?.find(p => p.id === 'mite')?.count || 0) < 3) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const radius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (!(radius > 0)) return null;
  const solids = [...state.entities.values()].filter(e => e !== player && (
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(e?.type)
    || (e?.physicsBody?.schemaVersion === 1 && e.physicsBody.material !== 'massline_sensor')));
  // Fixed world bearings are deterministic. A blocked court is not manufactured:
  // try its next real clear entrance, then leave all four lives in ordinary debt.
  for (let bearing = 0; bearing < 8; bearing++) {
    const angle = bearing * Math.PI / 4, ux = Math.cos(angle), uz = Math.sin(angle);
    const at = (along, side = 0) => ({ x: player.pos.x + ux * along - uz * side,
      z: player.pos.z + uz * along + ux * side });
    const cyst = at(110), mites = [at(155, -15), at(165), at(155, 15)];
    const reserved = [];
    if (![ { pos: cyst, radius: cystRadius }, ...mites.map(pos => ({ pos, radius: miteRadius })) ]
      .every(({ pos, radius: r }) => {
        if (!swarmPlacementIsClear(state, pos, r, { clearance: 8, reserved })) return false;
        reserved.push({ alive: true, pos, radius: r }); return true;
      })) continue;
    // Retain a full native-radius sideways escape and an unobstructed shot.
    if (solids.some(e => sweptDiscsOverlap(player.pos, cystRadius, e,
      { horizon: 1, clearance: 2, velocity: { x: ux * 110, z: uz * 110 } }))) continue;
    const escape = [1, -1].find(side => solids.concat(reserved).every(e =>
      !sweptDiscsOverlap(player.pos, radius, e, { horizon: 1, clearance: 4,
        velocity: { x: -uz * side * 90, z: ux * side * 90 } })));
    if (!escape) continue;
    return { cyst, mites, escape: { x: -uz * escape, z: ux * escape },
      course: { x: player.pos.x, z: player.pos.z, ux, uz, player } };
  }
  return null;
}
