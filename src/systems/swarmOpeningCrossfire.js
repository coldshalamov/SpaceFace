// Round four combines the learned throw with the learned marked-acid dodge.
// Placement only: all four lives come from the ordinary finite wave plan.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningCrossfire(state, run, wave, plan, miteRadius, spitterRadius) {
  if (wave !== 4 || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || (state?.rockCore?.ratingT || 0) > 0
    || ![miteRadius, spitterRadius].every(r => Number.isFinite(r) && r > 0)
    || (plan?.find(part => part.id === 'mite')?.count || 0) < 3
    || (plan?.find(part => part.id === 'spitter')?.count || 0) < 1) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (!(pilotRadius > 0)) return null;
  const solids = [...state.entities.values()].filter(entity =>
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(entity?.type)
    || (entity?.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'));
  const candidates = [];
  for (const rock of state.entities.values()) {
    if (!rock?.alive || rock.type !== 'asteroid' || !rock.data?.swarmArenaDebris
      || rock.collides === false
      || !(rock.radius > 0 && rock.radius <= 9) || !Number.isFinite(rock.pos?.x)
      || !Number.isFinite(rock.pos?.z) || Math.hypot(rock.vel?.x || 0, rock.vel?.z || 0) > 2
      || !resolvePhysicsBodySpec(rock)?.dynamic
      || !(resolvePhysicsBodySpec(rock).mass > 0 && resolvePhysicsBodySpec(rock).mass <= 220)) continue;
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    if (distance >= 45 && distance <= 120) candidates.push({ rock, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || (String(a.rock.id) < String(b.rock.id) ? -1 : String(a.rock.id) > String(b.rock.id) ? 1 : 0));
  for (const { rock, distance } of candidates) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    const mites = [45, 60, 75].map(along => ({ x: rock.pos.x + ux * along, z: rock.pos.z + uz * along }));
    const spitter = { x: player.pos.x - ux * 140, z: player.pos.z - uz * 140 };
    const reserved = [];
    if (![...mites.map(pos => ({ pos, radius: miteRadius })), { pos: spitter, radius: spitterRadius }]
      .every(({ pos, radius }) => {
        if (!swarmPlacementIsClear(state, pos, radius, { clearance: 8, reserved })) return false;
        reserved.push({ alive: true, pos, radius });
        return true;
      })) continue;
    // Check the full throw, not just its nearest target. Neither the rock nor
    // a native hull envelope may pass through intervening physical dressing.
    const rockRadius = Math.max(rock.radius, resolvePhysicsBodySpec(rock).radius);
    const velocity = { x: ux * 75, z: uz * 75 };
    if (!Number.isFinite(rockRadius) || solids.some(other => other !== rock
      && sweptDiscsOverlap(rock.pos, rockRadius, other, { horizon: 1, clearance: 2, velocity }))) continue;
    const escape = [1, -1].find(side => solids.concat(reserved).every(other => other === player
      || !sweptDiscsOverlap(player.pos, pilotRadius, other, {
        horizon: 1, clearance: 4, velocity: { x: -uz * side * 65, z: ux * side * 65 },
      })));
    if (!escape) continue;
    return { rockId: rock.id, mites, spitter,
      escape: { x: -uz * escape, z: ux * escape },
      course: { x: player.pos.x, z: player.pos.z, ux, uz, player } };
  }
  return null;
}
