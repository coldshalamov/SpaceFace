import { CAL_DAY_S, CAL_YEAR_DAYS } from './worldCalendar.js';
import { SECTORS } from './sectors.js';
import { SHIPS } from './ships.js';

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

// ── special-500 Phase 2 (batch 12, codex family) ────────────────────────────────────────────
// Fourteen codex/lore reads, same pattern as the batch-1 rows above: frozen authored tables
// plus pure reads over durable state, failing closed (an empty list) until the world has
// honestly earned the page. The durable writer for every moment already exists — the
// special-500 director files `special500.<id>` when the entry's trigger fires — so each read
// keys on that receipt first, then accepts the consensus-named plain flag as an alternate
// writer seam where another leg owns the moment. None of these reads write anything.
//
// One plain flag is written by this batch: `morrow_hundred`, written by the Morrow launch
// path (src/systems/morrow.js) at the hundredth departure — the leg that owns the moment.

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

function sectorDisplayName(id) {
  const sector = SECTOR_BY_ID.get(id);
  if (sector && sector.name) return sector.name;
  return String(id || '').replace(/^sector_/, '').replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || 'an unrecorded place';
}

/** The director's durable receipt for one catalog moment: the simTime it fired, or null. */
function special500Moment(state, id) {
  const flags = state?.story?.flags;
  const at = flags ? Number(flags[`special500.${id}`]) : NaN;
  return Number.isFinite(at) && at >= 0 ? at : null;
}

function plainFlag(state, name) {
  const flags = state?.story?.flags;
  const value = flags ? flags[name] : undefined;
  return value !== undefined && value !== null && value !== false ? value : null;
}

function dayOf(at) {
  return Number.isFinite(at) && at > 0 ? Math.floor(at / CAL_DAY_S) : null;
}

// SP2-029 "The Buoy That Answers Anyway" — the retired channel buoy at the Listening Field.
// The third answer is the moment; the director files it on proximity. The consensus-named
// plain flag `buoy_keeping` would be written by the hail-count branch in the new
// hail-response data file (shared with SP2-018); until that leg lands, the read honestly
// waits on the director's receipt and accepts the plain flag if it ever appears.
export const BUOY_KEEPING_FLAG = 'buoy_keeping';

export const BUOY_KEEPING_TABLE = Object.freeze([
  Object.freeze({ label: 'CHANNEL', value: 'RETIRED', sealed: false }),
  Object.freeze({ label: 'REGISTRY', value: 'NO ENTRY FILED', sealed: false }),
  Object.freeze({ label: 'ANSWER', value: 'KEPT ANYWAY', sealed: false }),
  Object.freeze({ label: 'INSTRUCTION', value: 'DO NOT TELL THE NETWORK', sealed: true }),
]);

/** The buoy's answer, once it has answered anyway. Empty until then. */
export function buoyKeepingRows(state) {
  if (!special500Moment(state, 'SP2-029') && !plainFlag(state, BUOY_KEEPING_FLAG)) return [];
  return BUOY_KEEPING_TABLE;
}

// SPX-A-09 "The Half a Conversation" — the same buoy, after the keeping: it plays one side
// of an old argument and holds the other party's turns open as carrier silence. The
// bandpass/noise audio recipes for the bed belong with the hail-response leg; the page does
// not wait for them.
export const HALF_CONVERSATION_TABLE = Object.freeze([
  Object.freeze({ label: 'SIDE A', value: '"— BECAUSE I SIGNED FOR THE PAIR OF THEM, THAT\'S WHY —"', sealed: false }),
  Object.freeze({ label: 'SIDE B', value: 'CARRIER SILENCE', sealed: true }),
  Object.freeze({ label: 'PAUSE LENGTH', value: 'LONG ENOUGH TO ANSWER INTO', sealed: false }),
  Object.freeze({ label: 'CHANNEL HELD OPEN BY', value: 'NOBODY LIVING', sealed: false }),
]);

/** The half a conversation, once the buoy has been caught keeping. */
export function halfConversationRows(state) {
  if (!special500Moment(state, 'SPX-A-09')) return [];
  return HALF_CONVERSATION_TABLE;
}

// SPX-A-07 "The Abutment Weight" — the Tethys weigh clamp's abutment stone, chalked with a
// season of dated hull masses. The scan-copy is keyed to calendarDay(simTime) through the
// director's receipt: the day on the newest line is the day you idled there. Your hull's
// mass is read from the owned-ship record and the authored SHIPS table; a stale save with
// no hull degrades to UNLISTED, never to an invented number.
export const ABUTMENT_CHALK_TABLE = Object.freeze([
  Object.freeze({ label: 'STONE', value: 'WEIGH-CLAMP ABUTMENT, TETHYS JUNCTION', sealed: false }),
]);

export function abutmentHullLine(state) {
  const player = state && state.player ? state.player : {};
  const owned = Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const ship = owned[Number(player.activeShipIndex) || 0] || owned[0] || null;
  const def = ship && ship.defId ? SHIPS.find((s) => s.id === ship.defId) : null;
  if (!def) return 'HULL UNLISTED — THE CHALK WAITS FOR A NAME';
  const mass = Number.isFinite(def.mass) ? `${def.mass} T` : 'MASS UNLISTED';
  return `${String(def.name || def.id).toUpperCase()} · ${mass}`;
}

/** The chalk: your line, dated yesterday; the season of dates above it. */
export function abutmentChalkRows(state) {
  const at = special500Moment(state, 'SPX-A-07');
  if (at == null) return [];
  const day = dayOf(at);
  return [
    ...ABUTMENT_CHALK_TABLE,
    Object.freeze({
      label: 'YOUR LINE',
      value: `${abutmentHullLine(state)} — DATED YESTERDAY, DAY ${day != null ? day : 'UNFILED'}`,
      sealed: false,
    }),
    Object.freeze({
      label: 'THE CHALK',
      value: 'A SEASON OF DATES MARCHING UP THE STONE — THE NEWEST IS YOURS',
      sealed: false,
    }),
    Object.freeze({
      label: 'WHO WRITES IT',
      value: 'NOBODY ON THE ROSTER REMEMBERS',
      sealed: true,
    }),
  ];
}

// SP2-190 "The 47-A Refund" — Kessler's desk, Scale 4, one hundred days in. The release is
// the anomaly: the payment goes out in full under a dormant signature and is re-filed
// withheld before the ink dries. The tense swap lives in these rows — before the desk
// processes it, the page is empty; after, the file reads RELEASED and WITHHELD at once.
export const REFUND_47A_TABLE = Object.freeze([
  Object.freeze({ label: 'CONTRACT', value: '47-A', sealed: false }),
  Object.freeze({ label: 'ACTION', value: 'PAYMENT RELEASED, IN FULL, WITH INTEREST', sealed: false }),
  Object.freeze({ label: 'SIGNATURE', value: 'D. VALE, DORMANT', sealed: false }),
  Object.freeze({ label: 'BALANCE', value: 'RE-FILED — WITHHELD', sealed: false }),
  Object.freeze({ label: 'NOTE', value: 'THE DESK APOLOGIZES FOR THE HOPE', sealed: false }),
]);

/** The 47-A file in its released tense. Empty until the desk processes it (day 100 or later). */
export function refund47aRows(state) {
  const at = special500Moment(state, 'SP2-190');
  if (at == null) return [];
  const day = dayOf(at);
  return [
    Object.freeze({ label: 'FILED', value: day != null ? `DAY ${day}, SCALE 4` : 'SCALE 4, DATE UNFILED', sealed: false }),
    ...REFUND_47A_TABLE,
  ];
}

// SP2-001 "Maera Vols's Last Log" — the scorched crew-pod past the weigh-point, unmarked on
// any chart. The consensus names the plain flag `tessera_vols_found` (the scanner-receipt
// path); until a scanner leg writes it, the read honestly waits on the director's proximity
// receipt and accepts the plain flag as the alternate seam.
export const VOLS_FOUND_FLAG = 'tessera_vols_found';

export const VOLS_LAST_LOG_TABLE = Object.freeze([
  Object.freeze({ label: 'POD', value: 'SCORCHED CREW-POD — NOT ON ANY CHART', sealed: false }),
  Object.freeze({ label: 'TRANSPONDER', value: 'TESSERA / OLD RIG', sealed: false }),
  Object.freeze({ label: 'VOLLS, M.', value: '"TO WHOEVER INHERITS HER: SHE FLOATS BETTER THAN SHE STEERS."', sealed: false }),
  Object.freeze({ label: 'LOCATION NOTE', value: '"THIRD BULKHEAD, BEHIND THE PLATE."', sealed: false }),
  Object.freeze({ label: 'APOLOGY', value: '"I AM SORRY ABOUT THE PLATE."', sealed: true }),
]);

/** The last log, once the pod has caught the light. */
export function volsLastLogRows(state) {
  if (!special500Moment(state, 'SP2-001') && !plainFlag(state, VOLS_FOUND_FLAG)) return [];
  return VOLS_LAST_LOG_TABLE;
}

// SP2-031 "The Latch-Child's Rag" — a wreck left intact, no jettison, comes back tidied.
// The tidy moment fires on the director's daily hash; the memory record it files carries the
// sector, so the per-sector mark is a live read, not a second flag. The consensus-named
// per-sector flag writer (the wreck-dressing leg) would extend the mark to future wrecks;
// until it lands the record of the one tidy is honest.
export const LATCH_TIDY_TABLE = Object.freeze([
  Object.freeze({ label: 'WORK DONE', value: 'LOOSE PLATES STACKED · SALVAGE TAG STRAIGHTENED', sealed: false }),
  Object.freeze({ label: 'HULL NUMBER', value: 'REPLACED — A CHILD\'S DRAWING, WELDED', sealed: false }),
  Object.freeze({ label: 'THE DRAWING', value: 'A STICK-FIGURE TUG HOLDING A SMALLER STICK-FIGURE TUG', sealed: false }),
  Object.freeze({ label: 'REGISTRY STAMP', value: 'LATCH-CHILD, ORIGIN LAPSED', sealed: true }),
]);

/** The tidy receipt: what was done, and the sector the mark now persists in. */
export function latchTidyRows(state) {
  const at = special500Moment(state, 'SP2-031');
  if (at == null) return [];
  const record = state?.story?.depthProgramEncounters?.completed?.['special500.SP2-031'];
  const sectorId = record && typeof record === 'object' ? record.sectorId : null;
  return [
    Object.freeze({ label: 'WRECK', value: 'LEFT INTACT — NOTHING TAKEN', sealed: false }),
    ...LATCH_TIDY_TABLE,
    Object.freeze({
      label: 'THE MARK',
      value: sectorId
        ? `PERSISTS IN ${sectorDisplayName(sectorId).toUpperCase()} — FUTURE WRECKS KEEP IT`
        : 'PERSISTS WHERE IT WAS LEFT',
      sealed: false,
    }),
  ];
}

// SP1-099 "The Long Sentence" — the pre-Collapse beacon past the Tether Memorial. Each pulse
// advances one character; the director's receipt is the first-heard time and simTime does the
// rest, so the character state is a pure function of two saved numbers and survives Continue.
// One hour of attention files the whole sentence. It is not a loop.
export const LONG_SENTENCE = Object.freeze(
  'WE WERE SENT TO SURVEY WHAT THE CHART CALLS EMPTY. THE EMPTY WAS NOT EMPTY. '
  + 'WE ARE SORRY FOR THE NOISE WE MADE IN IT. WE ARE SORRY FOR THE LIGHT. '
  + 'THE LANE WE CUT IS STILL OPEN AND WE CANNOT CLOSE IT FROM HERE. '
  + 'IF ANYONE IS COUNTING PULSES: THE COUNT IS THE APOLOGY. '
  + 'IT WAS MEANT FOR WHOEVER CAME AFTER. YOU DID. THE BEACON HOLDS.',
);
export const LONG_SENTENCE_S = 3600; // one hour of attention, start to finish

/** The sentence so far, one character per pulse since the first-heard receipt. */
export function longSentenceRows(state) {
  const at = special500Moment(state, 'SP1-099');
  if (at == null) return [];
  const text = LONG_SENTENCE;
  const now = Number(state && state.simTime);
  const elapsed = Number.isFinite(now) ? Math.max(0, now - at) : 0;
  const chars = Math.min(text.length, Math.floor((elapsed / LONG_SENTENCE_S) * text.length));
  const complete = chars >= text.length;
  return [
    Object.freeze({ label: 'BEACON', value: 'PRE-COLLAPSE — ALPHABET MATCHES NO CATALOG', sealed: false }),
    Object.freeze({
      label: 'TRANSMISSION',
      value: complete ? text : (chars ? text.slice(0, chars) + ' ' : '') + '▌',
      sealed: false,
    }),
    Object.freeze({
      label: 'PROGRESS',
      value: `${chars} OF ${text.length} CHARACTERS — ONE PULSE, ONE CHARACTER, NOT A LOOP`,
      sealed: false,
    }),
    Object.freeze({
      label: 'WHEN COMPLETE',
      value: complete ? 'FILED IN FULL. THE APOLOGY STANDS.' : 'THE BEACON HAS TIME. COME BACK.',
      sealed: complete ? false : true,
    }),
  ];
}

// SP2-010 "0.7 Tonnes of Moisture" — the Shaft 7 stake's re-chalked tally plate. The DMC
// standing tick for leaving a water-ice unit at the stake (the cargo-consumption offering)
// has no live seam yet — deferred to the interaction leg, not invented here.
export const SHAFT_SEVEN_TALLY_TABLE = Object.freeze([
  Object.freeze({ label: 'TALLY PLATE', value: '9 / 11 RETURNED', sealed: false }),
  Object.freeze({ label: 'FILED AS', value: '0.7T MOISTURE', sealed: false }),
  Object.freeze({ label: 'SECOND HAND, DIFFERENT CHALK', value: 'THE MATH IS LEGAL. THE MATH IS NOT DONE.', sealed: false }),
  Object.freeze({ label: 'MEMORIAL CLAMP', value: 'TWO HELMETS, FACE OUT, STILL WATCHING THE LANE', sealed: false }),
]);

/** The stake's tally, once the plate has been re-chalked for you. */
export function shaftSevenTallyRows(state) {
  if (!special500Moment(state, 'SP2-010')) return [];
  return SHAFT_SEVEN_TALLY_TABLE;
}

// SP2-116 "Morrow's Hundredth Push" — the launches counter in state.morrow is the live owner
// (src/systems/morrow.js); the director's nth-100 receipt and the plain flag `morrow_hundred`
// (written by the launch path at the moment) stand in for stale or pruned counters.
export const MORROW_HUNDRED_FLAG = 'morrow_hundred';

export const MORROW_HUNDRED_TABLE = Object.freeze([
  Object.freeze({ label: 'ARRIVALS', value: 'THE SAME NUMBER', sealed: false }),
  Object.freeze({ label: 'THE TALLY, ALOUD', value: '"I HAVE STOPPED COUNTING ARRIVALS SEPARATELY."', sealed: false }),
  Object.freeze({ label: 'FINAL LINE', value: '"GO ON. THERE IS MORE SKY. THERE ALWAYS WAS."', sealed: false }),
]);

/** Morrow's hundredth-departure tally, read off the launches counter it owns. */
export function morrowHundredRows(state) {
  const launches = Math.max(0, Math.floor(Number(state?.morrow?.launches)) || 0);
  const moment = special500Moment(state, 'SP2-116');
  const receipt = plainFlag(state, MORROW_HUNDRED_FLAG);
  if (launches < 100 && moment == null && receipt == null) return [];
  const count = launches >= 100 ? launches : 'ONE HUNDRED';
  return [
    Object.freeze({ label: 'DEPARTURES', value: String(count), sealed: false }),
    ...MORROW_HUNDRED_TABLE,
  ];
}

// SP1-023 "The Checkpoint Cat" — the maintenance drone logged as equipment, morale. The
// plain flag `checkpoint_cat` (the persistent-prop leg that would perch the drone at every
// later Concord checkpoint) has no writer yet; the read honestly waits on the director's
// receipt and accepts the plain flag when that leg lands.
export const CHECKPOINT_CAT_FLAG = 'checkpoint_cat';

export const CHECKPOINT_CAT_TABLE = Object.freeze([
  Object.freeze({ label: 'OBJECT', value: 'MAINTENANCE DRONE, PERCHED', sealed: false }),
  Object.freeze({ label: 'POST', value: 'SCAN-RING EMITTER, CHECKPOINT NINER', sealed: false }),
  Object.freeze({ label: 'DESIGNATION', value: 'EQUIPMENT, MORALE', sealed: false }),
  Object.freeze({ label: 'EXAMINER\'S DENIAL', value: 'FILED IN WRITING — POSTED BESIDE THE DRONE', sealed: true }),
]);

/** The drone's paperwork, once it has adopted a checkpoint in your presence. */
export function checkpointCatRows(state) {
  if (!special500Moment(state, 'SP1-023') && !plainFlag(state, CHECKPOINT_CAT_FLAG)) return [];
  return CHECKPOINT_CAT_TABLE;
}

// SP2-189 "The First Jump Attribution" — the lanes registry's quietest line. The private
// jump counter (never shown, by design) has no live writer yet — the receipt path would
// carry it in the jump-arrive leg; until then the jump-1 receipt is real (the director
// files it on the first jump:arrive of a save) and the jump-100 row honestly waits on the
// plain flag `jump100`.
export const JUMP100_FLAG = 'jump100';

export const JUMP_LOG_TABLE = Object.freeze([
  Object.freeze({ label: 'JUMP 1', value: 'LOGGED', sealed: false }),
  Object.freeze({ label: 'WELCOME', value: 'TO THE LANES', sealed: false }),
  Object.freeze({ label: 'THE MASS', value: 'KNEW YOU WERE COMING. IT ALWAYS DOES.', sealed: false }),
  Object.freeze({ label: 'PRIVATE COUNTER', value: 'NEVER SHOWN', sealed: true }),
]);

/** The jump log: the first-jump receipt, plus the hundredth line once a writer files it. */
export function jumpLogRows(state) {
  const at = special500Moment(state, 'SP2-189');
  if (at == null) return [];
  const rows = [...JUMP_LOG_TABLE];
  if (plainFlag(state, JUMP100_FLAG)) {
    rows.push(Object.freeze({ label: 'JUMP 100', value: 'THE MASS STILL KNOWS. KEEP GOING.', sealed: false }));
  }
  return rows;
}

// SP2-130 "The Gallery Rock Exhibition" — Gallery Rock, accessioned. The scan-copy keys on
// the marking state: the catalog fires this only after Rubric's own marking (SP2-120), so
// the director's receipt is the marking read. Later Rubric markings citing the accession
// number belong to the Rubric leg, not this page.
export const GALLERY_ACCESSION_TABLE = Object.freeze([
  Object.freeze({ label: 'EXHIBIT', value: 'A', sealed: false }),
  Object.freeze({ label: 'WELD-BEAD TEXT', value: 'THIS ROCK IS FINE. THE LABEL IS FOR YOU.', sealed: false }),
  Object.freeze({ label: 'STAMP', value: 'HM-11', sealed: false }),
  Object.freeze({ label: 'COLLECTION', value: 'GALLERY ROCK — PERMANENT COLLECTION', sealed: false }),
  Object.freeze({ label: 'ACCESSION NO.', value: '1', sealed: false }),
]);

/** The accession record, once the rock has been marked and re-scanned. */
export function galleryAccessionRows(state) {
  if (!special500Moment(state, 'SP2-130')) return [];
  return GALLERY_ACCESSION_TABLE;
}

// SP2-143 "The Chess Game In The Nebula" — the derelict pair nose-to-nose over the table.
// The visit counter the followup names has no live writer (the director files the first
// visit once), so the draw — three visits, a stalemate, the light out forever — honestly
// waits on the plain flag `long_game_drawn`. Until then the page records the standing game.
export const LONG_GAME_DRAWN_FLAG = 'long_game_drawn';

export const LONG_GAME_TABLE = Object.freeze([
  Object.freeze({ label: 'HULLS', value: 'TWO, DOCKED NOSE-TO-NOSE — POWER COLD', sealed: false }),
  Object.freeze({ label: 'TABLE', value: 'MID-GAME — ONE PIECE MOVED PER VISIT', sealed: false }),
  Object.freeze({ label: 'NOTATION SHEET', value: 'BOTH HANDS THE SAME', sealed: true }),
  Object.freeze({ label: 'RUNNING', value: 'ELEVEN YEARS, RESUMED EVERY FEW CYCLES', sealed: false }),
]);

/** The long game's standing state; the draw row appears only when the visits leg writes it. */
export function longGameRows(state) {
  if (!special500Moment(state, 'SP2-143')) return [];
  const drawn = plainFlag(state, LONG_GAME_DRAWN_FLAG) != null;
  const rows = [...LONG_GAME_TABLE];
  rows.push(Object.freeze({
    label: 'GAME STATE',
    value: drawn ? 'A DRAW. THE LIGHT IS OUT. IT WAS NEVER GOING TO END ANY OTHER WAY.' : 'IN PROGRESS — ONE PIECE, EVERY VISIT',
    sealed: drawn,
  }));
  return rows;
}

// SP3-016 "The Photographer's Second" — the yearly four-second alignment in Helios Prime.
// The calendar trigger is the director's (day 16, a four-second window, every year); the
// frame's year is read off the receipt. Capture — a scan pulse fired inside the window —
// has no live writer yet, so the capture row states the condition instead of claiming the
// frame, and accepts the plain flag `alignment_kept` when that hook lands.
export const ALIGNMENT_KEPT_FLAG = 'alignment_kept';

export const ALIGNMENT_TABLE = Object.freeze([
  Object.freeze({ label: 'ALIGNMENT', value: 'GIANT LIMB · RING-EDGE · COMET TAIL · HULL GLINT', sealed: false }),
  Object.freeze({ label: 'WINDOW', value: 'FOUR SECONDS, ONCE PER YEAR', sealed: false }),
]);

/** The alignment receipt: the frame composed, and whether anyone kept it. */
export function alignmentRows(state) {
  const at = special500Moment(state, 'SP3-016');
  if (at == null) return [];
  const dayIndex = Math.floor(Math.max(0, at) / CAL_DAY_S);
  const year = Math.floor(dayIndex / CAL_YEAR_DAYS);
  const kept = plainFlag(state, ALIGNMENT_KEPT_FLAG) != null;
  return [
    ...ALIGNMENT_TABLE,
    Object.freeze({ label: 'FRAME', value: `DAY 16, YEAR ${year} — COMPOSED WHETHER OR NOT ANYONE LOOKED`, sealed: false }),
    Object.freeze({
      label: 'CAPTURE',
      value: kept ? 'KEPT — THE SCANNER FIRED INSIDE THE WINDOW' : 'FIRE THE SCANNER INSIDE THE WINDOW',
      sealed: false,
    }),
  ];
}
