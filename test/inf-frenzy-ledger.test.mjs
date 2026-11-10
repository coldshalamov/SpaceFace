/**
 * inf-frenzy-ledger — after a rampage, the Ship's Ledger answers "did the mess pay?".
 *
 * CH-43 (chaos pays). The book already filed each fine, repair and sale as scattered rows, and
 * the Ship Sheet rolled the costs up — but no page ever put gains against costs, so a messy night
 * ended with no readable verdict. Now src/systems/shipLedger.js derives one frenzy page per
 * ledger cycle from receipts both owners already file (player.sessionSinks chaos costs vs
 * player.tradeLedger sell-side takes), and the station ledger's reading column and tape read the
 * signed net. Ordinary sells without costs file nothing; costs without sells file the honest
 * pure-loss page; buys never count as fenced.
 *
 * Focused: owners = src/systems/shipLedger.js, src/ui/station/screens/ledger.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShipLedger, frenzyCycle } from '../src/systems/shipLedger.js';
import { readingOf } from '../src/ui/station/screens/ledger.js';

// SHIP_LEDGER_CYCLE_SECONDS is 600; cycleOf(t) = floor(t / 600) + 1, so t=1250..1799 is cycle 3.
const CYCLE_3_T = 1250;
const CYCLE_1_T = 100;

function baseState() {
  return {
    meta: { seed: 4242 },
    simTime: 1500,
    story: {},
    player: { sessionSinks: [], tradeLedger: [], bounty: 0 },
  };
}

function sink(state, kind, amount, at) {
  state.player.sessionSinks.push({
    id: `sink:${state.player.sessionSinks.length + 1}`, kind, cause: 'the rampage', amount, at,
  });
}

function sell(state, total, at, commodityId = 'cmdty_scrap_metal') {
  state.player.tradeLedger.push({
    side: 'sell', qty: 10, commodityId, stationId: 'station_helios_prime', total, seenAt: at,
  });
}

function frenzyEntries(state) {
  return buildShipLedger(state).entries.filter((e) => e.type === 'frenzy');
}

test('a cost-carrying cycle with takes files one frenzy page that answers the net', () => {
  const state = baseState();
  sink(state, 'fine', 800, CYCLE_3_T);
  sink(state, 'repair', 400, CYCLE_3_T + 50);
  sell(state, 1500, CYCLE_3_T + 20);
  sell(state, 900, CYCLE_3_T + 60);

  const read = frenzyCycle(state);
  assert.ok(read, 'the read exists');
  assert.equal(read.fencedCr, 2400, 'both sells fence');
  assert.equal(read.costCr, 1200, 'both sinks cost');
  assert.equal(read.netCr, 1200, 'the net is fenced minus cost');
  assert.deepEqual(read.kinds, ['fines', 'repairs'], 'the cost kinds are named');

  const pages = frenzyEntries(state);
  assert.equal(pages.length, 1, 'exactly one frenzy page');
  const page = pages[0];
  assert.equal(page.cycleLabel, 'CYCLE 0003', 'the page is dated to its cycle');
  assert.equal(
    page.text,
    'The frenzy paid: 2,400 cr fenced against 1,200 cr in fines and repairs.',
    'the prose names both sides',
  );
  const view = readingOf(page);
  assert.equal(view.hero, '+1,200', 'the reading leads with the signed net');
  assert.equal(view.unit, 'cr net', 'the unit is the net');
  assert.equal(view.title, '2,400 fenced · 1,200 out', 'the reading names both sides');
  assert.match(view.kicker, /FRENZY/);
  assert.ok(!/price stands/i.test(view.kicker), 'no bounty, no price line');
});

test('a price still standing on the hull rides the frenzy page', () => {
  const state = baseState();
  sink(state, 'fine', 800, CYCLE_3_T);
  sell(state, 1500, CYCLE_3_T);
  state.player.bounty = 250;

  const page = frenzyEntries(state)[0];
  assert.ok(page, 'the page exists');
  assert.match(page.text, /A 250 cr price still stands on the hull\./, 'the bounty is named');
  assert.match(readingOf(page).kicker, /A PRICE STANDS/, 'the reading carries the price');
});

test('a losing night says so', () => {
  const state = baseState();
  sink(state, 'fine', 800, CYCLE_3_T);
  sink(state, 'impound', 400, CYCLE_3_T);
  sell(state, 300, CYCLE_3_T);

  const page = frenzyEntries(state)[0];
  assert.equal(
    page.text,
    'The frenzy cost more than it fenced: 300 cr fenced against 1,200 cr in fines and impounds.',
    'the losing prose names the shortfall',
  );
  assert.equal(readingOf(page).hero, '\u2212900', 'the net reads negative');
});

test('costs without takes file the honest pure-loss page', () => {
  const state = baseState();
  sink(state, 'restitution', 1200, CYCLE_3_T);

  const page = frenzyEntries(state)[0];
  assert.equal(
    page.text,
    'The frenzy fenced nothing: 1,200 cr went out in restitution.',
    'pure loss says so instead of vanishing',
  );
  assert.equal(readingOf(page).hero, '\u22121,200', 'the net reads negative');
});

test('ordinary trade without chaos costs files no frenzy page', () => {
  const state = baseState();
  sell(state, 1500, CYCLE_3_T);
  sell(state, 900, CYCLE_3_T);
  // buys are not takes either
  state.player.tradeLedger.push({
    side: 'buy', qty: 5, commodityId: 'cmdty_ore_iron', stationId: 'station_helios_prime',
    total: 400, seenAt: CYCLE_3_T,
  });

  assert.equal(frenzyCycle(state), null, 'no costs, no frenzy');
  assert.equal(frenzyEntries(state).length, 0, 'the book files no page');
});

test('the page names the latest cost-carrying cycle, not an empty newer one', () => {
  const state = baseState();
  sink(state, 'fine', 800, CYCLE_1_T);
  sell(state, 1500, CYCLE_3_T); // newer, ordinary trade

  const read = frenzyCycle(state);
  assert.equal(read.cycle, 1, 'the frenzy cycle is the costed one');
  assert.equal(read.fencedCr, 0, 'its takes are the ones counted');
  const page = frenzyEntries(state)[0];
  assert.equal(page.cycleLabel, 'CYCLE 0001', 'the page dates to the costed cycle');
  assert.match(page.text, /fenced nothing/, 'the older night fenced nothing');
});

test('the page id is deterministic for the same receipts', () => {
  const state = baseState();
  sink(state, 'insurance', 600, CYCLE_3_T);
  sell(state, 2100, CYCLE_3_T);
  const first = frenzyEntries(state)[0];
  const rebuilt = buildShipLedger(state).entries.find((e) => e.type === 'frenzy');
  assert.equal(first.id, rebuilt.id, 'same state, same page id');
  assert.ok(first.id.startsWith('ledger_'), 'the id carries the ledger prefix');
});
