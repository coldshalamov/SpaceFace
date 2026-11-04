// special-500 Phase 2, batch 14 — the codex family. Fourteen codex/lore legs, each a pure
// read in data/discoveryPresentation.js over durable state the live owners already keep
// (the director's special500.* receipts and its nth-receipt counter, the authored Tessera
// registry line, the calendar's station shifts and storm-season table, the ace-memory bag
// the encounter systems keep), a codexPages.js overlay row in the section the entry names,
// and a World-tab section in the codex screen. Every read fails closed: no gate, no rows,
// no invented paperwork. SP3-078 and SP3-108 already carry their spectacle rows (batch 8);
// this batch is the codex leg those entries name — the spectacle legs are asserted, not rebuilt.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLIND_SOLD_FLAG,
  blindRows,
  baySevenRows,
  COLD_FOUR_POI_ID,
  COLD_FOUR_ROLLCALL_FLAG,
  coldFourRows,
  concordFormNumber,
  concordFormRows,
  CONCORD_FORM_PREFIX,
  chainLetterRows,
  dockChoirRows,
  HELIX_FINES_NTH,
  helixFineCount,
  helixVerseRows,
  MIRA_TIMESTAMP_FLAG,
  miraFixesRows,
  PLAYER_IS_A_FORM_FLAG,
  pourAnnouncementRows,
  QUIET_RECEIPT_OFF_BY_ONE_FLAG,
  QUIET_RECEIPT_SEAL,
  quietReceiptRows,
  QUEUE_MIRACLE_FLAG,
  QUEUE_MIRACLE_TABLE,
  queueMiracleRows,
  ransomBuoyRows,
  ransomRollNames,
  ROCK_CROSSING_DAY,
  rockCrossingRows,
  shelterAdvisoryRows,
  TESSERA_REGISTRY,
} from '../src/data/discoveryPresentation.js';
import { stationShiftAt, stormSeasonAt, CAL_DAY_S } from '../src/data/worldCalendar.js';
import { knownAces } from '../src/data/namedAces.js';
import { CODEX_PAGES, codexPageById } from '../src/data/codexPages.js';
import { SPECIAL500_ALL } from '../src/data/special500/index.js';
import { SPECTACLE_LEGS } from '../src/data/special500/spectacleLegs.js';
import { codexScreen } from '../src/ui/screens/codex.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const DAY = CAL_DAY_S; // 600 — the one day the world agrees on
const YEAR_DAYS = 40;  // CAL_YEAR_DAYS

function baseState(over = {}) {
  return {
    meta: { seed: 5014 },
    simTime: 0,
    tick: 0,
    player: { credits: 0, heat: 0, stats: {}, cargo: { items: {} }, ownedShips: [], activeShipIndex: 0 },
    factions: {},
    story: {
      beatIndex: 1,
      flags: {},
      depthProgramEncounters: { schemaVersion: 1, completed: {}, history: [] },
    },
    world: { currentSectorId: 'sector_helios_prime', discovery: {} },
    ...over,
  };
}

const ALL_READS = [
  quietReceiptRows, queueMiracleRows, concordFormRows, helixVerseRows, coldFourRows,
  blindRows, rockCrossingRows, pourAnnouncementRows, ransomBuoyRows, dockChoirRows,
  chainLetterRows, baySevenRows, miraFixesRows, shelterAdvisoryRows,
];

const BATCH_IDS = [
  'SP2-020', 'SP2-114', 'SP2-094', 'SP2-113', 'SP2-131', 'SP1-138', 'SP3-078', 'SP3-093',
  'SP1-007', 'SP3-108', 'SP2-045', 'SP3-109', 'SP2-052', 'SP3-056',
];

// ── the batch boundary: already-true legs are asserted, not rebuilt ──────────────────────────

test('SP3-078 and SP3-108 already carry their batch-8 spectacle rows; the codex leg is this batch only', () => {
  for (const id of ['SP3-078', 'SP3-108']) {
    const row = SPECTACLE_LEGS[id];
    assert.ok(row, `${id} has a landed spectacle row`);
    assert.ok(row.anchor && row.anchor.sectorId, `${id}'s row names its anchor sector`);
    assert.ok(Array.isArray(row.steps) && row.steps.length > 0, `${id}'s row carries its beats`);
  }
});

test('SP2-114 is still dormant in the catalog, so its read is an honest gated wait', () => {
  const entry = SPECIAL500_ALL.find((e) => e.id === 'SP2-114');
  assert.ok(entry, 'the Fulfillment Queue Miracle is a catalog entry');
  assert.equal(entry.dormant, true, 'no delivery-timing read exists yet — the entry stays dormant');
  assert.ok(entry.dormantReason && entry.dormantReason.includes('delivery-timing'),
    'the dormant reason names the missing read');
});

// ── fail-closed and adversarial ──────────────────────────────────────────────────────────────

test('no batch-14 read invents rows on an empty, missing or hostile state', () => {
  for (const read of ALL_READS) {
    assert.equal(read(null).length, 0, `${read.name}(null) fails closed`);
    assert.equal(read({}).length, 0, `${read.name}({}) fails closed`);
    assert.equal(read(baseState()).length, 0, `${read.name} on a fresh save fails closed`);
  }
});

test('stale flag shapes degrade to honest empty rows instead of crashing the page', () => {
  const garbage = baseState();
  for (const id of BATCH_IDS) garbage.story.flags[`special500.${id}`] = { nonsense: true };
  garbage.story.flags['special500.SP2-113.n'] = 'ten-ish';
  garbage.aceMemory = 'a shoebox of callsigns';
  garbage.world.currentSectorId = { junk: true };
  for (const read of ALL_READS) {
    assert.equal(read(garbage).length, 0, `${read.name} on garbage state fails closed`);
  }
  assert.equal(concordFormNumber(garbage), null, 'a corrupt receipt files no form number');
  assert.deepEqual(ransomRollNames(garbage), [], 'a corrupt ace memory names no captains');
});

test('refiring the same moment twice files the same rows — no duplicate paperwork', () => {
  const state = baseState();
  state.story.flags['special500.SP2-020'] = 12 * DAY;
  const first = quietReceiptRows(state);
  state.story.flags['special500.SP2-020'] = 13 * DAY;
  assert.equal(quietReceiptRows(state), first, 'a later receipt changes nothing');
  const bay = baseState();
  bay.story.flags['special500.SP3-109'] = 4 * DAY;
  const bayRows = baySevenRows(bay);
  bay.story.flags['special500.SP3-109'] = 11 * DAY;
  assert.equal(baySevenRows(bay), bayRows, 'a second weekly notice files no second page');
});

// ── per-unit behavior ────────────────────────────────────────────────────────────────────────

test('SP2-020: the receipt seal is the hull registration with exactly one character in dispute', () => {
  const state = baseState();
  assert.equal(quietReceiptRows(state).length, 0, 'no quiet business, no receipt');
  state.story.flags['special500.SP2-020'] = 9 * DAY;
  const rows = quietReceiptRows(state);
  assert.equal(rows.find((r) => r.label === 'HULL SEAL (PRINTED)').value, TESSERA_REGISTRY,
    'the printed seal is the authored registry line');
  assert.equal(TESSERA_REGISTRY, 'VHL-4471-T');
  assert.equal(QUIET_RECEIPT_SEAL, 'VHL-4472-T', 'the receipt seal is derived, not invented');
  const diffs = [...TESSERA_REGISTRY].filter((ch, i) => ch !== QUIET_RECEIPT_SEAL[i]).length;
  assert.equal(diffs, 1, 'the two seals differ in exactly one character');
  assert.equal(rows.find((r) => r.label === 'THE DIFFERENCE').value, 'ONE CHARACTER, IN DISPUTE');
  assert.equal(rows.find((r) => r.label === 'LINE ITEMS').sealed, true,
    'the line items stay sealed — the Quiet does not share its ledger');
  const flagged = baseState();
  flagged.story.flags[QUIET_RECEIPT_OFF_BY_ONE_FLAG] = true;
  assert.equal(quietReceiptRows(flagged).length, rows.length,
    'the scanner leg\u2019s plain receipt earns the same page');
});

test('SP2-114: the queue files nothing until the delivery-timing leg writes its one receipt', () => {
  const state = baseState();
  assert.equal(queueMiracleRows(state).length, 0, 'no zero-buffer delivery, no miracle');
  state.story.flags['special500.SP2-114'] = 12 * DAY;
  assert.equal(queueMiracleRows(state).length, 0,
    'even a director receipt is not the zero-buffer read — the entry is dormant and the wait is honest');
  state.story.flags[QUEUE_MIRACLE_FLAG] = true;
  const rows = queueMiracleRows(state);
  assert.deepEqual(rows, [...QUEUE_MIRACLE_TABLE], 'the plain flag is the only writer seam');
  assert.ok(rows.find((r) => r.label === 'CLASSIFICATION').value.includes('MIRACLE (STATISTICAL)'));
});

test('SP2-094: the form number reads off the receipt day, and the citation waits for the mail leg', () => {
  const state = baseState();
  assert.equal(concordFormNumber(state), null, 'no receipt, no form number');
  state.story.flags['special500.SP2-094'] = 20 * DAY + 123;
  assert.equal(concordFormNumber(state), `${CONCORD_FORM_PREFIX}20`, '44-C-P<day>, the payload\u2019s own arithmetic');
  const rows = concordFormRows(state);
  assert.equal(rows.find((r) => r.label === 'FORM NUMBER').value, `${CONCORD_FORM_PREFIX}20`);
  assert.equal(rows.find((r) => r.label === 'STATUS').value, 'YOU ARE NOW CITABLE');
  assert.ok(rows.find((r) => r.label === 'THE HEADERS').value.includes('QUEUED'),
    'no mail-leg writer, no citation claim');
  const cited = baseState();
  cited.story.flags[PLAYER_IS_A_FORM_FLAG] = true;
  assert.ok(concordFormRows(cited).find((r) => r.label === 'THE HEADERS').value.includes('ACTIVE'),
    'the mail leg\u2019s plain receipt is the alternate writer seam');
  assert.ok(concordFormRows(cited).find((r) => r.label === 'FORM NUMBER').value.includes('UNFILED'),
    'a flag without a receipt reads an honest UNFILED day');
});

test('SP2-113: the verse runs on the tenth fine, and the desk\u2019s own counter is the read', () => {
  const state = baseState();
  assert.equal(helixFineCount(state), 0, 'no fines on file');
  state.story.flags['special500.SP2-113.n'] = 7;
  assert.equal(helixVerseRows(state).length, 0, 'seven fines pay no footer verse');
  assert.equal(helixFineCount(state), 7, 'the running counter is the director\u2019s save-carried flag');
  state.story.flags['special500.SP2-113.n'] = 10;
  let rows = helixVerseRows(state);
  assert.equal(rows.find((r) => r.label === 'THE VERSE').value,
    'THE FINE IS THE PRICE / OF KNOWING THE PRICE / OF THE ROAD');
  assert.equal(rows.find((r) => r.label === 'REMOVAL').value, 'QUEUED');
  assert.equal(rows.find((r) => r.label === 'FINES PAID').value, '10 OF 10 — THE TENTH RUNS THE FOOTER');
  const receipted = baseState();
  receipted.story.flags['special500.SP2-113'] = 14 * DAY;
  assert.equal(helixFineCount(receipted), HELIX_FINES_NTH,
    'a pruned counter degrades to the receipt, never below it');
  assert.equal(helixVerseRows(receipted).length, rows.length);
  const corrupt = baseState();
  corrupt.story.flags['special500.SP2-113.n'] = 999;
  assert.equal(helixFineCount(corrupt), HELIX_FINES_NTH, 'a corrupt counter clamps to the trigger\u2019s own nth');
});

test('SP2-131: the roll call keeps the transcript, and the watch row reads the drill\u2019s own clock', () => {
  const state = baseState();
  assert.equal(coldFourRows(state).length, 0, 'the drill has not had an audience yet');
  state.story.flags['special500.SP2-131'] = 10 * DAY;
  assert.ok(coldFourRows(state).find((r) => r.label === 'THE ROLL CALL').value
    .includes('ALL POSITIONS NOTED AS PRESENT'));
  assert.ok(coldFourRows(state).find((r) => r.label === 'CLOSING').value.includes('GOOD WATCH.'));
  let onShift = null;
  let offShift = null;
  for (let t = 0; t < 2 * DAY; t += 1) {
    const shift = stationShiftAt(COLD_FOUR_POI_ID, t).id;
    if (shift === 'third' && onShift == null) onShift = t;
    if (shift !== 'third' && offShift == null) offShift = t;
    if (onShift != null && offShift != null) break;
  }
  assert.ok(onShift != null && offShift != null, 'the drill\u2019s clock has a deep-night watch and the rest of the day');
  state.simTime = offShift;
  assert.ok(coldFourRows(state).find((r) => r.label === 'TONIGHT').value.includes('NOT DEEP-NIGHT'),
    'off watch, the PA keeps the schedule');
  state.simTime = onShift;
  assert.ok(coldFourRows(state).find((r) => r.label === 'TONIGHT').value.includes('THE PA IS ON SHIFT'),
    'on deep night, the PA is on shift');
  const flagged = baseState();
  flagged.story.flags[COLD_FOUR_ROLLCALL_FLAG] = true;
  assert.equal(coldFourRows(flagged).length, coldFourRows({ ...flagged, simTime: offShift }).length,
    'the PA-audio leg\u2019s plain receipt earns the same page');
});

test('SP1-138: the band was their workplace, and the plan stays unsold until a choice leg sells it', () => {
  const state = baseState();
  assert.equal(blindRows(state).length, 0, 'no stakeout has drifted under you yet');
  state.story.flags['special500.SP1-138'] = 6 * DAY;
  let rows = blindRows(state);
  assert.equal(rows.find((r) => r.label === 'THE SUBJECT').value, 'NONE OF IT ABOUT YOU');
  assert.ok(rows.find((r) => r.label === 'THE PLAN').value.includes('UNSOLD'),
    'no choice leg, no sale claim');
  assert.equal(rows.find((r) => r.label === 'THE PLAN').sealed, false);
  const sold = baseState();
  sold.story.flags[BLIND_SOLD_FLAG] = true;
  rows = blindRows(sold);
  assert.ok(rows.find((r) => r.label === 'THE PLAN').value.includes('SOLD TO THE QUARRY'),
    'the choice leg\u2019s plain receipt files the sale');
  assert.equal(rows.find((r) => r.label === 'THE PLAN').sealed, true, 'a sold plan is settled paperwork');
});

test('SP3-078: the crossing reads its day off the wire, and the calendar row knows which day it is', () => {
  const state = baseState();
  assert.equal(rockCrossingRows(state).length, 0, 'no posting has been filed for you yet');
  state.story.flags['special500.SP3-078'] = ROCK_CROSSING_DAY * DAY + 230;
  let rows = rockCrossingRows(state);
  assert.equal(rows.find((r) => r.label === 'THE CROSSING').value,
    `DAY ${ROCK_CROSSING_DAY}, SECOND BELL — ON SCHEDULE`);
  assert.ok(rows.find((r) => r.label === 'THE ESCORT').value.includes('BORED TENDER SKIFF'));
  state.simTime = (ROCK_CROSSING_DAY - 1) * DAY + 100;
  assert.ok(rockCrossingRows(state).find((r) => r.label === 'THE CALENDAR').value
    .includes('THE WIRE POSTS IT TOMORROW'), 'the posting day is the crossing day minus one');
  state.simTime = ROCK_CROSSING_DAY * DAY + 100;
  assert.ok(rockCrossingRows(state).find((r) => r.label === 'THE CALENDAR').value
    .includes('CROSSING DAY'), 'on the minute, the calendar says give it room');
  state.simTime = (ROCK_CROSSING_DAY + 4) * DAY + 100;
  assert.ok(rockCrossingRows(state).find((r) => r.label === 'THE CALENDAR').value
    .includes(`THE NEXT CROSSING IS DAY ${ROCK_CROSSING_DAY}`), 'after the crossing, the wire keeps its schedule');
});

test('SP3-093: the announcement files the lead it actually keeps, on the day it fired', () => {
  const state = baseState();
  assert.equal(pourAnnouncementRows(state).length, 0, 'no pour called for you yet');
  state.story.flags['special500.SP3-093'] = 9 * DAY + 230;
  const rows = pourAnnouncementRows(state);
  assert.equal(rows.find((r) => r.label === 'THE WIRE').value,
    '"POUR IN THIRTY. CHANNEL IS HOT. GIVE THE SPINE ROOM."');
  assert.ok(rows.find((r) => r.label === 'THE LEAD').value.includes('DAY 9'),
    'the lead row reads the announcement day off the receipt');
  assert.ok(rows.find((r) => r.label === 'THE LEAD').value.includes('THE POUR RUNS THE WINDOW THE ANNOUNCEMENT ENDS ON'));
});

test('SP1-007: the roll reads only callsigns your ace memory actually carries', () => {
  const state = baseState();
  assert.equal(ransomBuoyRows(state).length, 0, 'the buoy has not read you the roll yet');
  state.story.flags['special500.SP1-007'] = 5 * DAY;
  let rows = ransomBuoyRows(state);
  assert.deepEqual(ransomRollNames(state), [], 'an empty log names nobody');
  assert.ok(rows.find((r) => r.label === 'ENTRY OF NOTE').value.includes('NAMES YOU HAVE NOT MET'),
    'an empty log degrades honestly, never to an invented captain');
  const ACE = knownAces()[0];
  const other = knownAces()[1];
  state.aceMemory = { [other.id]: { encountered: true, grudge: 1 } };
  assert.deepEqual(ransomRollNames(state), [other.name], 'the roll reads the run\u2019s actual encounter history');
  assert.ok(ransomBuoyRows(state).find((r) => r.label === 'ENTRY OF NOTE')
    .value.includes(String(other.name).toUpperCase()), 'the entry of note names the met captain');
  state.aceMemory = {
    [ACE.id]: { encountered: true, grudge: 2 },
    [other.id]: { encountered: true, grudge: 1 },
  };
  const names = ransomRollNames(state);
  assert.deepEqual(names, [ACE.name, other.name].sort((a, b) => a.localeCompare(b)),
    'two met captains sort deterministically');
  assert.ok(ransomBuoyRows(state).find((r) => r.label === 'THE TELL').value
    .includes('ONE ENTRY MATCHES A CALLSIGN YOUR LOG CARRIES'));
  const hostile = baseState();
  hostile.story.flags['special500.SP1-007'] = 5 * DAY;
  hostile.aceMemory = 'a shoebox of callsigns';
  assert.deepEqual(ransomRollNames(hostile), [], 'a corrupt memory bag names no captains');
});

test('SP3-108: the choir\u2019s score is the codex leg; the batch-8 spectacle row owns the audio', () => {
  const state = baseState();
  assert.equal(dockChoirRows(state).length, 0, 'the apron has not raised its choir for you yet');
  state.story.flags['special500.SP3-108'] = 12 * DAY;
  const rows = dockChoirRows(state);
  assert.ok(rows.find((r) => r.label === 'THE PARTS').value.includes('ONE VOICE ALWAYS SLIGHTLY BEHIND'));
  assert.equal(rows.find((r) => r.label === 'THE MATERIAL').value,
    'WORK — THE APRON HAS A CHOIR AND IT IS MADE OF WORK');
  assert.ok(SPECTACLE_LEGS['SP3-108'], 'the audio stays the spectacle row\u2019s job');
});

test('SP2-045: the letter denies itself in writing, and the log correction stays the letter\u2019s claim', () => {
  const state = baseState();
  assert.equal(chainLetterRows(state).length, 0, 'no quiet business, no letter');
  state.story.flags['special500.SP2-045'] = 8 * DAY;
  const rows = chainLetterRows(state);
  assert.equal(rows.find((r) => r.label === 'THE LAST LINE').value, '"YOU HAVE NOT READ THIS."');
  const log = rows.find((r) => r.label === 'THE LOG');
  assert.ok(log.value.includes('LOG CORRECTED'));
  assert.equal(log.sealed, true, 'the self-redaction is glue that has not landed; the page keeps it as the letter\u2019s account');
});

test('SP3-109: bay 7\u2019s canon emptiness is the page — no pod is claimed that never spawned', () => {
  const state = baseState();
  assert.equal(baySevenRows(state).length, 0, 'the notice has not posted for you yet');
  state.story.flags['special500.SP3-109'] = 4 * DAY;
  const rows = baySevenRows(state);
  assert.ok(rows.find((r) => r.label === 'THE WIRE').value.includes('CLAIM OR IT DRILLS'));
  assert.ok(rows.find((r) => r.label === 'THE POD').value.includes('NONE FOUND'),
    'the landed entry is the hones\u2019d version; the page does not invent a pod');
});

test('SP2-052: the correction is dated one hour early, and the audit queue waits for the trap leg', () => {
  const state = baseState();
  assert.equal(miraFixesRows(state).length, 0, 'no manifest has corrected itself yet');
  state.story.flags['special500.SP2-052'] = 7 * DAY;
  let rows = miraFixesRows(state);
  assert.ok(rows.find((r) => r.label === 'THE DATE').value.includes('ONE HOUR BEFORE THE CORRECTION HAPPENED'));
  assert.ok(rows.find((r) => r.label === 'THE AUDIT QUEUE').value.includes('UNTOUCHED'),
    'no trap leg, no suppression claim');
  assert.equal(rows.find((r) => r.label === 'THE AUDIT QUEUE').sealed, false);
  const fixed = baseState();
  fixed.story.flags[MIRA_TIMESTAMP_FLAG] = true;
  rows = miraFixesRows(fixed);
  assert.ok(rows.find((r) => r.label === 'THE AUDIT QUEUE').value.includes('PRE-DISMISSED'),
    'the trap leg\u2019s plain receipt files the suppression');
  assert.equal(rows.find((r) => r.label === 'THE AUDIT QUEUE').sealed, true);
});

test('SP3-056: the advisory reads the sector\u2019s real season, and a clear season says so', () => {
  const state = baseState();
  assert.equal(shelterAdvisoryRows(state).length, 0, 'no surge has been posted yet');
  // one simTime inside a stormy season for Helios and one in a clear one — the calendar owns both
  let stormy = null;
  let clear = null;
  for (let t = 0; t < 2 * 40 * DAY; t += 30) {
    const s = stormSeasonAt('sector_helios_prime', t);
    if (s.stormy && stormy == null) stormy = t;
    if (!s.stormy && clear == null) clear = t;
    if (stormy != null && clear != null) break;
  }
  assert.ok(stormy != null && clear != null, 'the sector calendar has both weather and clear seasons');
  state.story.flags['special500.SP3-056'] = 3 * DAY;
  state.simTime = stormy;
  const stormRows = shelterAdvisoryRows(state);
  const sectorRow = stormRows.find((r) => r.label === 'THIS SECTOR');
  assert.ok(sectorRow.value.includes('THE WIRE IS TALKING ABOUT YOUR WEATHER'),
    'a stormy sector reads its own season');
  assert.match(sectorRow.value, /DAY\(S\) LEFT IN THE SEASON/, 'the season\u2019s remaining days are a calendar read');
  state.simTime = clear;
  assert.ok(shelterAdvisoryRows(state).find((r) => r.label === 'THIS SECTOR').value
    .includes('CLEAR SEASON'), 'a clear season does not borrow someone else\u2019s weather');
  const noSector = baseState();
  noSector.story.flags['special500.SP3-056'] = 3 * DAY;
  noSector.world = { discovery: {} };
  const bare = shelterAdvisoryRows(noSector);
  assert.ok(bare.find((r) => r.label === 'THIS SECTOR').value.includes('CLEAR SEASON'),
    'a save with no current sector degrades honestly');
});

// ── codexPages.js overlays ───────────────────────────────────────────────────────────────────

test('the batch-14 sector overlays carry their lines in the sectors section', () => {
  const expectations = [
    ['sector_helios_prime', 'bay 7 has been empty for nine years'],
    ['sector_helios_prime', 'apron has a choir'],
    ['sector_vesta_forge', 'Cold Drill Four'],
    ['sector_vesta_forge', 'pour in thirty'],
    ['sector_kepler_scar', 'rock crossings one day ahead'],
    ['sector_sker_haven', 'hunter stakeout'],
    ['sector_pallas_drift', 'captains of interest'],
  ];
  for (const [id, line] of expectations) {
    const page = codexPageById(id);
    assert.ok(page && page.section === 'sectors', `${id} is a sectors page`);
    assert.ok(page.body.includes(line), `${id} carries the batch-14 line: ${line}`);
  }
});

test('the batch-14 faction and figure pages carry theirs', () => {
  const expectations = [
    ['faction_scn', 'filed back as a form'],
    ['faction_helix', 'THE FINE IS THE PRICE'],
    ['faction_fulfillment', 'MIRACLE (STATISTICAL)'],
    ['faction_quiet', 'one character off'],
    ['faction_quiet', 'chain letter'],
    ['faction_mts', 'berths go half price'],
    ['mira', 'dated one hour before'],
  ];
  for (const [id, line] of expectations) {
    const page = codexPageById(id);
    assert.ok(page, `${id} is a codex page`);
    assert.ok(page.body.includes(line), `${id} carries the batch-14 line: ${line}`);
  }
  const pallas = CODEX_PAGES.filter((p) => p.id === 'sector_pallas_drift');
  assert.equal(pallas.length, 1, 'the new Pallas Drift overlay is one entry, not a duplicate');
});

// ── the codex screen's World tab ─────────────────────────────────────────────────────────────

function renderedWorldState14() {
  const state = baseState();
  // every director receipt lands, then the per-unit world facts the reads honestly need
  state.story.flags['special500.SP2-020'] = 12 * DAY;
  state.story.flags['special500.SP2-094'] = 12 * DAY;
  state.story.flags['special500.SP2-113'] = 12 * DAY;
  state.story.flags['special500.SP2-113.n'] = 10;
  state.story.flags['special500.SP2-131'] = 12 * DAY;
  state.story.flags['special500.SP1-138'] = 12 * DAY;
  state.story.flags['special500.SP3-078'] = ROCK_CROSSING_DAY * DAY + 230;
  state.story.flags['special500.SP3-093'] = 9 * DAY + 230;
  state.story.flags['special500.SP1-007'] = 12 * DAY;
  state.story.flags['special500.SP3-108'] = 12 * DAY;
  state.story.flags['special500.SP2-045'] = 12 * DAY;
  state.story.flags['special500.SP3-109'] = 12 * DAY;
  state.story.flags['special500.SP2-052'] = 12 * DAY;
  state.story.flags['special500.SP3-056'] = 3 * DAY;
  const ACE = knownAces()[0];
  state.aceMemory = { [ACE.id]: { encountered: true, grudge: 1 } };
  // the advisory fires inside a stormy Helios season — the season row reads real weather
  assert.ok(stormSeasonAt('sector_helios_prime', 3 * DAY + 100).stormy,
    'the fixture\u2019s advisory day is stormy on the Helios calendar');
  state.simTime = 3 * DAY + 100;
  return state;
}

test('the World tab carries the batch-14 receipt sections in order, with honest empty states', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: renderedWorldState14() });
    const labels = codexScreen._sections.map((s) => s.label);
    assert.deepEqual(labels.slice(-28, -14), [
      'The Off-By-One Seal', 'The Queue Files An Emotion', 'You Are Now Citable', 'The Queued Verse',
      'Good Watch', 'The Blind', 'The Crossing', 'Pour In Thirty',
      'Captains Of Interest', 'The Dock Choir', 'Not A Chain Letter', 'Bay Seven',
      'Dated One Hour Early', 'Shelter Advisory',
    ], 'the batch-14 sections sit after the batch-12 and batch-13 receipts, before the batch-14b sections');
    assert.equal(codexScreen._sections.length, 63,
      'eight standing sections, the thirteen batch-12 sections, the fourteen batch-13 sections, '
      + 'the fourteen batch-14 sections, and the fourteen batch-14b sections');
    for (const entry of codexScreen._entries) {
      assert.ok(entry.article, `${entry.id} carries a real article`);
      const text = textLines(entry.article).join('\n');
      assert.ok(text.includes(entry.name), `${entry.id} prints its name in the article`);
    }
    const seal = codexScreen._entries.find((e) => e.id.startsWith('world:seal:RECEIPT SEAL'));
    assert.ok(seal && seal.name.includes('VHL-4472-T'), 'the filed seal prints, one character off');
    const ransom = codexScreen._entries.find((e) => e.id.startsWith('world:ransom:ENTRY OF NOTE'));
    assert.ok(ransom && ransom.name.includes(String(knownAces()[0].name).toUpperCase()),
      'the roll names the captain the log actually carries');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a fresh save renders every batch-14 section as its honest empty state', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: baseState() });
    assert.equal(codexScreen._sections.length, 63, 'the sections exist before their moments');
    const empties = codexScreen._sections.slice(-28, -14).map((s) => s.empty);
    for (const line of empties) {
      assert.ok(typeof line === 'string' && line.length > 0, 'every empty state says something honest');
    }
    assert.equal(codexScreen._entries.length, 1,
      'only the pilot\u2019s opening logbook entry renders; no batch-14 rows are invented');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a hostile save renders the batch-14 sections without crashing or inventing rows', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    const hostile = renderedWorldState14();
    for (const id of BATCH_IDS) hostile.story.flags[`special500.${id}`] = { nonsense: true };
    hostile.story.flags[QUEUE_MIRACLE_FLAG] = { junk: true };
    hostile.story.flags['special500.SP2-113.n'] = 'ten-ish';
    hostile.aceMemory = 'a shoebox of callsigns';
    hostile.world = { currentSectorId: 42, discovery: {} };
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: hostile });
    assert.equal(codexScreen._sections.length, 63, 'the page structure survives a hostile save');
    const batch14Entries = codexScreen._entries.filter((e) => [
      'world:seal:', 'world:miracle:', 'world:form:', 'world:verse:', 'world:rollcall:', 'world:blind:',
      'world:crossing:', 'world:pour:', 'world:ransom:', 'world:choir:', 'world:chain:', 'world:bay:',
      'world:mira:', 'world:advisory:',
    ].some((prefix) => e.id.startsWith(prefix)));
    assert.equal(batch14Entries.length, 0,
      'corrupt receipts file no batch-14 rows — every read degrades to its honest empty state');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});
