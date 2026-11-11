// One owed shell beyond surviving loose matter. No refill, prop relocation or
// damage shortcut: the real Line, flight and mass-contact owners decide the hit.
import { physicsBodyNativeReady, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { isMasslineObstructed } from '../world/asteroidField.js';
import { contextualAttachmentWorlds } from './tetherGameplay.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningGlassback(state, run, wave, plan, radius) {
  if (wave !== 13 || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || run.telemetry?.circuit || (state?.rockCore?.ratingT || 0) > 0
    || !(Number.isFinite(radius) && radius > 0)
    || !(plan?.find(part => part.id === 'glassback')?.count > 0)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (!(pilotRadius > 0)) return null;
  const solids = [...state.entities.values()].filter(e =>
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(e?.type)
    || (e?.physicsBody?.schemaVersion === 1 && e.physicsBody.material !== 'massline_sensor'));
  const candidates = [];
  for (const rock of state.entities.values()) {
    if (!rock?.alive || !['asteroid', 'wreck'].includes(rock.type)
      || rock.collides === false || rock.physicsBody === false || !physicsBodyNativeReady(rock)
      || (state.player?.tether?.active && state.player.tether.targetId === rock.id)
      || (Number.isFinite(rock.data?.despawnAt) && rock.data.despawnAt <= (state.simTime || 0) + 30)
      || !Number.isFinite(rock.pos?.x) || !Number.isFinite(rock.pos?.z)
      || !Number.isFinite(rock.vel?.x) || !Number.isFinite(rock.vel?.z)
      || Math.hypot(rock.vel.x, rock.vel.z) > 2) continue;
    const body = resolvePhysicsBodySpec(rock);
    // Starter-sized real matter, not a bank dressed up as throwable ammunition.
    if (!body?.dynamic || !(body.mass > 0 && body.mass <= 35)
      || !(body.radius > 0 && body.radius <= 9)
      || PHYSICS_MATERIALS[body.material]?.ghost === true
      || ['sensor', 'massline_sensor'].includes(body.material)) continue;
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    if (distance < Math.max(45, pilotRadius + body.radius + 12) || distance > 120) continue;
    if (isMasslineObstructed({ state, player, target: rock,
      ...contextualAttachmentWorlds(player, rock, rock.pos) })) continue;
    candidates.push({ rock, body, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance
    || (String(a.rock.id) < String(b.rock.id) ? -1 : String(a.rock.id) > String(b.rock.id) ? 1 : 0));
  for (const { rock, body, distance } of candidates) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    const pos = { x: rock.pos.x + ux * 70, z: rock.pos.z + uz * 70 };
    if (!swarmPlacementIsClear(state, pos, radius, { clearance: 8 })) continue;
    if (solids.some(e => e !== rock && sweptDiscsOverlap(rock.pos, body.radius, e,
      { horizon: 1, clearance: 2, velocity: { x: ux * 70, z: uz * 70 } }))) continue;
    // The shell's shards are dangerous. Leave a genuine sideways escape rather
    // than solving the shell by silently turning off its death splash.
    if (![1, -1].some(side => solids.concat({ alive: true, pos, radius }).every(e => e === player
      || !sweptDiscsOverlap(player.pos, pilotRadius, e, { horizon: 1, clearance: 4,
        velocity: { x: -uz * side * 90, z: ux * side * 90 } })))) continue;
    return { pos, rockId: rock.id };
  }
  return null;
}
