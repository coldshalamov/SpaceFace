import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { core } from '../src/core/coreSystem.js';
import { economy, serviceUnitCr, SERVICE_PRICES } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

// §1.8 transactions edge: the standing discount (factions.rankServiceDiscount — 10% at rank
// step ≥ 2 with the docked station's own faction) was quoted by the dock UI and never honored
// by the charge, so a standing player was shown one number and billed another. One source now
// feeds both sides (economy.serviceUnitCr); these pins hold quote and charge to the same
// number at full price, discounted price, and the partial-affordability branch.

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const HELIOS_FACTION = 'faction_scn';

function dockedSim({ credits = 10_000, rep = 0, hull = 60, hullMax = 100, armorMax = 20, fuel = null } = {}) {
  const sim = createSimulation({ seed: 42, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: armorMax * 0.5, armorMax,
    flags: { docked: true },
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = credits;
  state.factions = { ...(state.factions || {}), [HELIOS_FACTION]: { rep } };
  if (fuel) state.fuel = fuel;
  state.meta = { ...(state.meta || {}), seed: 42 };
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  state.world = { ...(state.world || {}), currentSectorId: SECTOR };
  state.simTime = 0;
  state.timeScale = 0;
  bus.emit('dock:docked', { stationId: STATION });
  const ctx = { state, bus, helpers: {}, registry: sim.registry };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  return { sim, state, bus, econ, player };
}

test('a standing pilot is charged the discounted price the dock button quoted — full refuel', () => {
  const { state, econ } = dockedSim({ rep: 200, fuel: { current: 20, max: 100 } });
  const quote = serviceQuote('refuel', state, null);
  const discountedUnit = serviceUnitCr(state, SERVICE_PRICES.fuelCrPerUnit);
  assert.ok(discountedUnit < SERVICE_PRICES.fuelCrPerUnit,
    'rank step ≥ 2 must move the unit price below list');
  assert.equal(quote.cost, Math.round(80 * discountedUnit),
    'the quote prices the 80u deficit at the discounted unit');
  econ.handleService({ type: 'refuel' });
  assert.equal(state.player.credits, 10_000 - quote.cost,
    'the charge equals the quoted number, not the list price');
});

test('the same parity holds for a full repair at standing', () => {
  const { state, econ, player } = dockedSim({ rep: 200, hull: 60, hullMax: 100, armorMax: 20 });
  const quote = serviceQuote('repair', state, player);
  const discountedUnit = serviceUnitCr(state, SERVICE_PRICES.repairCrPerHp);
  assert.ok(quote.cost > 0);
  assert.equal(quote.cost, Math.round(quote.amount * discountedUnit));
  econ.handleService({ type: 'repair' });
  assert.equal(state.player.credits, 10_000 - quote.cost,
    'the yard takes the standing rate the button showed');
});

test('a fresh pilot (below the discount step) pays the full list price the quote shows', () => {
  const { state, econ } = dockedSim({ rep: 0, fuel: { current: 20, max: 100 } });
  const quote = serviceQuote('refuel', state, null);
  assert.equal(serviceUnitCr(state, SERVICE_PRICES.fuelCrPerUnit), SERVICE_PRICES.fuelCrPerUnit,
    'rank below step 2 keeps the list unit');
  assert.equal(quote.cost, Math.round(80 * SERVICE_PRICES.fuelCrPerUnit));
  econ.handleService({ type: 'refuel' });
  assert.equal(state.player.credits, 10_000 - quote.cost);
});

test('the partial-affordability branch quotes and charges the same discounted units', () => {
  const { state, econ, sim } = dockedSim({
    rep: 200,
    credits: 100,
    fuel: { current: 20, max: 100 },
  });
  const discountedUnit = serviceUnitCr(state, SERVICE_PRICES.fuelCrPerUnit);
  const quote = serviceQuote('refuel', state, null);
  const expectedUnits = Math.min(80, Math.max(0, Math.floor(100 / discountedUnit)));
  assert.equal(quote.amount, expectedUnits, 'the quote shows the affordable discounted units');
  assert.equal(quote.cost, Math.round(expectedUnits * discountedUnit));
  econ.handleService({ type: 'refuel' });
  assert.equal(state.player.credits, 100 - quote.cost);
  // The yard owns timed delivery on the production dock: run it until the quoted units land.
  const job = state.stationServices.player && state.stationServices.player.jobs[0];
  assert.ok(job, 'the partial refuel booked a yard job');
  for (let i = 0; i < 60 * 120 && state.fuel.current < 20 + expectedUnits - 1e-6; i += 1) sim.step();
  assert.ok(Math.abs(state.fuel.current - (20 + expectedUnits)) < 1e-6,
    `the tank takes exactly the quoted units (${state.fuel.current}/100, want ${20 + expectedUnits})`);
});
