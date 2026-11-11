// Spend one planned latch beside a real, reachable scrape surface. This helper
// only chooses an entrance; it neither moves terrain nor guarantees a shed.
import { resolvePhysicsBodySpec, physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningLeecher(state, run, wave, plan, radius) {
  if (![11, 12].includes(wave) || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || run.telemetry?.circuit || (state?.rockCore?.ratingT || 0) > 0
    || !(Number.isFinite(radius) && radius > 0)
    || !(plan?.find(part => part.id === 'leecher')?.count > 0)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (!(pilotRadius > 0)) return null;
  const solids = [...state.entities.values()].filter(e =>
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(e?.type)
    || (e?.physicsBody?.schemaVersion === 1 && e.physicsBody.material !== 'massline_sensor'));
  const candidates = [];
  for (const rock of state.entities.values()) {
    // Asteroids are in the existing Brood rock cache. Do not advertise a wreck,
    // sensor, expiring prop, moving projectile or abstract station as a surface.
    if (!rock?.alive || rock.type !== 'asteroid' || rock.collides === false
      || rock.physicsBody === false || !physicsBodyNativeReady(rock)
      // Production room banks have a fifteen-minute lease. They are valid
      // surfaces while that lease outlives this bounded approach/read.
      || (Number.isFinite(rock.data?.despawnAt) && rock.data.despawnAt <= (state.simTime || 0) + 30)
      || !Number.isFinite(rock.pos?.x)
      || !Number.isFinite(rock.pos?.z) || !Number.isFinite(rock.vel?.x)
      || !Number.isFinite(rock.vel?.z) || Math.hypot(rock.vel.x, rock.vel.z) > 2) continue;
    const body = resolvePhysicsBodySpec(rock);
    if (!body || PHYSICS_MATERIALS[body.material]?.ghost === true || ['sensor', 'massline_sensor'].includes(body.material)
      || !(rock.radius >= 8 && body.radius >= 8)) continue;
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    const gap = distance - body.radius - pilotRadius;
    if (gap >= 35 && gap <= 140) candidates.push({ rock, distance, body });
  }
  candidates.sort((a, b) => a.distance - b.distance || (String(a.rock.id) < String(b.rock.id) ? -1 : String(a.rock.id) > String(b.rock.id) ? 1 : 0));
  for (const { rock, distance, body } of candidates) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    const pos = { x: player.pos.x - ux * 76, z: player.pos.z - uz * 76 };
    if (!swarmPlacementIsClear(state, pos, radius, { clearance: 8 })) continue;
    // Check both the latch's unobstructed approach and the pilot's hull-width
    // route to the near face. The chosen surface is the intended contact only.
    const contactDistance = distance - body.radius - pilotRadius;
    const velocity = { x: ux * contactDistance, z: uz * contactDistance };
    if (solids.some(other => other !== player && other !== rock
      && sweptDiscsOverlap(player.pos, pilotRadius, other, { horizon: 1, clearance: 4, velocity }))) continue;
    const approach = { x: player.pos.x - pos.x, z: player.pos.z - pos.z };
    if (solids.some(other => other !== player
      && sweptDiscsOverlap(pos, radius, other, { horizon: 1, clearance: 2, velocity: approach }))) continue;
    return { pos, rockId: rock.id };
  }
  return null;
}
