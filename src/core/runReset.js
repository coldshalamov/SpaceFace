// Canonical fresh-run system reset order. Keeping this outside main.js makes the real New Game
// transition directly testable and prevents additive systems from depending on imaginary events.
export const FRESH_RUN_SYSTEMS = Object.freeze([
  'world',
  'regionalEcology',
  'factions',
  'economy',
  'automation',
  'intervention',
  'sectorSim',
  'missions',
  'aiEncounter',
  'crafting',
  'traffic',
  'drill',
  'claims',
  'beacons',
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
