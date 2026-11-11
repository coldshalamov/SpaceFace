// Let the first acid marker read beside an actual throwable, before the crowd.
// This is one seat from the ordinary round-three plan, not a new enemy or lesson owner.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { swarmPlacementIsClear, sweptDiscsOverlap } from './swarmSafety.js';

export function planSwarmOpeningSpitter(state, run, wave, plan, radius) {
  if (wave !== 3 || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || (state?.rockCore?.ratingT || 0) > 0
    || !(Number.isFinite(radius) && radius > 0)
    || !(plan?.find(part => part.id === 'spitter')?.count > 0)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const solids = [...state.entities.values()].filter(entity =>
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(entity?.type)
    || (entity?.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'));
  const candidates = [];
  for (const rock of state.entities.values()) {
    if (!rock?.alive || rock.type !== 'asteroid' || !rock.data?.swarmArenaDebris
      || rock.collides === false
      || !(rock.radius > 0 && rock.radius <= 9) || !Number.isFinite(rock.pos?.x)
      || !Number.isFinite(rock.pos?.z) || Math.hypot(rock.vel?.x || 0, rock.vel?.z || 0) > 2
      || !resolvePhysicsBodySpec(rock)?.dynamic) continue;
    const distance = Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z);
    if (distance >= 45 && distance <= 120) candidates.push({ rock, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || (String(a.rock.id) < String(b.rock.id) ? -1 : String(a.rock.id) > String(b.rock.id) ? 1 : 0));
  for (const { rock, distance } of candidates) {
    const ux = (rock.pos.x - player.pos.x) / distance, uz = (rock.pos.z - player.pos.z) / distance;
    const pos = { x: rock.pos.x + ux * 60, z: rock.pos.z + uz * 60 };
    if (!swarmPlacementIsClear(state, pos, radius, { clearance: 8 })) continue;
    // Preserve a genuine crosswise dodge from the acid marker, using the pilot's
    // native hull envelope and swept obstacles. Never move scenery to manufacture it.
    const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
    if (!(pilotRadius > 0) || ![1, -1].some(side => {
      const velocity = { x: -uz * side * 65, z: ux * side * 65 };
      return solids.every(other => other === player
        || !sweptDiscsOverlap(player.pos, pilotRadius, other, { horizon: 1, clearance: 4, velocity }));
    })) continue;
    // The same stone must have a clear throw at the spitter, not an advertised
    // shot through another bank. Bodies still use ordinary movement and attacks.
    const rockRadius = Math.max(rock.radius, resolvePhysicsBodySpec(rock).radius);
    const velocity = { x: pos.x - rock.pos.x, z: pos.z - rock.pos.z };
    if (!Number.isFinite(rockRadius) || solids.some(other => other !== rock
      && sweptDiscsOverlap(rock.pos, rockRadius, other, { horizon: 1, clearance: 2, velocity }))) continue;
    return { pos, course: { x: player.pos.x, z: player.pos.z, ux, uz, player } };
  }
  return null;
}

// A crowded earned field may have no room for another throwable. Keep the first
// acid read without inventing scenery: one ordinary Spitter and a real escape.
// The arena has already tried the preferred stone scene before actual admission.
export function planSwarmOpeningDodge(state, run, wave, plan, radius) {
  if (wave !== 3 || run?.ruleset !== 'swarm' || run.arenaId !== 'helios_core'
    || run.arenaMutators?.length || (state?.rockCore?.ratingT || 0) > 0
    || !(Number.isFinite(radius) && radius > 0)
    || !(plan?.find(part => part.id === 'spitter')?.count > 0)) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const pilotRadius = Math.max(player.radius || 0, resolvePhysicsBodySpec(player)?.radius || 0);
  if (!(pilotRadius > 0) || !Number.isFinite(pilotRadius)) return null;
  const solids = [...state.entities.values()].filter(entity =>
    ['asteroid', 'wreck', 'station', 'ship', 'drone'].includes(entity?.type)
    || (entity?.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'));
  // A nearby usable stone belongs to the original throw scene. A blocked throw
  // must not silently advertise a different shot through that same obstruction.
  if (solids.some(rock => rock?.alive && rock.type === 'asteroid' && rock.data?.swarmArenaDebris
    && rock.collides !== false && rock.radius > 0 && rock.radius <= 9
    && Number.isFinite(rock.pos?.x) && Number.isFinite(rock.pos?.z)
    && Math.hypot(rock.vel?.x || 0, rock.vel?.z || 0) <= 2
    && resolvePhysicsBodySpec(rock)?.dynamic
    && Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z) >= 45
    && Math.hypot(rock.pos.x - player.pos.x, rock.pos.z - player.pos.z) <= 120)) return null;
  const heading = Number.isFinite(player.rot) ? player.rot : 0;
  for (let i = 0; i < 16; i++) {
    const angle = heading + i * Math.PI / 8, ux = Math.cos(angle), uz = Math.sin(angle);
    const pos = { x: player.pos.x + ux * 140, z: player.pos.z + uz * 140 };
    if (!swarmPlacementIsClear(state, pos, radius, { clearance: 8 })) continue;
    // The threat approaches in open space, rather than starting hidden behind a
    // bank. Both this lane and the full dodge use conservative native envelopes.
    if (solids.some(other => other !== player && sweptDiscsOverlap(player.pos, radius, other,
      { horizon: 1, clearance: 4, velocity: { x: ux * 140, z: uz * 140 } }))) continue;
    const side = [1, -1].find(side => solids.every(other => other === player
      || !sweptDiscsOverlap(player.pos, pilotRadius, other, {
        horizon: 1, clearance: 4, velocity: { x: -uz * side * 65, z: ux * side * 65 },
      })));
    if (!side) continue;
    return { pos, course: { x: player.pos.x, z: player.pos.z, ux, uz, player } };
  }
  return null;
}
