import { CAL_DAY_S } from './worldCalendar.js';

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
    const place = fact.sectorName || (typeof fact.sectorId === 'string'
      ? fact.sectorId.replace(/^sector_/, '').replace(/_/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase())
      : 'an unrecorded place');
    names.set(key, { id: fact.id, name, at: fact.t || 0,
      place, citation: fact.id,
      body: `${name}. Lost in ${place}. The record names a lost hull; it makes no claim about who escaped.` });
  }
  return [...names.values()].sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id))).slice(0, 32);
}

// ── special-500 Phase 2 (batch 1, codex family) ────────────────────────────────────────────
// Two discovery reads, following this module's existing row pattern: frozen authored tables
// plus pure reads over durable state. Neither read writes anything; both fail closed (an
// empty list) until the world has honestly earned the page.

// SP2-004 "Incident 7741, the Sealed Side" — the Listening Field's mirrored evidence board.
// The revisit count is a live read: the scanner's durable per-signal record carries scanCount
// (the same retained-reading read src/systems/scanner.js uses for the Shard Sphere Song), and
// the consensus-named story counter flag `poi_io_listening_visit` is accepted as an alternate
// writer seam. `incident7741_shelf_seen` is the plain-named durable receipt: set, the shelf
// shows even if the bounded signal record was later pruned (stale-save hardening). The Concord
// rep branch (-1 records request / +2 walk away) belongs to a records-request interaction that
// does not exist yet — deferred, not invented.
export const LISTENING_FIELD_POI_ID = 'poi_io_listening_field';
export const LISTENING_FIELD_REVISIT_FLAG = 'poi_io_listening_visit';
export const INCIDENT_7741_SHELF_SEEN_FLAG = 'incident7741_shelf_seen';
export const INCIDENT_7741_BEAT = 3;        // "a second scan after beat 3"
export const INCIDENT_7741_REVISITS = 2;    // the field, scanned twice

export const INCIDENT_7741_SHELF = Object.freeze([
  Object.freeze({ label: 'INCIDENT', value: '7741', sealed: false }),
  Object.freeze({ label: 'CREW', value: '5', sealed: false }),
  Object.freeze({ label: 'CAUSE', value: 'SEALED', sealed: true }),
  Object.freeze({ label: 'EVIDENCE', value: 'SEALED', sealed: true }),
  Object.freeze({ label: 'WITNESSES', value: 'SEALED', sealed: true }),
  Object.freeze({ label: 'HULL STATUS', value: 'HELD TOGETHER', sealed: false }),
]);

/** Times the Listening Field's own signal has been scanned (plus any story-flag counter). */
export function listeningFieldScanCount(state) {
  const record = state?.signalInvestigation?.records?.[`signal:poi:${LISTENING_FIELD_POI_ID}`];
  const scans = Number(record && record.scanCount) || 0;
  const counter = Number(state?.story?.flags?.[LISTENING_FIELD_REVISIT_FLAG]) || 0;
  return Math.max(scans, counter);
}

/**
 * The mirrored board, once the field has been scanned twice after beat 3 (or the durable
 * receipt flag is set). Empty until then — a sealed shelf is not a rumor.
 */
export function incident7741ShelfRows(state) {
  const story = state && state.story ? state.story : {};
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  if (flags[INCIDENT_7741_SHELF_SEEN_FLAG]) return INCIDENT_7741_SHELF;
  const beat = Math.floor(Number(story.beatIndex) || 0);
  if (beat < INCIDENT_7741_BEAT) return [];
  if (listeningFieldScanCount(state) < INCIDENT_7741_REVISITS) return [];
  return INCIDENT_7741_SHELF;
}

// SP2-112 "The Verge-Layer's Toll Riddle" — the codex leg: the receipt as a lore page.
// The gate POI interaction (one-ring wake, artifact-in-hold check, hull/cargo/transponder
// weigh, Verge standing +3) is the unit's interaction leg; it writes the plain-named flag
// `verge_gate_receipt` — a simTime number, or { at, concerning: true } for the stricter
// verdict. Until a writer exists the receipt rows stay honestly empty.
export const VERGE_GATE_RECEIPT_FLAG = 'verge_gate_receipt';

export const VERGE_GATE_RECEIPT = Object.freeze([
  Object.freeze({ label: 'QUESTION ASKED', value: 'WHAT IS THE MASS OF A DECISION?', sealed: false }),
  Object.freeze({ label: 'WEIGHED', value: 'HULL · CARGO · TRANSPONDER HISTORY', sealed: false }),
  Object.freeze({ label: 'RING STATUS', value: 'CLOSED', sealed: true }),
  Object.freeze({ label: 'TOLL', value: 'ANSWERED', sealed: false }),
]);

/** The filed receipt, with the day read off the flag value. Empty until the gate writes it. */
export function vergeGateReceiptRows(state) {
  const flags = state?.story?.flags;
  const filed = flags && flags[VERGE_GATE_RECEIPT_FLAG];
  if (!filed) return [];
  const at = typeof filed === 'object' ? Number(filed.at) : Number(filed);
  const day = Number.isFinite(at) && at > 0 ? Math.floor(at / CAL_DAY_S) : null;
  const concerning = typeof filed === 'object' && filed.concerning === true;
  return [
    Object.freeze({ label: 'GATE RECEIPT', value: day != null ? `DAY ${day}` : 'DAY UNFILED', sealed: false }),
    ...VERGE_GATE_RECEIPT,
    Object.freeze({
      label: 'VERDICT',
      value: concerning ? 'CONSISTENT (CONCERNING)' : 'CONSISTENT',
      sealed: false,
    }),
  ];
}
