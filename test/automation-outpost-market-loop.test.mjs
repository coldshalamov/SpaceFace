import test from 'node:test';
import assert from 'node:assert/strict';
import { automation } from '../src/systems/automation.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { OUTPOSTS } from '../src/data/automation.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { normalizeOutpostOperation, outpostInputUsed } from '../src/systems/outpostOperations.js';
import { automationScreen, describeOutpostOperation } from '../src/ui/screens/automationPanel.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { forEachDressingRow } from '../src/world/dressingTable.js';

const SECTOR = 'sector_helios_prime';
const FUEL = 'cmdty_fuel_cells';
const DEF = OUTPOSTS.find(row => row.id === 'outpost_fuelsynth');
const INPUTS = Object.keys(DEF.recipe.inputs);

function makeBus() {
  const handlers = new Map(), events = [];
  return {
    events,
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn); handlers.set(name, list);
      return () => list.splice(list.indexOf(fn), 1);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
    off() {},
  };
}

function boot({ owner = true } = {}) {
  const pilot = { id: 1, type: 'ship', alive: true, pos: { x: 900, z: 100 }, data: {} };
  const state = { simTime: 40, meta: { seed: 973 }, mode: 'flight', playerId: 1,
    player: { credits: 500_000, droneTierCap: 5, stats: {}, ownedShips: [],
      researchedNodes: ['tech_outpost_charter'],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 1000, capMass: 1000 } },
    world: { currentSectorId: SECTOR, activeSector: null }, entities: new Map([[1, pilot]]),
    entityList: [pilot], automation: null, story: { flags: {}, persistentCargo: [] },
    missions: { active: [] }, factions: { faction_scn: { rep: 0 } }, economy: {},
    conflicts: {}, sectorSim: { field: { nodes: {} } }, ui: {}, nav: {},
  };
  const bus = makeBus(), econ = Object.create(economy), inst = Object.create(automation);
  const registry = { get: id => id === 'economy' && owner ? econ : null };
  if (owner) { econ.init({ state, bus, registry, helpers: {} }); econ.newGame(); }
  const cargoOwner = Object.create(cargo);
  cargoOwner.init({ state, bus, registry, helpers: {} });
  inst.init({ state, bus, registry, helpers: {} }); inst.newGame();
  return { state, pilot, bus, econ, inst };
}

function acquire(h, defId = DEF.id) {
  h.bus.emit('ui:fleetOrder', { order: 'buildOutpost', targetRef: defId });
  const outpost = h.state.automation.outposts.at(-1);
  assert.ok(outpost);
  h.pilot.pos = { ...outpost.pos };
  return outpost;
}

function supply(h, o, units = 10) {
  for (const good of INPUTS) assert.equal(addCargo(h.state, good, units), units);
  h.bus.emit('ui:fleetOrder', { order: 'supplyOutpost', shipId: o.id });
}

function produce(h, o, seconds = 10) {
  h.inst._produceOutpost(o, DEF, seconds, h.state.automation);
}

function storedOutput(h, qty = 10) {
  const o = acquire(h);
  o.storage = qty; o.storageGoodId = FUEL;
  h.inst._capBudget = 100_000;
  return o;
}

test('ordinary facility orders acquire, supply real cargo, produce, settle market stock and reinvest', () => {
  const h = boot(), o = acquire(h);
  assert.equal(h.state.player.credits, 500_000 - DEF.buildCost);
  for (const good of INPUTS) {
    const bought = h.econ.execute('station_helios', good, 'buy', 12);
    assert.equal(bought.ok, true, `native market stocks ${good}`);
  }
  h.bus.emit('ui:fleetOrder', { order: 'supplyOutpost', shipId: o.id });
  assert.equal(outpostInputUsed(o), 36);
  for (const good of INPUTS) assert.equal(h.state.player.cargo.items[good] || 0, 0);
  produce(h, o);
  assert.equal(o.storage, 7);
  for (const good of INPUTS) assert.equal(o.inputStock[good], 5);
  const holdBefore = structuredClone(h.state.player.cargo);
  const market = h.econ.ensureMarket(o.saleStationId)[FUEL];
  const stockBefore = market.stock, creditsBefore = h.state.player.credits;
  h.inst._capBudget = 5_000;
  h.bus.emit('ui:fleetOrder', { order: 'sellOutpost', shipId: o.id });
  assert.equal(o.storage, 0);
  assert.equal(market.stock, stockBefore + 7);
  assert.equal(h.state.player.credits - creditsBefore, o.lastSale.credited);
  assert.equal(o.totalSoldUnits, 7);
  assert.equal(o.totalSaleCredits, o.lastSale.credited);
  assert.deepEqual(h.state.player.cargo, holdBefore, 'warehouse settlement never borrows the pilot hold');
  const expansionBefore = h.state.player.credits;
  h.bus.emit('ui:fleetOrder', { order: 'upgradeOutpost', shipId: o.id });
  assert.equal(o.level, 2);
  assert.equal(o.storageCap, 680);
  assert.equal(expansionBefore - h.state.player.credits, 27_000);
  assert.equal(o.moduleEntityIds.length, 1, 'a paid expansion adds one bounded authored annex');
  assert.equal(h.inst.decommissionOutpost(o.id), false, 'stored feedstock survives an accidental retire order');
});

test('receiving demand limits a sale, retains the remainder and refuses a repeated full receiver', () => {
  const h = boot(), o = storedOutput(h, 10);
  const market = h.econ.ensureMarket(o.saleStationId)[FUEL];
  const target = h.econ.quoteAutomationIntake(o.saleStationId, FUEL, 10, { outpost: o }).intakeTarget;
  market.stock = target - 2;
  const before = h.state.player.credits;
  const first = h.inst._sellOutpost(o);
  assert.equal(first.ok, true);
  assert.equal(first.receipt.quantity, 2);
  assert.equal(o.storage, 8);
  assert.equal(market.stock, target);
  assert.equal(h.state.player.credits, before + first.receipt.credited);
  const saved = structuredClone(o.lastSale), balance = h.state.player.credits;
  assert.equal(h.inst._sellOutpost(o).reason, 'demand_saturation');
  assert.equal(o.storage, 8);
  assert.deepEqual(o.lastSale, saved);
  assert.equal(h.state.player.credits, balance);
});

test('passive and wallet ceilings preserve unsold output and report only realized credits', () => {
  const h = boot(), o = storedOutput(h, 20);
  const market = h.econ.ensureMarket(o.saleStationId)[FUEL], stockBefore = market.stock;
  const one = h.econ.quoteOutpostIntake(o.saleStationId, o, 1, { maxCredit: 100_000 });
  assert.ok(one.ok && one.credited > 1);
  h.inst._capBudget = one.credited - 1;
  const before = h.state.player.credits;
  assert.equal(h.inst._sellOutpost(o).reason, 'passive_limit');
  assert.equal(o.storage, 20);
  assert.equal(market.stock, stockBefore);
  assert.equal(h.state.player.credits, before);
  h.inst._capBudget = one.credited;
  const sold = h.inst._sellOutpost(o);
  assert.equal(sold.receipt.quantity, 1);
  assert.equal(o.storage, 19);
  assert.equal(h.inst._capBudget, 0);
  h.state.player.credits = Number.MAX_SAFE_INTEGER;
  h.inst._capBudget = 10_000;
  assert.equal(h.inst._sellOutpost(o).reason, 'credit_limit');
  assert.equal(o.storage, 19);
  assert.equal(o.totalSaleCredits, one.credited);
});

test('outpost settlement rejects foreign custody, stale receipts and reentrant liquidation', () => {
  const h = boot(), o = storedOutput(h);
  assert.equal(h.econ.quoteAutomationIntake('station_ceres', FUEL, 1, { outpost: o }).ok, false);
  assert.equal(h.econ.quoteOutpostIntake(o.saleStationId, { ...o }, 1, { maxCredit: 10_000 }).ok, false);
  let observed;
  h.bus.on('credits:changed', event => {
    if (event.reason !== 'automation:outpost') return;
    observed = { storage: o.storage, receipt: o.lastSale?.credited,
      repeat: h.inst._sellOutpost(o).ok, retired: h.inst.decommissionOutpost(o.id) };
  });
  const result = h.inst._sellOutpost(o), balance = h.state.player.credits;
  assert.deepEqual(observed, { storage: 0, receipt: result.receipt.credited, repeat: false, retired: false });
  const duplicate = h.econ.executeOutpostIntake(o.saleStationId, o, 10,
    { sequence: result.receipt.sequence, maxCredit: 10_000 }, () => assert.fail('duplicate must never recommit'));
  assert.equal(duplicate.duplicate, true);
  assert.equal(h.state.player.credits, balance);
  assert.equal(h.econ.executeOutpostIntake(o.saleStationId, o, 11,
    { sequence: result.receipt.sequence }, () => true).reason, 'intent_conflict');
});

test('input transfer protects mission cargo, limits each recipe bin and cannot move cargo remotely', () => {
  const h = boot(), o = acquire(h);
  for (const good of INPUTS) addCargo(h.state, good, 200);
  const locked = INPUTS[0];
  h.state.story.persistentCargo.push(locked);
  const holdBefore = structuredClone(h.state.player.cargo);
  h.pilot.pos.x += 451;
  assert.equal(h.inst.supplyOutpost(o.id), false);
  assert.deepEqual(h.state.player.cargo, holdBefore);
  h.pilot.pos = { ...o.pos };
  assert.equal(h.inst.supplyOutpost(o.id), true);
  assert.equal(o.inputStock[locked] || 0, 0);
  assert.equal(h.state.player.cargo.items[locked], holdBefore.items[locked]);
  for (const good of INPUTS.slice(1)) assert.equal(o.inputStock[good], 133);
  h.state.story.persistentCargo = [];
  assert.equal(h.inst.supplyOutpost(o.id), true);
  assert.equal(o.inputStock[locked], 133, 'later ingredients have reserved room');
  assert.equal(outpostInputUsed(o), 399);
});

test('manual collection respects hold volume and input recovery preserves uncollected stock', () => {
  const h = boot(), o = storedOutput(h, 5);
  const volume = COMMODITIES.find(row => row.id === FUEL).volPerU;
  h.state.player.cargo.capVolume = volume * 2;
  assert.equal(h.inst.collectOutpost(o.id), true);
  assert.equal(h.state.player.cargo.items[FUEL], 2);
  assert.equal(o.storage, 3);
  assert.equal(h.inst.collectOutpost(o.id), false);
  o.inputStock[INPUTS[0]] = 3;
  assert.equal(h.inst.recoverOutpostInputs(o.id), false);
  assert.equal(o.inputStock[INPUTS[0]], 3);
  h.state.player.cargo.capVolume = 100;
  assert.equal(h.inst.recoverOutpostInputs(o.id), true);
  assert.equal(o.inputStock[INPUTS[0]], 0);
});

test('exact acquisition and expansion refuse absent owners or funds and commit before credit observers', () => {
  const absent = boot({ owner: false });
  assert.equal(absent.inst.buildOutpost(DEF.id), false);
  assert.equal(absent.state.automation.outposts.length, 0);
  assert.equal(absent.state.player.credits, 500_000);
  const h = boot(), o = acquire(h);
  h.state.player.credits = 26_999;
  assert.equal(h.inst.upgradeOutpost(o.id), false);
  assert.equal(o.level, 1);
  h.state.player.credits = 27_000;
  let observed;
  h.bus.on('credits:changed', event => {
    if (event.reason.startsWith('automation:upgrade:')) observed = { level: o.level,
      repeat: h.inst.upgradeOutpost(o.id), retired: h.inst.decommissionOutpost(o.id) };
  });
  assert.equal(h.inst.upgradeOutpost(o.id), true);
  assert.deepEqual(observed, { level: 2, repeat: false, retired: false });
  assert.equal(h.state.player.credits, 0);
});

test('paused facilities retain ownership through shortage and resume with an exact arrears payment', () => {
  const h = boot(), o = acquire(h);
  o.status = 'distressed'; o._prevStatus = 'starved'; o.inputStock[INPUTS[0]] = 4;
  h.state.automation.accumulators.upkeepDebt = 50;
  h.inst._repossessOne(h.state.automation);
  assert.ok(h.state.automation.outposts.includes(o));
  h.state.player.credits = 49;
  assert.equal(h.inst.resumeOutpost(o.id), false);
  assert.equal(o.status, 'distressed');
  h.state.player.credits = 50;
  assert.equal(h.inst.resumeOutpost(o.id), true);
  assert.equal(o.status, 'starved');
  assert.equal(o.inputStock[INPUTS[0]], 4);
  assert.equal(h.state.automation.accumulators.upkeepDebt, 0);
  assert.equal(h.state.player.credits, 0);
});

test('native upkeep keeps wealthy facilities running across 32-bit balance boundaries', () => {
  for (const balance of [2 ** 31, 2 ** 32, Number.MAX_SAFE_INTEGER - 100]) {
    const h = boot(), o = acquire(h);
    h.state.player.credits = balance;
    h.inst._drainUpkeep(60, h.state.automation);
    assert.equal(h.state.player.credits, balance - DEF.upkeepPerMin, String(balance));
    assert.equal(h.state.automation.accumulators.upkeepDebt, 0, String(balance));
    assert.equal(o.status, 'producing', String(balance));
    assert.equal(h.bus.events.some(event => event.name === 'automation:assetDistressed'), false);
  }
});

test('native upkeep fails closed for an unknowable or negative credit balance', () => {
  for (const balance of [NaN, Infinity, -1]) {
    const h = boot(), o = acquire(h);
    h.state.player.credits = balance;
    const start = h.bus.events.length;
    h.inst._drainUpkeep(60, h.state.automation);
    assert.equal(o.status, 'distressed');
    assert.equal(h.state.automation.accumulators.upkeepDebt, DEF.upkeepPerMin);
    assert.equal(h.bus.events.slice(start).some(event => event.name === 'economy:chargeCredits'), false);
  }
});

test('Continue retains inputs, output, paid expansion, buyer and last receipt without runtime annex ids', () => {
  const h = boot(), o = storedOutput(h, 10);
  supply(h, o, 4);
  const one = h.econ.quoteOutpostIntake(o.saleStationId, o, 1, { maxCredit: 10_000 });
  h.inst._capBudget = one.credited;
  h.inst._sellOutpost(o);
  h.inst.upgradeOutpost(o.id);
  const before = structuredClone(o), creditsBefore = h.state.player.credits;
  const snapshot = h.inst.serialize();
  const data = JSON.parse(JSON.stringify(snapshot));
  o.inputStock[INPUTS[0]] += 1;
  assert.deepEqual(snapshot.outposts[0].inputStock, before.inputStock,
    'ongoing production cannot mutate an already-captured save');
  assert.equal(data.outposts[0].entityId, undefined);
  assert.equal(data.outposts[0].moduleEntityIds, undefined);
  h.inst.deserialize(data);
  const restored = h.state.automation.outposts[0];
  for (const key of ['id', 'inputStock', 'storage', 'level', 'saleStationId', 'lastSale', 'saleSequence', 'totalSaleCredits'])
    assert.deepEqual(restored[key], before[key], key);
  assert.equal(h.state.player.credits, creditsBefore);
  h.inst._capBudget = 0;
  assert.equal(h.inst._sellOutpost(restored).ok, false);
  assert.equal(restored.storage, 9);
});

test('expanded presence reuses bounded authored annexes and releases only its own runtime actors', () => {
  const h = boot(), o = acquire(h);
  assert.equal(h.inst.upgradeOutpost(o.id), true);
  assert.equal(h.inst.upgradeOutpost(o.id), true);
  const rows = () => {
    const result = [];
    forEachDressingRow(h.state, row => { if (row.data?.automationOutpostId === o.id) result.push(row); });
    return result;
  };
  const firstIds = rows().map(row => row.id);
  assert.equal(firstIds.length, 3);
  h.inst._syncOutpostPresence(h.state.automation);
  assert.deepEqual(rows().map(row => row.id), firstIds);
  o.moduleEntityIds.push(h.pilot.id);
  h.inst._releaseOutpostEntity(o);
  assert.equal(h.pilot.alive, true, 'a reused or stale runtime id cannot retire the pilot');
  assert.equal(rows().length, 0);
  h.inst._syncOutpostPresence(h.state.automation);
  assert.equal(rows().length, 3);
  assert.equal(o.level, 3);
});

test('offline facility receipts settle through the same stock owner exactly once', () => {
  const h = boot(), o = acquire(h);
  supply(h, o, 12);
  h.state.automation.meta.lastTickTime = 10_000;
  h.state.automation.meta.lastOfflineWindowStart = 0;
  const market = h.econ.ensureMarket(o.saleStationId)[FUEL], stockBefore = market.stock;
  const before = h.state.player.credits;
  const first = h.inst.runOfflineCatchup({ nowMs: 70_000 });
  assert.ok(first.outpostCr > 0);
  assert.equal(first.credited, first.outpostCr, 'there is no second aggregate facility grant');
  assert.equal(h.state.player.credits - before, first.outpostCr - first.upkeepCharged);
  assert.equal(market.stock - stockBefore, o.totalSoldUnits);
  assert.equal(o.storage + o.totalSoldUnits, 12);
  const after = h.state.player.credits;
  h.state.automation.meta.lastTickTime = 10_000;
  const second = h.inst.runOfflineCatchup({ nowMs: 70_000 });
  assert.equal(second.skipReason, 'idempotent');
  assert.equal(h.state.player.credits, after);
  assert.equal(market.stock - stockBefore, o.totalSoldUnits);
});

test('habitat service receipts obey the account ceiling, retain their unpaid buffer and survive normalization', () => {
  const h = boot(), o = acquire(h, 'outpost_habhub');
  o.storage = 100; h.inst._capBudget = 100;
  h.state.player.credits = Number.MAX_SAFE_INTEGER - 7;
  const paid = h.inst._sellOutpost(o);
  assert.equal(paid.receipt.credited, 7);
  assert.equal(o.storage, 93);
  assert.equal(h.state.player.credits, Number.MAX_SAFE_INTEGER);
  assert.equal(h.inst._sellOutpost(o).reason, 'credit_limit');
  normalizeOutpostOperation(o);
  assert.equal(o.lastSale.credited, 7);
});

test('Operations exposes stored feedstock, realized proceeds, recovery and the physical map handoff', () => {
  const h = boot(), o = acquire(h);
  supply(h, o, 3); produce(h, o, 1);
  o.saleBlock = 'demand_saturation';
  const readout = describeOutpostOperation(o, DEF);
  assert.match(readout.feeders.label, /input units stored/);
  const priorDocument = globalThis.document;
  try {
    const doc = fakeDom(); globalThis.document = doc;
    const screen = Object.create(automationScreen), fragment = doc._make('fragment');
    screen._ctx = { state: h.state, bus: h.bus };
    screen._renderOutposts(fragment);
    const html = fragment.children.map(row => row.innerHTML).join('\n');
    for (const action of ['supplyOutpost', 'collectOutpost', 'sellOutpost', 'upgradeOutpost', 'routeOutpost', 'locateOutpost', 'recoverOutpostInputs'])
      assert.match(html, new RegExp(`data-act="${action}"`));
    assert.match(html, /Buyer storage is full/);
    assert.match(html, /No income received yet/);
    screen._close = () => {};
    screen._onAction('locateOutpost', o.id, 'outpost');
    assert.equal(h.state.ui.mapOpenIntent.focus, 'local');
    assert.deepEqual(h.state.ui.mapOpenIntent.pos, o.pos);
    assert.equal(h.state.ui.mapOpenIntent.sectorId, SECTOR);
  } finally { globalThis.document = priorDocument; }
});
