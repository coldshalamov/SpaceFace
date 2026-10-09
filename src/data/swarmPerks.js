// SWARM-06 — the perk loadout (SWARM_ARCADE §4.3). A small loadout the pilot brings in: two
// slots, passive, build-defining, chosen per run on the Hangar.
//
//   * EARNS are never bought: stars off the curated ladder and finished challenges open the
//     catalog, so the collection keeps growing exactly where §4.3 says it grows. The earn is
//     DERIVED from the profile — a perk is "earned" iff its condition reads true right now;
//     only the two-slot pick is stored (profile.perks.loadout), so a wiped account re-earns
//     honestly instead of keeping a stale flag.
//
//   * THE RUN reads `run.telemetry.perks` — the loadout as it stood at begin, stamped by
//     runSession (earned-checked there, so a hand-written bag never sneaks a locked perk into
//     the arena). Every effect site reads this one helper set; nothing else re-judges earns.
//
// Pure frozen data + pure functions. No bus, no RNG, no DOM.

export const SWARM_PERK_SLOTS = 2;

export const SWARM_PERKS = Object.freeze([
  Object.freeze({
    id: 'scavenger', name: 'Scavenger', stars: 2,
    blurb: 'Every tenth kill drops a bonus credit chip.',
  }),
  Object.freeze({
    id: 'overclock', name: 'Overclock', stars: 5,
    blurb: 'Every kill feeds the boost reserve.',
  }),
  Object.freeze({
    id: 'gambler', name: 'Gambler', stars: 8,
    blurb: 'Two more re-rolls on the bench — then paid draws at half price.',
  }),
  Object.freeze({
    id: 'ram_plate', name: 'Ram Plate', stars: 11,
    blurb: 'Your hull hits like the plated module — collisions deal damage.',
  }),
  Object.freeze({
    id: 'bounty_hunter', name: 'Bounty Hunter', challenges: 1,
    blurb: 'Champions pay three times the run credits.',
  }),
  Object.freeze({
    id: 'chain_reactor', name: 'Chain Reactor', stars: 16,
    blurb: 'A kill past chain 25 detonates the body.',
  }),
]);

export const SWARM_PERK_BY_ID = Object.freeze(Object.fromEntries(
  SWARM_PERKS.map((row) => [row.id, row]),
));

export function emptyPerks() {
  return { loadout: [] };
}

/** Only catalog ids, at most the slot count, first-picked order kept. */
export function migratePerks(raw) {
  const out = emptyPerks();
  const list = raw && typeof raw === 'object' && Array.isArray(raw.loadout) ? raw.loadout : [];
  for (const id of list) {
    if (typeof id !== 'string' || !SWARM_PERK_BY_ID[id]) continue;
    if (out.loadout.includes(id)) continue;
    if (out.loadout.length >= SWARM_PERK_SLOTS) break;
    out.loadout.push(id);
  }
  return out;
}

/**
 * The perks the profile has earned right now: stars off the whole ladder (the same total the
 * arena gates read) and finished challenges off the challenge ledger. Derived, never stored.
 */
export function earnedPerkIds(profile, { starTotal = null, challengesDone = 0 } = {}) {
  const stars = Number.isInteger(starTotal) ? starTotal : 0;
  const done = Number.isInteger(challengesDone) && challengesDone > 0 ? challengesDone : 0;
  const out = [];
  for (const perk of SWARM_PERKS) {
    const starGate = Number.isInteger(perk.stars) ? perk.stars : null;
    const challengeGate = Number.isInteger(perk.challenges) ? perk.challenges : null;
    if (starGate != null && stars >= starGate) { out.push(perk.id); continue; }
    if (challengeGate != null && done >= challengeGate) out.push(perk.id);
  }
  return out;
}

/**
 * Validate a loadout pick against what the profile has earned. Returns the normalized pick —
 * unknown and unearned ids drop silently, exactly like a door toggle the player could never
 * have clicked.
 */
export function normalizePerkLoadout(ids, earnedIds) {
  const earned = new Set(Array.isArray(earnedIds) ? earnedIds : []);
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !SWARM_PERK_BY_ID[id]) continue;
    if (!earned.has(id) || out.includes(id)) continue;
    if (out.length >= SWARM_PERK_SLOTS) break;
    out.push(id);
  }
  return out;
}

/** The perk ids stamped onto the live run at begin. Always a fresh array, never a guess. */
export function runPerkIds(run) {
  const list = run && run.telemetry && Array.isArray(run.telemetry.perks)
    ? run.telemetry.perks : [];
  const out = [];
  for (const id of list) {
    if (typeof id === 'string' && SWARM_PERK_BY_ID[id] && !out.includes(id)) out.push(id);
  }
  return out;
}

export function runHasPerk(run, perkId) {
  return runPerkIds(run).includes(perkId);
}
