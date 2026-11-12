// The market repair choice names the price the yard charges. Seed 4242.
// At Helios, a Trusted Concord pilot was told the list bill. The yard
// charges the standing rate.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { stationServices } from '../src/systems/stationServices.js';
import { economy } from '../src/systems/economy.js';
import { presentSurfaceDecisions } from '../src/ui/adventureDecisions.js';

function docked(rep) {
  const sim = createSimulation({ seed: 4242, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull: 40, hullMax: 100, armorHp: 10, armorMax: 40,
    flags: { docked: true },
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = 5000;
  state.factions = { ...(state.factions || {}), faction_scn: { ...(state.factions && state.factions.faction_scn), rep } };
  state.meta = { ...(state.meta || {}), seed: 4242 };
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.world = { ...(state.world || {}), currentSectorId: 'sector_helios_prime' };
  state.simTime = 0;
  bus.emit('dock:docked', { stationId: 'station_helios' });
  const econ = Object.create(economy);
  econ.init({ state, bus, helpers: {}, registry: sim.registry });
  return { state, econ };
}

function repairChoice(state) {
  const decisions = presentSurfaceDecisions(state, 'station_helios', 'market');
  const repair = decisions.find((row) => row.kind === 'repair');
  assert.ok(repair, 'the market offers a repair choice');
  return repair.options.find((row) => row.id === 'repair');
}

test('a Trusted pilot sees the repair price the yard charges', () => {
  const { state, econ } = docked(150);
  assert.equal(state.meta.seed, 4242);
  const choice = repairChoice(state);
  const before = state.player.credits;
  econ.handleService({ type: 'repair' });
  const charged = before - state.player.credits;
  assert.equal(charged, 73);
  assert.equal(choice.effect.cost, charged);
  assert.match(choice.tradeoff, /Pay 73 cr/);
  assert.doesNotMatch(choice.tradeoff, /Pay 81 cr/);
});

test('a repair the yard already booked is not offered again at that price', () => {
  const { state, econ } = docked(150);
  const before = state.player.credits;
  econ.handleService({ type: 'repair' });
  assert.equal(before - state.player.credits, 73);
  const decisions = presentSurfaceDecisions(state, 'station_helios', 'market');
  assert.equal(decisions.some((row) => row.kind === 'repair'), false);
  const mid = state.player.credits;
  econ.handleService({ type: 'repair' });
  assert.equal(mid - state.player.credits, 0);
});

test('a choice already shown follows the remainder after a partial weld', () => {
  const { state, econ } = docked(150);
  const first = repairChoice(state);
  assert.equal(first.effect.cost, 73);
  state.player.credits = 40;
  econ.handleService({ type: 'repair' });
  assert.equal(state.player.credits, 0);
  state.player.credits = 5000;
  const next = repairChoice(state);
  const before = state.player.credits;
  econ.handleService({ type: 'repair' });
  const charged = before - state.player.credits;
  assert.ok(charged > 0 && charged < 73, charged);
  assert.equal(next.effect.cost, charged);
  assert.match(next.tradeoff, new RegExp(`Pay ${charged} cr`));
});

test('a pilot without standing still sees the list repair price', () => {
  const { state, econ } = docked(0);
  const choice = repairChoice(state);
  const before = state.player.credits;
  econ.handleService({ type: 'repair' });
  const charged = before - state.player.credits;
  assert.equal(charged, 81);
  assert.equal(choice.effect.cost, 81);
  assert.match(choice.tradeoff, /Pay 81 cr/);
});
