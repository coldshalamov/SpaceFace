// special-500 SP2-112 "The Verge-Layer's Toll Riddle" — the codex/lore leg. The dormant gate
// ring on Sedna Dark's ringworld arc asks one question that is a toll, weighs the hull, and
// files the answer as a receipt; the ring stays closed either way. The gate POI interaction
// (wake, artifact check, weigh, Verge standing) is the unit's interaction leg; it writes the
// plain-named flag this page reads. Until then the receipt stays honestly empty.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VERGE_GATE_RECEIPT,
  VERGE_GATE_RECEIPT_FLAG,
  vergeGateReceiptRows,
} from '../src/data/discoveryPresentation.js';
import { codexPageById } from '../src/data/codexPages.js';
import { codexPageView } from '../src/ui/sim/codexPages.js';

function baseState(over = {}) {
  return {
    meta: { seed: 5112 },
    simTime: 0,
    tick: 0,
    player: { credits: 0, heat: 0, stats: {}, cargo: { items: {} }, ownedShips: [] },
    factions: {},
    story: { beatIndex: 0, flags: {} },
    world: { currentSectorId: 'sector_helios_prime', discovery: {} },
    ...over,
  };
}

const SECTOR_PAGE_ID = 'sector_sedna_dark';
const DISCOVERED = {
  sector_sedna_dark: { discovered: true, visitedCount: 1, pois: {}, fieldsDepleted: {} },
};

test('the receipt is empty until the gate files it — no invented paperwork', () => {
  const state = baseState();
  assert.equal(vergeGateReceiptRows(state).length, 0,
    'no flag, no receipt: the page refuses to pretend the weigh happened');
  state.story.flags[VERGE_GATE_RECEIPT_FLAG] = 0;
  assert.equal(vergeGateReceiptRows(state).length, 0,
    'a falsy filing is not a filing either');
});

test('a filed receipt reads the day off the flag value and closes the ring either way', () => {
  const state = baseState();
  state.story.flags[VERGE_GATE_RECEIPT_FLAG] = 2.5 * 600; // day 2, mid-shift
  const rows = vergeGateReceiptRows(state);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel['GATE RECEIPT'], 'DAY 2', 'the day is read off the filing time');
  assert.equal(byLabel['QUESTION ASKED'], 'WHAT IS THE MASS OF A DECISION?',
    'the toll question survives as authored');
  assert.equal(byLabel['VERDICT'], 'CONSISTENT', 'an ordinary weigh reads consistent');
  assert.equal(byLabel['RING STATUS'], 'CLOSED', 'the ring has never opened');
  assert.equal(byLabel['TOLL'], 'ANSWERED', 'answering at all is what the auditors respect');
});

test('the concerning verdict is a property of the filing, not a second flag', () => {
  const state = baseState();
  state.story.flags[VERGE_GATE_RECEIPT_FLAG] = { at: 11 * 600, concerning: true };
  const rows = vergeGateReceiptRows(state);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel['GATE RECEIPT'], 'DAY 11');
  assert.equal(byLabel['VERDICT'], 'CONSISTENT (CONCERNING)',
    'the stricter verdict renders when the gate weighed it so');
});

test('the authored receipt table keeps the weigh lines the gate promises', () => {
  const labels = VERGE_GATE_RECEIPT.map((r) => r.label);
  assert.deepEqual(labels, ['QUESTION ASKED', 'WEIGHED', 'RING STATUS', 'TOLL']);
  const weighed = VERGE_GATE_RECEIPT.find((r) => r.label === 'WEIGHED');
  assert.ok(weighed.value.includes('HULL') && weighed.value.includes('CARGO')
    && weighed.value.includes('TRANSPONDER HISTORY'),
    'hull, cargo and transponder history — the three things the gate weighs');
});

test("the Sedna Dark codex page carries the toll riddle once the sector is charted", () => {
  const page = codexPageById(SECTOR_PAGE_ID);
  assert.ok(page && page.section === 'sectors', 'Sedna Dark has a sectors page');
  const locked = codexPageView(baseState(), page);
  assert.equal(locked.unlocked, false, 'off the edge of the chart, nothing leaks');
  assert.equal(locked.body, '');
  const visited = baseState({ world: { currentSectorId: 'sector_helios_prime', discovery: DISCOVERED } });
  const view = codexPageView(visited, page);
  assert.equal(view.unlocked, true, 'a jump there unseals the page');
  assert.ok(view.body.includes('WHAT IS THE MASS OF A DECISION?'),
    'the gate\'s question is on the sector page');
  assert.ok(view.body.includes('receipt'), 'the page names the receipt as the prize');
});
