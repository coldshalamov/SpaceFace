// Canonical fresh-run system reset order. Keeping this outside main.js makes the real New Game
// transition directly testable and prevents additive systems from depending on imaginary events.
export const FRESH_RUN_SYSTEMS = Object.freeze([
  // runSession first: New Game must clear the run envelope before any content owner rebuilds.
  // Keeping this on FRESH_RUN_SYSTEMS makes that transition directly testable (the purpose of this file).
  'runSession',
  // survivalWave holds the previous run's wave cohort and budget owners. Clear it with the
  // envelope, before spawnBudget wipes the ledger it reserved from.
  'survivalWave',
  'survivalRewards',
  'survivalDraft',
  'survivalResults',
  // Clear the global live-ship ledger before world or any content owner rematerializes a fresh run.
  'spawnBudget',
  'world',
  'regionalEcology',
  'factions',
  'economy',
  'automation',
  'intervention',
  'sectorSim',
  'missions',
  'postEndingReplay',
  'aiEncounter',
  'crafting',
  'traffic',
  'drill',
  'claims',
  'beacons',
  'aceMemory',
  'lossLedger',
  'factionPresence',
]);

export function resetFreshRunSystems(registry, options = {}) {
  if (!registry || typeof registry.get !== 'function') return true;
  const afterEach = typeof options.afterEach === 'function' ? options.afterEach : null;
  for (const name of FRESH_RUN_SYSTEMS) {
    const system = registry.get(name);
    if (system && typeof system.newGame === 'function') system.newGame();
    if (afterEach && afterEach(name, system) === false) return false;
  }
  return true;
}
