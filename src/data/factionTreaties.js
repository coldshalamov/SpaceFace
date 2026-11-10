// factionTreaties.js — standing links a recovered treaty opens between two rival powers.
//
// A treaty is unlocked by a player flag that its story reward writes (data/uniqueWrecks.js
// `uniqueDrops[].unlockFlag`, set by systems/uniqueWrecks.js on the claim). While the flag is set
// the reputation owner (systems/factions.js) replaces the pair's authored rivalry weight with the
// treaty weight: standing earned with one power now carries a share to the other instead of
// costing it. The faction screen reads the same helper so the link is visible where standing is.
// Pure data and pure reads; nothing here writes state.

export const FACTION_TREATIES = Object.freeze([
  Object.freeze({
    id: 'treaty_choir_vael_cassandra',
    name: 'Cassandra Treaty',
    flag: 'crossRep.choirVaelTreaty',
    factions: Object.freeze(['faction_choir', 'faction_vael']),
    // Authored rivalry is -0.6 each way. Under the treaty a quarter of standing carries across.
    weight: 0.25,
    news: 'CASSANDRA TREATY IN PLAY. CHOIR AND VAEL BOTH DENY IT, AND BOTH NOW COUNT WHAT YOU DO FOR THE OTHER.',
    summary: 'Cassandra Treaty: a quarter of standing you earn or lose with one now carries to the other.',
  }),
]);

/** The treaty binding factions `a` and `b`, if its flag is set in this state; else null. */
export function activeTreatyBetween(state, a, b) {
  if (!a || !b || a === b) return null;
  const flags = state && state.player && state.player.flags;
  if (!flags) return null;
  for (const treaty of FACTION_TREATIES) {
    if (flags[treaty.flag] !== true) continue;
    if (treaty.factions.includes(a) && treaty.factions.includes(b)) return treaty;
  }
  return null;
}

/** Every active treaty that names faction `id`: [{ treaty, otherId }]. */
export function activeTreatiesFor(state, id) {
  const flags = state && state.player && state.player.flags;
  if (!flags || !id) return [];
  const out = [];
  for (const treaty of FACTION_TREATIES) {
    if (flags[treaty.flag] !== true || !treaty.factions.includes(id)) continue;
    for (const otherId of treaty.factions) if (otherId !== id) out.push({ treaty, otherId });
  }
  return out;
}

/** The treaty for an unlock flag, or null. */
export function treatyForFlag(flag) {
  return FACTION_TREATIES.find((treaty) => treaty.flag === flag) || null;
}
