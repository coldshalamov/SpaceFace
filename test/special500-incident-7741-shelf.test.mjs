// special-500 SP2-004 "Incident 7741, the Sealed Side" — the codex leg. The Listening Field's
// array has been re-aimed since the first visit; a second scan after beat 3 files the mirrored
// evidence shelf, every line sealed except one. Warrant Orrin's file closes on the same line.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INCIDENT_7741_SHELF,
  INCIDENT_7741_SHELF_SEEN_FLAG,
  LISTENING_FIELD_POI_ID,
  incident7741ShelfRows,
  listeningFieldScanCount,
} from '../src/data/discoveryPresentation.js';
import { CODEX_PAGES, codexPageById } from '../src/data/codexPages.js';
import { codexPageView, codexPagesView } from '../src/ui/sim/codexPages.js';

function baseState(over = {}) {
  return {
    meta: { seed: 5004 },
    simTime: 0,
    tick: 0,
    player: { credits: 0, heat: 0, stats: {}, cargo: { items: {} }, ownedShips: [] },
    factions: {},
    story: { beatIndex: 3, flags: {} },
    world: { currentSectorId: 'sector_io_reach', discovery: {} },
    ...over,
  };
}

const SIGNAL_ID = `signal:poi:${LISTENING_FIELD_POI_ID}`;

function withScans(state, count) {
  state.signalInvestigation = {
    schemaVersion: 2,
    records: {
      [SIGNAL_ID]: {
        id: SIGNAL_ID,
        sectorId: 'sector_io_reach',
        sourceKind: 'anomaly',
        sourceId: LISTENING_FIELD_POI_ID,
        scanCount: count,
        firstSeenAt: 120,
        lastScanAt: 120 + count * 30,
      },
    },
    completed: {},
  };
  return state;
}

test('the sealed shelf stays sealed before beat 3, whatever the scanner says', () => {
  const state = withScans(baseState({ story: { beatIndex: 2, flags: {} } }), 5);
  assert.equal(incident7741ShelfRows(state).length, 0,
    'beat 2: the field has not turned yet, the shelf is not a rumor');
});

test('one scan after beat 3 is the first visit; the shelf takes a second reading', () => {
  const state = withScans(baseState(), 1);
  assert.equal(listeningFieldScanCount(state), 1, 'the scan count is the live read');
  assert.equal(incident7741ShelfRows(state).length, 0,
    'a single visit still sees the array aimed the old way');
  withScans(state, 2);
  assert.equal(incident7741ShelfRows(state), INCIDENT_7741_SHELF,
    'the second scan files the mirrored board');
});

test('the mirrored board lists five crew and seals every line but the hull status', () => {
  const rows = INCIDENT_7741_SHELF;
  const labels = rows.map((r) => `${r.label}: ${r.value}`);
  assert.deepEqual(labels, [
    'INCIDENT: 7741', 'CREW: 5', 'CAUSE: SEALED', 'EVIDENCE: SEALED',
    'WITNESSES: SEALED', 'HULL STATUS: HELD TOGETHER',
  ], 'the board reads exactly as the field shows it');
  const open = rows.filter((r) => !r.sealed);
  assert.deepEqual(open.map((r) => r.label), ['INCIDENT', 'CREW', 'HULL STATUS'],
    'cause, evidence and witnesses stay sealed; the hull status is the one open line');
});

test('the durable receipt flag shows the shelf even after the scan record is pruned', () => {
  const state = baseState();
  state.story.flags[INCIDENT_7741_SHELF_SEEN_FLAG] = state.simTime + 1;
  assert.equal(incident7741ShelfRows(state), INCIDENT_7741_SHELF,
    'the plain-named flag is the durable receipt — no bounded record can unsee it');
});

test('the consensus-named counter flag stands in for the scanner read when present', () => {
  const state = baseState();
  state.story.flags.poi_io_listening_visit = 2;
  assert.equal(incident7741ShelfRows(state), INCIDENT_7741_SHELF,
    'the writer seam the consensus names is honored');
  state.story.flags.poi_io_listening_visit = 1;
  assert.equal(incident7741ShelfRows(state).length, 0,
    'a counter below two keeps the shelf sealed');
});

test("Warrant Orrin's codex page carries the sealed-side line once his page unseals", () => {
  const page = codexPageById('warrant_orrin');
  assert.ok(page && page.section === 'figures', 'Orrin has a Figures page');
  const beatFive = baseState({ story: { beatIndex: 5, flags: {} } });
  const view = codexPageView(beatFive, page);
  assert.equal(view.unlocked, true, 'beat 5 unseals the Inspector General');
  assert.ok(view.body.includes('Incident 7741'), 'the file name is on his page');
  assert.ok(view.body.includes('HULL STATUS: HELD TOGETHER'), 'the unsealed line is on his page');
  const beatFour = baseState({ story: { beatIndex: 4, flags: {} } });
  const locked = codexPageView(beatFour, page);
  assert.equal(locked.unlocked, false, 'the story has not spoken him yet');
  assert.equal(locked.body, '', 'a locked page leaks nothing');
});

test('the codex catalog keeps one Orrin page and the overlay reads in the view shape', () => {
  const orrins = CODEX_PAGES.filter((p) => p.id === 'warrant_orrin');
  assert.equal(orrins.length, 1, 'no duplicate figure page from the append');
  const sections = codexPagesView(baseState({ story: { beatIndex: 6, flags: {} } })).sections;
  const figures = sections.find((s) => s.id === 'figures');
  const row = figures.pages.find((p) => p.id === 'warrant_orrin');
  assert.ok(row && row.unlocked && row.body.includes('Incident 7741'),
    'the rendered figures section serves the line the shelf earned');
});
