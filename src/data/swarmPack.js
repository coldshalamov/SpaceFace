// Rounds 1–10 of ordinary Swarm. These rows compose only already-admitted ships;
// the wave planner still owns quotas, champions, debuts, pressure and every spawn.
import { swarmRosterFor, swarmFreeGateFor } from './swarmMode.js';

const freeze = rows => Object.freeze(rows.map(row => Object.freeze(row)));
const PACK = Object.freeze({
  1: { question: 'A clear shot and loose mass. Kill cleanly, or throw what the room gives you.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 1, atTick: 0 }, { enemyId: 'wasp_swarmer', share: 1, atTick: 12 }]) },
  2: { question: 'The pirate enters behind the light pack. Turn their approach into a bank or a throw.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 1, atTick: 0 }, { enemyId: 'wasp_swarmer', share: 1, atTick: 12 }]) },
  3: { question: 'One pirate commits after the light pack. Sidestep its pass and punish the turn.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 5, atTick: 0 }, { enemyId: 'reaver_pirate', count: 1, atTick: 120, staged: true }]) },
  4: { question: 'A pirate contests one approach; the new guardian covers the pack. Flank the screen or move it.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 3, atTick: 0 }, { enemyId: 'reaver_pirate', share: 1, atTick: 12 }]) },
  5: { question: 'The champion is the work. Keep the light bodies as ammunition and cross the committed attack.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 1, atTick: 0 }, { enemyId: 'choir_zealot', share: 1, atTick: 12 }]) },
  6: { question: 'Use your new kit on familiar light hulls. The mine layer salts a route; the gaps stay open.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 1, atTick: 0 }, { enemyId: 'choir_zealot', share: 1, atTick: 12 }]) },
  7: { question: 'Pirates press while guardians cover the pack. Separate their approaches and open one target.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 2, atTick: 0 }, { enemyId: 'reaver_pirate', share: 1, atTick: 12 }, { enemyId: 'choir_zealot', share: 1, atTick: 24 }]) },
  8: { question: 'The sniper owns one line. Spend the mass that remains, or cross its aim and take the open flank.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 1, atTick: 0 }, { enemyId: 'wasp_swarmer', share: 1, atTick: 12 },
      { enemyId: 'wasp_swarmer', share: 1, atTick: 24 }, { enemyId: 'choir_zealot', share: 1, atTick: 36 }]) },
  9: { question: 'A warden shields the pressure hulls. Guns can isolate it; a thrown light hull can break their formation.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 3, atTick: 0 }, { enemyId: 'reaver_pirate', share: 2, atTick: 12 }]) },
  10: { question: 'Light mass, a pressing pirate and a screen. Solve the familiar mix, then refit for round 11.',
    groups: freeze([{ enemyId: 'wasp_swarmer', share: 2, atTick: 0 }, { enemyId: 'reaver_pirate', share: 1, atTick: 12 }, { enemyId: 'choir_zealot', share: 1, atTick: 24 }]) },
});
for (const row of Object.values(PACK)) Object.freeze(row);

export function swarmPackFor(wave) {
  return Number.isInteger(wave) ? PACK[wave] || null : null;
}

/** Keep the exact native opening budget and its owed champion/debut/wall seats. */
export function composeSwarmPackOpening(wave, packages) {
  const row = swarmPackFor(wave);
  if (!row || !Array.isArray(packages)) return packages;
  // The existing first encounter and champion already have dedicated physical
  // staging owners. Keep those schedules exact, including explicit training.
  if (wave === 1 || wave === 5) return packages;
  const protectedSeat = pkg => pkg.champion === true || pkg.debut === true || pkg.wall === true || pkg.staged === true;
  const protectedPackages = packages.filter(protectedSeat);
  const total = packages.filter(pkg => !protectedSeat(pkg)).reduce((sum, pkg) => sum + pkg.count, 0);
  const legal = new Map(swarmRosterFor(wave).map(entry => [entry.enemyId, entry]));
  if (total < row.groups.length || row.groups.some(group => !legal.has(group.enemyId))) return packages;
  const fixed = row.groups.reduce((sum, group) => sum + (group.count || 0), 0);
  const shares = row.groups.reduce((sum, group) => sum + (group.share || 0), 0);
  const counts = row.groups.map(group => group.count || Math.max(1, Math.floor((total - fixed) * group.share / shares)));
  let delta = total - counts.reduce((sum, count) => sum + count, 0);
  for (let i = 0; delta !== 0 && i < 100; i++) {
    const index = i % counts.length;
    if (row.groups[index].count != null || (delta < 0 && counts[index] <= 1)) continue;
    counts[index] += Math.sign(delta); delta -= Math.sign(delta);
  }
  if (delta !== 0) return packages;
  const used = protectedPackages.map(pkg => pkg.gateGroup);
  const opening = row.groups.map((group, index) => {
    const gateGroup = swarmFreeGateFor(wave, used); used.push(gateGroup);
    return { enemyId: group.enemyId, role: legal.get(group.enemyId).role,
      gateGroup, atTick: group.atTick, count: counts[index], batchSize: counts[index], batchGapTicks: 0,
      ...(group.staged ? { staged: true } : {}) };
  });
  return [...protectedPackages, ...opening];
}
