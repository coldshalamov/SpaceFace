import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { economy } from '../src/systems/economy.js';
import { DRONES } from '../src/data/automation.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addToShipment } from '../src/systems/cargoCustody.js';

// ECON-06 — drone ore sales land through the economy's grantCredits listener exactly once:
// automation emits the intent, it never writes player.credits itself, and the recall path
// banks the buffer through the same capped funnel the programmed depot sale uses.
//
// The miningDrone:sellOre seam is retired on BOTH sides (listener dropped in 516241bba —
// it double-counted stock pressure against economy:applyTradePressure — and it never had an
// emitter). The real emitter on the unload path is the economy:grantCredits intent; the
// integration tests below prove the credit lands through the real economy exactly once and
// that the retired event name stays dead so the double-count cannot grow back.

function drive() {
  const events = [];
  const state = {
    simTime: 0,
    tick: 0,
    player: { id: 'player', credits: 1000, hints: {} },
    settings: { gameplay: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
    automation: null,
  };
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(automation);
  system.init({ state, bus, helpers: {}, registry: null });
  return {
    state,
    events,
    system,
    grants() {
      return events.filter((e) => e.event === 'economy:grantCredits');
    },
    // The per-minute cap bucket refills inside update() — tick the system so a bank call
    // has budget the way a live tick would have given it.
    tick(seconds = 60) { system.update(seconds, state); },
  };
}

function oreGroup() {
  const def = DRONES[0];
  return {
    id: 'drone-g1', defId: def.id, count: 1, tier: def.tier,
    sectorId: 'sector_helios_prime',
    buffer: 40, bufferCap: def.bufferCap,
    fuel: def.fuelMax, fuelMax: def.fuelMax,
    durability: def.durabilityMax, durabilityMax: def.durabilityMax,
    autoReturn: false, status: 'idle', ratePerMin: 0, entityIds: [],
  };
}

test('ECON-06: recalling a loaded drone emits one economy:grantCredits and writes no credits', () => {
  const h = drive();
  h.state.automation.drones.push(oreGroup());
  h.tick();
  const ok = h.system.recallDrone('drone-g1');
  assert.equal(ok, true);
  const grants = h.grants();
  assert.equal(grants.length, 1, 'the ore value lands through the economy listener once');
  assert.equal(grants[0].payload.reason, 'automation:drone');
  assert.ok(grants[0].payload.amount > 0, 'the buffered ore has value');
  assert.equal(h.state.player.credits, 1000, 'automation never writes credits itself');
});

test('ECON-06: an empty drone recalls with no grant intent', () => {
  const h = drive();
  const g = oreGroup();
  g.buffer = 0;
  h.state.automation.drones.push(g);
  assert.equal(h.system.recallDrone('drone-g1'), true);
  assert.equal(h.grants().length, 0, 'no ore, no sale');
});

test('ECON-06: creditPassive is the sole funnel — one intent per bank, capped not duplicated', () => {
  const h = drive();
  h.tick();
  h.system.creditPassive(100, 'drone');
  h.system.creditPassive(100, 'drone');
  const grants = h.grants();
  assert.equal(grants.length, 2, 'each bank call is one intent, no replay');
  assert.equal(h.state.player.credits, 1000, 'the funnel stays listener-mediated');
});

// ---------------------------------------------------------------------------------------------
// Integration: the real automation system and the real economy share one real bus, so a drone
// unload proves the whole chain — one intent emitted, the economy's sole credit writer lands
// it exactly once. Station/ore match the warmed Helios market from economy.newGame().
// ---------------------------------------------------------------------------------------------

const STATION = 'station_helios';
const ORE = 'cmdty_ore_iron';

function driveIntegrated() {
  const bus = createBus();
  const state = createGameState(4242);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const econ = Object.create(economy);
  econ.init({ state, bus, helpers: {}, registry: null });
  econ.newGame();
  const system = Object.create(automation);
  system.init({ state, bus, helpers: {}, registry: { get: (n) => (n === 'economy' ? econ : null) } });
  // Snapshot BEFORE the taps below subscribe: proves neither system binds the retired event.
  const retiredListeners = (bus._listeners.get('miningDrone:sellOre') || { size: 0 }).size;
  const seen = { grants: [], charges: [], pressures: [], retired: [], creditChanges: [] };
  bus.on('economy:grantCredits', (p) => seen.grants.push(p));
  bus.on('economy:chargeCredits', (p) => seen.charges.push(p));
  bus.on('economy:applyTradePressure', (p) => seen.pressures.push(p));
  bus.on('miningDrone:sellOre', (p) => seen.retired.push(p));
  bus.on('credits:changed', (p) => seen.creditChanges.push(p));
  return { bus, state, econ, system, seen, retiredListeners };
}

test('ECON-06: neither system binds the retired miningDrone:sellOre event', () => {
  const h = driveIntegrated();
  assert.equal(h.retiredListeners, 0, 'the dead listener stays gone (removed in 516241bba)');
});

test('ECON-06: recalling a loaded drone lands exactly one credit through the real economy', () => {
  const h = driveIntegrated();
  h.state.player.credits = 1000;
  const g = oreGroup();
  h.state.automation.drones.push(g);
  // Pre-fill the passive cap bucket directly — ticking would burn fuel and add a refuel charge
  // to the same receipt set, which would muddy the exactly-once assertion.
  h.system._capBudget = 1_000_000;
  const value = h.system._droneBufferValue(g);
  assert.ok(value > 0, 'a full ore buffer has sale value at the home-station price');
  const before = h.state.player.credits;
  assert.equal(h.system.recallDrone('drone-g1'), true);
  assert.equal(h.seen.grants.length, 1, 'one grant intent on the recall unload path');
  assert.equal(h.seen.grants[0].reason, 'automation:drone');
  assert.equal(h.seen.grants[0].amount, value, 'the grant is the buffered ore value');
  assert.equal(h.state.player.credits, before + value, 'the economy lands the credit exactly once');
  assert.equal(h.seen.charges.length, 0, 'a fueled recall charges nothing on top');
  const deltas = h.seen.creditChanges.filter((p) => p && p.delta > 0);
  assert.equal(deltas.length, 1, 'one credits:changed receipt for the grant');
  assert.equal(deltas[0].delta, value);
  assert.equal(h.seen.retired.length, 0, 'miningDrone:sellOre is never emitted');
});

test('ECON-06: a programmed depot sale credits once and a replayed intent never pays twice', () => {
  const h = driveIntegrated();
  h.state.player.credits = 5000;
  const g = oreGroup();
  g.oreType = ORE;
  h.state.automation.drones.push(g);
  const cap = g.bufferCap || 40;
  const qty = Math.min(10, cap);
  assert.equal(addToShipment(g, ORE, qty, cap), qty, 'the operation shipment holds the ore');
  const row = h.state.economy.markets[STATION][ORE];
  assert.ok(row, 'the warmed Helios market lists the ore');
  const stockBefore = row.stock;
  const before = h.state.player.credits;

  const first = h.system._programSellCargo(g, STATION);
  assert.ok(first && first.ok === true && !first.duplicate, 'the depot accepts the shipment');
  assert.equal(h.seen.grants.length, 1, 'one grant intent for one sale');
  assert.equal(h.seen.grants[0].reason, 'automation:drone:program');
  assert.equal(h.seen.grants[0].amount, first.receipt.credited, 'the grant is the settled receipt');
  assert.ok(first.receipt.credited > 0);
  assert.equal(h.state.player.credits, before + first.receipt.credited, 'the credit lands once');
  assert.equal(h.seen.pressures.length, 1, 'one trade-pressure notice for the sold load');
  assert.equal(h.seen.pressures[0].vol, first.receipt.quantity);
  assert.equal(row.stock, stockBefore + first.receipt.quantity, 'the book absorbs the sale once');

  // Save/reload can leave pendingSale armed while the receipt is already sealed: the retry must
  // answer from the sealed receipt — no second grant, no second pressure, no credit replay.
  g.pendingSale = { intentId: `drone-sale:${g.id}:1`, stationId: STATION, good: ORE, quantity: qty };
  const retry = h.system._programSellCargo(g, STATION);
  assert.ok(retry && retry.ok === true && retry.duplicate === true, 'the sealed receipt answers the retry');
  assert.equal(h.seen.grants.length, 1, 'the replayed intent does not re-emit the grant');
  assert.equal(h.seen.pressures.length, 1, 'nor re-apply stock pressure');
  assert.equal(h.state.player.credits, before + first.receipt.credited, 'nor move credits twice');
  assert.equal(row.stock, stockBefore + first.receipt.quantity);

  // With the hold empty there is nothing to sell — no free grant materializes.
  assert.equal(h.system._programSellCargo(g, STATION), null);
  assert.equal(h.seen.grants.length, 1);
  assert.equal(h.seen.retired.length, 0, 'miningDrone:sellOre is never emitted');
});
