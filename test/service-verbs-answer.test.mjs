import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { core } from '../src/core/coreSystem.js';
import { economy, AMMO_BATCH } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';

// §1.8 unreadable-feedback edge: every docked service verb answers its player — the repair
// bench says "Hull already intact", the wash says "already clean", the note says "No note on
// the ledger" — except two: a refuel at a full tank and a munitions ask with no amount used
// to return without a word. The verbs now answer like their siblings, and a munitions ask
// with no amount defaults to a batch the way refuel defaults to the tank and repair to the hull.

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';

function dockedSim({ credits = 10_000, fuel = null, hull = 100, hullMax = 100 } = {}) {
  const sim = createSimulation({ seed: 42, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: 0, armorMax: 0,
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
  state.ui.dockedStationId = STATION;
  state.world = { ...(state.world || {}), currentSectorId: SECTOR };
  state.simTime = 0;
  state.timeScale = 0;
  bus.emit('dock:docked', { stationId: STATION });
  const ctx = { state, bus, helpers: {}, registry: sim.registry };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  return { sim, state, bus, econ, player, toasts };
}

test('a refuel at a full tank says so instead of doing nothing', () => {
  const { econ, state, toasts } = dockedSim({ fuel: { current: 100, max: 100 } });
  econ.handleService({ type: 'refuel' });
  assert.ok(toasts.some((t) => /tank already full/i.test(t.text)), JSON.stringify(toasts));
  assert.equal(state.player.credits, 10_000, 'a full tank costs nothing');
});

test('a munitions ask with no amount buys like the dock button does — batch, hold permitting', () => {
  const { econ, state, toasts } = dockedSim({ credits: 100_000 });
  econ.handleService({ type: 'ammo' });
  const bought = toasts.find((t) => /Bought \d+ munitions/.test(t.text));
  assert.ok(bought, JSON.stringify(toasts));
  const count = Number(/Bought (\d+) munitions/.exec(bought.text)[1]);
  assert.ok(count > 0 && count <= AMMO_BATCH, `default fill is batch-sized, hold-clamped (${count})`);
  assert.equal(state.player.credits, 100_000 - count * 12, 'the charge matches the voiced count');
});

test('an explicit zero munitions ask is answered, not swallowed', () => {
  const { econ, state, toasts } = dockedSim({});
  econ.handleService({ type: 'ammo', amount: 0 });
  assert.ok(toasts.some((t) => /no munitions requested/i.test(t.text)), JSON.stringify(toasts));
  assert.equal(state.player.credits, 10_000);
});
