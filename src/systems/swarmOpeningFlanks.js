// The second Foundry round reuses the court the pilot has actually left standing.
// Placement only: spend the ordinary plan through the existing arrival owner.
import { swarmPlacementIsClear } from './swarmSafety.js';

export const SWARM_OPENING_FLANK_GATES = Object.freeze([
  'front', 'rear', 'ne', 'sw', 'diagonal_b', 'diagonal_a', 'se', 'nw',
]);
// Clear the surviving starter pebble at x=120 with the whole arrival disc.
const FLANK_DISTANCE = 180;

export function planSwarmOpeningFlanks(state, run, wave, plan, radius) {
  if (wave !== 2 || run?.arenaId !== 'helios_core' || run?.ruleset !== 'swarm'
    || run.arenaMutators?.length || (state?.rockCore?.ratingT || 0) > 0
    || !Number.isFinite(radius) || radius <= 0
    || (plan?.find(part => part.id === 'mite')?.count || 0) < 36) return null;
  const player = state?.entities?.get?.(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return null;
  const shoulders = new Map();
  for (const rock of state.entities.values()) {
    const slot = rock?.data?.openingTerrainSlot;
    if (!Number.isInteger(slot) || slot < 0 || slot > 3 || !rock.data.swarmArenaDebris
      || rock.type !== 'asteroid' || !rock.alive || rock.collides === false
      || !Number.isFinite(rock.pos?.x) || !Number.isFinite(rock.pos?.z)
      || Math.hypot(rock.vel?.x || 0, rock.vel?.z || 0) > 2) continue;
    // Conflicting slot identities are not enough evidence to author a court.
    if (shoulders.has(slot)) return null;
    shoulders.set(slot, rock);
  }
  for (const [rightSlot, leftSlot, dz] of [[0, 3, -200], [1, 2, 200]]) {
    const right = shoulders.get(rightSlot), left = shoulders.get(leftSlot);
    if (!right || !left || Math.abs(right.pos.x - left.pos.x - 300) > 24
      || Math.abs(right.pos.z - left.pos.z - dz) > 24) continue;
    const x = (right.pos.x + left.pos.x) / 2, z = (right.pos.z + left.pos.z) / 2;
    if (Math.hypot(player.pos.x - x, player.pos.z - z) > 96) continue;
    // Both entrances must be genuine open discs, not just clear target centers.
    // Actual packet seats still pass the normal moving-pilot and obstacle checks.
    if (![1, -1].every(side => swarmPlacementIsClear(state,
      { x: x + side * FLANK_DISTANCE, z }, 30 + radius, { clearance: 8 }))) continue;
    return { x, z, ux: 1, uz: 0, distance: FLANK_DISTANCE, player };
  }
  return null;
}
