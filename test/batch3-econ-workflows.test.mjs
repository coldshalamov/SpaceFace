import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { automation } from '../src/systems/automation.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, addSalvage, cashInSalvage } from '../src/systems/cargo.js';
import { addToShipment, shipmentQty } from '../src/systems/cargoCustody.js';
import { TRADERS } from '../src/data/automation.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { formatTraderReceipt } from '../src/ui/screens/automationPanel.js';

const ORE = 'cmdty_ore_iron';
const STATION = 'station_helios';
function boot() {
  const state = createGameState(47);
  state.mode = 'flight'; state.simTime = 40; state.playerId = 1;
  state.player.credits = 100_000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
  state.world.currentSectorId = 'sector_helios_prime';
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12 };
  state.entities.set(1, player); state.entityList = [player];
  const bus = createBus();
  const econ = Object.create(economy);
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } }); econ.newGame();
  const auto = Object.create(automation);
  auto.init({ state, bus, helpers: {}, registry: { get: id => id === 'economy' ? econ : null } }); auto.newGame();
  const hold = Object.create(cargo); hold.init({ state, bus, helpers: {} });
  return { state, bus, econ, auto, hold };
}

test('flight dump retains the entire lot if its persistent pod is refused or unavailable', () => {
  const { state, hold, bus } = boot();
  addCargo(state, ORE, 5);
  const events = []; bus.on('cargo:jettisoned', p => events.push(p));
  assert.equal(hold.jettison(ORE, 3), 0);
  assert.equal(state.player.cargo.items[ORE], 5);
  hold.helpers.spawnEntity = () => null;
  assert.equal(hold.jettison(ORE, 3), 0);
  assert.equal(state.player.cargo.items[ORE], 5);
  assert.equal(events.length, 0);
  const toasts = []; bus.on('toast', p => toasts.push(p));
  state.input.actions = { jettisonLot: true };
  hold.update(1 / 60, state);
  assert.match(toasts.at(-1).text, /could not be released.*stays aboard/i);
  assert.doesNotMatch(toasts.at(-1).text, /sealed/i);
});

test('partial dump debits only accepted pods and keeps refused lot provenance under reentry', () => {
  const { state, hold, bus } = boot();
  addCargo(state, ORE, 2, { lotId: 'rich-a', provenanceId: 'mine:a' });
  addCargo(state, ORE, 3, { lotId: 'rich-b', provenanceId: 'mine:b' });
  let attempts = 0; const pods = []; const events = [];
  bus.on('cargo:jettisoned', p => events.push(p));
  hold.helpers.spawnEntity = spec => {
    assert.equal(hold.jettison(ORE, 1), 0, 'spawn observers cannot recursively empty the same hold');
    if (++attempts === 2) return null;
    const pod = { ...spec, id: 100 + attempts, alive: true };
    state.entities.set(pod.id, pod); state.entityList.push(pod); pods.push(pod); return pod;
  };
  assert.equal(hold.jettison(ORE, 5), 2);
  assert.equal(pods.length, 1);
  assert.equal(pods[0].data.amount, 2);
  assert.equal(state.player.cargo.items[ORE], 3);
  assert.deepEqual(state.player.cargo.richLots.map(l => [l.lotId, l.qty, l.provenanceId]), [['rich-b', 3, 'mine:b']]);
  assert.deepEqual(events.map(p => p.amount), [2]);
  assert.equal(state.player.cargo.usedVolume, 3);
});

test('salvage cash-in uses the active content price and keeps an unvalued lot for later settlement', () => {
  const { state } = boot();
  state.content = { commodities: {
    custom_scrap: { id: 'custom_scrap', volPerU: 1.2, massPerU: 2, legality: 'legal', basePrice: 90 },
    custom_unknown: { id: 'custom_unknown', volPerU: 2, massPerU: 1, legality: 'legal' },
  } };
  assert.equal(addSalvage(state, 'custom_scrap', 3), 3);
  assert.equal(addSalvage(state, 'custom_unknown', 2), 2);
  const sale = cashInSalvage(state);
  assert.equal(sale.credits, 162);
  assert.equal(sale.units, 3);
  assert.deepEqual(state.player.salvageBay.items, { custom_unknown: 2 });
  assert.equal(state.player.salvageBay.usedVolume, 4);
  assert.equal(cashInSalvage(state), null);
  state.content.commodities.custom_unknown.basePrice = 50;
  assert.equal(cashInSalvage(state).credits, 60);
});

test('unvalued protocol salvage retains its canonical footprint while waiting for settlement', () => {
  const { state } = boot();
  const id = 'depth_vols_black_box';
  assert.equal(addSalvage(state, id, 2), 2);
  assert.equal(state.player.salvageBay.usedVolume, 0);
  assert.equal(cashInSalvage(state), null);
  assert.equal(state.player.salvageBay.items[id], 2);
  assert.equal(state.player.salvageBay.usedVolume, 0);
});

test('a throwing pod admission restores unsent rich custody and releases the dump latch', () => {
  const { state, hold } = boot();
  addCargo(state, ORE, 2, { lotId: 'rich-a', provenanceId: 'mine:a' });
  hold.helpers.spawnEntity = () => { throw new Error('admission failed'); };
  assert.throws(() => hold.jettison(ORE, 2), /admission failed/);
  assert.equal(state.player.cargo.items[ORE], 2);
  assert.equal(state.player.cargo.richLots[0].provenanceId, 'mine:a');
  assert.equal(state.player.cargo.richLots[0].qty, 2);
  assert.equal(hold._jettisonInFlight, false);
});

test('a later throwing admission still announces the earlier accepted physical dump once', () => {
  const { state, hold, bus } = boot();
  addCargo(state, ORE, 2, { lotId: 'rich-a', provenanceId: 'mine:a' });
  addCargo(state, ORE, 3, { lotId: 'rich-b', provenanceId: 'mine:b' });
  const accepted = [], receipts = [];
  bus.on('cargo:jettisoned', event => {
    receipts.push(event);
    assert.equal(hold.jettison(ORE, 1), 0, 'completion observers cannot recursively reopen the active attempt');
  });
  hold.helpers.spawnEntity = spec => {
    if (accepted.length) throw new Error('later admission failed');
    const pod = { ...spec, id: 101, alive: true };
    accepted.push(pod); state.entities.set(pod.id, pod); state.entityList.push(pod);
    return pod;
  };
  assert.throws(() => hold.jettison(ORE, 5), /later admission failed/);
  assert.equal(accepted[0].data.amount, 2);
  assert.equal(state.player.cargo.items[ORE], 3);
  assert.deepEqual(state.player.cargo.richLots.map(lot => [lot.lotId, lot.qty]), [['rich-b', 3]]);
  assert.deepEqual(receipts.map(event => event.amount), [2]);
  assert.equal(hold._jettisonInFlight, false);
});

test('docked salvage settlement pays the active price through economy and keeps lots above the credit limit', () => {
  const { state, hold } = boot();
  const previous = COMBAT_FLAGS.salvageBay; COMBAT_FLAGS.salvageBay = true;
  try {
    state.content = { commodities: [{ id: 'custom_scrap', volPerU: 1, massPerU: 1, legality: 'legal', basePrice: 100 }] };
    addSalvage(state, 'custom_scrap', 2);
    const before = state.player.credits;
    hold._cashInSalvage({ stationId: STATION });
    assert.equal(state.player.credits - before, 120);
    assert.equal(state.player.salvageBay.items.custom_scrap, undefined);
    addSalvage(state, 'custom_scrap', 2);
    state.player.credits = Number.MAX_SAFE_INTEGER - 100;
    hold._cashInSalvage({ stationId: STATION });
    assert.equal(state.player.credits, Number.MAX_SAFE_INTEGER - 100);
    assert.equal(state.player.salvageBay.items.custom_scrap, 2);
  } finally { COMBAT_FLAGS.salvageBay = previous; }
});

test('reroute starts a new journey without clearing unpaid upkeep or distress', () => {
  const { state, auto } = boot();
  const t = { id: 'trader-1', status: 'distressed', _prevStatus: 'enroute', cycleProgress: .95,
    hotness: .8, ratePerMin: 88, route: { from: 'old-a', to: 'old-b', good: ORE } };
  state.automation.traders = [t]; state.automation.accumulators.upkeepDebt = 40;
  auto._pickRoute = () => ({ from: 'new-a', to: 'new-b', good: ORE });
  assert.equal(auto.handleOrder({ order: 'assignRoute', shipId: t.id }), true);
  assert.equal(t.status, 'distressed'); assert.equal(t._prevStatus, 'enroute');
  assert.equal(t.cycleProgress, 0); assert.equal(t.ratePerMin, 0);
  assert.equal(t.hotness, 0); assert.equal(state.automation.accumulators.upkeepDebt, 40);
  auto._updateTraders(60, state.automation); assert.equal(t.cycleProgress, 0);
  assert.equal(auto.resumeTrader(t.id), true); assert.equal(t.status, 'enroute');
  assert.equal(state.player.credits, 99_960);
});

test('a running trader reroute does not finish a fresh route using its old travel clock', () => {
  const { state, auto } = boot();
  const t = { id: 'trader-2', status: 'enroute', cycleProgress: .99, hotness: .4,
    route: { from: 'old-a', to: 'old-b', good: ORE }, defId: TRADERS[0].id };
  state.automation.traders = [t]; auto._pickRoute = () => ({ from: 'new-a', to: 'new-b', good: ORE });
  auto.reroute(t.id);
  auto._completeTraderCycle = () => assert.fail('the new journey cannot finish after one second');
  auto._estTraderProfit = () => 50;
  auto._updateTraders(1, state.automation);
  assert.ok(t.cycleProgress < .01);
});

test('trader receipt and player-facing formatter reconcile a partial passive payout', () => {
  const { state, auto, bus } = boot();
  const def = TRADERS[0]; const t = { id: 'trader-1', defId: def.id, hotness: 0,
    route: { from: STATION, to: 'station_ceres', good: ORE } };
  state.automation.traders = [t];
  auto._capBudget = 23;
  auto._traderCycleQuote = () => ({ profit: 80, tradeEff: 1, hotPenalty: 1, good: ORE,
    units: 10, buyA: 10, sellB: 20, fuelCost: 20 });
  auto._applyTradePressure = () => {}; auto._traderLossProb = () => 0;
  const receiptEvents = []; bus.on('automation:traderCycleCompleted', p => receiptEvents.push(p));
  const before = state.player.credits;
  auto._completeTraderCycle(t, def, state.automation, 0);
  assert.equal(state.player.credits - before, 23);
  assert.equal(t.lastReceipt.credited, 23); assert.equal(t.lastReceipt.grossProfit, 80);
  assert.equal(t.lastReceipt.overflowDropped, 57);
  assert.equal(receiptEvents[0].receipt.credited, 23);
  assert.match(formatTraderReceipt(t), /net \+23 cr/);
  assert.match(formatTraderReceipt(t), /57 cr.*cap/i);
  auto._completeTraderCycle(t, def, state.automation, 0);
  assert.equal(t.lastReceipt.credited, 0); assert.equal(t.lastReceipt.result, 'capped');
  assert.match(formatTraderReceipt(t), /passive.*cap/i);
  assert.doesNotMatch(formatTraderReceipt(t), /spread covered no costs/i);
});

test('trader receipt distinguishes the wallet limit from the passive budget', () => {
  const { state, auto } = boot();
  const def = TRADERS[0], t = { id: 'trader-wallet', defId: def.id, hotness: 0,
    route: { from: STATION, to: 'station_ceres', good: ORE } };
  state.automation.traders = [t]; state.player.credits = Number.MAX_SAFE_INTEGER - 10;
  auto._capBudget = 80;
  auto._traderCycleQuote = () => ({ profit: 80, tradeEff: 1, hotPenalty: 1, good: ORE,
    units: 10, buyA: 10, sellB: 20, fuelCost: 20 });
  auto._applyTradePressure = () => {}; auto._traderLossProb = () => 0;
  auto._completeTraderCycle(t, def, state.automation, 0);
  assert.equal(state.player.credits, Number.MAX_SAFE_INTEGER);
  assert.equal(t.lastReceipt.credited, 10); assert.equal(t.lastReceipt.walletWithheld, 70);
  assert.equal(t.lastReceipt.overflowDropped, 0);
  assert.match(formatTraderReceipt(t), /net \+10 cr.*70 cr above the credit limit/i);
});

test('an operation-owned shipment sells while the same commodity is sealed in the player hold', () => {
  const { state, auto, econ } = boot();
  addCargo(state, ORE, 6);
  state.missions.active = [{ id: 'sealed-delivery', status: 'active', preloadedCargo: true, params: { cmdtyId: ORE } }];
  assert.equal(econ.quoteAutomationIntake(STATION, ORE, 6).reason, 'mission_cargo_locked');
  assert.equal(econ.execute(STATION, ORE, 'sell', 6).reason, 'mission_cargo_locked');
  const g = { id: 'op-1', defId: 'drone_mk1', oreType: ORE, sectorId: state.world.currentSectorId };
  state.automation.drones.push(g); addToShipment(g, ORE, 4, 40);
  const held = structuredClone(state.player.cargo);
  const before = state.player.credits;
  const result = auto._programSellCargo(g, STATION);
  assert.equal(result.ok, true);
  assert.equal(result.receipt.quantity, 4); assert.ok(result.receipt.credited > 0);
  assert.equal(shipmentQty(g, ORE), 0); assert.equal(state.player.credits - before, result.receipt.credited);
  assert.deepEqual(state.player.cargo, held);
  assert.equal(econ.execute(STATION, ORE, 'sell', 1).reason, 'mission_cargo_locked');
  assert.equal(econ.quoteAutomationIntake(STATION, ORE, 1, { operation: structuredClone(g) }).reason, 'invalid_custody');
});

test('an operation retains its shipment when the native wallet cannot receive the quoted sale', () => {
  const { state, auto, econ } = boot();
  const group = { id: 'op-wallet', defId: 'drone_mk1', oreType: ORE,
    sectorId: state.world.currentSectorId };
  state.automation.drones.push(group); addToShipment(group, ORE, 4, 40);
  state.player.credits = Number.MAX_SAFE_INTEGER - 1;
  const quote = econ.quoteAutomationIntake(STATION, ORE, 4, { operation: group });
  assert.equal(quote.reason, 'credit_limit');
  const before = structuredClone(group.shipment);
  assert.equal(auto._programSellCargo(group, STATION).ok, false);
  assert.deepEqual(group.shipment, before);
  assert.equal(state.player.credits, Number.MAX_SAFE_INTEGER - 1);
  state.player.credits = 100_000;
  assert.equal(auto._programSellCargo(group, STATION).ok, true, 'the retained shipment remains saleable after room returns');
  assert.equal(shipmentQty(group, ORE), 0);
});
