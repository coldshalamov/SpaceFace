// FB-049 — a loan can be taken, a balance can be seen, and a stale debt is announced.
// The note is bounded by net worth and standing, settles through the wallet, and ages into
// bounty through the existing day:tick rule — with one cited headline per escalation.
import assert from 'node:assert/strict';
import test from 'node:test';

import { economy, loanLimitFor } from '../src/systems/economy.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

function busCapture() {
  const events = [];
  return {
    events,
    emit(ev, p) { events.push({ ev, p }); },
    on() {},
    of(ev) { return events.filter((e) => e.ev === ev); },
  };
}

function harness({ credits = 0, debt = 0, stationId = 'station_helios' } = {}) {
  const state = {
    player: { credits, debt, activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }], cargo: { items: {} } },
    entities: new Map(),
    entityList: [],
    fuel: { current: 10, max: 100 },
    meta: { seed: 7 },
    days: 0,
    factions: {},
    ui: { docked: true, dockedStationId: stationId },
    world: { currentSectorId: 'sector_helios' },
    content: {},
    simTime: 0,
  };
  const bus = busCapture();
  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ._registry = { get: () => null };
  econ._lastDockedStation = stationId;
  return { state, bus, econ };
}

test('a loan credits once against the note limit, and a second ask hits the ceiling', () => {
  const { state, econ, bus } = harness({ credits: 0 });
  const limit = loanLimitFor(state, 'station_helios');
  assert.ok(limit >= 800, `a pilot with a starter hull gets a real note, got ${limit}`);
  econ.handleService({ type: 'loan' });
  const taken = state.player.credits;
  assert.ok(taken > 0 && taken <= limit, 'one click borrows up to the remaining limit');
  assert.equal(state.player.debt, taken, 'the note records exactly what the wallet gained');
  assert.equal(state.player.debtSinceDay, 0, 'fresh debt starts the stale clock');
  assert.equal(bus.of('service:completed').at(-1).p.type, 'loan');
  // The limit is live — borrowed credits raise net worth, but the note outpaces it: each draw
  // adds debt 1:1 while the limit grows 0.35 of it, so the room converges and the cap holds.
  econ.handleService({ type: 'loan' });
  const taken2 = state.player.credits - taken;
  assert.ok(taken2 < taken, 'the second draw is smaller — debt outpaces the limit');
  for (let i = 0; i < 30 && state.player.credits + 1 > 0; i += 1) {
    const before = state.player.debt;
    econ.handleService({ type: 'loan' });
    if (state.player.debt === before) break;   // at the limit
  }
  assert.ok(state.player.debt <= 10000, `the note is capped, got ${state.player.debt}`);
});

test('settle pays the note down and a clear ledger drops the stale clock', () => {
  const { state, econ } = harness({ credits: 2000, debt: 600 });
  state.player.debtSinceDay = 0;
  econ.handleService({ type: 'settle', amount: 250 });
  assert.equal(state.player.debt, 350, 'partial settle reduces the balance');
  econ.handleService({ type: 'settle' });
  assert.equal(state.player.debt, 0, 'settle clears the ledger');
  assert.equal(state.player.credits, 1400, 'the wallet paid exactly the note');
  assert.equal(state.player.debtSinceDay, null, 'no stale clock on a clean ledger');
  econ.handleService({ type: 'settle' });
  assert.equal(state.player.credits, 1400, 'settling nothing moves no money');
});

test('a stale debt levies bounty once per day and the quote surface shows the balance', () => {
  const { state, econ, bus } = harness({ debt: 400 });
  state.player.debtSinceDay = 0;
  state.days = 3;                       // past DEBT_STALE_DAYS grace
  econ._onDebtStaleDay({ days: 3 });
  const levy = Math.max(1, Math.round(400 * 0.25));
  assert.equal(state.player.bounty, levy, 'one levy per stale day');
  const esc = bus.of('economy:debtEscalated');
  assert.equal(esc.length, 1, 'one escalation event');
  assert.equal(esc[0].p.debtCr, 400);
  econ._onDebtStaleDay({ days: 3 });
  assert.equal(bus.of('economy:debtEscalated').length, 1, 'same day cannot levy twice');

  const q = serviceQuote('settle', state, null);
  assert.equal(q.disabled, true, 'a broke wallet cannot settle');
  assert.match(q.detail, /400/, 'the balance is visible in the quote');
  const qLoan = serviceQuote('loan', state, null);
  assert.match(qLoan.detail, /25%\/day/, 'the escalation rule is disclosed before borrowing');
});
