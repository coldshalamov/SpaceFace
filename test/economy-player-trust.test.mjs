import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { priceModForState } from '../src/systems/factions.js';
import { commodityStandingMultipliers } from '../src/economy/economyMath.js';
import { fullQuantityQuote, maxAffordableQuantity, planTradeLoad } from '../src/economy/tradePlanning.js';
import { computeBestTrades, formatRouteCard } from '../src/ui/market/tradeLogic.js';
import { formatOfflineReceiptLine, bindAutomationPayoffUi } from '../src/ui/automationPayoff.js';
import { presentSurfaceDecisions, chooseAdventureDecision, acceptMissionOnLane } from '../src/ui/adventureDecisions.js';
import { marketQuoteHtml } from '../src/ui/views/marketPresentation.js';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
const HERE = 'station_helios', THERE = 'station_coalition', IRON = 'cmdty_ore_iron';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [economy] });
  sim.state.mode = 'flight';
  sim.state.player.credits = 100000;
  sim.state.player.cargo.capVolume = 250;
  sim.state.simTime = 600;
  sim.state.ui.dockedStationId = HERE;
  const owner = sim.registry.get('economy');
  for (const sid of [HERE, THERE]) { owner.ensureMarket(sid); owner.snapshotIntel(sid); }
  return { sim, owner, state: sim.state, bus: sim.bus };
}
function projection() {
  return { simTime: 2000, player: { credits: 10000, cargo: { capVolume: 50, usedVolume: 0 }, marketMemory: {
    [THERE]: { [IRON]: { buy: 20, sell: 30, seenAt: 100 } },
  } }, economy: { markets: { [HERE]: { [IRON]: { lastBuy: 10, stock: 100 } } } } };
}

test('all standing levels retain ordered prices and reward standing without crossing the midpoint', () => {
  for (const spread of [0.04, 0.08, 0.16, 0.4]) {
    let lastBuy = Infinity, lastSell = 0;
    for (let rep = -1000; rep <= 1000; rep += 10) {
      const standing = priceModForState({ factions: { faction_scn: { rep } } }, 'faction_scn');
      const mult = commodityStandingMultipliers(spread, standing);
      const ask = (1 + spread / 2) * mult.buy, bid = (1 - spread / 2) * mult.sell;
      assert.ok(ask > 1 && bid < 1 && bid < ask);
      assert.ok(ask <= lastBuy + 1e-12 && bid >= lastSell - 1e-12);
      lastBuy = ask; lastSell = bid;
      const blocked = commodityStandingMultipliers(spread, standing, { buy: 1.25, sell: 0.8 });
      assert.ok(blocked.buy >= mult.buy && blocked.sell <= mult.sell);
    }
  }
});

test('real same-berth round trips cannot mint credits across seeds, standings and lot sizes', () => {
  let checks = 0;
  for (const seed of [47, 4242, 8008]) {
    const { sim, owner, state } = boot(seed);
    try {
      for (const rep of [-1000, -500, 0, 100, 500, 1000]) {
        state.factions.faction_scn = { rep };
        for (const cid of [IRON, 'cmdty_food', 'cmdty_refined_metals']) {
          for (const qty of [1, 2, 7, 20]) {
            const before = state.player.credits, stock = owner.getMarket(HERE)[cid].stock;
            const b = owner.execute(HERE, cid, 'buy', qty);
            if (!b.ok) continue;
            const s = owner.execute(HERE, cid, 'sell', b.qty);
            assert.ok(s.ok);
            assert.ok(state.player.credits <= before, `${seed}/${rep}/${cid}/${qty} minted money`);
            assert.ok(Math.abs(owner.getMarket(HERE)[cid].stock - stock) < 1e-8);
            checks++;
          }
        }
      }
    } finally { sim.dispose(); }
  }
  assert.ok(checks >= 200, `sweep too small: ${checks}`);
});

test('partial, malformed, thrown, and capacity-limited quotes cannot enlarge the max button', () => {
  assert.equal(fullQuantityQuote({ ok: true, qty: 3, total: 1, partial: true }, 30), false);
  assert.equal(fullQuantityQuote({ ok: true, qty: 30, acceptQty: 3, total: 1 }, 30), false);
  assert.equal(fullQuantityQuote({ ok: true, qty: 1, total: -1 }, 1), false);
  assert.equal(fullQuantityQuote({ ok: true, qty: 1, total: Infinity }, 1), false);
  const limit = maxAffordableQuantity({ limit: 100, credits: 5000, quote: n => ({ ok: true, qty: Math.min(n, 3), total: Math.min(n, 3) * 10 }) });
  assert.equal(limit, 3);
  assert.equal(maxAffordableQuantity({ limit: 100, credits: 500, quote: () => { throw Error('offline'); } }), 0);
  assert.equal(maxAffordableQuantity({ limit: Infinity, credits: 500, quote: () => ({ ok: true, total: 1 }) }), 0);
});

test('convex source-depth planner matches exhaustive integer margin search with bounded quote work', () => {
  let checked = 0;
  for (const slope of [0, .01, .1, .8, 2]) for (const sale of [10, 12, 25, 80]) for (const budget of [50, 777, 100000]) {
    let calls = 0;
    const quote = n => { calls++; const raw = 10 * n + slope * n * n / 2; return { ok: true, qty: n, total: Math.ceil(raw), unitAvg: raw / n }; };
    const plan = planTradeLoad({ credits: budget, holdUnits: 500, stockUnits: 401, sellEstimate: sale, quote });
    const actualCalls = calls;
    let best = 0;
    for (let n = 1; n <= 401; n++) { const cost = Math.ceil(10 * n + slope * n * n / 2); if (cost <= budget) best = Math.max(best, n * sale - cost); }
    assert.equal(plan ? plan.loadProfit : 0, best, `${slope}/${sale}/${budget}`);
    assert.ok(actualCalls < 50, `quote work ${actualCalls}`);
    if (plan) assert.ok(plan.loadCost <= budget && plan.loadUnits <= 401);
    checked++;
  }
  assert.equal(checked, 60);
});

test('stock, cargo volume, optional reserve and marginal loss each bind plans honestly', () => {
  const quote = n => ({ ok: true, qty: n, total: 10 * n, unitAvg: 10 });
  const base = { credits: 1000, holdUnits: 200, stockUnits: 10, sellEstimate: 20, quote };
  assert.equal(planTradeLoad(base).loadBound, 'stock');
  assert.equal(planTradeLoad({ ...base, holdUnits: 2 }).loadBound, 'hold');
  const reserved = planTradeLoad({ ...base, reserveCredits: 955 });
  assert.equal(reserved.loadUnits, 4); assert.equal(reserved.cashAfterPurchase, 960); assert.equal(reserved.loadBound, 'credits');
  assert.equal(planTradeLoad({ ...base, reserveCredits: 1001 }), null);
  const curved = planTradeLoad({ ...base, stockUnits: 200, quote: n => ({ ok: true, qty: n, total: 10*n+n*n, unitAvg: 10+n }) });
  assert.equal(curved.loadUnits, 5); assert.equal(curved.loadBound, 'margin');
});

test('commodity freshness cannot borrow another commodity time or be overwritten by an older scan', () => {
  const state = projection();
  state.player.marketMemory[THERE].cmdty_food = { buy: 500, sell: 600, seenAt: 1999 };
  state.economy.marketIntel = { [THERE]: { seenAtT: 10, snapshot: { [IRON]: { buy: 40, sell: 99 } } } };
  const row = computeBestTrades(state, HERE)[0];
  assert.equal(row.sellThere, 30); assert.equal(row.seenAtT, 100);
  assert.match(row.intelLabel, /stale/);
  state.economy.marketIntel[THERE].seenAtT = 1990;
  assert.equal(computeBestTrades(state, HERE)[0].sellThere, 99);
});

test('no memory is unknown, not omniscience; future and unrecognized observations are refused', () => {
  const state = projection();
  delete state.player.marketMemory;
  state.economy.markets[THERE] = { [IRON]: { lastBuy: 400, lastSell: 500, stock: 500 } };
  assert.deepEqual(computeBestTrades(state, HERE), []);
  state.player.marketMemory = { [THERE]: { [IRON]: { sell: 500, seenAt: 3000 } } };
  assert.deepEqual(computeBestTrades(state, HERE), []);
  state.player.marketMemory[THERE][IRON] = { sell: 500, seenAt: 1000, source: 'unknown' };
  assert.deepEqual(computeBestTrades(state, HERE), []);
});

test('active quote-backed route cost, wallet, stock and retained handling match the real settlement', () => {
  const { sim, owner, state } = boot();
  try {
    state.player.credits = 1000;
    const before = JSON.stringify([state.player.credits, state.player.cargo, Object.values(owner.getMarket(HERE)).map(e=>e.stock)]);
    const quote = (...args) => { assert.equal(args[0], HERE, 'must not consult hidden remote book'); return owner.quote(...args); };
    const routes = computeBestTrades(state, HERE, { quote });
    assert.ok(routes.length > 0);
    assert.equal(JSON.stringify([state.player.credits, state.player.cargo, Object.values(owner.getMarket(HERE)).map(e=>e.stock)]), before);
    for (const t of routes) {
      const q = owner.quote(HERE, t.cmdtyId, 'buy', t.loadUnits);
      assert.equal(t.loadCost, q.total); assert.equal(q.qty, t.loadUnits); assert.ok(q.total <= 1000);
      assert.equal(t.loadProfit, Math.floor(t.loadUnits * t.sellThere) - q.total);
      assert.match(formatRouteCard(t).profitText, /^Est\./);
      assert.match(formatRouteCard(t).sub, /local batch quoted/);
    }
    const t = routes.find(t => t.cmdtyId === 'cmdty_food') || routes[0];
    const bought = owner.execute(HERE, t.cmdtyId, 'buy', t.loadUnits, { expectedTotal: t.loadCost });
    assert.ok(bought.ok); assert.equal(bought.total, t.loadCost); assert.equal(state.player.credits, t.cashAfterPurchase);
  } finally { sim.dispose(); }
});

test('priceOf has exactly the same one-unit integer settlement and access policy as quote', () => {
  const { sim, owner, state } = boot();
  try {
    for (const rep of [-800, 0, 700, 1000]) {
      state.factions.faction_scn = { rep };
      for (const cid of [IRON, 'cmdty_food']) for (const side of ['buy', 'sell']) {
        const q = owner.quote(HERE, cid, side, 1);
        assert.equal(owner.priceOf(HERE, cid, side), q.ok ? q.total : null);
      }
    }
    assert.equal(owner.priceOf(HERE, IRON, 'invalid'), null);
  } finally { sim.dispose(); }
});

test('offline settlement names actual wallet loss and unpaid debt separately without changing money', () => {
  const r = { credited: 1200, upkeepCharged: 1500, upkeepUnpaid: 200, elapsedSec: 3600 };
  const copy = JSON.stringify(r);
  const text = formatOfflineReceiptLine(r);
  assert.match(text, /−300 cr wallet change/); assert.match(text, /200 cr unpaid \(not yet charged\)/);
  const bus = createBus(), events = [], state = { ui: {} };
  bindAutomationPayoffUi(bus, () => state); bus.on('toast', p => events.push(p));
  bus.emit('automation:offlineSummary', r); assert.equal(events[0].kind, 'warn');
  bus.emit('automation:offlineSummary', r); assert.equal(events.length, 1);
  bus.emit('automation:offlineSummary', { ...r, upkeepUnpaid: 250 }); assert.equal(events.length, 2);
  assert.equal(JSON.stringify(r), copy);
});

test('haul decision uses the batch quote and a changed price cannot buy or redirect the ship', async () => {
  const { sim, owner, state, bus } = boot();
  try {
    state.player.credits = 1000;
    const d = presentSurfaceDecisions(state, HERE, 'market').find(x => x.kind === 'haul');
    assert.ok(d, 'ordinary stocked opening stations expose a haul');
    const effect = d.options.find(x => x.id === 'haul').effect;
    assert.equal(effect.expectedTotal, owner.quote(HERE, effect.commodityId, 'buy', effect.qty).total);
    const navBefore = JSON.stringify(state.nav), credits = state.player.credits;
    owner.getMarket(HERE)[effect.commodityId].demandMult = 2.5;
    const result = await chooseAdventureDecision(state, d.id, 'haul', { bus, economy: owner });
    assert.equal(result.ok, false); assert.equal(result.reason, 'price_changed');
    assert.equal(state.player.credits, credits); assert.equal(JSON.stringify(state.nav), navBefore);
  } finally { sim.dispose(); }
});


test('successful haul settles the reviewed total once before the route is plotted', async () => {
  const {sim, owner, state, bus} = boot();
  try {
    state.player.credits = 1000;
    const d = presentSurfaceDecisions(state, HERE, 'market').find(x => x.kind === 'haul');
    const effect = d.options.find(x => x.id === 'haul').effect;
    const settlements = []; bus.on('economy:tradeCompleted', e => settlements.push(e));
    const result = await chooseAdventureDecision(state, d.id, 'haul', {bus, economy: owner});
    assert.ok(result.ok);
    assert.equal(state.player.credits, 1000 - effect.expectedTotal);
    assert.equal(state.player.cargo.items[effect.commodityId], effect.qty);
    assert.equal(settlements.length, 1);
    const after = JSON.stringify([state.player.credits, state.player.cargo, state.nav]);
    const duplicate = await chooseAdventureDecision(state, d.id, 'haul', {bus, economy: owner});
    assert.ok(duplicate.duplicate); assert.equal(settlements.length, 1);
    assert.equal(JSON.stringify([state.player.credits, state.player.cargo, state.nav]), after);
  } finally { sim.dispose(); }
});

test('reviewed loads reject moved berths, partial holds, and malformed price terms before settlement', () => {
  const {sim, owner, state} = boot();
  try {
    const total = owner.quote(HERE, IRON, 'buy', 3).total;
    const terms = {sourceStationId: HERE, requireFullQuantity: true, expectedTotal: total};
    const before = JSON.stringify([state.player.credits, state.player.cargo, owner.getMarket(HERE), owner.getMarket(THERE)]);
    assert.equal(owner.execute(THERE, IRON, 'buy', 3, terms).reason, 'station_changed');
    assert.equal(owner.execute(HERE, IRON, 'buy', 3, {...terms, expectedTotal: NaN}).reason, 'bad_terms');
    assert.equal(JSON.stringify([state.player.credits, state.player.cargo, owner.getMarket(HERE), owner.getMarket(THERE)]), before);
    state.player.cargo.capVolume = 1;
    const held = JSON.stringify([state.player.credits, state.player.cargo, owner.getMarket(HERE)]);
    const partial = owner.handleTrade(IRON, 'buy', 3, terms);
    assert.equal(partial.ok, false); assert.equal(partial.reason, 'load_changed');
    assert.equal(JSON.stringify([state.player.credits, state.player.cargo, owner.getMarket(HERE)]), held);
    assert.equal(fullQuantityQuote({ok: true, total: 10}, 3), false, 'an unspecified quantity cannot prove a full load');
  } finally { sim.dispose(); }
});

test('lane haul forwards binding terms and waits for the actual owner verdict before navigation', async () => {
  const {sim, owner, state, bus} = boot();
  try {
    state.player.credits = 1000;
    const d = presentSurfaceDecisions(state, HERE, 'market').find(x => x.kind === 'haul');
    const effect = d.options.find(x => x.id === 'haul').effect;
    let fulfill; const calls = [];
    installSimCommandSink(p => {
      if (p.kind === 'rpc') { calls.push(p); return new Promise(resolve => { fulfill = resolve; }); }
      return true;
    });
    const navBefore = JSON.stringify(state.nav);
    const pending = chooseAdventureDecision(state, d.id, 'haul', {bus});
    await Promise.resolve();
    assert.equal(JSON.stringify(state.nav), navBefore);
    const a = calls[0].args;
    assert.equal(calls[0].op, 'economyTrade'); assert.equal(a.expectedTotal, effect.expectedTotal);
    assert.equal(a.sourceStationId, HERE); assert.equal(a.requireFullQuantity, true);
    assert.ok(a.intentId);
    const result = owner.handleTrade(a.commodityId, a.side, a.qty, a);
    fulfill({ok: true, result: {ok: true, result}});
    assert.equal((await pending).ok, true);
    assert.equal(state.player.credits, 1000 - effect.expectedTotal);
    assert.equal(state.player.cargo.items[effect.commodityId], effect.qty);
  } finally { uninstallSimCommandSink(); sim.dispose(); }
});

test('a rejected worker settlement cannot redirect or retry through the event bus', async () => {
  const {sim, owner, state, bus} = boot();
  try {
    state.player.credits = 1000;
    const d = presentSurfaceDecisions(state, HERE, 'market').find(x => x.kind === 'haul');
    let emitted = 0; bus.on('ui:buy', () => emitted++);
    const before = JSON.stringify([state.player.credits, state.player.cargo, state.nav]);
    installSimCommandSink(() => Promise.resolve({ok: true, result: {ok: true, result: {ok: false, reason: 'station_changed'}}}));
    const result = await chooseAdventureDecision(state, d.id, 'haul', {bus});
    assert.equal(result.reason, 'station_changed'); assert.equal(emitted, 0);
    assert.equal(JSON.stringify([state.player.credits, state.player.cargo, state.nav]), before);
    installSimCommandSink(() => Promise.resolve({ok: false, reason: 'owner-threw-after-request'}));
    assert.equal((await chooseAdventureDecision(state, d.id, 'haul', {bus})).ok, false);
    assert.equal(emitted, 0, 'an RPC rejection is not evidence that no owner exists');
  } finally { uninstallSimCommandSink(); sim.dispose(); }
});

test('bus fallback ignores unrelated trade receipts and settles only the submitted intent', async () => {
  const {sim, owner, state} = boot();
  const bus = createBus();
  owner.bus = bus;
  try {
    state.player.credits = 1000;
    const d = presentSurfaceDecisions(state, HERE, 'market').find(x => x.kind === 'haul');
    const received = [];
    bus.on('ui:buy', p => {
      received.push(p);
      bus.emit('economy:tradeCompleted', {...p, side: 'buy', intentId: 'unrelated-order'});
      owner.handleTrade(p.commodityId, 'buy', p.qty, p);
    });
    const done = await chooseAdventureDecision(state, d.id, 'haul', {bus});
    assert.equal(done.ok, true); assert.equal(received.length, 1);
    assert.equal(received[0].requireFullQuantity, true); assert.equal(received[0].sourceStationId, HERE);
    assert.ok(received[0].intentId);
  } finally { sim.dispose(); }
});

test('unavailable quotes display no invented zero-price spread', () => {
  const html = marketQuoteHtml({id: IRON, name: 'Iron', buy: null, sell: null, avg: 30});
  assert.match(html, /one unit now/);
  assert.match(html, /Local spread/);
  assert.match(html, /sx-mkt-readouts__item--margin[^]*?<dd>— cr<\/dd>/);
  assert.doesNotMatch(html, /class="k-hero__n">0</);
});

test('production worker registered trade port enforces berth, whole-load, price, and duplicate terms', async () => {
  const {createSimHost} = await import('../scripts/lib/simWorkerHost.mjs');
  const api = createSimHost();
  try {
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    await api.init({profile: 'production', seed: 4242, scenarioContract, settings: {gameplay: {tutorialHints: false}}});
    const {state, registry, rpcHandlers} = api.host;
    const owner = registry.get('economy'), trade = rpcHandlers.get('economyTrade');
    state.ui.dockedStationId = HERE; state.ui.docked = true;
    state.player.credits = 10000; state.player.cargo.capVolume = 250;
    owner.ensureMarket(HERE);
    const total = owner.quote(HERE, IRON, 'buy', 3).total;
    const args = {commodityId: IRON, side: 'buy', qty: 3, sourceStationId: HERE, requireFullQuantity: true, expectedTotal: total, intentId: 'reviewed-worker-load'};
    const before = state.player.credits;
    assert.equal(trade({...args, sourceStationId: THERE}).result.reason, 'station_changed');
    assert.equal(trade({...args, expectedTotal: 0}).result.reason, 'price_changed');
    state.player.cargo.capVolume = 1;
    assert.equal(trade(args).result.reason, 'load_changed');
    assert.equal(state.player.credits, before); assert.equal(state.player.cargo.items[IRON] || 0, 0);
    state.player.cargo.capVolume = 250;
    const paid = trade(args).result;
    assert.equal(paid.ok, true); assert.equal(paid.qty, 3); assert.equal(paid.total, total);
    const after = state.player.credits;
    assert.equal(trade(args).result.duplicate, true); assert.equal(state.player.credits, after);
    assert.equal(state.player.cargo.items[IRON], 3);
    installSimCommandSink(p => Promise.resolve({ok: true, result: rpcHandlers.get(p.op)(p.args)}));
    assert.equal((await acceptMissionOnLane(api.host.bus, 'mission-that-does-not-exist')).ok, false,
      'a delivered mission RPC is not the owner acceptance verdict');
  } finally { uninstallSimCommandSink(); api.shutdown(); }
});
