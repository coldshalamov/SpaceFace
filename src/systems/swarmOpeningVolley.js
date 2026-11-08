// First Foundry pack: three ordinary mites beyond a real starter throwable.
// Placement only: no added population, damage, rewards, parked actors or input lock.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningVolley(state, run, wave, plan, bodyRadius) {
  if (wave !== 1 || run?.arenaId !== 'helios_core' || run?.ruleset !== 'swarm'
    || run.arenaMutators?.length || (state?.rockCore?.ratingT || 0) > 0
    || !Number.isFinite(bodyRadius) || bodyRadius <= 0
    || (plan?.find(p => p.id === 'mite')?.count || 0) < 3) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.pos || player.alive === false || !Number.isFinite(player.pos.x)
    || !Number.isFinite(player.pos.z)) return null;
  const candidates = [];
  for (const rock of state.entities.values()) {
    if (!rock?.alive || rock.type !== 'asteroid' || !rock.data?.swarmArenaDebris
      || !(rock.data.openingPocket || rock.data.openingLesson)
      || rock.collides === false || !(rock.radius > 0 && rock.radius <= 9)
      || !Number.isFinite(rock.pos?.x) || !Number.isFinite(rock.pos?.z)
      || Math.hypot(rock.vel?.x || 0, rock.vel?.z || 0) > 2
      || !resolvePhysicsBodySpec(rock)?.dynamic) continue;
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    if (distance >= 45 && distance <= 120) candidates.push({ rock, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || (String(a.rock.id) < String(b.rock.id) ? -1 : String(a.rock.id) > String(b.rock.id) ? 1 : 0));
  for (const { rock, distance } of candidates) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    const points = [[45, 0], [68, -14], [68, 14]].map(([along, across]) => ({
      x: rock.pos.x + ux * along - uz * across,
      z: rock.pos.z + uz * along + ux * across,
    }));
    // A clear target is not enough: the throwable's actual collider must have a
    // clear straight approach to it. Do not advertise a shot through another bank.
    const rockRadius = Math.max(rock.radius, resolvePhysicsBodySpec(rock).radius);
    if (!Number.isFinite(rockRadius)) continue;
    const velocity = { x: points[0].x - rock.pos.x, z: points[0].z - rock.pos.z };
    let laneBlocked = false;
    for (const other of state.entities.values()) {
      if (other === rock || !(['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(other?.type)
        || (other?.physicsBody?.schemaVersion === 1 && other.physicsBody.material !== 'massline_sensor'))) continue;
      if (sweptDiscsOverlap(rock.pos, rockRadius, other, { horizon: 1, clearance: 2, velocity })) {
        laneBlocked = true; break;
      }
    }
    if (laneBlocked) continue;
    const reserved = [];
    let clear = true;
    for (const pos of points) {
      if (!swarmPlacementIsClear(state, pos, bodyRadius, { clearance: 8, reserved })) { clear = false; break; }
      reserved.push({ alive: true, pos, radius: bodyRadius });
    }
    if (clear) return { rockId: rock.id, points };
  }
  return null;
}
