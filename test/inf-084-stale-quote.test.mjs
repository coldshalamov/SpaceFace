// INF-084 — handle a changed quote without a surprise transaction. The market screen
// states a total, but the confirm used to settle at whatever the live price had become
// by click time: a 15-second economy tick or another trade between render and confirm
// moved the money silently. Now the go handler binds the trade to the stated terms and
// the transaction authority settles better-or-equal or aborts with an explanation —
// never worse, never silently. Repeated confirmation stays single-shot in-screen via
// the existing tradeBusy guard; the authority additionally refuses to settle worse.
import test from 'node:test';
import assert from 'node:assert/strict';

import { economy } from '../src/systems/economy.js';
import { expectedTotalForTerms } from '../src/ui/station/screens/market.js';

const SID = 'station_helios';
const IRON = 'cmdty_ore_iron';

function makeBus(captured = []) {
  const handlers = new Map();
  return {
    captured,
    on(e, h) { const l = handlers.get(e) || []; l.push(h); handlers.set(e, l); },
    off(e, h) { handlers.set(e, (handlers.get(e) || []).filter((x) => x !== h)); },
    emit(e, p) { captured.push({ e, p }); for (const h of [...(handlers.get(e) || [])]) h(p); },
  };
}

function boot() {
  const bus = makeBus();
  const state = {
    mode: 'flight', simTime: 100, meta: { seed: 84 },
    player: {
      credits: 100000,
      cargo: { items: { [IRON]: 20 }, capVolume: 200, usedVolume: 20 },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {},
    conflicts: {},
    sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { owner: 'faction_scn' } } },
    ui: { dockedStationId: SID }, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, bus, econ };
}

function snap(state) {
  return {
    credits: state.player.credits,
    stock: state.economy.markets[SID][IRON].stock,
    hold: state.player.cargo.items[IRON] || 0,
  };
}

test('a buy past stale terms aborts with everything untouched', () => {
  const { state, econ } = boot();
  try {
    const stated = econ.quote(SID, IRON, 'buy', 5);
    assert.ok(stated.ok, 'stated quote works');
    econ.applyStockPressure(SID, IRON, 'buy', 12); // someone else drains the shelf
    const before = snap(state);
    const res = econ.execute(SID, IRON, 'buy', 5, { expectedTotal: Math.round(stated.total) });
    assert.equal(res.ok, false, 'worse terms never settle');
    assert.equal(res.reason, 'price_changed', 'the reason names the stale quote');
    assert.ok(res.liveTotal > res.expectedTotal, 'the live price is the worse one');
    assert.deepEqual(snap(state), before, 'credits, stock, and hold untouched');
  } finally { economy._instance = null; }
});

test('a buy at or under the stated terms settles', () => {
  const { state, econ } = boot();
  try {
    const stated = econ.quote(SID, IRON, 'buy', 5);
    const res = econ.execute(SID, IRON, 'buy', 5, { expectedTotal: Math.round(stated.total) });
    assert.ok(res.ok, 'unchanged market settles');
    assert.equal(res.total, Math.round(stated.total), 'settles at the stated total');
    econ.applyStockPressure(SID, IRON, 'sell', 12); // shelf fills, price drops
    const dropped = econ.quote(SID, IRON, 'buy', 5);
    assert.ok(dropped.total < stated.total, 'setup moved the price down');
    const better = econ.execute(SID, IRON, 'buy', 5, { expectedTotal: Math.round(stated.total) });
    assert.ok(better.ok, 'a better price still settles');
    assert.ok(better.total <= Math.round(stated.total), 'never above stated');
  } finally { economy._instance = null; }
});

test('a sale below the stated proceeds aborts; above settles', () => {
  const { state, econ } = boot();
  try {
    const stated = econ.quote(SID, IRON, 'sell', 10);
    econ.applyStockPressure(SID, IRON, 'sell', 15); // shelf fills, proceeds fall
    const before = snap(state);
    const res = econ.execute(SID, IRON, 'sell', 10, { expectedTotal: Math.round(stated.total) });
    assert.equal(res.ok, false, 'a worse sale never settles');
    assert.equal(res.reason, 'price_changed', 'the reason names the stale quote');
    assert.deepEqual(snap(state), before, 'cargo, credits, and stock untouched');
    econ.applyStockPressure(SID, IRON, 'buy', 25); // shelf drains, proceeds rise
    const risen = econ.quote(SID, IRON, 'sell', 10);
    assert.ok(risen.total > stated.total, 'setup moved the proceeds up');
    const sale = econ.execute(SID, IRON, 'sell', 10, { expectedTotal: Math.round(stated.total) });
    assert.ok(sale.ok, 'a better sale still settles');
    assert.ok(sale.total >= Math.round(stated.total), 'never below stated');
  } finally { economy._instance = null; }
});

test('no stated terms keeps live-price behavior', () => {
  const { econ } = boot();
  try {
    const stated = econ.quote(SID, IRON, 'buy', 5);
    econ.applyStockPressure(SID, IRON, 'buy', 12);
    const res = econ.execute(SID, IRON, 'buy', 5);
    assert.ok(res.ok, 'unbound trades settle at live');
    assert.ok(res.total > Math.round(stated.total), 'at the moved price, as before');
  } finally { economy._instance = null; }
});

test('the handler explains a stale quote instead of failing silently', () => {
  const { bus, econ } = boot();
  try {
    const stated = econ.quote(SID, IRON, 'buy', 5);
    econ.applyStockPressure(SID, IRON, 'buy', 12);
    bus.captured.length = 0;
    econ.handleTrade(IRON, 'buy', 5, { expectedTotal: Math.round(stated.total) });
    const toast = bus.captured.find((m) => m.e === 'toast');
    assert.ok(toast && /Price changed/i.test(toast.p.text), 'the player is told to reconfirm');
    const failed = bus.captured.find((m) => m.e === 'economy:tradeFailed');
    assert.equal(failed && failed.p.reason, 'price_changed', 'the failure carries the reason');
    assert.ok(failed.p.liveTotal > failed.p.expectedTotal, 'both sides of the move ride along');
  } finally { economy._instance = null; }
});

test('stated terms bind only the exact rendered quantity', () => {
  assert.equal(expectedTotalForTerms({ qty: 5, total: 570.4 }, 5), 570, 'rounded stated total');
  assert.equal(expectedTotalForTerms({ qty: 5, total: 570.4 }, 4), undefined, 'qty drift unbinds');
  assert.equal(expectedTotalForTerms(null, 5), undefined, 'no render, no binding');
  assert.equal(expectedTotalForTerms({ qty: 5, total: NaN }, 5), undefined, 'non-numeric never binds');
});
