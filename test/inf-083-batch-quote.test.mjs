// INF-083 — quote the entire trade, not one unit times quantity. The contemplated
// sale line multiplied one unit price by the batch size, but the station's price
// moves as its stock fills: a 20-unit iron sale settles 570 cr, not 20×30 = 600.
// Now the line quotes the full batch through the economy owner's own quote (the same
// integral execute() settles), shows partial fills, and quoting moves no stock.
import test from 'node:test';
import assert from 'node:assert/strict';

import { economy } from '../src/systems/economy.js';
import { marketQuoteHtml } from '../src/ui/views/marketPresentation.js';

const SID = 'station_helios';
const IRON = 'cmdty_ore_iron';

function makeBus() {
  const handlers = new Map();
  return {
    on(e, h) { const l = handlers.get(e) || []; l.push(h); handlers.set(e, l); },
    off(e, h) { handlers.set(e, (handlers.get(e) || []).filter((x) => x !== h)); },
    emit(e, p) { for (const h of [...(handlers.get(e) || [])]) h(p); },
  };
}

function boot() {
  const state = {
    mode: 'flight', simTime: 100, meta: { seed: 83 },
    player: {
      credits: 100000,
      cargo: { items: { [IRON]: 20 }, capVolume: 100, usedVolume: 20 },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {},
    conflicts: {},
    sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { owner: 'faction_scn' } } },
    ui: {}, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus: makeBus(), helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, econ };
}

function saleCredits(html) {
  const match = html.match(/data-sale-credits="([^"]*)"/);
  return match ? Number(match[1]) : null;
}

test('the contemplated sale quotes the full batch, not unit times quantity', () => {
  const { state, econ } = boot();
  try {
    const entry = state.economy.markets[SID][IRON];
    const batch = econ.quote(SID, IRON, 'sell', 20);
    assert.ok(batch.ok, 'batch quote works');
    const one = econ.quote(SID, IRON, 'sell', 1);
    assert.ok(batch.total < one.total * 20, 'the price moves over the batch (test would catch unit math)');
    const html = marketQuoteHtml({
      id: IRON, name: 'Iron Ore', mode: 'sell', sell: entry.lastSell,
      saleQty: 20, saleQuote: batch,
    });
    assert.equal(saleCredits(html), Math.round(batch.total), 'the line shows the owner total');
    assert.ok(!html.includes(`${20} × ${Math.round(one.total)}`), 'no unit-times-quantity read');
  } finally { economy._instance = null; }
});

test('preview and settlement agree on the batch', () => {
  const { state, econ } = boot();
  try {
    const preview = econ.quote(SID, IRON, 'sell', 20);
    const stockBefore = state.economy.markets[SID][IRON].stock;
    const result = econ.execute(SID, IRON, 'sell', 20);
    assert.ok(result.ok, 'settlement succeeds: ' + result.reason);
    assert.equal(result.qty, 20, 'full batch settles');
    assert.equal(result.total, Math.round(preview.total), 'settlement pays the preview');
    assert.equal(state.economy.markets[SID][IRON].stock, stockBefore + 20, 'stock moved once, at settlement');
  } finally { economy._instance = null; }
});

test('low stock previews the partial fill it will settle', () => {
  const { state, econ } = boot();
  try {
    state.economy.markets[SID][IRON].stock = 6;
    const preview = econ.quote(SID, IRON, 'buy', 20);
    assert.ok(preview.ok && preview.partial, 'low stock previews partial');
    assert.equal(preview.qty, 5, 'one unit stays on the shelf');
    const html = marketQuoteHtml({
      id: IRON, name: 'Iron Ore', mode: 'sell', sell: 30, saleQty: 20, saleQuote: preview,
    });
    assert.match(html, /fills 5 u/, 'the partial fill is stated');
  } finally { economy._instance = null; }
});

test('quoting moves no stock', () => {
  const { state, econ } = boot();
  try {
    econ.quote(SID, IRON, 'sell', 20); // settle lazy init first
    const stock = state.economy.markets[SID][IRON].stock;
    for (let i = 0; i < 5; i++) econ.quote(SID, IRON, 'sell', 20);
    marketQuoteHtml({ id: IRON, name: 'Iron Ore', mode: 'sell', sell: 30, saleQty: 20,
      saleQuote: econ.quote(SID, IRON, 'sell', 20) });
    econ.quote(SID, IRON, 'buy', 7);
    assert.equal(state.economy.markets[SID][IRON].stock, stock, 'reads never write');
  } finally { economy._instance = null; }
});

test('no owner quote still renders the legacy single-unit read', () => {
  const html = marketQuoteHtml({ id: IRON, name: 'Iron Ore', mode: 'sell', sell: 30, saleQty: 1 });
  assert.equal(saleCredits(html), 30, 'single unit stays exact without a quote');
});
