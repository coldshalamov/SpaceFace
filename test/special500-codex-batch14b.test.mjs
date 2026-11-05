// special-500 Phase 2, batch 14b — the codex family (ledger batch 14). Fourteen codex/lore
// legs, each a pure read in data/discoveryPresentation.js over durable state the live owners
// already keep (the director's special500.* receipts, the quill copy counter src/systems/quill.js
// writes, the per-POI discovery records World keeps in state.world.discovery, the calendar's
// storm-season table and station watches), a codexPages.js overlay line in the sector section
// the entry names, and a World-tab section in the codex screen. Every read fails closed: no
// gate, no rows, no invented paperwork. Where the consensus names a mechanic for another family
// (the mooring hold-timer, the sale-band nudge, the lamp channel, the pooled prop, the audio
// mix, the wreck-herding presentation, the sectorZones record, the scanner branches, the bark
// variant, the intersection POI, the count ledger, the spawned pin row), the read states the
// condition instead of claiming it — the rest belongs to those legs' own units.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ashPinDiscovery,
  ASH_PIN_POIS,
  bargainLightRows,
  BARGAIN_LIGHT_DAY,
  FLOCK_REFLOCKED_FLAG,
  humAtSkerRows,
  HUM_ZONE_WU,
  mastPrefersYouRows,
  MAST_PREFERS_YOU_FLAG,
  MAST_POI_ID,
  mooringGuestRows,
  MOORING_BETWEEN_FLAG,
  panelNineRows,
  PANEL9_FOUND_FLAG,
  PANEL_NINE_LINE,
  paperPlaneRows,
  quillCopiedCount,
  reFlockedRows,
  STAR_MARKER_FIXED_FLAG,
  STAR_MARKER_POI_ID,
  starMarkerRows,
  stakeBookmarkRows,
  STAKE_BOOKMARKED_FLAG,
  STAKE_BOOKMARK_MIN,
  stillEyeRows,
  STILL_EYE_SECTOR,
  surveyorMapRows,
  twoCreditTruthRows,
  TWO_CREDIT_NUDGE_PCT,
  TWO_CREDIT_TRUTH_FLAG,
  twoPinsRows,
  PINS_PAIRED_FLAG,
  VANISHING_FIELD_SECTOR,
  vanishingFieldRows,
} from '../src/data/discoveryPresentation.js';
import { QUILL } from '../src/data/quill.js';
import { stationShiftAt, stormSeasonAt, CAL_DAY_S, CAL_YEAR_DAYS } from '../src/data/worldCalendar.js';
import { codexPageById, CODEX_PAGES } from '../src/data/codexPages.js';
import { SPECIAL500_ALL } from '../src/data/special500/index.js';
import { codexScreen } from '../src/ui/screens/codex.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const DAY = CAL_DAY_S; // 600 — the one day the world agrees on

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
  mooringGuestRows, stakeBookmarkRows, twoCreditTruthRows, bargainLightRows, paperPlaneRows,
  humAtSkerRows, reFlockedRows, stillEyeRows, panelNineRows, mastPrefersYouRows,
  twoPinsRows, starMarkerRows, vanishingFieldRows, surveyorMapRows,
];

const BATCH_IDS = [
  'SP2-179', 'SP2-171', 'SP2-085', 'SP3-107', 'SP3-117', 'SP3-138', 'SP2-168', 'SP3-026',
  'SP2-173', 'SP2-175', 'SP2-180', 'SP2-040', 'SP3-178', 'SP2-023',
];

// ── the batch boundary: the catalog entries are live, the reads are the codex legs ────────────

test('all fourteen batch-14b entries are live catalog rows the director actually fires', () => {
  for (const id of BATCH_IDS) {
    const entry = SPECIAL500_ALL.find((e) => e.id === id);
    assert.ok(entry, `${id} is a catalog entry`);
    assert.equal(entry.dormant, undefined, `${id} is not dormant — its receipt is an honest writer`);
    assert.ok(entry.trigger && entry.trigger.type, `${id} carries a trigger the director implements`);
  }
});

// ── fail-closed and adversarial ──────────────────────────────────────────────────────────────

test('no batch-14b read invents rows on an empty, missing or hostile state', () => {
  for (const read of ALL_READS) {
    assert.equal(read(null).length, 0, `${read.name}(null) fails closed`);
    assert.equal(read({}).length, 0, `${read.name}({}) fails closed`);
    assert.equal(read(baseState()).length, 0, `${read.name} on a fresh save fails closed`);
  }
});

test('stale flag shapes and corrupt bags degrade to honest empty rows instead of crashing', () => {
  const garbage = baseState();
  for (const id of BATCH_IDS) garbage.story.flags[`special500.${id}`] = { nonsense: true };
  for (const flag of [MOORING_BETWEEN_FLAG, STAKE_BOOKMARKED_FLAG, TWO_CREDIT_TRUTH_FLAG,
    FLOCK_REFLOCKED_FLAG, PANEL9_FOUND_FLAG, MAST_PREFERS_YOU_FLAG, PINS_PAIRED_FLAG,
    STAR_MARKER_FIXED_FLAG]) {
    garbage.story.flags[flag] = { junk: true };
  }
  garbage.story.flags[QUILL.copiedFlag] = 'two-ish';
  garbage.world.discovery = 'a shoebox of charts';
  garbage.world.currentSectorId = 42;
  garbage.simTime = 'not a clock';
  for (const read of ALL_READS) {
    assert.equal(read(garbage).length, 0, `${read.name} on garbage state fails closed`);
  }
  assert.deepEqual(ashPinDiscovery(garbage), { helios: false, ceres: false },
    'a corrupt discovery bag names no pins');
  assert.equal(quillCopiedCount(garbage), 0, 'a corrupt quill counter counts no pages');
});

test('refiring the same moment files the same rows — duplicate scans make no duplicate pages', () => {
  const chart = baseState();
  chart.story.flags['special500.SP2-023'] = 9 * DAY;
  const first = surveyorMapRows(chart);
  chart.story.flags['special500.SP2-023'] = 10 * DAY;
  assert.deepEqual(surveyorMapRows(chart), first, 'a second scan of the wreck files no second page');
  const moor = baseState();
  moor.story.flags['special500.SP2-179'] = 4 * DAY;
  const settled = mooringGuestRows(moor);
  moor.story.flags['special500.SP2-179'] = 5 * DAY;
  assert.deepEqual(mooringGuestRows(moor), settled, 're-settling at the mooring rewrites nothing');
});

// ── per-unit behavior ────────────────────────────────────────────────────────────────────────

test('SP2-179: the book keeps the entry half-finished until the departure leg writes mooring_between', () => {
  const state = baseState();
  assert.equal(mooringGuestRows(state).length, 0, 'an unsettled hull is not in the book');
  state.story.flags['special500.SP2-179'] = 4 * DAY;
  let rows = mooringGuestRows(state);
  assert.ok(rows.find((r) => r.label === 'YOUR LINE').value.includes('ARRIVED'),
    'the settle receipt files the arrival line');
  assert.ok(rows.find((r) => r.label === 'YOUR LINE').value.includes('FINISHES ITSELF WHEN YOU LEAVE'),
    'the book does not finish a departure nobody made');
  const left = baseState();
  left.story.flags[MOORING_BETWEEN_FLAG] = true;
  rows = mooringGuestRows(left);
  assert.equal(rows.find((r) => r.label === 'YOUR LINE').value,
    'ARRIVED. DEPARTED. BETWEEN: EVERYTHING.', 'the hold-timer leg\u2019s receipt is the alternate seam');
  assert.ok(rows.find((r) => r.label === 'THE HOUSE RULE').value.includes('HALF-FINISHED'),
    'the house rule is the book\u2019s own, not the player\u2019s');
});

test('SP2-171: the gate is the quill copy counter the Quill system actually writes', () => {
  const state = baseState();
  assert.equal(quillCopiedCount(state), 0, 'no copies, no count');
  state.story.flags[QUILL.copiedFlag] = 1;
  assert.equal(stakeBookmarkRows(state).length, 0, 'one copied page is below the bookmark gate');
  state.story.flags[QUILL.copiedFlag] = STAKE_BOOKMARK_MIN;
  let rows = stakeBookmarkRows(state);
  assert.ok(rows.find((r) => r.label === 'COPIED OPEN').value.includes('2 PAGES'),
    'the count is the counter the live writer keeps');
  assert.ok(rows.find((r) => r.label === 'THE KNOT').value.includes('INDEX KNOT'));
  state.story.flags[QUILL.copiedFlag] = 5;
  assert.ok(stakeBookmarkRows(state).find((r) => r.label === 'COPIED OPEN').value.includes('5 PAGES'),
    'the page tracks the player\u2019s actual copies');
  const pruned = baseState();
  pruned.story.flags['special500.SP2-171'] = 6 * DAY;
  rows = stakeBookmarkRows(pruned);
  assert.ok(rows.find((r) => r.label === 'COPIED OPEN').value.includes('THE COUNT RIDES AR-3\'S LOG'),
    'a receipt without its counter degrades honestly, never to an invented count');
  const flagged = baseState();
  flagged.story.flags[STAKE_BOOKMARKED_FLAG] = true;
  assert.equal(stakeBookmarkRows(flagged).length, rows.length,
    'the dressing leg\u2019s plain receipt earns the same page');
});

test('SP2-085: the advice files as the rockhand\u2019s claim until the economy leg pays it', () => {
  const state = baseState();
  assert.equal(twoCreditTruthRows(state).length, 0, 'no tired loads, no drink');
  state.story.flags['special500.SP2-085'] = 5 * DAY;
  let rows = twoCreditTruthRows(state);
  assert.ok(rows.find((r) => r.label === 'THE DRINK').value.includes('EXACTLY TWO CREDITS'));
  assert.ok(rows.find((r) => r.label === 'THE NEXT SALE').value.includes('WAITS'),
    'no sale-band writer, no nudge claim');
  assert.equal(rows.find((r) => r.label === 'THE NEXT SALE').sealed, false);
  const told = baseState();
  told.story.flags[TWO_CREDIT_TRUTH_FLAG] = true;
  rows = twoCreditTruthRows(told);
  assert.ok(rows.find((r) => r.label === 'THE NEXT SALE').value.includes(`+${TWO_CREDIT_NUDGE_PCT}%`),
    'the economy leg\u2019s receipt files the one-time nudge');
  assert.equal(rows.find((r) => r.label === 'THE NEXT SALE').sealed, true, 'a paid nudge is settled paperwork');
});

test('SP3-107: the calendar row reads the fair day, and between fairs it says when the lamp returns', () => {
  const state = baseState();
  assert.equal(bargainLightRows(state).length, 0, 'the lamp has not blinked for you yet');
  state.story.flags['special500.SP3-107'] = 12 * DAY;
  const onFair = 13 * DAY + 120; // dayOfYear 13 — Ring Fair
  assert.equal(Math.floor(onFair / DAY) % CAL_YEAR_DAYS, BARGAIN_LIGHT_DAY, 'the fixture sits on the fair day');
  state.simTime = onFair;
  assert.ok(bargainLightRows(state).find((r) => r.label === 'THE OCCASION').value.includes('THE LAMP IS LIT'),
    'on day 13 the page says lit');
  state.simTime = 15 * DAY + 120;
  assert.ok(bargainLightRows(state).find((r) => r.label === 'THE OCCASION').value
    .includes(`IT LIGHTS AGAIN ON DAY ${BARGAIN_LIGHT_DAY}`), 'between fairs the page keeps the schedule');
  assert.ok(bargainLightRows(state).find((r) => r.label === 'THE DECODE').value.includes('TAG LANE'),
    'the decode names the charted lane, not an invented route');
});

test('SP3-117: the witness page is the two lines — the object and the question', () => {
  const state = baseState();
  assert.equal(paperPlaneRows(state).length, 0, 'no window, no plane');
  state.story.flags['special500.SP3-117'] = 21 * DAY + 430;
  const rows = paperPlaneRows(state);
  assert.ok(rows.find((r) => r.label === 'THE OBJECT').value.includes('FOLDED HULL PLATE'));
  assert.equal(rows.find((r) => r.label === 'THE QUESTION').value, 'WHO FOLDS THESE?');
  assert.ok(rows.find((r) => r.label === 'THE PHYSICS').value.includes('NOTHING GLIDES IN VACUUM'),
    'the hones\u2019d entry throws, it does not glide');
});

test('SP3-138: the listening place files, and the mix states its own absence', () => {
  const state = baseState();
  assert.equal(humAtSkerRows(state).length, 0, 'the bearing has not held for you yet');
  state.story.flags['special500.SP3-138'] = 8 * DAY;
  const rows = humAtSkerRows(state);
  assert.ok(rows.find((r) => r.label === 'THE BEARING').value.includes(`${HUM_ZONE_WU} WU`),
    'the zone is the proximity gate the director keeps');
  assert.ok(rows.find((r) => r.label === 'THE RULE').value.includes('YOU ARE WHAT CHANGED'));
  assert.ok(rows.find((r) => r.label === 'THE MIX').value.includes('WAITS FOR THE AUDIO BUS'),
    'no audio-bus writer, no duck-and-chord claim');
});

test('SP2-168: the flock files on the kill receipt, and the salvage stays collectible', () => {
  const state = baseState();
  assert.equal(reFlockedRows(state).length, 0, 'no hull broken near the shepherd yet');
  state.story.flags['special500.SP2-168'] = 6 * DAY;
  let rows = reFlockedRows(state);
  assert.equal(rows.find((r) => r.label === 'THE COUNT').value, 'CORRECT');
  assert.ok(rows.find((r) => r.label === 'THE SALVAGE').value.includes('COLLECTIBLE BY ANYONE'),
    'the wreckage stays salvage; the claim is filing, not fencing');
  const flagged = baseState();
  flagged.story.flags[FLOCK_REFLOCKED_FLAG] = true;
  assert.equal(reFlockedRows(flagged).length, rows.length,
    'the presentation leg\u2019s plain receipt earns the same page');
});

test('SP3-026: the season row reads the calendar\u2019s real season count, and a dead clock says so', () => {
  const state = baseState();
  assert.equal(stillEyeRows(state).length, 0, 'the band has not shown you the pocket yet');
  state.story.flags['special500.SP3-026'] = 3 * DAY;
  state.simTime = 3 * DAY + 120;
  const rows = stillEyeRows(state);
  const season = stormSeasonAt(STILL_EYE_SECTOR, 3 * DAY + 120);
  assert.equal(rows.find((r) => r.label === 'THIS SEASON').value,
    `THE EYE\'S STEP IS FILED UNDER SEASON ${season.season} — IT MOVES ONE BAND-WIDTH EACH`,
    'the season count is the storm bands\u2019 own calendar read');
  assert.ok(rows.find((r) => r.label === 'THE PILOTS').value.includes('DO NOT SHARE THE COORDINATES'),
    'the page keeps the season math and withholds a position the zone record does not name yet');
  const deadClock = baseState();
  deadClock.story.flags['special500.SP3-026'] = 3 * DAY;
  deadClock.simTime = 'not a clock';
  assert.ok(stillEyeRows(deadClock).find((r) => r.label === 'THIS SEASON').value
    .includes('THE CALENDAR KEEPS THE COUNT'), 'a save without a clock degrades honestly');
});

test('SP2-173: the scan names the container, and the middle chapter stays queued', () => {
  const state = baseState();
  assert.equal(panelNineRows(state).length, 0, 'the relic has not been scanned yet');
  state.story.flags['special500.SP2-173'] = 7 * DAY;
  let rows = panelNineRows(state);
  assert.equal(rows.find((r) => r.label === 'THE SCAN').value, PANEL_NINE_LINE);
  assert.ok(rows.find((r) => r.label === 'THE PROVENANCE').value.includes('HELIOS BAY 7'));
  assert.ok(rows.find((r) => r.label === 'THE MIDDLE CHAPTER').value.includes('QUEUED'),
    'no Bay 7 thread writer, no middle-chapter claim');
  const flagged = baseState();
  flagged.story.flags[PANEL9_FOUND_FLAG] = true;
  assert.equal(panelNineRows(flagged).length, rows.length,
    'the scanner leg\u2019s plain receipt earns the same page');
});

test('SP2-175: the mast files its edit, and the preference reads as the mast\u2019s word', () => {
  const state = baseState();
  assert.equal(mastPrefersYouRows(state).length, 0, 'the mast has not edited you yet');
  state.story.flags['special500.SP2-175'] = 5 * DAY;
  let rows = mastPrefersYouRows(state);
  assert.equal(rows.find((r) => r.label === 'THE PLAYBACK').value,
    '"TRANSMISSION: EDITED. CONTENT: PRESERVED. THE MAST PREFERS YOU."');
  assert.ok(rows.find((r) => r.label === 'THE PREFERENCE').value.includes('PERMANENT'));
  const flagged = baseState();
  flagged.story.flags[MAST_PREFERS_YOU_FLAG] = true;
  assert.equal(mastPrefersYouRows(flagged).length, rows.length,
    'the comms leg\u2019s plain receipt earns the same page');
});

test('SP2-180: the honest gate is both pins in the world\u2019s discovery records, not a bare receipt', () => {
  const state = baseState();
  assert.equal(twoPinsRows(state).length, 0, 'no pins, no pair');
  state.story.flags['special500.SP2-180'] = 5 * DAY;
  assert.equal(twoPinsRows(state).length, 0,
    'the catalog\u2019s discovery receipt fires on any POI in either sector — it proves less than the page claims');
  const half = baseState();
  half.world.discovery = {
    [ASH_PIN_POIS.helios.sectorId]: { pois: { [ASH_PIN_POIS.helios.poiId]: { discovered: true } } },
  };
  half.story.flags['special500.SP2-180'] = 5 * DAY;
  assert.equal(twoPinsRows(half).length, 0, 'one pin is a stake, not a pair');
  const both = baseState();
  both.world.discovery = {
    [ASH_PIN_POIS.helios.sectorId]: { pois: { [ASH_PIN_POIS.helios.poiId]: { discovered: true } } },
    [ASH_PIN_POIS.ceres.sectorId]: { pois: { [ASH_PIN_POIS.ceres.poiId]: { identified: true } } },
  };
  const rows = twoPinsRows(both);
  assert.ok(rows, 'both pins in the world\u2019s own bags open the page');
  assert.ok(rows.find((r) => r.label === 'THE PAIR').value.includes('SAME PAINT BATCH'));
  assert.ok(rows.find((r) => r.label === 'THE MIDDLE').value.includes('NO ONE WROTE DOWN'),
    'the middle line stays unwritten — no thread-number read exists and the page does not invent one');
  const flagged = baseState();
  flagged.story.flags[PINS_PAIRED_FLAG] = true;
  assert.equal(twoPinsRows(flagged).length, rows.length,
    'the two-visit leg\u2019s plain receipt (both pins inside the week) earns the same page');
  const garbage = baseState();
  garbage.world.discovery = 'a shoebox of charts';
  garbage.story.flags['special500.SP2-180'] = 5 * DAY;
  assert.deepEqual(ashPinDiscovery(garbage), { helios: false, ceres: false },
    'a corrupt bag names no pins and the page stays honestly empty');
});

test('SP2-040: the sextant reads the marker\u2019s real watch, and the intersection waits for its flag', () => {
  const state = baseState();
  assert.equal(starMarkerRows(state).length, 0, 'the marker has not taken your scan yet');
  state.story.flags['special500.SP2-040'] = 6 * DAY;
  const rows = starMarkerRows(state);
  assert.ok(rows.find((r) => r.label === 'THE SEXTANT').value.includes('ABOVE NOTHING'));
  assert.ok(rows.find((r) => r.label === 'THE INTERSECTION').value.includes('UNCHARTED'),
    'no world-leg writer, no grave claim');
  assert.equal(rows.find((r) => r.label === 'THE INTERSECTION').sealed, false);
  let watched = null;
  for (let t = 0; t < 2 * DAY; t += 1) {
    const shift = stationShiftAt(STAR_MARKER_POI_ID, t);
    if (shift.id === 'third') { watched = t; break; }
  }
  assert.ok(watched != null, 'the marker\u2019s berth clock has a third watch');
  state.simTime = watched;
  assert.ok(starMarkerRows(state).find((r) => r.label === 'THIS WATCH').value.includes('THIRD WATCH'),
    'the watch row is the calendar\u2019s own read at the marker');
  assert.ok(starMarkerRows(state).find((r) => r.label === 'THIS WATCH').value
    .includes('THE OTHER BEARING WAITS FOR THE OTHER WATCH'), 'the per-phase scan copy is the scanner leg\u2019s');
  const deadClock = baseState();
  deadClock.story.flags['special500.SP2-040'] = 6 * DAY;
  deadClock.simTime = 'not a clock';
  assert.ok(starMarkerRows(deadClock).find((r) => r.label === 'THIS WATCH').value
    .includes('THE PAGE READS THE CLOCK WHEN THE SAVE CARRIES ONE'), 'a save without a clock degrades honestly');
  const flown = baseState();
  flown.story.flags[STAR_MARKER_FIXED_FLAG] = true;
  const fixed = starMarkerRows(flown);
  assert.ok(fixed.find((r) => r.label === 'THE INTERSECTION').value.includes('A GRAVE'),
    'the world leg\u2019s plain receipt files the flown point');
  assert.equal(fixed.find((r) => r.label === 'THE INTERSECTION').sealed, true, 'a grave is settled paperwork');
});

test('SP3-178: the audit trail keeps the finding, and states the ledger\u2019s absence', () => {
  const state = baseState();
  assert.equal(vanishingFieldRows(state).length, 0, 'the field has not been counted yet');
  state.story.flags['special500.SP3-178'] = 4 * DAY;
  const rows = vanishingFieldRows(state);
  assert.ok(rows.find((r) => r.label === 'THE FIELD').value.includes('SMALLER EVERY TIME'));
  assert.ok(rows.find((r) => r.label === 'THE COUNT').value.includes('EXACT'));
  assert.equal(rows.find((r) => r.label === 'THE REASON').value, 'ABSENT');
  assert.ok(rows.find((r) => r.label === 'THE LEDGER').value.includes('NOT FILED YET'),
    'no per-visit count writer, no ledger claim — the page keeps the trail it can');
});

test('SP2-023: the chart keeps the surveyor\u2019s tallies, and the pin stays uncharted until its row exists', () => {
  const state = baseState();
  assert.equal(surveyorMapRows(state).length, 0, 'the wreck has not been scanned yet');
  state.story.flags['special500.SP2-023'] = 9 * DAY;
  const rows = surveyorMapRows(state);
  assert.ok(rows.find((r) => r.label === 'THE CHART').value.includes('TALLY MARK'));
  assert.ok(rows.find((r) => r.label === 'THE CIRCLE').value.includes('A REAL UNCHARTED BODY'));
  assert.ok(rows.find((r) => r.label === 'THE PIN').value.includes('UNCHARTED STILL'),
    'no POI-row writer, no discoverable claim — the map is only a map');
});

// ── codexPages.js overlays ───────────────────────────────────────────────────────────────────

test('the batch-14b sector overlays carry their lines in the sectors section, one page per sector', () => {
  const expectations = [
    ['sector_helios_prime', 'guest book in handwriting'],
    ['sector_helios_prime', 'folded hull plate'],
    ['sector_ceres_belt', 'exactly two credits'],
    ['sector_ceres_belt', 'same paint batch'],
    ['sector_tethys_junction', 'calm pocket the storm flows around'],
    ['sector_pallas_drift', 'Ring Fair'],
    ['sector_io_reach', 'edits, and does not jam'],
    ['sector_charon_expanse', 'AR-3'],
    ['sector_charon_expanse', 'gather the fresh wreckage'],
    ['sector_charon_expanse', 'R3-CARRIER GRID, PANEL 9'],
    ['sector_charon_expanse', 'two bearings by two watches'],
    ['sector_sker_haven', 'all in tune'],
    ['sector_nyx_march', 'numbered in survey paint'],
    ['sector_sedna_dark', 'hand-cut tally mark'],
  ];
  for (const [id, line] of expectations) {
    const page = codexPageById(id);
    assert.ok(page && page.section === 'sectors', `${id} is a sectors page`);
    assert.ok(page.body.includes(line), `${id} carries the batch-14b line: ${line}`);
  }
  const ids = expectations.map(([id]) => id);
  assert.equal(new Set(ids).size, 9, 'the fourteen lines live on nine sector pages');
  for (const id of new Set(ids)) {
    assert.equal(CODEX_PAGES.filter((p) => p.id === id).length, 1,
      `${id} is one entry, not a duplicate`);
  }
});

// ── the codex screen's World tab ─────────────────────────────────────────────────────────────

function renderedWorldState14b() {
  const state = baseState();
  // every director receipt lands, then the per-unit world facts the reads honestly need
  for (const id of BATCH_IDS) state.story.flags[`special500.${id}`] = 6 * DAY;
  state.story.flags[QUILL.copiedFlag] = 3; // SP2-171's live gate: three pages copied open
  state.story.flags[MOORING_BETWEEN_FLAG] = true; // the hold-timer leg's departure receipt
  state.world.discovery = {
    [ASH_PIN_POIS.helios.sectorId]: { pois: { [ASH_PIN_POIS.helios.poiId]: { discovered: true } } },
    [ASH_PIN_POIS.ceres.sectorId]: { pois: { [ASH_PIN_POIS.ceres.poiId]: { discovered: true } } },
  };
  state.simTime = BARGAIN_LIGHT_DAY * DAY + 120; // Ring Fair — the calendar row reads lit
  return state;
}

test('the World tab carries the batch-14b receipt sections in order, with honest empty states', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: renderedWorldState14b() });
    const labels = codexScreen._sections.map((s) => s.label);
    assert.deepEqual(labels.slice(-14), [
      'Between', 'The Recommendations', 'Two-Credit Truth', 'The Bargain Light',
      'Who Folds These', 'The Hum', 'Re-Flocked', 'The Still Eye',
      'Panel Nine', 'The Mast Prefers You', 'The Two Pins', 'The Sextant',
      'The Audit Trail', 'The Surveyor\u2019s Last Map',
    ], 'the batch-14b sections close the World tab after the batch-12, 13 and 14 receipts');
    assert.equal(codexScreen._sections.length, 63,
      'eight standing sections, the thirteen batch-12 sections, the fourteen batch-13 sections, '
      + 'the fourteen batch-14 sections, and the fourteen batch-14b sections — the same count '
      + 'fb-codex-world-tab\u2019s updated guard asserts');
    for (const entry of codexScreen._entries) {
      assert.ok(entry.article, `${entry.id} carries a real article`);
      const text = textLines(entry.article).join('\n');
      assert.ok(text.includes(entry.name), `${entry.id} prints its name in the article`);
    }
    const moor = codexScreen._entries.find((e) => e.id.startsWith('world:moor:YOUR LINE'));
    assert.ok(moor && moor.name.includes('BETWEEN: EVERYTHING'), 'the departed line prints, finished');
    const bookmark = codexScreen._entries.find((e) => e.id.startsWith('world:bookmark:COPIED OPEN'));
    assert.ok(bookmark && bookmark.name.includes('3 PAGES'), 'the bookmark reads the live quill counter');
    const lamp = codexScreen._entries.find((e) => e.id.startsWith('world:bargain:THE OCCASION'));
    assert.ok(lamp && lamp.name.includes('THE LAMP IS LIT'), 'the calendar row reads Ring Fair');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a fresh save renders every batch-14b section as its honest empty state', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: baseState() });
    assert.equal(codexScreen._sections.length, 63, 'the sections exist before their moments');
    const empties = codexScreen._sections.slice(-14).map((s) => s.empty);
    for (const line of empties) {
      assert.ok(typeof line === 'string' && line.length > 0, 'every empty state says something honest');
    }
    assert.equal(codexScreen._entries.length, 1,
      'only the pilot\u2019s opening logbook entry renders; no batch-14b rows are invented');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('a hostile save renders the batch-14b sections without crashing or inventing rows', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    const hostile = renderedWorldState14b();
    for (const id of BATCH_IDS) hostile.story.flags[`special500.${id}`] = { nonsense: true };
    for (const flag of [MOORING_BETWEEN_FLAG, STAKE_BOOKMARKED_FLAG, TWO_CREDIT_TRUTH_FLAG,
      FLOCK_REFLOCKED_FLAG, PANEL9_FOUND_FLAG, MAST_PREFERS_YOU_FLAG, PINS_PAIRED_FLAG,
      STAR_MARKER_FIXED_FLAG]) {
      hostile.story.flags[flag] = { junk: true };
    }
    hostile.story.flags[QUILL.copiedFlag] = 'two-ish';
    hostile.world.discovery = { garbage: { pois: { broken: 'not a record' } } };
    hostile.simTime = 'not a clock';
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: hostile });
    assert.equal(codexScreen._sections.length, 63, 'the page structure survives a hostile save');
    const batch14bEntries = codexScreen._entries.filter((e) => [
      'world:moor:', 'world:bookmark:', 'world:truth:', 'world:bargain:', 'world:plane:',
      'world:hum:', 'world:flock:', 'world:eye:', 'world:panel:', 'world:mast:',
      'world:pins:', 'world:sextant:', 'world:field:', 'world:chart:',
    ].some((prefix) => e.id.startsWith(prefix)));
    assert.equal(batch14bEntries.length, 0,
      'corrupt receipts file no batch-14b rows — every read degrades to its honest empty state');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});
