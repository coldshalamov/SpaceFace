import { CAL_DAY_S, CAL_YEAR_DAYS, stationShiftAt, stormSeasonAt } from './worldCalendar.js';
import { SECTORS } from './sectors.js';
import { SHIPS } from './ships.js';
import { COMMODITIES } from './commodities.js';
import { aceById } from './namedAces.js';
import { QUILL } from './quill.js';

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

// ── special-500 Phase 2 (batch 13, codex family) ────────────────────────────────────────────
// Fourteen more codex/lore reads, same pattern as batches 1 and 12: frozen authored tables
// plus pure reads over durable state, failing closed (an empty list) until the world has
// honestly earned the page. The director's `special500.<id>` receipt is the durable writer
// for every moment; where the consensus names a plain flag for another leg's writer, the
// read accepts it as an alternate seam. None of these reads write anything.
//
// Live owners these reads key on beyond the receipts: the chronicler's kill facts (the
// plinth's witnessed-death gate), the scanner's per-signal record (the cockpit manifest's
// scan counter), the economy trade ledger (the discontinued cargo's sale date), and the
// calendar's station watches (the welding constellation's third-watch visibility).

// The Tessera's registration, as the wires and the Helix ping keep reading it out
// (src/data/narrative.js). The tide ledger's odometer whimsy reads its last digit off this
// authored registry line — the one hull number every save actually carries.
export const TESSERA_REGISTRY = 'VHL-4471-T';
export const TESSERA_HULL_DIGIT = (TESSERA_REGISTRY.match(/\d(?=\D*$)/) || ['0'])[0];

/** Any ship death the chronicler has on file for one sector — the plinth's honest gate. */
export function witnessedDeathsInSector(state, sectorId) {
  const stories = state?.chronicler?.stories;
  if (!Array.isArray(stories)) return 0;
  let count = 0;
  for (const story of stories) {
    if (!story || !Array.isArray(story.nodes)) continue;
    for (const fact of story.nodes) {
      if (fact && fact.stage === 'kill' && (fact.sectorId === sectorId
        || (typeof fact.sectorName === 'string'
          && String(sectorId).replace(/^sector_/, '').replace(/_/g, ' ')
            === fact.sectorName.toLowerCase()))) count++;
    }
  }
  return count;
}

// SP2-009 "The Twenty-Fifth Plinth" — the Candle Fleet memorial's dark plinth, Helios Prime.
// The scan interaction's receipt is the consensus-named plain flag `candle_count_understood`;
// the scan leg does not exist yet, so the read honestly waits on the director's proximity
// receipt AND a witnessed death (a chronicler kill fact in-sector) — both are live reads.
// The plinth-light session behavior after a near-death belongs to that scan leg, not this page.
export const CANDLE_COUNT_UNDERSTOOD_FLAG = 'candle_count_understood';

export const PLINTH_TABLE = Object.freeze([
  Object.freeze({ label: 'PLINTH', value: 'THE TWENTY-FIFTH — KEPT DARK ON PURPOSE', sealed: false }),
  Object.freeze({
    label: 'THE CLERK\'S LINE',
    value: '"WE LIGHT TWENTY-FOUR BECAUSE TWENTY-FIVE IS WHOEVER IS OUT THERE RIGHT NOW. '
      + 'IT GOES ON WHEN YOU DON\'T COME BACK. WELCOME TO THE COUNT."',
    sealed: false,
  }),
  Object.freeze({ label: 'THE LIGHT', value: 'BREATHES ONCE, THEN HOLDS', sealed: false }),
  Object.freeze({ label: 'THE COUNT', value: 'OPEN — THE NEXT NAME IS WHOEVER DOESN\'T COME BACK', sealed: false }),
]);

/** The plinth's one stored line, once a death has been witnessed here and the scan answers. */
export function plinthRows(state) {
  const answered = special500Moment(state, 'SP2-009') != null
    || plainFlag(state, CANDLE_COUNT_UNDERSTOOD_FLAG) != null;
  if (!answered) return [];
  if (witnessedDeathsInSector(state, 'sector_helios_prime') < 1) return [];
  return PLINTH_TABLE;
}

// SP2-166 "The Preserved Cockpit's Manifest" — the sealed cockpit in Charon Expanse. The
// scanner's durable per-signal record is the live scan counter (the same retained-reading
// bag the batch-1 shelf reads); the counter leg's session-separated tally would write the
// plain numeric flag `cockpit_manifest` and does not exist yet. Pruned records degrade to
// the director's discovery receipt, never to an invented line count.
export const COCKPIT_MANIFEST_FLAG = 'cockpit_manifest';
export const COCKPIT_POI_ID = 'poi_charon_preserved_cockpit';
export const COCKPIT_MANIFEST_LINES = Object.freeze([
  'ONE (1) PAIR WORK GLOVES, WORN RIGHT',
  'ONE (1) THERMOS, STOWED WARM-SIDE DOWN',
  'ONE (1) PAPERBACK, WATER-COCKED',
  'ONE (1) SECOND PAPERBACK, SAME BOOK',
  'ONE (1) NOTE: "SO YOU DON\'T FINISH IT TOO FAST"',
]);

/** How many scans the cockpit's signal has on file (the record's count, or the counter leg's
 * plain flag). The director's discovery receipt is not a scan and files no line. */
export function cockpitScanCount(state) {
  const record = state?.signalInvestigation?.records?.[`signal:poi:${COCKPIT_POI_ID}`];
  const scans = Number(record && record.scanCount) || 0;
  const counted = Math.max(0, Math.floor(Number(plainFlag(state, COCKPIT_MANIFEST_FLAG)) || 0));
  return Math.max(scans, counted);
}

/** The manifest so far: one more line per scan — items being added, not recovered. A save
 * whose record was pruned still shows the page off the discovery receipt, honestly empty. */
export function cockpitManifestRows(state) {
  const scans = cockpitScanCount(state);
  if (scans < 1 && special500Moment(state, 'SP2-166') == null) return [];
  const shown = Math.min(scans, COCKPIT_MANIFEST_LINES.length);
  const rows = [
    Object.freeze({ label: 'COCKPIT', value: 'PRESERVED — SEALED, LIT, OCCUPIED', sealed: false }),
  ];
  for (let i = 0; i < shown; i++) {
    rows.push(Object.freeze({ label: `LINE ${i + 1}`, value: COCKPIT_MANIFEST_LINES[i], sealed: false }));
  }
  if (shown >= COCKPIT_MANIFEST_LINES.length) {
    rows.push(Object.freeze({
      label: 'LAST LINE',
      value: 'ONE (1) PILOT, PRESERVED, DO NOT WAKE UNTIL THE BELT IS SAFE. STATUS: [REDACTED]',
      sealed: true,
    }));
  } else {
    rows.push(Object.freeze({
      label: 'THE MANIFEST',
      value: 'ONE MORE LINE EVERY SESSION — ITEMS BEING ADDED, NOT RECOVERED',
      sealed: false,
    }));
  }
  return rows;
}

// SP2-164 "The Warm Freighter's Order" — the crewless galley in Charon Expanse. The
// jettison-alongside delivery and the station-tab writer ("PAID — KITCHEN") belong to the
// counter/vendor legs; until they land, the page carries the PA's own announcement — read
// off the director's receipt, with the order naming whatever food the hold actually has.
export const KITCHEN_POI_ID = 'poi_charon_warm_freighter';

const FOOD_BY_ID = new Map(COMMODITIES.filter((c) => c.category === 'food').map((c) => [c.id, c]));

/** The first food commodity the hold actually carries, or null. */
export function holdFoodName(state) {
  const cargo = state?.player?.cargo?.items;
  if (!cargo || typeof cargo !== 'object') return null;
  for (const [id, qty] of Object.entries(cargo)) {
    if ((Number(qty) || 0) > 0 && FOOD_BY_ID.has(id)) return FOOD_BY_ID.get(id).name;
  }
  return null;
}

/** The galley PA's order, once the vent has breathed. Empty until the receipt. */
export function kitchenRows(state) {
  if (special500Moment(state, 'SP2-164') == null) return [];
  const food = holdFoodName(state);
  return [
    Object.freeze({ label: 'GALLEY VENT', value: 'BREATHED ONCE — A REAL, THERMAL EVENT', sealed: false }),
    Object.freeze({
      label: 'THE PA',
      value: `"ORDER FOR ${food ? String(food).toUpperCase() : 'WHOEVER IS HOLDING FOOD'}, `
        + 'TABLE FOR CREW COUNT: ZERO. KITCHEN IS OPEN. KITCHEN HAS ALWAYS BEEN OPEN."',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE DELIVERY',
      value: 'JETTISON ALONGSIDE — TAKEN IN BY A MECHANISM NOBODY SEES',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE TAB',
      value: 'ONE MEAL AT EVERY CHARON DOCK — MARKED PAID — KITCHEN',
      sealed: false,
    }),
  ];
}

// SP2-192 "The B8 Coordinates Bloom" — the Helix audit's unresolvable point, Veil Nebula.
// The chain reads story_b8_helix_audit (the audit's own flag, filed by the comms story) AND
// the director's communicator receipt; the consensus-named plain flag `b8_resolved` is the
// coordinate-reveal leg's receipt and opens the page on its own. The standing-in-the-spot
// reveal itself is that leg's moment, not this page's.
export const B8_RESOLVED_FLAG = 'b8_resolved';
export const B8_HELIX_AUDIT_FLAG = 'story_b8_helix_audit';

export const PHOTOGRAPH_TABLE = Object.freeze([
  Object.freeze({
    label: 'THE FILE',
    value: 'COORDINATES DO NOT RESOLVE — FILED AS UNRESOLVABLE, YEAR AFTER YEAR',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE STAND',
    value: 'THEY RESOLVE — ALL AT ONCE, FOR WHOEVER IS STANDING IN THEM WITH THE SALVAGED COMMUNICATOR',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE PINGS',
    value: 'A BLOOM OF HELIX VARIANCE, EVERY ONE POINTING AT ONE EMPTY PATCH OF SPACE',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE HOLE',
    value: 'BY EVERY INSTRUMENT, EXACTLY ONE HULL-SIZED HOLE IN THE UNIVERSE',
    sealed: false,
  }),
  Object.freeze({
    label: 'VERDICT',
    value: 'THE FILE WAS NEVER WRONG. THE FILE WAS A PHOTOGRAPH.',
    sealed: false,
  }),
]);

/** The photograph, once the audit has been read and the spot has been stood in. */
export function photographRows(state) {
  const flags = state?.story?.flags;
  const audited = !!(flags && flags[B8_HELIX_AUDIT_FLAG]);
  if (!plainFlag(state, B8_RESOLVED_FLAG)
    && !(special500Moment(state, 'SP2-192') != null && audited)) return [];
  return PHOTOGRAPH_TABLE;
}

// SP2-138 "The Scale Zero Rock" — the mass-0.0 rock in Nereid Shoal, and the one unit of a
// commodity no market lists anymore. The codex-only commodity page (Discontinued Cargo)
// lives in codexPages.js; the sale-date rewrite is a live read off the economy trade
// ledger's sell row, and states the condition until a row exists. The seeded rock and its
// massline override belong to the spawn leg, not this page.
export const DISCONTINUED_CARGO_ID = 'cmdty_discontinued_cargo';

/** The ledger's sell row for the discontinued unit, if the Archive berth has ever bought one. */
function discontinuedSaleRow(state) {
  const ledger = state?.player?.tradeLedger;
  if (!Array.isArray(ledger)) return null;
  for (const row of ledger) {
    if (row && row.commodityId === DISCONTINUED_CARGO_ID && row.side === 'sell') return row;
  }
  return null;
}

/** The void stasis crate's receipt: the readings, the withheld answer, and the sale. */
export function voidCrateRows(state) {
  if (special500Moment(state, 'SP2-138') == null) return [];
  const sale = discontinuedSaleRow(state);
  const rows = [
    Object.freeze({ label: 'SCANNER', value: 'MASS 0.0', sealed: false }),
    Object.freeze({ label: 'MASSLINE', value: 'PULLS HEAVY', sealed: false }),
    Object.freeze({
      label: 'INTERIOR',
      value: 'VOID STASIS CRATE — MASS-CANCELED, OLDER THAN THE CHARTER',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE GLYPH',
      value: 'WHAT WAS STORED HERE? (ANSWER WITHHELD)',
      sealed: true,
    }),
    Object.freeze({
      label: 'THE CARGO',
      value: 'ONE UNIT — DISCONTINUED. NO MARKET LISTS IT ANYMORE.',
      sealed: false,
    }),
  ];
  rows.push(Object.freeze({
    label: 'THE SALE',
    value: sale
      ? `SOLD — DAY ${dayOf(Number(sale.seenAt)) != null ? dayOf(Number(sale.seenAt)) : 'UNFILED'}`
        + `${sale.stationId ? `, ${String(sale.stationId).toUpperCase()}` : ''} — THIS PAGE REWROTE ITSELF`
      : 'HOLD IT. THE PAGE REWRITES ITSELF THE DAY AN ARCHIVE BERTH BUYS IT.',
    sealed: false,
  }));
  return rows;
}

// SP2-039 "The Forty-First Hull" — the Listening Field's board, Io Reach, which has been
// counting the player the whole time. The transit counter's own receipt is the
// consensus-named plain flag `counted_counted` (the counter leg does not exist yet); the
// read accepts it beside the director's receipt. The Quiet standing tick belongs to that leg.
export const COUNTED_COUNTED_FLAG = 'counted_counted';

export const QUIET_COUNT_TABLE = Object.freeze([
  Object.freeze({ label: 'REGISTERED', value: 'FORTY-ONE', sealed: false }),
  Object.freeze({ label: 'OBSERVED', value: 'FORTY-TWO', sealed: false }),
  Object.freeze({ label: 'THE DIFFERENCE', value: 'ALWAYS YOU', sealed: false }),
  Object.freeze({
    label: 'THE BOARD',
    value: 'AMENDED ITSELF MID-SCAN — IT HAS BEEN COUNTING YOU THE WHOLE TIME',
    sealed: false,
  }),
  Object.freeze({
    label: 'FILED UNDER',
    value: 'THE QUIET — THEY RESPECT A FELLOW BOOKKEEPER',
    sealed: false,
  }),
]);

/** The Quiet count, once the board has amended itself for you. */
export function quietCountRows(state) {
  if (!special500Moment(state, 'SP2-039') && !plainFlag(state, COUNTED_COUNTED_FLAG)) return [];
  return QUIET_COUNT_TABLE;
}

// SP3-025 "The Sling Chime" — the Anvil gravity-assist band, Tethys Junction. The
// sling-band predicate and the shared harmonic are the bespoke setpiece leg; the codex page
// ("mass made audible") reads the director's sector-entry receipt.
export const SLING_BAND = Object.freeze({
  sectorId: 'sector_tethys_junction',
  minSpeedWuS: 140,
  minRadius: 1040,
  maxRadius: 1450,
});

export const SLING_CHIME_TABLE = Object.freeze([
  Object.freeze({
    label: 'THE BAND',
    value: 'THE ANVIL SLING — TANGENTIAL, ABOVE 140 WU/S, BETWEEN r 1040 AND r 1450',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE HARMONIC',
    value: 'SWELLS UNDER THE BAND CHATTER — MASS MADE AUDIBLE',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE ARCS',
    value: 'EVERY PREDICTOR LINE AND ENGINE TRAIL BENDS INTO THE SAME FAMILY',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE HAULERS',
    value: 'ALL SING THE SAME NOTE AT THE SAME PLACE ON THE CURVE',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE LAW',
    value: 'THE MOST LAWLIKE SOUND IN THE SECTOR — EVEN THE PIRATES CROSS IT POLITELY',
    sealed: false,
  }),
]);

/** The chime's page, once the band has been crossed fast enough to sing. */
export function slingChimeRows(state) {
  if (special500Moment(state, 'SP3-025') == null) return [];
  return SLING_CHIME_TABLE;
}

// SP1-156 "The Dust Script" — the calm fog patches in Veil Nebula, where wakes hold. The
// ephemeral per-visit wake polyline is the visual leg's canvas; the codex thread is the
// daily writer's. The read keys on the director's Murmur Buoy proximity receipt.
export const DAILY_WRITER_NOTE = Object.freeze({
  line: 'RE-CARVED FRESH EVERY DAY FOR YEARS',
  signed: 'BY A PILOT EVERYONE THOUGHT DIED',
});

export const DUST_SCRIPT_TABLE = Object.freeze([
  Object.freeze({ label: 'THE DUST', value: 'THE CALM PATCHES HOLD WAKES FOR HOURS', sealed: false }),
  Object.freeze({
    label: 'THE SCRIPT',
    value: 'OLD ROUTES · A NAME · AN ARROW POINTING AT NOTHING, PATIENTLY',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE FADE RATE',
    value: 'THE SAME HONEST RATE AS EVERYTHING ELSE — INCLUDING YOURS',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE DAILY LINE',
    value: `${DAILY_WRITER_NOTE.line} — SIGNED ${DAILY_WRITER_NOTE.signed}`,
    sealed: false,
  }),
  Object.freeze({
    label: 'YOUR LINE',
    value: 'LASTS EXACTLY AS LONG AS ANYONE\'S — THE DUST DOES NOT KEEP FAVORITES',
    sealed: false,
  }),
]);

/** The dust's script, once the calm patch has shown you a wake that will not fade. */
export function dustScriptRows(state) {
  if (special500Moment(state, 'SP1-156') == null) return [];
  return DUST_SCRIPT_TABLE;
}

// SP2-153 "The Triton Tithe Audit" — the Watcher's rim, which curates what you leave. The
// rim jettison counter and the guaranteed find belong to their own legs; the read accepts
// the consensus-named plain flag `tithe_notices` beside the director's receipt.
export const TITHE_NOTICES_FLAG = 'tithe_notices';

export const RIM_TITHE_TABLE = Object.freeze([
  Object.freeze({
    label: 'THE TALLY PLATE',
    value: '3 FOR 3. NOBODY EVER TAKES. YOU KEPT GIVING ANYWAY. THE RIM NOTICES.',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE ARRANGEMENT',
    value: 'YOUR OFFERINGS IN A NEAT ROW, SQUARED TO THE DARK',
    sealed: false,
  }),
  Object.freeze({
    label: 'SIGNATURE',
    value: 'A SINGLE GLYPH — THE WATCHER\'S OWN',
    sealed: true,
  }),
  Object.freeze({
    label: 'THE RIM\'S LEDGER',
    value: 'THE RIM DOES NOT PAY. THE RIM NOTICES. THESE ARE DIFFERENT THINGS.',
    sealed: false,
  }),
]);

/** The curated tithe, once the rim has squared your offerings to the dark. */
export function rimTitheRows(state) {
  if (!special500Moment(state, 'SP2-153') && !plainFlag(state, TITHE_NOTICES_FLAG)) return [];
  return RIM_TITHE_TABLE;
}

// SP2-155 "The Orcus Tide Ledger" — the transponder gate's sun-bleached odometer. The
// hold-timer is the counter leg's moment; its receipt is the consensus-named plain flag
// `tide_wound`. The odometer's next reading ends in the last digit of the hull's
// registration — read off the authored Tessera registry line, not invented.
export const TIDE_WOUND_FLAG = 'tide_wound';
export const TIDE_CYCLE = '4,110';

export const TIDE_LEDGER_TABLE = Object.freeze([
  Object.freeze({ label: 'ODOMETER', value: `CYCLE ${TIDE_CYCLE}`, sealed: false }),
  Object.freeze({
    label: 'STAMPED',
    value: `COUNT CORRECT AS OF CYCLE ${TIDE_CYCLE}`,
    sealed: false,
  }),
  Object.freeze({ label: 'THE WINDER', value: 'NOBODY HAS EVER BEEN SEEN WINDING IT', sealed: true }),
  Object.freeze({
    label: 'THE WINDMILL-SHAPED COMPONENT',
    value: 'THE DARK\'S BEST-KEPT SECRET AND ITS LEAST-KEPT SECRET, SIMULTANEOUSLY',
    sealed: false,
  }),
]);

/** The tide ledger, once you have sat through a full cycle at the gate. */
export function tideLedgerRows(state) {
  if (!special500Moment(state, 'SP2-155') && !plainFlag(state, TIDE_WOUND_FLAG)) return [];
  return [
    ...TIDE_LEDGER_TABLE,
    Object.freeze({
      label: 'THE NEXT READING',
      value: `ENDS IN A ${TESSERA_HULL_DIGIT} — THE LAST DIGIT OF YOUR HULL'S REGISTRATION`,
      sealed: false,
    }),
  ];
}

// SP3-145 "The Jukebox Ghost" — the Pale Holiday's one unexplained audio artifact. The
// detuned off-scale recipe is the audio leg's (gated inside the festival window, one play
// per sitting); the barkeep's barContact line is its own leg. The codex entry reads the
// director's calendar receipt — day 33, the window the festival row already keeps.
export const JUKEBOX_TABLE = Object.freeze([
  Object.freeze({
    label: 'THE TRACK',
    value: 'SLOW, WRONG-TEMPERATURE — NO RECIPE IN THE CATALOG MATCHES',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE ENDING',
    value: 'THE JUKEBOX\'S MECHANICAL RESET CLUNK',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE ROOM',
    value: 'LISTENED ALL THE WAY THROUGH. NOBODY DANCED.',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE BARKEEP',
    value: '"NOBODY LOADED THAT."',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE HOLIDAY',
    value: 'THE PALE HOLIDAY, DAY 33 — SIGNALS RUN STRANGE ON SCHEDULE',
    sealed: false,
  }),
]);

/** The jukebox's page, once the Pale Holiday has cut the mix for you. */
export function jukeboxRows(state) {
  if (special500Moment(state, 'SP3-145') == null) return [];
  return JUKEBOX_TABLE;
}

// SP3-091 "The Welding Constellation" — the construction frame off the abandoned Charon
// colony. The drone flash timings and the bearing data row are the spectacle leg's; the
// codex entry reads the director's proximity receipt, and the watch row is a live read off
// the calendar (third watch at the frame's own clock, stationShiftAt).
export const CONSTELLATION_FRAME_ID = 'poi_colony';

export const CONSTELLATION_TABLE = Object.freeze([
  Object.freeze({
    label: 'THE FRAME',
    value: 'LONE CONSTRUCTION FRAME, OFF THE COLONY — WELD SCHEDULE AS USUAL',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE PATTERN',
    value: 'FROM ONE BEARING THE DRONE FLASHES READ AS A CONSTELLATION\'S DOTS',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE BEARING',
    value: 'MARKED ON THE CHART\'S MARGIN — THIRD WATCH ONLY',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE PLATE',
    value: '"THE SKY WE CAME FROM."',
    sealed: false,
  }),
  Object.freeze({
    label: 'ON INSPECTION',
    value: 'THE DRONES ARE JUST FOLLOWING THE WELD SCHEDULE. BOTH THINGS ARE TRUE.',
    sealed: false,
  }),
]);

/** The constellation's page, plus whether the frame is on third watch right now. */
export function constellationRows(state) {
  if (special500Moment(state, 'SP3-091') == null) return [];
  const now = Number(state && state.simTime);
  const showing = Number.isFinite(now)
    && stationShiftAt(CONSTELLATION_FRAME_ID, now).id === 'third';
  return [
    ...CONSTELLATION_TABLE,
    Object.freeze({
      label: 'TONIGHT',
      value: showing
        ? 'THIRD WATCH AT THE FRAME — THE PATTERN IS SHOWING'
        : 'NOT THIRD WATCH AT THE FRAME — THE PATTERN KEEPS THE WELD SCHEDULE',
      sealed: false,
    }),
  ];
}

// SP3-199 "The 500th Rock" — the Tally: a painted survey mark, one rock per field, one
// person's decade project. The seeded painted-rock flag and the strike pitch belong to the
// spawn leg; its counter would write the plain numeric flag `tally_marks` (marks found,
// 1–10). Until a writer exists, the director's strike receipt is the one honest mark.
export const TALLY_MARKS_FLAG = 'tally_marks';
export const TALLY_SCALE_NOTES = 10;

/** How many of the scale's notes you have heard: the counter's flag, or the one receipt. */
export function tallyMarksFound(state) {
  const counted = Math.max(0, Math.floor(Number(plainFlag(state, TALLY_MARKS_FLAG)) || 0));
  const receipt = special500Moment(state, 'SP3-199') != null ? 1 : 0;
  return Math.min(TALLY_SCALE_NOTES, Math.max(counted, receipt));
}

/** The Tally's page: the mark, the note, and how much of the scale you have heard. */
export function tallyRows(state) {
  const found = tallyMarksFound(state);
  if (found < 1) return [];
  const complete = found >= TALLY_SCALE_NOTES;
  return [
    Object.freeze({
      label: 'THE MARK',
      value: 'A SMALL PAINTED 500 AND FORTY STROKES UNDER IT',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE RING',
      value: 'ONE CLEAN NOTE, LOWER THAN THE ROCK HAS ANY RIGHT TO BE',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE TALLY',
      value: 'A SURVEY MARK — ONE PERSON\'S DECADE PROJECT, ONE ROCK PER FIELD',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE SCALE',
      value: complete
        ? 'TEN NOTES, ALL HEARD — THE BELT WAS LEFT TUNED, AND NOW IT IS PLAYED'
        : `TEN NOTES LONG — ${found} HEARD SO FAR`,
      sealed: complete,
    }),
    Object.freeze({
      label: 'THE PAINTER',
      value: 'SPENT TEN YEARS PAINTING AN INSTRUMENT, THEN STOPPED COUNTING AT FIVE HUNDRED',
      sealed: false,
    }),
  ];
}

// SP2-135 "The Dione Customs Coin" — stamped after both liens are paid, valid everywhere
// once. The coin item and the one-use dispute waiver are the vendor/cargo legs; their
// retirement receipt is the plain flag `dione_coin_retired`, which does not exist yet —
// the page carries the stamp and the honest "still in hand" until it does. Customs
// standing +4 belongs to the interaction leg, not this page.
export const DIONE_COIN_RETIRED_FLAG = 'dione_coin_retired';

/** The coin's page: the stamp, the caveat, and whether the nail has it now. */
export function customsCoinRows(state) {
  if (!special500Moment(state, 'SP2-135') && !plainFlag(state, DIONE_COIN_RETIRED_FLAG)) return [];
  const retired = plainFlag(state, DIONE_COIN_RETIRED_FLAG) != null;
  return [
    Object.freeze({
      label: 'THE COIN',
      value: 'ONE (1) HULL SETTLED TWO (2) LIENS',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE STAMP',
      value: 'THIS COIN IS LEGAL NOWHERE AND VALID EVERYWHERE',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE WITNESS',
      value: 'CUSTOMS WATCHED YOU EARN IT — WHICH IS THE ONLY REASON IT WORKS',
      sealed: false,
    }),
    Object.freeze({
      label: 'SPENT',
      value: retired
        ? 'RETIRED — DRILLED, AND NAILED TO THE CUSTOMS HALL WALL'
        : 'STILL IN HAND — IT WORKS ONCE, ON THE AUTHORED DISPUTE, HONESTLY SETTLED',
      sealed: retired,
    }),
  ];
}

// ── special-500 Phase 2 (batch 14, codex family) ────────────────────────────────────────────
// Fourteen more codex/lore reads, same pattern as batches 1, 12 and 13: frozen authored tables
// plus pure reads over durable state, failing closed (an empty list) until the world has
// honestly earned the page. The director's `special500.<id>` receipt is the durable writer for
// every live moment; where the consensus names a plain flag for another leg's writer, the read
// accepts it as an alternate seam and states the condition until that leg lands. SP2-114's
// catalog entry is still dormant (no delivery-timing read exists), so its read gates on the
// consensus-named plain flag alone and honestly waits. None of these reads write anything.
//
// Live owners these reads key on beyond the receipts: the authored Tessera registry line (the
// Quiet's off-by-one seal), the director's nth-receipt counter (the Helix fine count), the
// calendar's station shifts (Cold Drill Four's deep-night watch), the ace-memory bag the
// encounter systems keep (the ransom roll's met callsigns), and the solar-storm season read
// (the shelter advisory's sector weather).

/** Whether a plain-flag receipt is an honest writer receipt: `true`, a simTime number, or a
 * numeric string. Any other shape is stale-save garbage and fails closed — the legs that
 * would write these flags write receipts, not prose. */
function honestReceipt(value) {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
  return false;
}

/** The receipt seal the Quiet files: the hull's own registration with its last digit advanced
 * by one — one character off, no invented code. Pure string arithmetic over the authored line. */
function sealOffByOne(registry) {
  const chars = String(registry).split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/[0-9]/.test(chars[i])) {
      chars[i] = String((Number(chars[i]) + 1) % 10);
      return chars.join('');
    }
  }
  return String(registry);
}

// SP2-020 "The Quiet's Receipt" — the unaddressed relay that files you sixty seconds after a
// fence deal closes. The printed seal is the authored Tessera registry line; the receipt's is
// derived from it. The scan-copy variant (one extra line when you scan your own hull) belongs
// to the scanner leg; its receipt is the consensus-named plain flag `quiet_receipt_off_by_one`,
// which has no writer yet — the page carries the relay's own paperwork honestly until it does.
export const QUIET_RECEIPT_OFF_BY_ONE_FLAG = 'quiet_receipt_off_by_one';
export const QUIET_RECEIPT_SEAL = sealOffByOne(TESSERA_REGISTRY);

export const QUIET_RECEIPT_TABLE = Object.freeze([
  Object.freeze({
    label: 'THE RELAY',
    value: 'UNADDRESSED — THE QUIET THANK NOBODY. THE QUIET FILE EVERYTHING.',
    sealed: false,
  }),
  Object.freeze({ label: 'YOUR FILE', value: 'CURRENT', sealed: false }),
  Object.freeze({
    label: 'LINE ITEMS',
    value: 'FILED — COMMODITY, AMOUNT — THE QUIET DOES NOT SHARE ITS LEDGER',
    sealed: true,
  }),
  Object.freeze({ label: 'HULL SEAL (PRINTED)', value: TESSERA_REGISTRY, sealed: false }),
  Object.freeze({ label: 'RECEIPT SEAL (FILED)', value: QUIET_RECEIPT_SEAL, sealed: false }),
  Object.freeze({ label: 'THE DIFFERENCE', value: 'ONE CHARACTER, IN DISPUTE', sealed: false }),
]);

/** The Quiet's receipt, once quiet business has flagged you for it. */
export function quietReceiptRows(state) {
  const got = special500Moment(state, 'SP2-020') != null
    || honestReceipt(plainFlag(state, QUIET_RECEIPT_OFF_BY_ONE_FLAG));
  if (!got) return [];
  return QUIET_RECEIPT_TABLE;
}

// SP2-114 "The Fulfillment Queue Miracle" — a delivery with zero seconds of buffer, classified
// MIRACLE (STATISTICAL), filed once. The catalog entry is still dormant: no delivery-timing
// read exists for the zero-buffer check to key on, so the zero-buffer re-arm belongs to that
// dormant unit. The read gates on the consensus-named plain flag `queue_miracle` — an honest
// gated wait; the greeting variant and the standing tick belong to the same glue pass.
export const QUEUE_MIRACLE_FLAG = 'queue_miracle';

export const QUEUE_MIRACLE_TABLE = Object.freeze([
  Object.freeze({ label: 'FULFILLMENT LOG', value: 'DELIVERY RECEIVED. BUFFER: 0.00s.', sealed: false }),
  Object.freeze({ label: 'CLASSIFICATION', value: 'MIRACLE (STATISTICAL)', sealed: false }),
  Object.freeze({ label: 'THE FILING', value: 'MIRACLE HAS BEEN FILED. MIRACLE WILL NOT BE REPEATED.', sealed: false }),
  Object.freeze({ label: 'THE QUEUE', value: 'IS EMOTIONAL ABOUT THIS AND DECLINES TO ELABORATE', sealed: false }),
  Object.freeze({ label: 'HONORIFIC', value: 'MIRACLE — ADDED TO EVERY FUTURE FULFILLMENT GREETING', sealed: false }),
]);

/** The miracle filing, once the delivery-timing leg has written its one receipt. */
export function queueMiracleRows(state) {
  if (!honestReceipt(plainFlag(state, QUEUE_MIRACLE_FLAG))) return [];
  return QUEUE_MIRACLE_TABLE;
}

// SP2-094 "The Concord Form That Files You Back" — reciprocal filing: your patterns filed as a
// form. The form number reads off the receipt's day (44-C-P<day>), the same arithmetic the
// payload names. The mail header variant (every later Concord letter citing you by number) is
// the mail leg's; its receipt is the consensus-named plain flag `player_is_a_form`, with no
// writer yet — the page states the condition instead of claiming the citation.
export const PLAYER_IS_A_FORM_FLAG = 'player_is_a_form';
export const CONCORD_FORM_PREFIX = '44-C-P';

/** The form number Concord Records assigned you, read off the receipt day. */
export function concordFormNumber(state) {
  const at = special500Moment(state, 'SP2-094');
  const flagged = honestReceipt(plainFlag(state, PLAYER_IS_A_FORM_FLAG));
  if (at == null && !flagged) return null;
  const day = at != null ? dayOf(at) : null;
  return `${CONCORD_FORM_PREFIX}${day != null ? day : 'UNFILED'}`;
}

/** Your form's page: the notice, the number, and whether the headers have caught up. */
export function concordFormRows(state) {
  const form = concordFormNumber(state);
  if (!form) return [];
  const cited = honestReceipt(plainFlag(state, PLAYER_IS_A_FORM_FLAG));
  return [
    Object.freeze({
      label: 'NOTICE',
      value: 'RECIPROCAL FILING — YOUR PATTERNS HAVE BEEN FILED AS A FORM',
      sealed: false,
    }),
    Object.freeze({ label: 'FORM NUMBER', value: form, sealed: false }),
    Object.freeze({ label: 'STATUS', value: 'YOU ARE NOW CITABLE', sealed: false }),
    Object.freeze({
      label: 'THE HEADERS',
      value: cited
        ? 'ACTIVE — CONCORD CORRESPONDENCE CITES YOU BY NUMBER'
        : 'QUEUED — THE NEXT CONCORD LETTER CARRIES IT',
      sealed: false,
    }),
  ];
}

// SP2-113 "The Helix Invoice Poem" — the unauthorized footer verse on every tenth fine receipt.
// The director's nth-receipt counter (`special500.SP2-113.n`) is the running fine count the
// desk actually keeps — save-carried, capped at the trigger's own nth; a pruned counter
// degrades to the receipt, never below it. The verse page ("The Queued Verse") is the codex
// leg the consensus names; the fine-payment counter UI is not part of this page.
export const HELIX_VERSE_LINES = 'THE FINE IS THE PRICE / OF KNOWING THE PRICE / OF THE ROAD';
export const HELIX_FINES_NTH = 10;

/** How many Helix fines the desk has on file: the running counter, floored by the receipt. */
export function helixFineCount(state) {
  const flags = state?.story?.flags;
  const counted = Math.floor(Number(flags && flags['special500.SP2-113.n'])) || 0;
  const receipt = special500Moment(state, 'SP2-113') != null ? HELIX_FINES_NTH : 0;
  return Math.min(HELIX_FINES_NTH, Math.max(counted, receipt));
}

/** The verse page: the footer, its authorization status, and the count that earned it. */
export function helixVerseRows(state) {
  const fines = helixFineCount(state);
  if (fines < HELIX_FINES_NTH) return [];
  return [
    Object.freeze({ label: 'FINES PAID', value: `${fines} OF ${HELIX_FINES_NTH} — THE TENTH RUNS THE FOOTER`, sealed: false }),
    Object.freeze({ label: 'THE VERSE', value: HELIX_VERSE_LINES, sealed: false }),
    Object.freeze({ label: 'AUTHORIZATION', value: 'NONE — UNAUTHORIZED, AND UNAUTHORIZED FOR YEARS', sealed: false }),
    Object.freeze({ label: 'REMOVAL', value: 'QUEUED', sealed: false }),
  ];
}

// SP2-131 "The Cold Drill Four Broadcast" — the derelict drill's shift roll call for a crew
// that has not assembled in years. The proximity receipt is the gate; the watch row is a live
// read off the calendar (deep night at the drill's own clock, stationShiftAt — the SP3-091
// precedent). The consensus-named plain flag `cold_four_rollcall` is the PA-audio leg's
// receipt; no audio row exists yet, and the page does not wait on one to keep the transcript.
export const COLD_FOUR_ROLLCALL_FLAG = 'cold_four_rollcall';
export const COLD_FOUR_POI_ID = 'poi_vesta_cold_line';

export const COLD_FOUR_TABLE = Object.freeze([
  Object.freeze({ label: 'THE DRILL', value: 'COLD DRILL FOUR — DERELICT, PA STILL ON SCHEDULE', sealed: false }),
  Object.freeze({
    label: 'THE ROLL CALL',
    value: '"COLD FOUR, NIGHT WATCH: REPORT. ... REPORT. ... ALL POSITIONS NOTED AS PRESENT."',
    sealed: false,
  }),
  Object.freeze({
    label: 'THE PAUSE',
    value: 'WHERE THE LAST NAME SHOULD BE — 100% FAITHFUL TO THE ORIGINAL AUDIO',
    sealed: false,
  }),
  Object.freeze({ label: 'CLOSING', value: '"GOOD WATCH."', sealed: false }),
]);

/** The roll call's transcript, plus whether deep night holds at the drill right now. */
export function coldFourRows(state) {
  const got = special500Moment(state, 'SP2-131') != null
    || honestReceipt(plainFlag(state, COLD_FOUR_ROLLCALL_FLAG));
  if (!got) return [];
  const now = Number(state && state.simTime);
  const deepNight = Number.isFinite(now) && stationShiftAt(COLD_FOUR_POI_ID, now).id === 'third';
  return [
    ...COLD_FOUR_TABLE,
    Object.freeze({
      label: 'TONIGHT',
      value: deepNight
        ? 'DEEP-NIGHT AT THE DRILL — THE PA IS ON SHIFT'
        : 'NOT DEEP-NIGHT AT THE DRILL — THE PA KEEPS THE SCHEDULE',
      sealed: false,
    }),
  ];
}

// SP1-138 "The Blind" — a hunter stakeout's open channel at the Bounty Wrecks field. The
// proximity receipt is the gate. The sell-the-plan-to-the-quarry choice and the named contact
// are the encounter/counter legs; their receipt is the consensus-shaped plain flag
// `blind_sold`, with no writer yet — the page records the band's discipline and states what
// the plan still is, without claiming a sale nobody made.
export const BLIND_SOLD_FLAG = 'blind_sold';

export const BLIND_TABLE = Object.freeze([
  Object.freeze({ label: 'THE BAND', value: 'A HUNTER STAKEOUT\'S WORKPLACE — OPEN CHANNEL, CRISP ARGOT', sealed: false }),
  Object.freeze({ label: 'ON THE AIR', value: 'TARGET DESCRIPTIONS · SHIFT CHANGES · KNOWN HABITS', sealed: false }),
  Object.freeze({ label: 'THE SUBJECT', value: 'NONE OF IT ABOUT YOU', sealed: false }),
  Object.freeze({
    label: 'THE QUARRY',
    value: 'ITS ENGINE NOTE, PASSING UNDER EVERYONE\'S — INCLUDING YOURS',
    sealed: false,
  }),
]);

/** The stakeout's discipline, and what the plan still is. */
export function blindRows(state) {
  const sold = honestReceipt(plainFlag(state, BLIND_SOLD_FLAG));
  const got = special500Moment(state, 'SP1-138') != null || sold;
  if (!got) return [];
  return [
    ...BLIND_TABLE,
    Object.freeze({
      label: 'THE PLAN',
      value: sold
        ? 'SOLD TO THE QUARRY — THEY PAID, AND THE TAKEDOWN RAN ON SCHEDULE ANYWAY'
        : 'UNSOLD — THE TAKEDOWN RUNS ON SCHEDULE, AND YOU CAN WATCH',
      sealed: sold,
    }),
  ];
}

// SP3-078 "Rock Crossing Warning" — the wire posts the crossing one day ahead and the rock
// keeps the appointment (day 16, second bell — the window the landed calendar row runs). The
// crossing day reads off the receipt; the calendar row tells you whether the posting, the
// crossing, or the wait is tonight. The physical boulder and the lamp tells are the spectacle
// row's (already landed); the deterministic spawn is that calendar leg's.
export const ROCK_CROSSING_DAY = 16;
export const ROCK_CROSSING_WINDOW = Object.freeze([200, 260]);

/** The crossing's page: the posting, the iron, the escort, and where tonight sits on the wire. */
export function rockCrossingRows(state) {
  const at = special500Moment(state, 'SP3-078');
  if (at == null) return [];
  const day = dayOf(at);
  const dayOfYear = day != null ? day % CAL_YEAR_DAYS : ROCK_CROSSING_DAY;
  const now = Number(state && state.simTime);
  const today = Number.isFinite(now) && now > 0 ? Math.floor(now / CAL_DAY_S) % CAL_YEAR_DAYS : null;
  return [
    Object.freeze({ label: 'THE WIRE', value: 'A 40 M IRON CROSSES THE SCAR LANE — POSTED ONE DAY AHEAD', sealed: false }),
    Object.freeze({
      label: 'THE CROSSING',
      value: day != null ? `DAY ${dayOfYear}, SECOND BELL — ON SCHEDULE` : 'SECOND BELL, ON SCHEDULE',
      sealed: false,
    }),
    Object.freeze({ label: 'THE IRON', value: 'A DARK BOULDER — THREE BLINKING SURVEY LAMPS, A LIT TAIL OF DUST', sealed: false }),
    Object.freeze({ label: 'THE ESCORT', value: 'A BORED TENDER SKIFF — GIVES IT ROOM, MOSTLY', sealed: false }),
    Object.freeze({
      label: 'THE CALENDAR',
      value: today == null
        ? 'THE WIRE KEEPS THE APPOINTMENT; THE PAGE KEEPS THE DAY'
        : today === dayOfYear
          ? 'CROSSING DAY — GIVE IT ROOM'
          : (today + 1) % CAL_YEAR_DAYS === dayOfYear
            ? 'THE WIRE POSTS IT TOMORROW'
            : `THE NEXT CROSSING IS DAY ${ROCK_CROSSING_DAY}`,
      sealed: false,
    }),
  ];
}

// SP3-093 "The Pour Announcement" — thirty seconds of warning before the landed SP3-083 pour.
// The announcement's window ends where the pour's begins; the receipt's day is the announcement
// day. The traffic reaction is hones'd to apron dim + watch-light only (no job re-route) — the
// page carries exactly what the wire and the apron actually do.
export const POUR_ANNOUNCEMENT_LEAD_S = 30;

/** The announcement's page: the wire line, the standing-down, and the lead it keeps. */
export function pourAnnouncementRows(state) {
  const at = special500Moment(state, 'SP3-093');
  if (at == null) return [];
  const day = dayOf(at);
  return [
    Object.freeze({ label: 'THE WIRE', value: '"POUR IN THIRTY. CHANNEL IS HOT. GIVE THE SPINE ROOM."', sealed: false }),
    Object.freeze({ label: 'THE CHANNEL', value: 'HOT', sealed: false }),
    Object.freeze({ label: 'THE APRON', value: 'FLOODS DIM ON SCHEDULE', sealed: false }),
    Object.freeze({ label: 'THE FLOOR', value: 'STANDS DOWN TO WATCH-LIGHT — INDUSTRY, REHEARSED', sealed: false }),
    Object.freeze({
      label: 'THE LEAD',
      value: (day != null ? `THIRTY SECONDS, DAY ${day % CAL_YEAR_DAYS} — ` : 'THIRTY SECONDS — ')
        + 'THE POUR RUNS THE WINDOW THE ANNOUNCEMENT ENDS ON',
      sealed: false,
    }),
  ];
}

// SP1-007 "The Ransom Buoy" — the tag lane's rolling list of captains of interest. The names
// are a live read off the ace-memory bag the encounter systems already keep (systems/
// aceMemory.js): the buoy can only list captains your log actually carries, and an empty log
// degrades to names you have not met — never to an invented captain. The poorer-and-angrier
// encounter delta belongs to the numbered-script leg.
export const RANSOM_ROLL_LIMIT = 5;

/** Callsigns the buoy can honestly read: captains your ace memory actually carries. */
export function ransomRollNames(state) {
  const memory = state && state.aceMemory;
  if (!memory || typeof memory !== 'object') return [];
  const names = [];
  for (const [id, rec] of Object.entries(memory)) {
    if (rec && typeof rec === 'object' && rec.encountered) {
      const ace = aceById(id);
      if (ace && ace.name) names.push(ace.name);
    }
  }
  return names.sort((a, b) => String(a).localeCompare(String(b))).slice(0, RANSOM_ROLL_LIMIT);
}

/** The roll: the buoy's format, the one entry of note, and whether it names someone you met. */
export function ransomBuoyRows(state) {
  if (special500Moment(state, 'SP1-007') == null) return [];
  const names = ransomRollNames(state);
  const rows = [
    Object.freeze({ label: 'THE BUOY', value: 'LANE BUOY, OFFICIAL — THE TAG LANE, PALLAS DRIFT', sealed: false }),
    Object.freeze({ label: 'THE ROLL', value: 'CAPTAINS OF INTEREST — NAMES, UNPAID TITHES, INTEREST ACCRUED', sealed: false }),
  ];
  if (names.length) {
    rows.push(Object.freeze({
      label: 'ENTRY OF NOTE',
      value: `${String(names[0]).toUpperCase()} — TITHE UNPAID, INTEREST ACCRUING`,
      sealed: false,
    }));
    rows.push(Object.freeze({
      label: 'THE TELL',
      value: 'ONE ENTRY MATCHES A CALLSIGN YOUR LOG CARRIES',
      sealed: false,
    }));
  } else {
    rows.push(Object.freeze({
      label: 'ENTRY OF NOTE',
      value: 'NAMES YOU HAVE NOT MET — THE ROLL KEEPS SCROLLING',
      sealed: false,
    }));
    rows.push(Object.freeze({
      label: 'THE TELL',
      value: 'NO ENTRY MATCHES YOUR LOG YET — KEEP FLYING THE LANES',
      sealed: false,
    }));
  }
  rows.push(Object.freeze({ label: 'EDITORIALIZING', value: 'NONE. IT DOES NOT HAVE TO.', sealed: false }));
  return rows;
}

// SP3-108 "The Dock Choir" — docking chatter as audible texture inside the Helios apron
// approach. The spectacle row (already landed, batch 8) owns the audio; the codex page keeps
// the choir's score — the parts, the mix rule, the material — off the director's proximity
// receipt. The station-life audio recipes table the consensus named does not exist in the
// live audio data; the row voices through the shipped ambient/band recipes instead.
export const DOCK_CHOIR_TABLE = Object.freeze([
  Object.freeze({ label: 'THE CHOIR', value: 'DOCKING CHATTER AS TEXTURE — THE HELIOS APRON APPROACH', sealed: false }),
  Object.freeze({
    label: 'THE PARTS',
    value: 'OVERLAPPING APPROACH CALLS · BERTH ASSIGNMENTS · ONE VOICE ALWAYS SLIGHTLY BEHIND',
    sealed: false,
  }),
  Object.freeze({ label: 'THE MIX RULE', value: 'DUCKS UNDER ANYTHING URGENT — FILLS THE REST', sealed: false }),
  Object.freeze({ label: 'THE MATERIAL', value: 'WORK — THE APRON HAS A CHOIR AND IT IS MADE OF WORK', sealed: false }),
]);

/** The choir's score, once the apron has raised it for you. */
export function dockChoirRows(state) {
  if (special500Moment(state, 'SP3-108') == null) return [];
  return DOCK_CHOIR_TABLE;
}

// SP2-045 "Chain Letter, Quiet Edition" — the letter that denies its own existence. The
// self-redacting mail-log quirk is the mail evaluator's glue; the page keeps the letter's text
// and attributes the log's correction to the letter's own account — sealed, not asserted.
export const CHAIN_LETTER_TABLE = Object.freeze([
  Object.freeze({ label: 'THE LETTER', value: '"THIS MESSAGE IS NOT A CHAIN LETTER. DO NOT FORWARD IT."', sealed: false }),
  Object.freeze({ label: 'THE MECHANISM', value: 'FORWARDING IT IS HOW IT MOVES', sealed: false }),
  Object.freeze({ label: 'THE LAST LINE', value: '"YOU HAVE NOT READ THIS."', sealed: false }),
  Object.freeze({ label: 'SENDER', value: '[NO SENDER]', sealed: false }),
  Object.freeze({
    label: 'THE LOG',
    value: '"LOG CORRECTED." — BY THE LETTER\'S OWN ACCOUNT',
    sealed: true,
  }),
]);

/** The letter, once quiet business has flagged you for it. */
export function chainLetterRows(state) {
  if (special500Moment(state, 'SP2-045') == null) return [];
  return CHAIN_LETTER_TABLE;
}

// SP3-109 "Bay Seven's Cargo" — the weekly unattended-cargo notice, and why it uses bay 7:
// canon emptiness is the joke the regulars explain. The landed entry is the hones'd version —
// nobody has ever found a pod there — so the page does not claim a pod; the keyed pickup
// spawn, if a world leg ever arms it, would rewrite THE POD row through its own receipt.
export const BAY_SEVEN_TABLE = Object.freeze([
  Object.freeze({ label: 'THE WIRE', value: '"UNATTENDED CARGO, BAY 7. CLAIM OR IT DRILLS."', sealed: false }),
  Object.freeze({
    label: 'THE REGULARS',
    value: 'BAY 7 HAS BEEN EMPTY FOR NINE YEARS — WHICH IS WHY THE WIRE USES IT',
    sealed: false,
  }),
  Object.freeze({ label: 'THE PROOF', value: 'NOTHING IN BAY 7 HAS EVER CONTRADICTED THE WIRE', sealed: false }),
  Object.freeze({ label: 'THE POD', value: 'NONE FOUND — WHICH THE REGULARS TAKE AS THE WIRE WORKING', sealed: false }),
]);

/** Bay seven's page, once the notice has posted for you. */
export function baySevenRows(state) {
  if (special500Moment(state, 'SP3-109') == null) return [];
  return BAY_SEVEN_TABLE;
}

// SP2-052 "Mira Fixes It" — the manifest self-corrects and Bourse Freight takes credit,
// retroactively. The pre-dated stamp is the message's own authored tell. The audit-trap
// suppression (one CONCORD/MTS trap pre-dismissed) belongs to the trap leg; its receipt is
// the consensus-named plain flag `mira_timestamp`, with no writer yet — the queue row states
// the condition until that leg lands.
export const MIRA_TIMESTAMP_FLAG = 'mira_timestamp';

/** The correction's page: the line, the signature, the date, and the audit queue's status. */
export function miraFixesRows(state) {
  const fixed = honestReceipt(plainFlag(state, MIRA_TIMESTAMP_FLAG));
  const got = special500Moment(state, 'SP2-052') != null || fixed;
  if (!got) return [];
  return [
    Object.freeze({
      label: 'THE LINE',
      value: '"THE MANIFEST WAS ALWAYS CORRECT. YOU MISREAD IT. I HAVE CORRECTED YOUR MISREADING."',
      sealed: false,
    }),
    Object.freeze({ label: 'SIGNATURE', value: 'MIRA — BOURSE FREIGHT, UNTRACEABLE', sealed: false }),
    Object.freeze({
      label: 'THE DATE',
      value: 'ONE HOUR BEFORE THE CORRECTION HAPPENED. YOU CHECKED. YOU DID NOT MISREAD IT.',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE AUDIT QUEUE',
      value: fixed
        ? 'ONE TRAP PRE-DISMISSED — SHE HAS WRITE ACCESS NOW'
        : 'UNTOUCHED — SHE HAS NOT NEEDED THE QUEUE YET',
      sealed: fixed,
    }),
  ];
}

// SP3-056 "Shelter Advisory" — the surge-start broadcast: apron lights doubled, berths half
// price. The sector row is a live read off the calendar's storm-season table for the sector
// you are actually in (stormSeasonAt); a clear season says so honestly. The apron light
// streaks and the fee cut are the vfx/economy glue — deferred, not invented here.
export const SHELTER_ADVISORY_LINE = '"SURGE UNTIL SECOND BELL. APRON LIGHTS DOUBLED, BERTHS HALF PRICE."';

/** The advisory's page: the line, the aprons, and the weather your sector is actually having. */
export function shelterAdvisoryRows(state) {
  const at = special500Moment(state, 'SP3-056');
  if (at == null) return [];
  const sectorId = state && state.world ? state.world.currentSectorId : null;
  const now = Number(state && state.simTime);
  const storm = sectorId && Number.isFinite(now) ? stormSeasonAt(sectorId, now) : null;
  const rows = [
    Object.freeze({ label: 'THE ADVISORY', value: SHELTER_ADVISORY_LINE, sealed: false }),
    Object.freeze({ label: 'THE APRONS', value: 'BRIGHTEN AS THE LINE RUNS', sealed: false }),
  ];
  const endsInS = storm ? Number(storm.endsInS) : NaN;
  rows.push(Object.freeze({
    label: 'THIS SECTOR',
    value: storm && storm.stormy
      ? `${String(storm.label).toUpperCase()} — THE WIRE IS TALKING ABOUT YOUR WEATHER`
        + (Number.isFinite(endsInS)
          ? `, ${Math.max(1, Math.ceil(endsInS / CAL_DAY_S))} DAY(S) LEFT IN THE SEASON`
          : '')
      : 'CLEAR SEASON — THE ADVISORY WAS SOMEONE ELSE\'S WEATHER',
    sealed: false,
  }));
  rows.push(Object.freeze({ label: 'THE LESSON', value: 'STATIONS RESPOND TO WEATHER', sealed: false }));
  return rows;
}

// ── special-500 Phase 2 (batch 14b, codex family) ────────────────────────────────────────────
// Fourteen more codex/lore reads, same pattern as batches 1, 12, 13 and 14: frozen authored
// tables plus pure reads over durable state, failing closed (an empty list) until the world
// has honestly earned the page. The director's `special500.<id>` receipt is the durable writer
// for every live moment; where the consensus names a plain flag for another leg's writer, the
// read accepts it as an alternate seam and states the condition until that leg lands. None of
// these reads write anything.
//
// Live owners these reads key on beyond the receipts: the quill copy counter the Quill system
// already writes (src/systems/quill.js, `quill_copied` — the Reader's Stake bookmark), the
// per-POI discovery records World keeps in state.world.discovery[sectorId].pois (the two ash
// pins — the honest gate for the pair, because the catalog's bare poi:discovered receipt proves
// less than the page claims), the calendar's storm-season table (the Still Eye's season step)
// and its station watches (the Star Marker's sextant watches).
//
// Deferred to their own legs, stated in-page rather than invented: the mooring's departure
// state machine and Helios standing tick, the Bookmark's standing tick and stake dressing,
// the Two-Credit sale-band nudge, the Bargain Light's lamp channel, the Paper Plane's pooled
// prop and breach cue, the Hum's audio-bus duck and chord mix, the Shepherd's wreck-herding
// presentation, the Still Eye's sectorZones record, the Slurry scan's commodity-context branch
// and Bay 7 thread flags, the Mast's edited-hail bark variant, the Star Marker's per-phase scan
// copy and intersection POI, the Vanishing Field's per-visit count ledger, and the Surveyor's
// spawned precursor-pin row.

// SP2-179 "The Pilgrim Mooring's Guest Book" — the mooring's handwritten register. The
// proximity receipt is the settle gate; the hold-timer's text state machine (ARRIVED →
// DEPARTED on actual leaving) is that leg's, and its consensus-named plain flag
// `mooring_between` is accepted as the alternate seam. Until it writes, the page keeps the
// player's line honestly half-finished — the book does not finish a departure nobody made.
export const MOORING_BETWEEN_FLAG = 'mooring_between';
export const MOORING_POI_ID = 'poi_helios_pilgrim_moor';

export const MOORING_BOOK_ROWS = Object.freeze([
  Object.freeze({ label: 'THE BOOK', value: 'EVERY HULL THAT EVER MOORED HERE, IN HANDWRITING', sealed: false }),
  Object.freeze({
    label: 'THE HOUSE RULE',
    value: 'THE MOST RECENT ENTRY IS ALWAYS HALF-FINISHED — EVERY PILGRIM MOORS MID-THOUGHT',
    sealed: false,
  }),
]);

/** The guest book, once you have settled. Empty until then. */
export function mooringGuestRows(state) {
  const between = honestReceipt(plainFlag(state, MOORING_BETWEEN_FLAG));
  if (special500Moment(state, 'SP2-179') == null && !between) return [];
  return [
    ...MOORING_BOOK_ROWS,
    Object.freeze({
      label: 'YOUR LINE',
      value: between
        ? 'ARRIVED. DEPARTED. BETWEEN: EVERYTHING.'
        : 'ARRIVED — (THE ENTRY FINISHES ITSELF WHEN YOU LEAVE)',
      sealed: false,
    }),
    Object.freeze({ label: 'THE BLINKING', value: 'A CURSOR, WAITING FOR A DEPARTURE', sealed: false }),
  ];
}

// SP2-171 "The Reader's Stake Bookmark" — the ribbon AR-3 tied at the Reader's Stake, marking
// the page of its open log that names every sealed thing the player unsealed. The gate is a
// live read the world already keeps: the quill copy counter `quill_copied` (src/systems/quill.js
// writes it per copy; the director fires the entry at 2+). A receipt or flag without the
// counter — a pruned save — keeps the page and reads the count honestly off AR-3's own log.
// The stake dressing and the Archive standing tick are that leg's.
export const STAKE_BOOKMARKED_FLAG = 'stake_bookmarked';
export const STAKE_BOOKMARK_MIN = 2;
export const STAKE_POI_ID = 'poi_charon_reader_stake';

/** Pages the Quill system has copied open: the counter it actually writes, floored at zero. */
export function quillCopiedCount(state) {
  const flags = state?.story?.flags;
  const copied = Math.floor(Number(flags && flags[QUILL.copiedFlag])) || 0;
  return copied > 0 ? copied : 0;
}

/** The bookmark's page: the ribbon, the knot, and the count your copies actually carry. */
export function stakeBookmarkRows(state) {
  const copied = quillCopiedCount(state);
  const got = copied >= STAKE_BOOKMARK_MIN
    || special500Moment(state, 'SP2-171') != null
    || honestReceipt(plainFlag(state, STAKE_BOOKMARKED_FLAG));
  if (!got) return [];
  const live = quillCopiedCount(state);
  return [
    Object.freeze({ label: 'THE STAKE', value: 'THE READER\'S STAKE, CHARON EXPANSE — ITS LOG STAYS OPEN', sealed: false }),
    Object.freeze({ label: 'THE BOOKMARK', value: 'A PHYSICAL RIBBON, TIED BY AR-3\'s GRIP', sealed: false }),
    Object.freeze({ label: 'THE KNOT', value: 'THE ARCHIVE\'S INDEX KNOT', sealed: false }),
    Object.freeze({ label: 'THE PAGE', value: 'EVERY SEALED THING YOU HAVE EVER UNSEALED, WITH DATES', sealed: false }),
    Object.freeze({
      label: 'COPIED OPEN',
      value: live > 0
        ? `${live} PAGE${live === 1 ? '' : 'S'} — FILED AS AR-3\'S OWN RECOMMENDATIONS`
        : 'THE COUNT RIDES AR-3\'S LOG, NOT THIS PAGE — THE RIBBON STAYS TIED',
      sealed: false,
    }),
  ];
}

// SP2-085 "The Two-Credit Truth" — the miners' corner buys the tired seller a drink for exactly
// two credits. The director's trade receipt in the Belt is the moment; the three-loss sale
// counter and the next above-band +2% nudge are the economy leg's — its consensus-named plain
// flag `two_credit_truth` is the alternate seam, and until it writes, the advice's mechanics
// stay the rockhand's claim, not the page's.
export const TWO_CREDIT_TRUTH_FLAG = 'two_credit_truth';
export const TWO_CREDIT_NUDGE_PCT = 2;
export const TWO_CREDIT_LOSS_STREAK = 3;

/** The two-credit page: the drink, the advice, and whether the mechanics have caught up. */
export function twoCreditTruthRows(state) {
  const told = honestReceipt(plainFlag(state, TWO_CREDIT_TRUTH_FLAG));
  if (special500Moment(state, 'SP2-085') == null && !told) return [];
  return [
    Object.freeze({ label: 'THE BAR', value: 'THE MINERS\' CORNER, BELT OUTPOST — EXACT CHANGE ONLY', sealed: false }),
    Object.freeze({ label: 'THE DRINK', value: 'BOUGHT FOR YOU, FOR EXACTLY TWO CREDITS', sealed: false }),
    Object.freeze({
      label: 'THE ADVICE',
      value: '"YOU ARE SELLING TIRED. THE SCALE CAN HEAR IT IN THE TONNAGE. REST, THEN SELL."',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE ROCK',
      value: '"THE ROCK IS NOT GOING ANYWHERE; THAT IS ITS WHOLE PERSONALITY."',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE NEXT SALE',
      value: told
        ? `ABOVE BAND, ONE TIME, +${TWO_CREDIT_NUDGE_PCT}% — THE ADVICE WAS MECHANICALLY REAL`
        : 'THE PRICE-BAND NUDGE WAITS FOR THE SALE LEDGER THAT KEEPS THE BANDS',
      sealed: told,
    }),
  ];
}

// SP3-107 "The Bargain Light" — the Den's green vent-spine lamp, lit only on Ring Fair. The
// director's annual calendar receipt is the gate; the lamp channel itself is the light leg's.
// The calendar row is a live read (the same day-of-year arithmetic the wire keeps): on the
// fair day the page says lit, between fairs it says when the lamp comes back.
export const BARGAIN_LIGHT_DAY = 13; // Ring Fair
export const BARGAIN_LIGHT_SECTOR = 'sector_pallas_drift';

/** The lamp's page: the light, the pattern, and the decode the neighbors pretend not to read. */
export function bargainLightRows(state) {
  if (special500Moment(state, 'SP3-107') == null) return [];
  const now = Number(state && state.simTime);
  const today = Number.isFinite(now) && now > 0 ? Math.floor(now / CAL_DAY_S) % CAL_YEAR_DAYS : null;
  return [
    Object.freeze({ label: 'THE LAMP', value: 'ONE SMALL GREEN LIGHT — THE DEN\'S VENT SPINE, SHADOW SIDE', sealed: false }),
    Object.freeze({
      label: 'THE OCCASION',
      value: today === BARGAIN_LIGHT_DAY
        ? `RING FAIR, DAY ${BARGAIN_LIGHT_DAY} — THE LAMP IS LIT`
        : `BETWEEN FAIRS — IT LIGHTS AGAIN ON DAY ${BARGAIN_LIGHT_DAY}`,
      sealed: false,
    }),
    Object.freeze({ label: 'THE PATTERN', value: 'LONG, SHORT-SHORT, LONG — PATIENT, REPEATING, AUTHORED', sealed: false }),
    Object.freeze({
      label: 'THE DECODE',
      value: 'THE TAG LANE BUOY\'S ROLL, READ AT DOCK — THE MARGIN IS WHERE THE BUOY POINTS',
      sealed: false,
    }),
    Object.freeze({ label: 'THE NEIGHBORS', value: 'ALL KNOW IT. ALL PRETEND THE LAMP IS A LAMP.', sealed: false }),
  ];
}

// SP3-117 "The Paper Plane" — the pod bay's annual throw: a folded hull plate with a lamp on
// it, on a computed arc, burning to a silver flash in the apron's heat wash. The director's
// calendar window (day 21, twenty seconds, Helios only) is the witness gate as implemented;
// the pooled prop and the breach cue light are the spectacle leg's. The page keeps the two
// lines the witness actually gets.
/** The plane's page: the object, the flight, and the only question it asks. */
export function paperPlaneRows(state) {
  if (special500Moment(state, 'SP3-117') == null) return [];
  return [
    Object.freeze({ label: 'THE OBJECT', value: 'A FOLDED HULL PLATE WITH A LAMP ON IT', sealed: false }),
    Object.freeze({
      label: 'THE FLIGHT',
      value: 'A COMPUTED ARC ACROSS THE APRON\'S LIGHT — BURNING TO A SILVER FLASH IN THE HEAT WASH',
      sealed: false,
    }),
    Object.freeze({ label: 'THE PHYSICS', value: 'NOTHING GLIDES IN VACUUM. SOMEBODY THREW IT ON PURPOSE.', sealed: false }),
    Object.freeze({ label: 'THE WIRE', value: 'NEVER MENTIONS IT', sealed: false }),
    Object.freeze({ label: 'THE QUESTION', value: 'WHO FOLDS THESE?', sealed: false }),
  ];
}

// SP3-138 "The Hum at Sker" — hold still inside the 80 WU zone off the market and the
// machinery composes. The proximity receipt is the gate as implemented; the stillness gate's
// audio-bus duck and chord mix are the audio leg's, and the page says so instead of claiming
// a mix nobody has patched yet. The listening place itself is real: the director filed you
// standing in it.
export const HUM_ZONE_WU = 80;
export const HUM_STILL_S = 30;
export const HUM_ANCHOR_ID = 'station_sker';

/** The listening place's page: the resolution, the orchestra, the rule, and the mix's status. */
export function humAtSkerRows(state) {
  if (special500Moment(state, 'SP3-138') == null) return [];
  return [
    Object.freeze({ label: 'THE BEARING', value: `INSIDE THE ${HUM_ZONE_WU} WU ZONE OFF THE SKER MARKET`, sealed: false }),
    Object.freeze({
      label: 'THE RESOLUTION',
      value: 'THE HUM EVERY HULL HALF-NOTICES RESOLVES, HERE, INTO A SLOW MELODY',
      sealed: false,
    }),
    Object.freeze({ label: 'THE ORCHESTRA', value: 'CRANES, PUMPS, WELDERS — ALL IN TUNE, COMPOSING FROM HERE', sealed: false }),
    Object.freeze({
      label: 'THE RULE',
      value: 'MOVE, AND IT DEGRADES BACK INTO MACHINERY. IT WAS ALWAYS THE SAME MACHINERY. YOU ARE WHAT CHANGED.',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE MIX',
      value: 'THE DUCK-AND-CHORD MIX WAITS FOR THE AUDIO BUS — THE LISTENING PLACE IS REAL REGARDLESS',
      sealed: false,
    }),
  ];
}

// SP2-168 "The Broken Shepherd's Flock" — break a hull near the Broken Shepherd and its herding
// rigs re-flock the wreckage. The director's combat receipt in the Expanse is the gate as
// implemented; the 600 WU proximity refinement and the orbiting-wreck presentation are the
// uniqueWrecks leg's — its consensus-named plain flag `flock_reflocked` is the alternate seam.
// The salvage stays collectible either way; the Understory's first claim is filing, not fencing.
export const FLOCK_REFLOCKED_FLAG = 'flock_reflocked';
export const FLOCK_RADIUS_WU = 600;
export const FLOCK_POI_ID = 'poi_charon_broken_shepherd';

/** The re-flocked flock's page: the rigs, the orbit, the PA, and the count that is correct. */
export function reFlockedRows(state) {
  const got = special500Moment(state, 'SP2-168') != null
    || honestReceipt(plainFlag(state, FLOCK_REFLOCKED_FLAG));
  if (!got) return [];
  return [
    Object.freeze({ label: 'THE SHEPHERD', value: 'BROKEN — AND ITS HERDING RIGS STILL DETACH, PIECE BY PIECE', sealed: false }),
    Object.freeze({ label: 'THE FLOCK', value: 'THE FRESH WRECKAGE, GATHERED INTO A QUIET ORBIT AROUND IT', sealed: false }),
    Object.freeze({ label: 'THE PA', value: '"COUNTED. COUNTED. COUNTED." — SOFTER EACH CYCLE', sealed: false }),
    Object.freeze({ label: 'THE COUNT', value: 'CORRECT', sealed: false }),
    Object.freeze({ label: 'THE SALVAGE', value: 'STILL COLLECTIBLE BY ANYONE — THE UNDERSTORY FILES FIRST CLAIM', sealed: false }),
  ];
}

// SP3-026 "The Still Eye" — the calm pocket inside the Anvil band. The director's sector-entry
// receipt is the gate; the zone record (anomaly_deep, no presence) and its drag/heat exemption
// are the sectorZones leg's — the page keeps the phenomenon and the season cadence, and reads
// the season count off the calendar the storm bands already use. It never names a position:
// the pilots who track the eye do not share the coordinates, only the season math.
export const STILL_EYE_SECTOR = 'sector_tethys_junction';
export const STILL_EYE_WU = 80;

/** The eye's page: the pocket, the heat, and which season the current step is filed under. */
export function stillEyeRows(state) {
  if (special500Moment(state, 'SP3-026') == null) return [];
  const now = Number(state && state.simTime);
  const season = Number.isFinite(now) && now >= 0 ? stormSeasonAt(STILL_EYE_SECTOR, now) : null;
  return [
    Object.freeze({
      label: 'THE EYE',
      value: `AN ${STILL_EYE_WU} WU CIRCLE INSIDE THE ANVIL BAND — LIGHTNING STOPS, DRAG VANISHES, DEBRIS HANGS GLITTERING`,
      sealed: false,
    }),
    Object.freeze({ label: 'THE HEAT', value: 'COOLS AT THE OUT-OF-BAND RATE INSIDE', sealed: false }),
    Object.freeze({
      label: 'THIS SEASON',
      value: season
        ? `THE EYE\'S STEP IS FILED UNDER SEASON ${season.season} — IT MOVES ONE BAND-WIDTH EACH`
        : 'THE STEP IS FILED PER SEASON — THE CALENDAR KEEPS THE COUNT',
      sealed: false,
    }),
    Object.freeze({ label: 'THE PILOTS', value: 'THEY DO NOT SHARE THE COORDINATES. THEY DO SHARE THE SEASON MATH.', sealed: false }),
  ];
}

// SP2-173 "The Slurry Relic's Contents" — the relic's scan returns a container, not a commodity:
// R3-CARRIER GRID, PANEL 9, shelved full in Helios Bay 7, the only panel that ever left the
// warehouse, and it left as a container, not cargo. The director's scan receipt in the Expanse
// is the gate as implemented; the commodity-context scan branch (slurry fresh in the sampling
// log) is the scanner leg's, and its consensus-named plain flag `panel9_found` is the alternate
// seam. The physical middle chapter rides the Bay 7 thread flags — queued, not claimed.
export const PANEL9_FOUND_FLAG = 'panel9_found';
export const PANEL_NINE_LINE = 'SLURRY, REFINED, BATCH R3-CARRIER. CONTAINER: R3-CARRIER GRID, PANEL 9.';
export const SLURRY_POI_ID = 'poi_charon_slurry';

/** Panel Nine's page: the composition, the provenance, and the middle chapter's status. */
export function panelNineRows(state) {
  const got = special500Moment(state, 'SP2-173') != null
    || honestReceipt(plainFlag(state, PANEL9_FOUND_FLAG));
  if (!got) return [];
  return [
    Object.freeze({ label: 'THE SCAN', value: PANEL_NINE_LINE, sealed: false }),
    Object.freeze({ label: 'THE PROVENANCE', value: 'SHELVED IN HELIOS BAY 7 — THE ONLY PANEL THAT EVER LEFT THE WAREHOUSE', sealed: false }),
    Object.freeze({ label: 'THE MANNER', value: 'IT LEFT AS A CONTAINER, NOT CARGO', sealed: false }),
    Object.freeze({
      label: 'THE MIDDLE CHAPTER',
      value: 'QUEUED — THE BAY 7 THREAD FLAGS CARRY IT WHEN THEY LAND',
      sealed: false,
    }),
  ];
}

// SP2-175 "The Quiet Mast's Silence Toll" — three hails inside a minute near the mast and the
// third plays back edited: every filler word removed, content preserved. The director's hail
// receipt in the Reach is the gate as implemented; the chatter-rate check and the edited-hail
// playback variant are the comms leg's, and the register payoff (first-ping resolution, band
// priority) is the mast's own word on the page until that leg's flag `mast_prefers_you` lands.
export const MAST_PREFERS_YOU_FLAG = 'mast_prefers_you';
export const MAST_HAIL_WINDOW_S = 60;
export const MAST_HAIL_COUNT = 3;
export const MAST_POI_ID = 'poi_io_quiet_mast';

/** The mast's page: the toll, the edit, the verdict, and the preference it never explains. */
export function mastPrefersYouRows(state) {
  const got = special500Moment(state, 'SP2-175') != null
    || honestReceipt(plainFlag(state, MAST_PREFERS_YOU_FLAG));
  if (!got) return [];
  return [
    Object.freeze({ label: 'THE TOLL', value: `THREE HAILS INSIDE ${MAST_HAIL_WINDOW_S} SECONDS, NEAR THE MAST`, sealed: false }),
    Object.freeze({ label: 'THE EDIT', value: 'NOT JAMMING — EDITING. EVERY FILLER WORD, REMOVED.', sealed: false }),
    Object.freeze({
      label: 'THE PLAYBACK',
      value: '"TRANSMISSION: EDITED. CONTENT: PRESERVED. THE MAST PREFERS YOU."',
      sealed: false,
    }),
    Object.freeze({ label: 'THE PREFERENCE', value: 'PERMANENT — THE MAST HAS NEVER EXPLAINED IT', sealed: false }),
    Object.freeze({
      label: 'THE BAND',
      value: 'OTHER PILOTS HEAR YOU AHEAD OF THEIR OWN TRAFFIC — THE MAST\'S DOING',
      sealed: false,
    }),
  ];
}

// SP2-180 "The Ash Pin's Second Age" — the pins are a pair: same stake design, same paint
// batch, same era, one incident from two ends. The honest gate is a live read World already
// keeps: both per-POI discovery records (state.world.discovery[sectorId].pois) for
// poi_helios_ash_pin and poi_ceres_ash_pin. The catalog's bare poi:discovered receipt proves
// less than the page claims, so it is not accepted on its own; the two-visit leg's
// consensus-named plain flag `pins_paired` (both pins within one in-game week) is the stricter
// writer and is honored on its own. The middle line — the player's campaign thread number —
// has no read yet and the page leaves it unwritten, like everyone else has.
export const PINS_PAIRED_FLAG = 'pins_paired';
export const ASH_PIN_POIS = Object.freeze({
  helios: { sectorId: 'sector_helios_prime', poiId: 'poi_helios_ash_pin' },
  ceres: { sectorId: 'sector_ceres_belt', poiId: 'poi_ceres_ash_pin' },
});

/** The world's own discovery records for both pins: found or not found, from the bags World keeps. */
export function ashPinDiscovery(state) {
  const disc = state && state.world && state.world.discovery;
  const found = (where) => {
    if (!disc || typeof disc !== 'object') return false;
    const sector = disc[where.sectorId];
    const pois = sector && typeof sector === 'object' ? sector.pois : null;
    const row = pois && typeof pois === 'object' ? pois[where.poiId] : null;
    return !!(row && typeof row === 'object'
      && (row.discovered === true || row.identified === true || row.investigated === true || row.defeated === true));
  };
  return { helios: found(ASH_PIN_POIS.helios), ceres: found(ASH_PIN_POIS.ceres) };
}

/** The pair's page: the pins, the text that completes itself, and the middle nobody wrote. */
export function twoPinsRows(state) {
  const both = ashPinDiscovery(state);
  const paired = both.helios && both.ceres;
  const got = paired
    || honestReceipt(plainFlag(state, PINS_PAIRED_FLAG));
  if (!got) return [];
  return [
    Object.freeze({ label: 'THE PAIR', value: 'SAME STAKE DESIGN, SAME PAINT BATCH, SAME ERA — ONE INCIDENT, TWO ENDS', sealed: false }),
    Object.freeze({ label: 'THE HELIOS PIN', value: 'BURNED DOWN IN HELIOS', sealed: false }),
    Object.freeze({ label: 'THE CERES PIN', value: 'ON THE PALLAS LEG OF CERES', sealed: false }),
    Object.freeze({ label: 'THE TEXT', value: 'THE TWO PARTIAL TEXTS COMPLETE EACH OTHER — EXCEPT THE MIDDLE', sealed: false }),
    Object.freeze({
      label: 'THE MIDDLE',
      value: 'THE PART NEITHER PIN CARRIES IS THE PART EVERYONE REMEMBERS AND NO ONE WROTE DOWN',
      sealed: false,
    }),
  ];
}

// SP2-040 "The Star Marker's Star" — an aimed stake that reads as a sextant: two bearings by
// two watches, intersecting above nothing, where nothing is charted. The director's scan
// receipt in the Expanse is the gate; the per-phase scan copy is the scanner leg's, and the
// intersection POI (a preserved cockpit beacon — a grave; Understory +3 for leaving it
// undisturbed) is the world leg's on its consensus-named plain flag `star_marker_fixed`, the
// accepted alternate seam. The watch row is a live read off the calendar: the station watch
// the marker is keeping right now, and which bearing that leaves un-read.
export const STAR_MARKER_FIXED_FLAG = 'star_marker_fixed';
export const STAR_MARKER_POI_ID = 'poi_charon_star_marker';

/** The sextant's page: the bearings, the intersection, and the watch the marker keeps now. */
export function starMarkerRows(state) {
  const fixed = honestReceipt(plainFlag(state, STAR_MARKER_FIXED_FLAG));
  if (special500Moment(state, 'SP2-040') == null && !fixed) return [];
  const now = Number(state && state.simTime);
  const shift = Number.isFinite(now) && now >= 0 ? stationShiftAt(STAR_MARKER_POI_ID, now) : null;
  return [
    Object.freeze({
      label: 'THE MARKER',
      value: 'AN AIMED STAKE, CHARON EXPANSE — TWO BEARINGS BY TWO WATCHES',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE SEXTANT',
      value: 'CROSS THE TWO BEARINGS AND THEY INTERSECT AT ONE FIXED POINT — ABOVE NOTHING',
      sealed: false,
    }),
    Object.freeze({
      label: 'THIS WATCH',
      value: shift
        ? `${String(shift.name || shift.id).toUpperCase()} — THE OTHER BEARING WAITS FOR THE OTHER WATCH`
        : 'THE MARKER KEEPS STATION WATCHES — THE PAGE READS THE CLOCK WHEN THE SAVE CARRIES ONE',
      sealed: false,
    }),
    Object.freeze({
      label: 'THE INTERSECTION',
      value: fixed
        ? 'FLOWN — A SINGLE PRESERVED COCKPIT BEACON. A GRAVE. LEFT AS FOUND.'
        : 'UNCHARTED — THE POINT WAITS FOR A FLIGHT',
      sealed: fixed,
    }),
  ];
}

// SP3-178 "The Vanishing Field" — a rock field that is measurably smaller every visit, the
// missing rocks standing elsewhere in a neat survey-painted row. The director's sector-entry
// receipt in the March is the gate; the seeded per-visit count ledger (the discovery-bag
// pattern) and the row placement are that leg's — the page states the ledger's absence and
// keeps the audit trail it can honestly keep: the finding itself.
export const VANISHING_FIELD_SECTOR = 'sector_nyx_march';

/** The field's page: the shrink, the row, and the ledger that has not been filed yet. */
export function vanishingFieldRows(state) {
  if (special500Moment(state, 'SP3-178') == null) return [];
  return [
    Object.freeze({ label: 'THE FIELD', value: 'MEASURABLY SMALLER EVERY TIME YOU COUNT IT', sealed: false }),
    Object.freeze({
      label: 'THE ROW',
      value: 'THE MISSING ROCKS, ELSEWHERE IN THE SECTOR — NEAT, NUMBERED IN SURVEY PAINT, FACING AWAY FROM EVERYTHING',
      sealed: false,
    }),
    Object.freeze({ label: 'THE COUNT', value: 'EXACT. THE ARRANGEMENT IS EXACT.', sealed: false }),
    Object.freeze({ label: 'THE REASON', value: 'ABSENT', sealed: false }),
    Object.freeze({
      label: 'THE LEDGER',
      value: 'THE PER-VISIT COUNT IS NOT FILED YET — THE FIELD SHRINKS REGARDLESS',
      sealed: false,
    }),
  ];
}

// SP2-023 "The Dead Star Chart" — the drifting survey wreck's chart table, every star replaced
// by a hand-cut tally mark, one circled. The director's scan receipt in the dark is the gate
// as implemented; the first-scan overlay copy is the scanner leg's, and the circled position's
// POI row (a dead precursor pin, Verge-Layer register) is the world leg's — the page keeps the
// chart honestly unfiled until that row exists, because the map is only a map.
export const SURVEYOR_SECTOR = 'sector_sedna_dark';

/** The chart's page: the tallies, the circle, and the filing the surveyor never made. */
export function surveyorMapRows(state) {
  if (special500Moment(state, 'SP2-023') == null) return [];
  return [
    Object.freeze({ label: 'THE WRECK', value: 'A DRIFTING SURVEY SHIP, SEDNA DARK — ITS CHART TABLE STILL LIT', sealed: false }),
    Object.freeze({ label: 'THE CHART', value: 'EVERY STAR REPLACED BY A HAND-CUT TALLY MARK', sealed: false }),
    Object.freeze({ label: 'THE CIRCLE', value: 'ONE TALLY, CIRCLED — POSITION FOR POSITION, A REAL UNCHARTED BODY', sealed: false }),
    Object.freeze({
      label: 'THE SURVEYOR',
      value: 'DIED BEFORE FILING IT, OR AFTER, OR BECAUSE OF IT. THE MAP DOES NOT SAY. THE MAP IS ONLY A MAP.',
      sealed: false,
    }),
    Object.freeze({ label: 'THE PIN', value: 'UNCHARTED STILL — THE CIRCLED POSITION WAITS FOR ITS POI ROW', sealed: false }),
  ];
}
