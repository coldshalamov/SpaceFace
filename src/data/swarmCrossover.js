// SWARM-06 — the crossover ledger (SWARM_ARCADE §8). What a Swarm run earns, an Adventure
// shipyard may sell.
//
//   * THE LEDGER is a slice of the Crucible profile: `profile.crossover.earned` maps a catalog
//     id to the run that proved it. Adventure READS it; it never writes Swarm progress, and
//     Swarm never writes an Adventure save. survivalRecords owns the bag's persistence and
//     registers the read port below, so systems that cannot import it (ships.js sits upstream
//     of survivalMutators → survivalRecords) still answer "earned?" off the one bag.
//
//   * THE FIRST ENTRY is the Saucer: earnable ONLY in Swarm — the Adventure research route is
//     retired (§11 decision 3) — and the earn is the Zone 3 boss: the wave-30 champion falls
//     inside the run's cleared span. Once the ledger carries it, Adventure shipyards sell the
//     hull like any other earned line. Credits never cross.
//
// Pure frozen data + pure functions. No bus, no RNG, no DOM.

export const SWARM_SAUCER_EARN_WAVE = 30;

export const SWARM_CROSSOVER_CATALOG = Object.freeze([
  Object.freeze({
    id: 'hull:ship_saucer',
    kind: 'hull',
    defId: 'ship_saucer',
    name: 'Saucer',
    earnWave: SWARM_SAUCER_EARN_WAVE,
    blurb: 'Fell the Zone 3 boss — the disc answers at any Adventure shipyard.',
  }),
]);

const CROSSOVER_BY_ID = new Map(SWARM_CROSSOVER_CATALOG.map((row) => [row.id, row]));

export function emptyCrossover() {
  return { earned: {} };
}

/** The migrated ledger slice: only catalog ids, only honest stamps. */
export function migrateCrossover(raw) {
  const out = emptyCrossover();
  const earned = raw && typeof raw === 'object' && raw.earned && typeof raw.earned === 'object'
    && !Array.isArray(raw.earned)
    ? raw.earned : {};
  for (const [id, row] of Object.entries(earned)) {
    const entry = CROSSOVER_BY_ID.get(id);
    if (!entry) continue;
    const rec = row && typeof row === 'object' ? row : {};
    out.earned[id] = {
      wave: Number.isInteger(rec.wave) && rec.wave > 0 ? rec.wave : null,
      at: typeof rec.at === 'string' && rec.at ? rec.at : null,
    };
  }
  return out;
}

/**
 * The earn facts a settled run supplies. The boss of Zone 3 sits on wave 30 (the ten-round
 * zones the ladder names are the same rounds the run counts), so the clause is the SPAN:
 * the run must have started at or before wave 30 and finished wave 30 clear. A checkpoint
 * start at Round 21 that kills the Zone 3 boss honestly earns — it fought the fight. A run
 * that opened at Round 31 never met that boss. Practice runs earn nothing.
 */
export function crossoverFactsFor(result = {}) {
  const src = result && typeof result === 'object' ? result : {};
  const ruleset = src.ruleset || (src.recordRules && src.recordRules.mode) || null;
  const startWave = Number.isInteger(src.startWave) && src.startWave > 0 ? src.startWave : 1;
  const lastCleared = startWave + (Number.isInteger(src.wavesCleared) ? src.wavesCleared : 0) - 1;
  // Practice reads two ways: a bare flag on a raw result, or the record-mode a settled compact
  // already folded the flag into. Either way the ledger stays shut.
  const practice = src.practice === true
    || (src.recordRules && src.recordRules.mode === 'practice');
  return { ruleset, practice, startWave, lastClearedWave: lastCleared };
}

export function crossoverEarnedByRun(facts = {}) {
  if (facts.ruleset !== 'swarm' || facts.practice === true) return [];
  return SWARM_CROSSOVER_CATALOG.filter((entry) => (
    Number.isInteger(entry.earnWave)
    && facts.startWave <= entry.earnWave
    && facts.lastClearedWave >= entry.earnWave
  ));
}

/**
 * Apply a finished run to the ledger. Pure: returns the next slice plus the catalog rows the
 * run earned for the first time (already-earned ids never re-fire).
 */
export function applyCrossoverResult(crossover, facts = {}) {
  const next = migrateCrossover(crossover);
  const fresh = [];
  for (const entry of crossoverEarnedByRun(facts)) {
    if (next.earned[entry.id]) continue;
    next.earned[entry.id] = {
      wave: Number.isInteger(facts.lastClearedWave) ? facts.lastClearedWave : null,
      at: typeof facts.at === 'string' ? facts.at : null,
    };
    fresh.push(entry);
  }
  return { crossover: next, earned: fresh };
}

/** The hull defIds the ledger has proven, for the run's manifest and the shipyard gate. */
export function crossoverHullIds(crossover) {
  const bag = migrateCrossover(crossover);
  const out = [];
  for (const id of Object.keys(bag.earned)) {
    const entry = CROSSOVER_BY_ID.get(id);
    if (entry && entry.kind === 'hull' && typeof entry.defId === 'string') out.push(entry.defId);
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* The read port. survivalRecords — the bag's owner — registers the live profile read at module  */
/* load. Any other caller (the shipyard's buy gate) answers off the same ledger without an        */
/* import cycle. A missing reader is the empty ledger, never a guessed earn.                      */
/* ---------------------------------------------------------------------------------------------- */

let _crossoverReader = null;

export function registerCrossoverReader(fn) {
  _crossoverReader = typeof fn === 'function' ? fn : null;
}

/** Live earned catalog ids (hull:ship_saucer, …) from the profile owner's own read. */
export function swarmEarnedCrossoverIds() {
  let profile = null;
  try { profile = _crossoverReader ? _crossoverReader() : null; } catch { profile = null; }
  const bag = migrateCrossover(profile && profile.crossover);
  return Object.keys(bag.earned);
}

/** Is this catalog row earned right now? */
export function swarmCrossoverEarned(crossoverId) {
  return swarmEarnedCrossoverIds().includes(crossoverId);
}

/**
 * The ship-defIds the ledger has proven — the gate ships.js reads when a hull asks
 * `swarmEarned`, and the flyable list the Hangar applies at run start.
 */
export function swarmEarnedHullDefIds() {
  const ids = swarmEarnedCrossoverIds();
  const out = [];
  for (const id of ids) {
    const entry = CROSSOVER_BY_ID.get(id);
    if (entry && entry.kind === 'hull' && typeof entry.defId === 'string') out.push(entry.defId);
  }
  return out;
}
