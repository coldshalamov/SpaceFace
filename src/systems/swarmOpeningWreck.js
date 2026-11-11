// Round six spends the champion's original matter, not a replacement tutorial prop.
// This only seats three already-owed Mites. Flight, Line and collision retain control.
import { physicsBodyNativeReady, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { isFoundryWreckKept } from '../data/swarmFoundryWreck.js';
import { isMasslineObstructed } from '../world/asteroidField.js';
import { contextualAttachmentWorlds } from './tetherGameplay.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningWreck(state, run, wave, plan, radius) {
  if (wave !== 6 || run !== state?.run
    || !(Number.isFinite(radius) && radius > 0)
    || (plan?.find(part => part.id === 'mite')?.count || 0) < 3) return null;
  const player = state.entities?.get?.(state.playerId);
  const rock = state.entities?.get?.(run?.telemetry?.foundryMawOffcut?.id);
  if ((state?.rockCore?.ratingT || 0) > 0
    && !(state.player?.tether?.active && state.player.tether.targetId === rock?.id)) return null;
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)
    || !isFoundryWreckKept(state, rock) || rock.collides === false || rock.physicsBody === false
    || !physicsBodyNativeReady(rock) || Number.isFinite(rock.data?.despawnAt)
    || !Number.isFinite(rock.pos?.x) || !Number.isFinite(rock.pos?.z)
    || !Number.isFinite(rock.vel?.x) || !Number.isFinite(rock.vel?.z)
    || Math.hypot(rock.vel.x, rock.vel.z) > 6) return null;
  const body = resolvePhysicsBodySpec(rock);
  if (!body?.dynamic || !(body.radius > 0 && body.radius <= 9) || !(body.mass > 0)
    || body.material === 'sensor' || body.material === 'massline_sensor'
    || PHYSICS_MATERIALS[body.material]?.ghost === true) return null;
  const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
  if (distance < 45 || distance > 220) return null;
  if (isMasslineObstructed({ state, player, target: rock,
    ...contextualAttachmentWorlds(player, rock, rock.pos) })) return null;
  const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
  const points = [45, 60, 75].map(along => ({ x: rock.pos.x + ux * along, z: rock.pos.z + uz * along }));
  const solids = [...state.entities.values()].filter(entity => entity?.physicsBody !== false
    && (['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(entity?.type)
      || entity?.physicsBody?.schemaVersion === 1));
  if (solids.some(other => other !== rock && sweptDiscsOverlap(rock.pos, body.radius, other,
    { horizon: 1, clearance: 2, velocity: { x: ux * 75, z: uz * 75 } }))) return null;
  const reserved = [];
  for (const pos of points) {
    if (!swarmPlacementIsClear(state, pos, radius, { clearance: 8, reserved })) return null;
    reserved.push({ alive: true, pos, radius });
  }
  return { rockId: rock.id, points,
    course: { x: player.pos.x, z: player.pos.z, ux, uz, player } };
}
