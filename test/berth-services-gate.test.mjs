import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { core } from '../src/core/coreSystem.js';
import { economy } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

// §1.8 transactions edge: a berth's services list is the contract for what it can sell. The
// yard's enqueue gate already refuses a job the berth does not offer (its comment even claims
// the quote layer enforces the same contract) — but neither the quote nor the charge checked,
// so at a pump-less berth the refusal fell through to economy's instant-fill fallback and the
// hull/tank silently restored anyway. Nine authored berths lack refuel; eight lack repair.

const SECTOR = 'sector_helios_prime';
const NO_SERVICE_STATION = 'station_beltout';   // [trade, missions, ore_buy]
const FULL_SERVICE_STATION = 'station_helios';  // [trade, shipyard, refuel, repair, missions]

function dockedSim(stationId, { credits = 10_000, hull = 60, hullMax = 100, armorMax = 20, fuel = null } = {}) {
  const sim = createSimulation({ seed: 42, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: 10, armorMax,
    flags: { docked: true },
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = credits;
  state.factions = { ...(state.factions || {}), faction_scn: { rep: 0 } };
  if (fuel) state.fuel = fuel;
  state.meta = { ...(state.meta || {}), seed: 42 };
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  state.world = { ...(state.world || {}), currentSectorId: SECTOR };
  state.simTime = 0;
  state.timeScale = 0;
  bus.emit('dock:docked', { stationId });
  const ctx = { state, bus, helpers: {}, registry: sim.registry };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  return { sim, state, bus, econ, player, toasts };
}

test('a berth with no pump refuses the refuel charge and the tank stays dry', () => {
  const { state, econ, toasts } = dockedSim(NO_SERVICE_STATION, { fuel: { current: 20, max: 100 } });
  econ.handleService({ type: 'refuel' });
  assert.equal(state.fuel.current, 20, 'no pump means no fuel, not a silent instant fill');
  assert.equal(state.player.credits, 10_000, 'nothing was charged');
  assert.ok(toasts.some((t) => /no fuel berth/i.test(t.text)), JSON.stringify(toasts));
  assert.equal(
    (state.stationServices.player && state.stationServices.player.jobs.length) || 0, 0,
    'no yard job was booked either');
});

test('a berth with no yard refuses the repair charge and the hull stays hurt', () => {
  const { state, econ, player, toasts } = dockedSim(NO_SERVICE_STATION);
  econ.handleService({ type: 'repair' });
  assert.equal(player.hull, 60, 'no yard means no weld, not a silent instant restore');
  assert.equal(state.player.credits, 10_000);
  assert.ok(toasts.some((t) => /no repair yard/i.test(t.text)), JSON.stringify(toasts));
});

test('the quote layer refuses first and explains why the verb is dead at this berth', () => {
  const { state, player } = dockedSim(NO_SERVICE_STATION, { fuel: { current: 20, max: 100 } });
  const refuel = serviceQuote('refuel', state, null);
  assert.equal(refuel.disabled, true);
  assert.match(refuel.disabledReason, /no fuel berth/i);
  const repair = serviceQuote('repair', state, player);
  assert.equal(repair.disabled, true);
  assert.match(repair.disabledReason, /no repair yard/i);
});

test('a full-service berth quotes and charges exactly as before', () => {
  const { state, econ, toasts } = dockedSim(FULL_SERVICE_STATION, { fuel: { current: 20, max: 100 } });
  const quote = serviceQuote('refuel', state, null);
  assert.equal(quote.disabled, false, 'helios runs a pump; the verb is live');
  econ.handleService({ type: 'refuel' });
  assert.equal(state.player.credits, 10_000 - quote.cost, 'the pump charges the quoted price');
  assert.ok(toasts.some((t) => /Refuel underway|Refueled|Partial refuel/.test(t.text)), JSON.stringify(toasts));
});
