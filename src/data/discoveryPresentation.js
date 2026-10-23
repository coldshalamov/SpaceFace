// Field classification is a crew's practical taxonomy, not a claim about common ancestry.
export const FAUNA_FAMILIES = Object.freeze({
  membrane: Object.freeze({ name: 'Membrane drifters', note: 'Broad sensing membranes ride charge and wake; hard acceleration frightens them.' }),
  colonial: Object.freeze({ name: 'Colonial assemblages', note: 'Many small bodies share a drive. Watch the formation before approaching its centre.' }),
  parasite: Object.freeze({ name: 'Heat followers', note: 'Reactor heat and hull motion are food signals; cooling the ship changes the encounter.' }),
  lithic: Object.freeze({ name: 'Lithic hosts', note: 'Rock, shell and embedded tissue carry the organism. Stillness is not proof of death.' }),
  relay: Object.freeze({ name: 'Relay bearers', note: 'Specialised relay tissue carries a pattern that other organisms follow.' }),
  brood: Object.freeze({ name: 'Brood vessels', note: 'The apparent body is also a nursery. Rupture releases what it carries.' }),
  tract: Object.freeze({ name: 'Tract organs', note: 'Attached tissues belong to a larger living passage; tension and flow are their language.' }),
});
const MEMBERS = {
  membrane: ['veil_ray', 'mourning_kite', 'glassback', 'black_sail'],
  colonial: ['needle_swarm', 'suture_mite'],
  parasite: ['hull_leech', 'furnace_maw', 'wake_eel'],
  lithic: ['casket_worm', 'bristle_ram', 'anchor_beast', 'archive_crab', 'stone_lung'],
  relay: ['blind_shepherd', 'cold_bell', 'pilgrim_spine'],
  brood: ['lantern_cyst', 'spindle_mother', 'void_carrier'],
};
const FAMILY_BY_SPECIES = new Map(Object.entries(MEMBERS).flatMap(([family, ids]) => ids.map(id => [id, family])));
export function faunaFamilyId(id) { return FAMILY_BY_SPECIES.get(id) || (String(id).startsWith('bolus_') ? 'tract' : 'colonial'); }
export function faunaFamily(id) { return FAUNA_FAMILIES[faunaFamilyId(id)]; }

export const SUHL_CLAUSES = Object.freeze([
  'A classification belongs to the observed manifest, not to the hull forever.',
  'Counter-evidence must describe the same hull that was classified.',
  'A clean control contains no flagged biological lots.',
  'The witness must be present while the comparison is made.',
  'The comparison belongs inside the marked witness volume.',
  'Motion below the stated limit keeps the comparison valid.',
  'Removing a flagged lot changes the evidence; a story about it does not.',
  'An accepted comparison restores an exception, not ownership of the gate.',
  'A later manifest is a later case. Keep the receipt of this one.',
]);
export function nextSuhlClause(records, incidentId, siteId, at) {
  const existing = Array.isArray(records) ? records : [];
  if (!incidentId || existing.some(row => row.incidentId === incidentId) || existing.length >= SUHL_CLAUSES.length) return null;
  return { index: existing.length, incidentId, siteId, at, text: SUHL_CLAUSES[existing.length] };
}
export function decodedSuhlClauses(state) {
  return (state?.world?.alienEcology?.machineAccess?.suhlClauses || []).filter(row =>
    row && Number.isInteger(row.index) && SUHL_CLAUSES[row.index] && row.incidentId)
    .map(row => ({ ...row, text: SUHL_CLAUSES[row.index] }));
}

export function namesForTheDead(state) {
  const names = new Map();
  for (const story of state?.chronicler?.stories || []) for (const fact of story.nodes || []) {
    const name = fact.subject?.name;
    if (fact.stage !== 'kill' || typeof name !== 'string' || /^(an? (unnamed|unknown) |unknown|unnamed|your ship$|a ship$)/i.test(name)) continue;
    const key = `${fact.subject?.key ?? name}:${fact.id}`;
    names.set(key, { id: fact.id, name, at: fact.t || 0,
      place: fact.sectorName || fact.sectorId || 'an unrecorded place', citation: fact.id,
      body: `${name}. Lost in ${fact.sectorName || fact.sectorId || 'an unrecorded place'}. The record names a lost hull; it makes no claim about who escaped.` });
  }
  return [...names.values()].sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id))).slice(0, 32);
}
