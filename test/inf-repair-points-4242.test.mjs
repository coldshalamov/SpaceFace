// A short repair names the hull points that weld will put back. Seed 4242.
// The Helios card used to floor the credits into "5 hp" while the yard booked
// the proportional weld, which lands as 6 points on the rounded hull.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { stationServices } from '../src/systems/stationServices.js';
import { economy } from '../src/systems/economy.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

function docked({ credits, hull, hullMax, armorHp, armorMax }) {
  const sim = createSimulation({ seed: 4242, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp, armorMax,
    flags: { docked: true },
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = credits;
  state.meta = { ...(state.meta || {}), seed: 4242 };
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.world = { ...(state.world || {}), currentSectorId: 'sector_helios_prime' };
  state.simTime = 0;
  bus.emit('dock:docked', { stationId: 'station_helios' });
  const econ = Object.create(economy);
  econ.init({ state, bus, helpers: {}, registry: sim.registry });
  return { state, player, econ };
}

test('a short repair names the hull points the weld puts back', () => {
  const { state, player, econ } = docked({
    credits: 5, hull: 92, hullMax: 100, armorHp: 20, armorMax: 20,
  });
  assert.equal(state.meta.seed, 4242);
  const quote = serviceQuote('repair', state, player);
  assert.equal(quote.cost, 5);
  assert.match(quote.detail, /partial 6\/8 hp/);
  assert.doesNotMatch(quote.detail, /partial 5\/8 hp/);
  econ.handleService({ type: 'repair', amount: quote.amount });
  assert.equal(state.player.credits, 0);
  const job = state.stationServices.player.jobs[0];
  const restored = job.meta.restoredHull;
  assert.ok(Math.abs(restored - (8 * 5 / 7)) < 1e-9, restored);
  assert.equal(Math.round(92 + restored) - 92, 6);
});

test('a repair the pilot can afford still prices the whole hole', () => {
  const { state, player } = docked({
    credits: 10000, hull: 92, hullMax: 100, armorHp: 20, armorMax: 20,
  });
  const quote = serviceQuote('repair', state, player);
  assert.equal(quote.buttonLabel, 'Repair Hull');
  assert.doesNotMatch(quote.detail, /partial/);
  assert.equal(quote.amount, 8);
  assert.equal(quote.cost, Math.round(8 * 0.9));
});
