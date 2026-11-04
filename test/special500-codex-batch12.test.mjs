// special-500 Phase 2, batch 12 — the codex family. Fourteen codex/lore legs, each a pure
// read in data/discoveryPresentation.js over durable state the live owners already keep
// (the director's special500.* receipts, the Morrow launches counter, calendar days, the
// depth-program memory records), a codexPages.js overlay row in the section the entry
// names, and a World-tab section in the codex screen. Every read fails closed: no gate,
// no rows, no invented paperwork.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abutmentChalkRows,
  alignmentRows,
  ALIGNMENT_KEPT_FLAG,
  buoyKeepingRows,
  BUOY_KEEPING_FLAG,
  BUOY_KEEPING_TABLE,
  checkpointCatRows,
  CHECKPOINT_CAT_FLAG,
  galleryAccessionRows,
  halfConversationRows,
  jumpLogRows,
  JUMP100_FLAG,
  latchTidyRows,
  LONG_SENTENCE,
  longGameRows,
  LONG_GAME_DRAWN_FLAG,
  longSentenceRows,
  MORROW_HUNDRED_FLAG,
  morrowHundredRows,
  refund47aRows,
  shaftSevenTallyRows,
  volsLastLogRows,
  VOLS_FOUND_FLAG,
} from '../src/data/discoveryPresentation.js';
import { SHIPS } from '../src/data/ships.js';
import { CAL_DAY_S, CAL_YEAR_DAYS } from '../src/data/worldCalendar.js';
import { CODEX_PAGES, codexPageById } from '../src/data/codexPages.js';
import { codexPageView } from '../src/ui/sim/codexPages.js';
import { codexScreen } from '../src/ui/screens/codex.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const DAY = CAL_DAY_S; // 600 s — the one day the world agrees on
const KESTREL = SHIPS.find((s) => s.id === 'ship_kestrel');

function baseState(over = {}) {
  return {
    meta: { seed: 5012 },
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

function withKestrel(state) {
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  return state;
}

const ALL_READS = [
  buoyKeepingRows, halfConversationRows, abutmentChalkRows, refund47aRows,
  volsLastLogRows, latchTidyRows, longSentenceRows, shaftSevenTallyRows,
  morrowHundredRows, checkpointCatRows, jumpLogRows, galleryAccessionRows,
  longGameRows, alignmentRows,
];

test('no batch-12 read invents rows on an empty, missing or hostile state', () => {
  for (const read of ALL_READS) {
    assert.equal(read(null).length, 0, `${read.name}(null) fails closed`);
    assert.equal(read({}).length, 0, `${read.name}({}) fails closed`);
    assert.equal(read(baseState()).length, 0, `${read.name} on a fresh save fails closed`);
  }
});

test('stale flag shapes degrade to honest empty rows instead of crashing the page', () => {
  const garbage = baseState();
  for (const id of ['SP2-190', 'SP3-016', 'SP1-099', 'SPX-A-07']) {
    garbage.story.flags[`special500.${id}`] = { nonsense: true };
  }
  assert.equal(refund47aRows(garbage).length, 0, 'an unparseable 47-A filing is not a filing');
  assert.equal(alignmentRows(garbage).length, 0, 'an unparseable alignment receipt is not a receipt');
  assert.equal(longSentenceRows(garbage).length, 0, 'an unparseable first-heard time is not a first hearing');
  assert.equal(abutmentChalkRows(garbage).length, 0, 'an unparseable weigh time is not a weigh');
  const junkMorrow = baseState();
  junkMorrow.morrow = { launches: 'many' };
  assert.equal(morrowHundredRows(junkMorrow).length, 0,
    'a corrupted launches counter reads as zero, not as a hundred');
});

test('SP2-029: the buoy answers anyway once the director files the moment', () => {
  const state = baseState();
  assert.equal(buoyKeepingRows(state).length, 0, 'no answer before the moment');
  state.story.flags['special500.SP2-029'] = 12 * DAY;
  assert.equal(buoyKeepingRows(state), BUOY_KEEPING_TABLE,
    'the moment earned the frozen table, not a copy of it');
  const labels = buoyKeepingRows(state).map((r) => `${r.label}: ${r.value}`);
  assert.deepEqual(labels, [
    'CHANNEL: RETIRED', 'REGISTRY: NO ENTRY FILED', 'ANSWER: KEPT ANYWAY',
    'INSTRUCTION: DO NOT TELL THE NETWORK',
  ]);
  assert.equal(BUOY_KEEPING_TABLE.find((r) => r.label === 'INSTRUCTION').sealed, true,
    'the instruction stays between the buoy and the network');
});

test('SP2-029: the consensus-named plain flag stands in for the director receipt', () => {
  const state = baseState();
  state.story.flags[BUOY_KEEPING_FLAG] = true;
  assert.equal(buoyKeepingRows(state), BUOY_KEEPING_TABLE,
    'the hail-response leg owns the moment too; the read honors either writer');
});

test('refiring the same moment twice files the same rows — no duplicate paperwork', () => {
  const state = baseState();
  state.story.flags['special500.SP2-029'] = 12 * DAY;
  const first = buoyKeepingRows(state);
  state.story.flags['special500.SP2-029'] = 13 * DAY;
  assert.equal(buoyKeepingRows(state), first, 'a later receipt changes nothing');
});

test('SPX-A-09: the half a conversation waits for its own gate, not just the buoy keeping', () => {
  const state = baseState();
  state.story.flags['special500.SP2-029'] = 12 * DAY;
  assert.equal(halfConversationRows(state).length, 0,
    'the after-gate is honored as a read: the buoy keeping alone does not open the argument');
  state.story.flags['special500.SPX-A-09'] = 15 * DAY;
  const rows = halfConversationRows(state);
  assert.equal(rows.find((r) => r.label === 'SIDE B').value, 'CARRIER SILENCE',
    'the other party\'s turns stay carrier-silence');
  assert.equal(rows.find((r) => r.label === 'SIDE B').sealed, true,
    'the silence is the one sealed line');
});

test('SPX-A-07: the abutment chalks your hull, massed and dated, off the live records', () => {
  const state = withKestrel(baseState());
  state.story.flags['special500.SPX-A-07'] = 40 * DAY;
  const rows = abutmentChalkRows(state);
  const yourLine = rows.find((r) => r.label === 'YOUR LINE');
  assert.ok(yourLine.value.includes(String(KESTREL.name).toUpperCase()),
    'the line names your hull by its authored name');
  assert.ok(yourLine.value.includes(`${KESTREL.mass} T`), 'the mass is the authored hull mass');
  assert.ok(yourLine.value.includes('DAY 40'), 'the day is read off the weigh receipt');
  assert.ok(yourLine.value.includes('DATED YESTERDAY'), 'the stone dates your line yesterday');
  assert.equal(rows.find((r) => r.label === 'WHO WRITES IT').sealed, true,
    'nobody on the roster remembers, and the chalk keeps that sealed');
});

test('SPX-A-07: a stale save with no owned hull still gets its chalk, with no invented mass', () => {
  const state = baseState();
  state.story.flags['special500.SPX-A-07'] = 40 * DAY;
  const rows = abutmentChalkRows(state);
  assert.ok(rows.find((r) => r.label === 'YOUR LINE').value.includes('HULL UNLISTED'),
    'the stone waits for a name instead of guessing one');
});

test('SP2-190: day 100 or later, Scale 4 processes the release and re-files it', () => {
  const state = baseState();
  assert.equal(refund47aRows(state).length, 0, 'before the desk, the page is empty');
  state.story.flags['special500.SP2-190'] = 100 * DAY;
  const rows = refund47aRows(state);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel['FILED'], 'DAY 100, SCALE 4', 'the day gate is the 100th in-game day');
  assert.equal(byLabel['CONTRACT'], '47-A');
  assert.equal(byLabel['SIGNATURE'], 'D. VALE, DORMANT', 'the signature is correct');
  assert.equal(byLabel['BALANCE'], 'RE-FILED — WITHHELD', 'the balance is re-withheld: the anomaly');
  assert.equal(byLabel['NOTE'], 'THE DESK APOLOGIZES FOR THE HOPE');
});

test('SP2-001: the pod log files under either writer — the scanner receipt or the director', () => {
  const state = baseState();
  state.story.flags['special500.SP2-001'] = 3 * DAY;
  let rows = volsLastLogRows(state);
  assert.equal(rows.find((r) => r.label === 'TRANSPONDER').value, 'TESSERA / OLD RIG');
  assert.equal(rows.find((r) => r.label === 'APOLOGY').sealed, true,
    'the apology stays as recorded');
  const alternate = baseState();
  alternate.story.flags[VOLS_FOUND_FLAG] = true;
  assert.equal(volsLastLogRows(alternate).length, rows.length,
    'the consensus-named tessera_vols_found flag earns the same page');
});

test('SP2-031: the tidy receipt names the sector the mark persists in, from the memory record', () => {
  const state = baseState();
  state.story.flags['special500.SP2-031'] = 9 * DAY;
  assert.ok(latchTidyRows(state).find((r) => r.label === 'THE MARK').value.includes('WHERE IT WAS LEFT'),
    'no memory record, no sector claim');
  state.story.depthProgramEncounters.completed['special500.SP2-031'] = {
    outcome: 'observed', at: 9 * DAY, sectorId: 'sector_ceres_belt', visits: 1,
  };
  const rows = latchTidyRows(state);
  assert.ok(rows.find((r) => r.label === 'THE MARK').value.includes('CERES'),
    'the mark persists in the sector the record names');
  assert.equal(rows.find((r) => r.label === 'REGISTRY STAMP').value, 'LATCH-CHILD, ORIGIN LAPSED');
  assert.equal(rows.find((r) => r.label === 'REGISTRY STAMP').sealed, true);
  assert.ok(rows.find((r) => r.label === 'WRECK').value.includes('NOTHING TAKEN'));
});

test('SP1-099: the beacon spells one character per pulse and the sentence is not a loop', () => {
  const state = baseState();
  state.story.flags['special500.SP1-099'] = 0;
  state.simTime = 720;
  let rows = longSentenceRows(state);
  let transmission = rows.find((r) => r.label === 'TRANSMISSION').value;
  assert.ok(transmission.startsWith('WE WERE SENT'), 'the sentence starts at the beginning');
  assert.ok(transmission.length < LONG_SENTENCE.length, 'two minutes is not the whole hour');
  assert.ok(transmission.endsWith('▌'), 'the cursor marks the pulse still owed');
  assert.ok(rows.find((r) => r.label === 'PROGRESS').value.includes('ONE PULSE, ONE CHARACTER'));
  assert.equal(rows.find((r) => r.label === 'WHEN COMPLETE').sealed, true,
    'the ending is still pulses away');
  state.simTime = 3600;
  rows = longSentenceRows(state);
  transmission = rows.find((r) => r.label === 'TRANSMISSION').value;
  assert.equal(transmission, LONG_SENTENCE, 'a full hour files the sentence in full');
  assert.equal(rows.find((r) => r.label === 'WHEN COMPLETE').value, 'FILED IN FULL. THE APOLOGY STANDS.');
  assert.equal(rows.find((r) => r.label === 'WHEN COMPLETE').sealed, false,
    'the completed page unseals its last line');
  assert.ok(LONG_SENTENCE.includes('APOLOGY'), 'the sentence is the apology the consensus promises');
});

test('SP1-099: a clock that runs backwards clamps to the first pulse instead of un-writing', () => {
  const state = baseState();
  state.story.flags['special500.SP1-099'] = 30 * DAY;
  state.simTime = 10 * DAY;
  const rows = longSentenceRows(state);
  assert.equal(rows.find((r) => r.label === 'TRANSMISSION').value, '▌',
    'zero characters and a cursor: the beacon restarts its count from now');
});

test('SP2-010: the re-chalked tally plate and the two helmets file once the stake is read', () => {
  const state = baseState();
  assert.equal(shaftSevenTallyRows(state).length, 0);
  state.story.flags['special500.SP2-010'] = 5 * DAY;
  const rows = shaftSevenTallyRows(state);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel['TALLY PLATE'], '9 / 11 RETURNED');
  assert.equal(byLabel['FILED AS'], '0.7T MOISTURE');
  assert.equal(byLabel['SECOND HAND, DIFFERENT CHALK'], 'THE MATH IS LEGAL. THE MATH IS NOT DONE.');
  assert.equal(byLabel['MEMORIAL CLAMP'], 'TWO HELMETS, FACE OUT, STILL WATCHING THE LANE');
});

test('SP2-116: Morrow says the number only when the launches counter earns it', () => {
  const state = baseState();
  state.morrow = { launches: 99 };
  assert.equal(morrowHundredRows(state).length, 0, 'ninety-nine departures are its own business');
  state.morrow.launches = 100;
  let rows = morrowHundredRows(state);
  assert.equal(rows.find((r) => r.label === 'DEPARTURES').value, '100',
    'the count is read off the live counter, not asserted');
  assert.equal(rows.find((r) => r.label === 'ARRIVALS').value, 'THE SAME NUMBER');
  state.morrow.launches = 140;
  assert.equal(morrowHundredRows(state).find((r) => r.label === 'DEPARTURES').value, '140',
    'the tally keeps counting past the moment');
});

test('SP2-116: a stale save without the morrow bag still earns the page via either receipt', () => {
  const flagged = baseState();
  flagged.story.flags['special500.SP2-116'] = 44 * DAY;
  assert.equal(morrowHundredRows(flagged).find((r) => r.label === 'DEPARTURES').value, 'ONE HUNDRED',
    'the director\'s nth receipt stands in for a pruned counter');
  const plain = baseState();
  plain.story.flags[MORROW_HUNDRED_FLAG] = 44 * DAY;
  assert.equal(morrowHundredRows(plain).length, 4,
    'the plain flag the launch path writes is the third seam');
});

test('SP1-023: the checkpoint drone files its paperwork under either writer', () => {
  const state = baseState();
  state.story.flags['special500.SP1-023'] = 7 * DAY;
  let rows = checkpointCatRows(state);
  assert.equal(rows.find((r) => r.label === 'DESIGNATION').value, 'EQUIPMENT, MORALE');
  assert.equal(rows.find((r) => r.label === 'EXAMINER\'S DENIAL').sealed, true,
    'the denial is the only line the examiner will countersign');
  const alternate = baseState();
  alternate.story.flags[CHECKPOINT_CAT_FLAG] = true;
  assert.equal(checkpointCatRows(alternate).length, rows.length,
    'the persistent-prop leg\'s plain flag earns the same rows');
});

test('SP2-189: the first jump is logged once; the hundredth waits for its own writer', () => {
  const state = baseState();
  assert.equal(jumpLogRows(state).length, 0, 'no jump, no log');
  state.story.flags['special500.SP2-189'] = 1 * DAY;
  let rows = jumpLogRows(state);
  assert.equal(rows.find((r) => r.label === 'JUMP 1').value, 'LOGGED');
  assert.equal(rows.some((r) => r.label === 'JUMP 100'), false,
    'the private counter has no writer yet; the page does not pretend');
  assert.equal(rows.find((r) => r.label === 'PRIVATE COUNTER').value, 'NEVER SHOWN');
  assert.equal(rows.find((r) => r.label === 'PRIVATE COUNTER').sealed, true);
  state.story.flags[JUMP100_FLAG] = true;
  rows = jumpLogRows(state);
  assert.equal(rows.find((r) => r.label === 'JUMP 100').value, 'THE MASS STILL KNOWS. KEEP GOING.',
    'when the jump-100 leg lands, its line files here');
});

test('SP2-130: Gallery Rock accessioned after the Rubric marking earns the scan', () => {
  const state = baseState();
  assert.equal(galleryAccessionRows(state).length, 0);
  state.story.flags['special500.SP2-130'] = 21 * DAY;
  const rows = galleryAccessionRows(state);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel['EXHIBIT'], 'A');
  assert.equal(byLabel['ACCESSION NO.'], '1');
  assert.equal(byLabel['WELD-BEAD TEXT'], 'THIS ROCK IS FINE. THE LABEL IS FOR YOU.');
});

test('SP2-143: the long game stands in progress until the visits leg files the draw', () => {
  const state = baseState();
  assert.equal(longGameRows(state).length, 0);
  state.story.flags['special500.SP2-143'] = 18 * DAY;
  let rows = longGameRows(state);
  assert.equal(rows.find((r) => r.label === 'GAME STATE').value, 'IN PROGRESS — ONE PIECE, EVERY VISIT');
  assert.equal(rows.find((r) => r.label === 'NOTATION SHEET').sealed, true,
    'both hands the same: the game seals that line, not the page');
  state.story.flags[LONG_GAME_DRAWN_FLAG] = true;
  rows = longGameRows(state);
  assert.ok(rows.find((r) => r.label === 'GAME STATE').value.includes('A DRAW'),
    'after three visits the game ends the only way it could');
  assert.equal(rows.find((r) => r.label === 'GAME STATE').sealed, true,
    'the light went out; the line sealed with it');
});

test('SP3-016: the alignment receipt reads its year off the calendar and keeps capture honest', () => {
  const state = baseState();
  assert.equal(alignmentRows(state).length, 0);
  state.story.flags['special500.SP3-016'] = (CAL_YEAR_DAYS + 16) * DAY + 301;
  let rows = alignmentRows(state);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel['FRAME'], 'DAY 16, YEAR 1 — COMPOSED WHETHER OR NOT ANYONE LOOKED');
  assert.equal(byLabel['CAPTURE'], 'FIRE THE SCANNER INSIDE THE WINDOW',
    'no capture writer exists yet; the row states the condition instead of claiming the frame');
  state.story.flags[ALIGNMENT_KEPT_FLAG] = true;
  rows = alignmentRows(state);
  assert.equal(rows.find((r) => r.label === 'CAPTURE').value, 'KEPT — THE SCANNER FIRED INSIDE THE WINDOW',
    'when the scan-pulse hook lands, its capture files here');
});

// ── codexPages.js overlays ──────────────────────────────────────────────────────────────────

test('the batch-12 sector overlays carry their lines in the sectors section', () => {
  const expectations = [
    ['sector_helios_prime', '47-A paperwork'],
    ['sector_ceres_belt', 'memorial clamp'],
    ['sector_tethys_junction', 'abutment stone'],
    ['sector_vesta_forge', 'Accession No. 1'],
    ['sector_io_reach', 'answers anyway'],
    ['sector_charon_expanse', 'one pulse per character'],
    ['sector_veil_nebula', 'nose-to-nose'],
  ];
  for (const [id, line] of expectations) {
    const page = codexPageById(id);
    assert.ok(page && page.section === 'sectors', `${id} is a sectors page`);
    assert.ok(page.body.includes(line), `${id} carries the batch-12 line: ${line}`);
  }
});

test('the batch-12 figure overlays carry their lines, and Morrow gets his page', () => {
  const vols = codexPageById('maera_vols');
  assert.ok(vols && vols.section === 'figures');
  assert.ok(vols.body.includes('TESSERA / OLD RIG'), 'Vols\' page carries the pod log line');
  const senna = codexPageById('dustwife_senna');
  assert.ok(senna.body.includes('moisture'), 'Senna\'s page carries the moisture filing');
  const latch = codexPageById('latch_child');
  assert.ok(latch.body.includes('Nothing was taken'), 'Latch-Child\'s page carries the tidy mark');
  const morrows = CODEX_PAGES.filter((p) => p.id === 'morrow');
  assert.equal(morrows.length, 1, 'one Morrow page, no duplicate from the append');
  assert.equal(morrows[0].section, 'figures');
  assert.ok(morrows[0].body.includes('momentum-rescue'), 'Morrow\'s page says what the machine is for');
});

test('Morrow\u2019s figure page unseals at beat 1, when the corridor has introduced him', () => {
  const page = codexPageById('morrow');
  const met = codexPageView(baseState(), page);
  assert.equal(met.unlocked, true, 'beat 1 unseals the rescue machine');
  assert.ok(met.body.includes('departures'), 'the unlocked page keeps the tally lore');
  const unmet = codexPageView(baseState({ story: { beatIndex: 0, flags: {} } }), page);
  assert.equal(unmet.unlocked, false, 'beat 0 has not introduced him');
  assert.equal(unmet.body, '', 'a locked page leaks nothing');
});

// ── the codex screen's World tab ─────────────────────────────────────────────────────────────

function renderedWorldState() {
  const state = withKestrel(baseState());
  for (const id of ['SP2-029', 'SPX-A-09', 'SPX-A-07', 'SP2-190', 'SP2-001', 'SP2-031',
    'SP2-010', 'SP2-116', 'SP1-023', 'SP2-189', 'SP2-130', 'SP2-143', 'SP3-016']) {
    state.story.flags[`special500.${id}`] = 12 * DAY;
  }
  // the beacon was first heard at hour zero, so a full hour of pulses has spelled the sentence
  state.story.flags['special500.SP1-099'] = 0;
  state.story.flags[JUMP100_FLAG] = true;
  state.story.flags[LONG_GAME_DRAWN_FLAG] = true;
  state.story.flags[ALIGNMENT_KEPT_FLAG] = true;
  state.story.flags[BUOY_KEEPING_FLAG] = true;
  state.morrow = { launches: 128 };
  state.simTime = 12 * DAY + 600;
  state.story.depthProgramEncounters.completed['special500.SP2-031'] = {
    outcome: 'observed', at: 12 * DAY, sectorId: 'sector_ceres_belt', visits: 1,
  };
  return state;
}

test('the World tab carries the batch-12 receipt sections in order, with honest empty states', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: renderedWorldState() });
    const labels = codexScreen._sections.map((s) => s.label);
    assert.deepEqual(labels.slice(8, 21), [
      'The Retired Channel', 'Weigh-Clamp Chalk', 'Contract 47-A', 'Vols\u2019s Last Log',
      'The Tidied Wreck', 'The Long Sentence', 'Shaft 7 Tally', 'Morrow\u2019s Tally',
      'Checkpoint Niner', 'Jump Log', 'Accession No. 1', 'The Long Game', 'Alignment, Day 16',
    ], 'the batch-12 sections sit after the pilot receipts, before the batch-13 sections');
    assert.equal(codexScreen._sections.length, 63,
      'eight standing sections, the thirteen batch-12 receipt sections, the fourteen batch-13 sections, '
      + 'the fourteen batch-14 sections, and the fourteen batch-14b sections');
    for (const entry of codexScreen._entries) {
      assert.ok(entry.article, `${entry.id} carries a real article`);
      const text = textLines(entry.article).join('\n');
      assert.ok(text.includes(entry.name), `${entry.id} prints its name in the article`);
    }
    const sentence = codexScreen._entries.find((e) => e.id.startsWith('world:sentence:TRANSMISSION'));
    assert.ok(sentence.name.endsWith('…'), 'the transcript trims its ladder name');
    assert.ok(textLines(sentence.article).join('\n').includes(LONG_SENTENCE),
      'the full sentence prints in the article body');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a fresh save renders every batch-12 section as its honest empty state', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: baseState() });
    assert.equal(codexScreen._sections.length, 63, 'the sections exist before their moments');
    const empties = codexScreen._sections.slice(8, 21).map((s) => s.empty);
    for (const line of empties) {
      assert.ok(typeof line === 'string' && line.length > 0, 'every empty state says something honest');
    }
    assert.equal(codexScreen._entries.length, 1,
      'only the pilot\u2019s opening logbook entry renders; no batch-12 rows are invented');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});
