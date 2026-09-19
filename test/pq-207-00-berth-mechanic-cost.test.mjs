// PQ-207.00 — the berth mechanic's "the ship ledger already has a fact on this hull" line ran
// `buildShipLedger` on the station's 18-frame refresh. Measured 2026-09-19: 3.7 ms per berth card
// on a scarred hull with a traded ledger (5.3 ms for the whole arrival), against 6 us on a clean
// hull. The rap line needs presence, not a page: `shipLedgerHasFactOutside` walks the same sources
// under the same admission rules and stops at the first admitted row outside hull history.
//
// Pins: the line's behavior, the probe contract, the one deliberate presence-vs-window delta, and
// the refresh budget. Headless — no GPU, no route.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  defaultLivingHull,
  livingHullWithRenown,
  livingHullWithScar,
} from '../src/core/livingHull.js';
import { buildShipLedger, shipLedgerHasFactOutside } from '../src/systems/shipLedger.js';
import { leftoverMechanicCard, leftoverMechanicLine } from '../src/story/mechanicVoice.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HULL_TYPES = new Set(['scar', 'patch']);
const PAGE = { page: 0, pageSize: 24 };
const STATION = { id: 'station_helios', name: 'Helios Station', services: [] };
const RAP = /ship ledger already has a fact/i;

function scarRow(band, facing, tick, id = `weapon:${tick}:${facing}`) {
  return { cause: 'weapon', surface: 'weapon', band, facing, atT: tick, tick, id };
}

function scarredHull(count = 1, baseTick = 12) {
  let hull = defaultLivingHull(0);
  for (let i = 0; i < count; i += 1) {
    const tick = baseTick + i * 10;
    hull = livingHullWithScar(hull, scarRow('hard', 'bow', tick, `scar-${i}`), tick);
  }
  return hull;
}

function tradeRows(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      side: i % 2 ? 'sell' : 'buy',
      commodityId: 'iron_ore',
      stationId: 'station_helios',
      qty: 4 + (i % 7),
      total: 1200 + i * 13,
      seenAt: 600 + i * 30,
    });
  }
  return rows;
}

function berthState({ hull = scarredHull(), tradeLedger = [], heat = 0, extra = {} } = {}) {
  return {
    meta: { seed: 4242 },
    player: { credits: 5000, heat, activeShipIndex: 0, tradeLedger, ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }] },
    ui: { marketNews: { log: [], lastCard: null } },
    ...extra,
  };
}

test('the berth card answers the ledger fact without building a ledger page', () => {
  const source = readFileSync(join(ROOT, 'src/story/mechanicVoice.js'), 'utf8');
  assert.doesNotMatch(source, /buildShipLedger/,
    'the 18-frame berth refresh must not build a ledger page');
  assert.match(source, /shipLedgerHasFactOutside\(state \|\| \{\}, HULL_HISTORY_TYPES\)/,
    'the rap line asks the presence probe with the hull-history exclusion');

  const ledger = readFileSync(join(ROOT, 'src/systems/shipLedger.js'), 'utf8');
  assert.match(ledger, /export function shipLedgerHasFactOutside/,
    'the probe is the ledger owner\'s public seam');
});

test('a scarred hull with a ledger fact still gets the rap line, on the berth route', () => {
  const state = berthState({ tradeLedger: tradeRows(3) });
  assert.equal(shipLedgerHasFactOutside(state, HULL_TYPES), true);

  const line = leftoverMechanicLine(state);
  assert.match(line, /Hard scar on the bow/);
  assert.match(line, RAP);

  const card = leftoverMechanicCard(state);
  assert.equal(card.title, 'Mechanic');
  assert.equal(card.body, 'Hard scar on the bow. That is a real hit. The ship ledger already has a fact on this hull.');

  const arrival = buildDockArrival(state, STATION);
  assert.equal(arrival.mechanicLine, card.body, 'the berth arrival carries the same line');
  assert.ok(arrival.lines.includes(card.body), 'the mechanic is one arrival line');
});

test('a scarred hull with no ledger fact gets no rap line', () => {
  const state = berthState();
  assert.equal(shipLedgerHasFactOutside(state, HULL_TYPES), false);
  assert.equal(leftoverMechanicCard(state).body, 'Hard scar on the bow. That is a real hit.');
  assert.doesNotMatch(leftoverMechanicLine(state), RAP);
});

test('a clean plate never asks for a ledger fact', () => {
  const state = berthState({ hull: defaultLivingHull(0), tradeLedger: tradeRows(40) });
  const line = leftoverMechanicLine(state);
  assert.match(line, /Clean plate/);
  assert.doesNotMatch(line, RAP, 'trade rows are not a rap on an unmarked hull');
});

test('live heat is the rap, and it never asks the ledger', () => {
  const state = berthState({ hull: defaultLivingHull(0), tradeLedger: tradeRows(40), heat: 0.3 });
  const line = leftoverMechanicLine(state);
  assert.match(line, /Heat is on this hull/);
  assert.doesNotMatch(line, RAP);
});

test('hull renown is a ledger fact like any other family', () => {
  const hull = livingHullWithRenown(
    scarredHull(),
    { id: 'r1', act: 'kill', factionId: 'faction_concord', sectorId: 'sector_helios_prime', atT: 90 },
    90,
  );
  const state = berthState({ hull });
  assert.equal(shipLedgerHasFactOutside(state, HULL_TYPES), true);
  assert.match(leftoverMechanicLine(state), RAP);
});

test('presence names a fact the newest page had pushed out', () => {
  // Deliberate delta (PQ-207.00): the page-0 window was an artifact of the old page call. With 30
  // scars and one older trade row the newest 24 rows are all hull history, so the window stayed
  // silent while the ledger does hold a trade fact. Presence names it.
  const state = berthState({
    hull: scarredHull(30, 1000),
    tradeLedger: [{ side: 'buy', commodityId: 'iron_ore', stationId: 'station_helios', qty: 4, total: 900, seenAt: 60 }],
  });
  const page = buildShipLedger(state, PAGE);
  assert.equal(page.entries.length, 24);
  assert.deepEqual([...new Set(page.entries.map((entry) => entry.type))], ['scar']);
  assert.equal(page.entries.some((entry) => !HULL_TYPES.has(entry.type)), false,
    'the newest page holds no fact — the old check stopped here');
  assert.equal(shipLedgerHasFactOutside(state, HULL_TYPES), true,
    'the ledger still holds the trade fact');
  assert.match(leftoverMechanicLine(state), RAP);
});

test('the probe agrees with the page it replaces wherever the window decides', () => {
  const corpus = {
    empty: {},
    scarredOnly: berthState(),
    scarredTrader: berthState({ tradeLedger: tradeRows(240) }),
    longSession: berthState({ tradeLedger: tradeRows(900) }),
    losses: berthState({ extra: { lossLedger: { entries: [{ lossId: 'l1', source: 'combat', assetId: 'ship_wasp', t: 300, killedByPlayer: true }] } } }),
    titles: berthState({ extra: { story: { titlesSeen: [{ id: 't1', title: 'Passing Title', seenAt: 800 }] } } }),
    sessionSink: berthState({ extra: { player: { ...berthState().player, sessionSinks: [{ id: 's1', kind: 'repair', cause: 'gunfire', at: 700, amount: 420 }] } } }),
    recoveredName: berthState({ extra: { story: { recoveredNames: [{ id: 'n1', name: 'Ada Venn', recoveredAt: 1200 }] } } }),
    stunt: berthState({ extra: { story: { titles: { stuntIncidents: [{ id: 'st1', rootId: 'r1', tick: 3000, name: 'Thrown Hull', visibility: 'witnessed', witnesses: [] }] } } } }),
    escalation: berthState({ extra: { encounterDirector: { escalationSeeds: [{ id: 'e1', cause: 'witness', beat: 'bounty', arrivedAt: 1500, place: { name: 'Ceres' } }] } } }),
    bearing: berthState({ extra: { player: { ...berthState().player, uniqueWrecks: { bearings: { wreck_a: { wreckId: 'wreck_a', heardAtS: 900, phase: 'rumor', sectorId: 'sector_helios_prime' } } } } } }),
    vestaCache: berthState({ extra: { world: { vestaOreCache: { recordId: 'rec_v', receipt: { id: 'vesta:1', choiceId: 'kept', outcome: 'recorded', resolvedAt: 1700 } } } } }),
  };
  for (const [name, state] of Object.entries(corpus)) {
    const window = buildShipLedger(state, PAGE).entries.some((entry) => !HULL_TYPES.has(entry.type));
    assert.equal(shipLedgerHasFactOutside(state, HULL_TYPES), window, `probe disagrees with the page on ${name}`);
  }
  assert.equal(shipLedgerHasFactOutside(corpus.scarredOnly, HULL_TYPES), false);
  assert.equal(shipLedgerHasFactOutside(corpus.scarredTrader, HULL_TYPES), true);
  for (const name of Object.keys(corpus).filter((key) => key !== 'empty' && key !== 'scarredOnly')) {
    assert.equal(shipLedgerHasFactOutside(corpus[name], HULL_TYPES), true, `${name} is a ledger fact`);
  }
});

test('the berth refresh stays inside its budget on a long-session ledger', () => {
  const state = berthState({ tradeLedger: tradeRows(900) });
  const card = () => leftoverMechanicCard(state);
  const page = () => buildShipLedger(state, PAGE);
  for (let i = 0; i < 50; i += 1) { card(); page(); }

  const median = (fn) => {
    const batches = [];
    for (let batch = 0; batch < 5; batch += 1) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i += 1) fn();
      batches.push((performance.now() - t0) / 20);
    }
    batches.sort((a, b) => a - b);
    return batches[2];
  };

  const cardMs = median(card);
  const pageMs = median(page);
  assert.ok(cardMs < 1.5,
    `berth mechanic card must stay well under a frame (got ${cardMs.toFixed(3)} ms on a 900-row ledger)`);
  assert.ok(pageMs > cardMs * 5,
    `the presence probe must be the cheap path (card ${cardMs.toFixed(3)} ms vs page ${pageMs.toFixed(3)} ms)`);
});
