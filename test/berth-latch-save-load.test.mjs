import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { core } from '../src/core/coreSystem.js';
import { economy } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';

// §1.8 docked-services seam: economy keeps two RUNTIME berth latches — _lastDockedStation
// (trade verbs, docked intel feed) and _stationServiceBerth (service-gate override for
// harness docks). newGame() clears both under a comment naming the failure mode, but
// deserialize() never did. Quit while docked, then load a save that restores in open space:
// the latches still resolved the pre-load berth, so handleTrade/handleService/insurance and
// the per-tick snapshotIntel all failed open against a station the pilot is not at — a
// ui:service 'refuel' in flight would charge credits and instantly fill the tank.

const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios'; // full-service berth [trade, shipyard, refuel, repair, missions]

function makeSim({ credits = 10_000, hull = 60, hullMax = 100, fuel = { current: 20, max: 100 } } = {}) {
  const sim = createSimulation({ seed: 42, systems: [stationServices] });
  const { state, bus } = sim;
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: 10, armorMax: 20,
    flags: {},
  };
  state.playerId = 'player';
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.player.credits = credits;
  state.fuel = fuel;
  state.meta = { ...(state.meta || {}), seed: 42 };
  state.world = { ...(state.world || {}), currentSectorId: SECTOR };
  state.simTime = 0;
  state.timeScale = 0;
  const ctx = { state, bus, helpers: {}, registry: sim.registry };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  return { sim, state, bus, econ, player, toasts };
}

function dockAt({ state, bus, player }, stationId) {
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  player.flags.docked = true;
  bus.emit('dock:docked', { stationId });
}

// The save restore always lands the pilot undocked: ui.docked/ui.dockedStationId and the
// entity dock flag are cleared by the restore path (saveSystem + uiRoot save:loaded).
function restoreInOpenSpace({ state, player, econ }, data) {
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  delete player.flags.docked;
  econ.deserialize(data);
}

test('a restore clears the remembered berth: docked gates close in open space', () => {
  const t = makeSim();
  dockAt(t, STATION);
  assert.equal(t.econ.dockedStationId(), STATION, 'sanity: the live dock resolved');
  assert.equal(t.econ._stationServicesDocked(), true);

  const saved = t.econ.serialize();
  restoreInOpenSpace(t, saved);

  assert.equal(t.econ.dockedStationId(), null,
    'the pre-load berth must not resolve after the restore');
  assert.equal(t.econ._stationServicesDocked(), false,
    'the stale berth latch must not satisfy the service gate');
});

test('a stale berth cannot sell: trade and service verbs refuse after the restore', () => {
  const t = makeSim();
  dockAt(t, STATION);
  const saved = t.econ.serialize();
  restoreInOpenSpace(t, saved);

  const trade = t.econ.handleTrade('food', 'buy', 1, {});
  assert.equal(trade.ok, false);
  assert.equal(trade.reason, 'not_docked');

  t.econ.handleService({ type: 'refuel' });
  assert.equal(t.state.fuel.current, 20, 'no silent instant fill from the stale berth');
  assert.equal(t.state.player.credits, 10_000, 'nothing was charged');
  assert.ok(t.toasts.some((row) => /dock first|not docked/i.test(row.text)),
    JSON.stringify(t.toasts));
});

test('the docked intel feed stops following the pre-load berth after a restore', () => {
  const t = makeSim();
  dockAt(t, STATION);
  assert.ok(t.state.economy.marketIntel[STATION], 'sanity: the dock snapshot landed');
  const saved = t.econ.serialize();
  restoreInOpenSpace(t, saved);

  // The remembered list is by design — it persists in the save and stays stale until the
  // berth is revisited. What must not happen is the docked-feed refresh keeping its
  // timestamp live while the pilot is in open space.
  t.state.simTime = 500;
  t.econ.econTick(5, t.state);
  assert.equal(t.state.economy.marketIntel[STATION].seenAtT, 0,
    'open space must not refresh the docked-feed timestamp on the pre-load berth');
});
