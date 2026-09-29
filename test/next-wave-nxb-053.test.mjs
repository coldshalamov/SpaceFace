// NXB-053 — the confirmation names one lot and one purchase. A refresh must not
// retarget that confirmation onto the next row, and a module buy must not settle
// at a price the dialog did not name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { economy } from '../src/systems/economy.js';
import { buildSlotList, ships as shipsPrototype, stationShopOffer } from '../src/systems/ships.js';
import { focusNamedStationControl, statedHullStillViewed, statedModulePurchaseStillMatches } from '../src/ui/outfittingSpendConfirm.js';
import {
  marketCommitPayload,
  marketGoDecision,
  marketQuantityAfterRefresh,
  marketQuoteIsExecutable,
  marketResumeSelection,
  marketTradeFocusChoice,
  resolveMarketSelection,
} from '../src/ui/station/screens/market.js';

const IRON = 'cmdty_ore_iron';
const SILICATE = 'cmdty_silicate';
const SID = 'station_helios';
const SWING = MODULES.find((d) => d.id === 'mod_swing_drive_m');
const DRIFTER = SHIPS.find((s) => s.id === 'ship_drifter');
const drifterSlots = buildSlotList(DRIFTER);
const drifterUtilityM = drifterSlots.findIndex((s) => s.type === 'utility' && s.size === 'M');

const MARKET_SOURCE = readFileSync(fileURLToPath(new URL('../src/ui/station/screens/market.js', import.meta.url)), 'utf8');
const SHIPWORKS_SOURCE = readFileSync(fileURLToPath(new URL('../src/ui/station/screens/shipworks.js', import.meta.url)), 'utf8');
const UI_INPUT_SOURCE = readFileSync(fileURLToPath(new URL('../src/ui/input.js', import.meta.url)), 'utf8');

function bootEconomy() {
  const bus = createBus();
  const state = {
    mode: 'flight', simTime: 100, meta: { seed: 53 },
    player: {
      credits: 100000,
      cargo: { items: { [IRON]: 4 }, capVolume: 200, usedVolume: 4 },
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
  return { state, econ };
}

function bootShips(credits) {
  const state = createGameState(0x53053);
  state.player.credits = credits;
  state.player.researchedNodes = [];
  state.player.ownedShips = [0, 1].map(() => ({
    defId: 'ship_drifter',
    fittings: new Array(drifterSlots.length).fill(null),
  }));
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [];
  state.ui.docked = true;
  state.ui.dockedStationId = SID;
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('economy:chargeCredits', ({ amount }) => { state.player.credits -= amount; });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, ships, toasts };
}

test('a refreshed ladder keeps the selected lot and does not trade its neighbor', () => {
  const hidden = resolveMarketSelection({
    selectedId: IRON,
    visibleIds: [SILICATE],
    tradedIds: [IRON, SILICATE],
  });
  assert.equal(hidden.tradeId, IRON, 'filtering the lot out of the ladder keeps the same trade');
  assert.equal(hidden.focusId, SILICATE, 'the Hand can rest on a visible row without becoming the trade');
  assert.equal(hidden.cleared, false);

  const gone = resolveMarketSelection({
    selectedId: IRON,
    visibleIds: [SILICATE],
    tradedIds: [SILICATE],
  });
  assert.equal(gone.selectedId, IRON, 'the named lot is remembered after it leaves the board');
  assert.equal(gone.tradeId, null, 'a missing lot is not replaced by the next row');
  assert.equal(gone.focusId, SILICATE);
  assert.equal(gone.cleared, true);

  assert.equal(marketQuantityAfterRefresh(6, 2), 6, 'a named quantity stays named when the shelf is shorter');
  assert.equal(marketQuantityAfterRefresh(0, 4), 1, 'an empty first paint still offers one unit when the shelf can');
  assert.equal(marketQuantityAfterRefresh(3, 9), 3);

  const kept = marketResumeSelection({
    selectedId: IRON,
    qty: 6,
    requestedMode: 'sell',
    requestedCommodityId: SILICATE,
    trackedCommodityId: SILICATE,
    listedIds: [IRON, SILICATE],
  });
  assert.equal(kept.selectedId, IRON, 'coming back keeps the lot already on screen');
  assert.equal(kept.qty, 6);
  assert.equal(kept.applyMode, null, 'a return does not switch buy and sell by itself');
  const opened = marketResumeSelection({
    selectedId: null,
    qty: 6,
    requestedMode: 'buy',
    requestedCommodityId: IRON,
    trackedCommodityId: SILICATE,
    listedIds: [IRON, SILICATE],
  });
  assert.equal(opened.selectedId, IRON, 'the first open can still land on the job');
  assert.equal(opened.qty, 1);
  assert.equal(opened.applyMode, 'buy');

  const { econ } = bootEconomy();
  try {
    const stated = econ.quote(SID, IRON, 'buy', 5);
    assert.ok(stated.ok && stated.total > 0 && stated.partial === false, 'the live quote is the receipt total');
    const terms = { commodityId: IRON, side: 'buy', qty: 5, total: stated.total };
    const same = marketCommitPayload(terms, IRON, 5, 'buy');
    assert.equal(same.commodityId, IRON);
    assert.equal(same.qty, 5);
    assert.equal(same.expectedTotal, Math.round(stated.total));
    assert.equal(marketCommitPayload(terms, SILICATE, 5, 'buy'), null, 'the neighbor cannot ride the iron receipt');
    assert.equal(marketCommitPayload(terms, IRON, 4, 'buy'), null, 'a different quantity cannot ride the receipt');
    assert.equal(marketCommitPayload(terms, IRON, 5, 'sell'), null, 'a sell cannot ride a buy receipt');
    assert.equal(marketCommitPayload(terms, IRON, 5).commodityId, IRON, 'callers that omit a side keep the receipt binding');

    const one = econ.quote(SID, IRON, 'buy', 1);
    assert.ok(one.ok && one.partial === false && one.qty === 1);
    const overQty = Math.floor(Number(one.stockAfter)) + 1;
    assert.ok(overQty > 1, 'the shelf has a real fill limit');
    const over = econ.quote(SID, IRON, 'buy', overQty);
    assert.equal(marketQuoteIsExecutable(over, overQty, 'buy'), false, 'a short fill is not the quantity the receipt named');
    assert.equal(marketQuoteIsExecutable(one, 1, 'sell'), false, 'the other side is not this quote');
    assert.equal(marketQuoteIsExecutable(one, 1, 'buy'), true);

    const fresh = econ.quote(SID, IRON, 'buy', 5);
    const accepted = marketGoDecision({
      lastQuotedTerms: terms,
      selectedId: IRON,
      qty: 5,
      side: 'buy',
      freshQuote: fresh,
    });
    assert.equal(accepted.emit, true);
    assert.equal(accepted.payload.expectedTotal, Math.round(fresh.total));
    const step = Math.max(1, Math.abs(Number(fresh.total)) * 0.05);
    const worse = { ...fresh, total: Number(fresh.total) + step };
    if (Math.round(worse.total) === Math.round(fresh.total)) worse.total = Number(fresh.total) + 1;
    const moved = marketGoDecision({
      lastQuotedTerms: terms,
      selectedId: IRON,
      qty: 5,
      side: 'buy',
      freshQuote: worse,
    });
    assert.equal(moved.emit, false, 'a moved total is not committed under the old receipt');
    assert.equal(moved.reason, 'price');
    const wrongLot = marketGoDecision({
      lastQuotedTerms: terms,
      selectedId: IRON,
      qty: 5,
      side: 'buy',
      freshQuote: { ...fresh, commodityId: SILICATE },
    });
    assert.equal(wrongLot.emit, false, 'a quote for another lot cannot confirm this one');
    const partialGo = marketGoDecision({
      lastQuotedTerms: { commodityId: IRON, side: 'buy', qty: overQty, total: over && over.total },
      selectedId: IRON,
      qty: overQty,
      side: 'buy',
      freshQuote: over,
    });
    assert.equal(partialGo.emit, false, 'a short fill cannot confirm');
  } finally {
    economy._instance = null;
  }

  const scrolled = [];
  const row = {
    isConnected: true,
    hidden: false,
    classList: { contains: () => false },
    getAttribute: () => null,
    scrollIntoView() { scrolled.push('scroll'); },
    focus() { scrolled.push('focus'); },
  };
  assert.equal(focusNamedStationControl(row), true);
  assert.deepEqual(scrolled, ['scroll', 'focus']);
  assert.equal(focusNamedStationControl({
    isConnected: false,
    focus() { scrolled.push('gone'); },
  }), false, 'a detached row does not take the Hand');
  assert.equal(focusNamedStationControl({
    isConnected: true,
    hidden: false,
    classList: { contains: (name) => name === 'orr-mkt-holdarc' },
    focus() { scrolled.push('gauge'); },
  }), false, 'the hold gauge is not a confirmation target');
  const host = { getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 80, width: 80, height: 100 }) };
  assert.equal(focusNamedStationControl({
    isConnected: true,
    hidden: false,
    classList: { contains: () => false },
    getAttribute: () => null,
    getBoundingClientRect: () => ({ top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 }),
    scrollIntoView() { scrolled.push('miss-scroll'); },
    focus() { scrolled.push('miss'); },
  }, host), false, 'a control outside the list does not take the Hand');
  assert.equal(focusNamedStationControl({
    isConnected: true,
    hidden: false,
    classList: { contains: () => false },
    getAttribute: () => null,
    getBoundingClientRect: () => ({ top: 120, bottom: 140, left: 8, right: 40, width: 32, height: 20 }),
    scrollIntoView() { scrolled.push('meet-scroll'); },
    focus() { scrolled.push('meet'); },
  }, host), true, 'a control whose box meets the list takes the Hand');
  const child = {
    isConnected: true,
    hidden: false,
    classList: { contains: () => false },
    getAttribute: () => null,
    getBoundingClientRect: () => ({ top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 }),
    scrollIntoView() { scrolled.push('child-scroll'); },
    focus() { scrolled.push('child'); },
  };
  const list = {
    contains: (node) => node === child,
    getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 80, width: 80, height: 100 }),
  };
  assert.equal(focusNamedStationControl(child, list), true, 'a row inside the list is scrolled into view');
  assert.deepEqual(scrolled, ['scroll', 'focus', 'meet-scroll', 'meet', 'child-scroll', 'child']);

  assert.match(MARKET_SOURCE, /marketGoDecision\(\{/);
  assert.match(MARKET_SOURCE, /marketCommitPayload\(lastQuotedTerms,\s*selectedId,\s*qty,\s*side\)/);
  assert.match(MARKET_SOURCE, /marketResumeSelection\(/);
  assert.match(MARKET_SOURCE, /marketQuantityAfterRefresh\(/);
  assert.match(MARKET_SOURCE, /marketQuoteIsExecutable\(/);
  assert.match(MARKET_SOURCE, /resolveMarketSelection\(/);
  assert.equal(marketTradeFocusChoice({ goEnabled: true, hasQuantity: true, hasRow: true }), 'go');
  assert.equal(marketTradeFocusChoice({ goEnabled: false, hasQuantity: true, hasRow: true }), 'quantity');
  assert.equal(marketTradeFocusChoice({ goEnabled: false, hasQuantity: false, hasRow: true }), 'row');
  assert.equal(marketTradeFocusChoice({}), null);
  assert.match(MARKET_SOURCE, /placeMarketHand\(/);
  assert.match(MARKET_SOURCE, /placeTradeHand\(\)/);
  assert.match(MARKET_SOURCE, /deferRefresh\(80, true, true\)/);
  assert.doesNotMatch(MARKET_SOURCE, /selectedId = visible\[0\]\.id/);
  assert.doesNotMatch(MARKET_SOURCE, /if \(qty > maxQty\) qty = maxQty/);
});

test('a module confirmation refuses a different price and fits the hull it named', () => {
  const offer = stationShopOffer(SWING, SID);
  assert.ok(offer && offer.price > 0, 'Helios lists the module');
  assert.notEqual(Math.round(offer.price), Math.round(SWING.price), 'the listing and the catalog are different published prices');
  const otherHull = SHIPS.find((ship) => ship && ship.id && ship.id !== DRIFTER.id);
  assert.ok(otherHull, 'another published hull exists so the confirmation can name the wrong one');
  const named = { defId: SWING.id, shipIndex: 1, fitSlotIndex: drifterUtilityM, price: offer.price };
  assert.equal(statedModulePurchaseStillMatches(named, { ...named, price: SWING.price }), false);
  assert.equal(statedModulePurchaseStillMatches(named, { ...named }), true);
  assert.equal(statedModulePurchaseStillMatches(
    { ...named, hullDefId: DRIFTER.id },
    { ...named, hullDefId: otherHull.id },
  ), false, 'a different hull does not match the confirmation');
  assert.equal(statedModulePurchaseStillMatches(
    { ...named, hullDefId: DRIFTER.id },
    { ...named, hullDefId: DRIFTER.id },
  ), true);
  assert.equal(statedHullStillViewed(
    { shipIndex: 1, hullDefId: DRIFTER.id },
    { shipIndex: 1, hullDefId: DRIFTER.id, connected: false },
  ), false, 'a closed screen cannot commit the purchase');
  assert.equal(statedHullStillViewed(
    { shipIndex: 1, hullDefId: DRIFTER.id },
    { shipIndex: 0, hullDefId: DRIFTER.id, connected: true },
  ), false, 'switching hulls while the dialog is open does not keep the confirmation');
  assert.equal(statedHullStillViewed(
    { shipIndex: 1, hullDefId: DRIFTER.id },
    { shipIndex: 1, hullDefId: DRIFTER.id, connected: true },
  ), true);

  const h = bootShips(offer.price);
  const refused = h.ships.buyModule({
    defId: SWING.id,
    fitSlotIndex: drifterUtilityM,
    shipIndex: 1,
    expectedPrice: SWING.price,
  });
  assert.equal(refused, false, 'the catalog price is not the price the dialog named');
  assert.equal(h.state.player.credits, offer.price, 'a refused purchase spends nothing');
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.equal(h.state.player.ownedShips[0].fittings[drifterUtilityM], null);
  assert.equal(h.state.player.ownedShips[1].fittings[drifterUtilityM], null);
  assert.ok(h.toasts.some((toast) => /price changed/i.test(toast.text)));

  const wrongHull = h.ships.buyModule({
    defId: SWING.id,
    fitSlotIndex: drifterUtilityM,
    shipIndex: 1,
    expectedPrice: offer.price,
    hullDefId: otherHull.id,
  });
  assert.equal(wrongHull, false, 'the writer refuses a hull the confirmation did not name');
  assert.equal(h.state.player.credits, offer.price, 'a wrong-hull purchase spends nothing');
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.equal(h.state.player.ownedShips[1].fittings[drifterUtilityM], null);
  assert.ok(h.toasts.some((toast) => /different hull/i.test(toast.text)));

  const bought = h.ships.buyModule({
    defId: SWING.id,
    fitSlotIndex: drifterUtilityM,
    shipIndex: 1,
    expectedPrice: offer.price,
    hullDefId: DRIFTER.id,
  });
  assert.equal(bought, true);
  assert.equal(h.state.player.credits, 0, 'the charge is the named listing price');
  assert.equal(h.state.player.ownedShips[0].fittings[drifterUtilityM], null, 'the active hull was not the named one');
  assert.equal(h.state.player.ownedShips[1].fittings[drifterUtilityM], SWING.id, 'the named hull received the module');

  assert.match(SHIPWORKS_SOURCE, /shipIndex: statedShipIndex, expectedPrice: statedPrice, hullDefId: statedHullDefId/);
  assert.match(SHIPWORKS_SOURCE, /statedModulePurchaseStillMatches\(/);
  assert.match(SHIPWORKS_SOURCE, /statedHullStillViewed\(/);
  assert.match(SHIPWORKS_SOURCE, /focusNamedStationControl\(/);
  assert.match(SHIPWORKS_SOURCE, /ui:deleteLoadoutPreset',\s*\{\s*shipIndex:\s*statedShipIndex/);
  assert.match(UI_INPUT_SOURCE, /if \(isConfirmOpen\(\)\) \{[\s\S]*?stopPropagation\(\)/);
});
