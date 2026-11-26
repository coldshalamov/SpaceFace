// A defeat in Adventure is recoverable. The after-action sheet opens over a live simulation, so
// the wreck sits through the lifetime sweep for as long as the player takes to press Continue.
// Recovery at the dock revives that same body (combat.js restorePlayerAtRecoveryDock), so the
// sweep must leave it in the world: when it did not, Continue answered "Recovery failed: ship
// record missing. Load a save or start a new run." on every defeat.
//
// This drives the real path on one bus with the real step:
//   combat.kill(player)        -> receipt, `player:death`, `game:over`
//   sim.runTicks(...)          -> the lifetime sweep runs at the end of every step
//   `player:recoveryRequested` -> combat.recoverPendingPlayer revives the wreck at the berth
// Run:
//   node --test test/player-defeat-survives-the-sweep.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';

const HELIOS = { stationId: 'station_helios', pos: { x: 320, z: -80 } };

function helios(seed = 5) {
  const sim = createSimulation({
    seed,
    systems: [combat],
    helpers: { hash32, mulberry32, voice: { say: () => true } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.combat = state.combat || {};
  state.settings = { gameplay: { difficulty: 'standard' } };
  state.player = {
    credits: 5000,
    insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: HELIOS.stationId },
    ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
    activeShipIndex: 0,
    cargo: { items: {}, capVolume: 1000, capMass: 1000, usedVolume: 0, usedMass: 0 },
  };
  state.world = {
    currentSectorId: 'sector_helios_prime',
    activeSector: { stations: [HELIOS] },
  };
  const player = sim.spawn({
    type: 'ship', pos: { x: 8, z: -4 }, hull: 140, hullMax: 140, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const attacker = sim.spawn({ type: 'ship', pos: { x: 0, z: 80 }, team: 1 });
  const events = [];
  for (const name of ['player:death', 'game:over', 'player:respawn', 'player:recoveryFailed']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, player, attacker, events, combat: sim.registry.get('combat') };
}

const count = (h, name) => h.events.filter((entry) => entry.name === name).length;

test('die in Helios, wait on the after-action sheet, Continue revives the same ship at the dock', () => {
  const h = helios();
  const { player } = h;

  h.combat.kill(player, h.attacker.id, {});
  assert.equal(player.alive, false, 'the kill defeats the player');
  assert.equal(count(h, 'player:death'), 1);
  assert.equal(count(h, 'game:over'), 1);
  assert.equal(h.events.find((entry) => entry.name === 'game:over').payload.recoverable, true);

  // The sheet stays open for two seconds before the player presses Continue.
  h.sim.runTicks(120);

  assert.equal(h.state.entities.get(player.id), player, 'the wreck is still in the world');
  assert.ok(h.state.entityList.includes(player), 'the wreck is still in the world list');
  assert.ok(!h.state.freeIds.includes(player.id), 'the player id was not recycled');

  h.bus.emit('player:recoveryRequested', { source: 'after_action' });

  assert.equal(count(h, 'player:recoveryFailed'), 0, 'Continue is not refused');
  const respawn = h.events.filter((entry) => entry.name === 'player:respawn');
  assert.equal(respawn.length, 1);
  assert.equal(respawn[0].payload.stationId, HELIOS.stationId, 'the ship comes back at the Helios dock');
  assert.equal(player.alive, true);
  assert.equal(player.hull, player.hullMax);
  assert.equal(player.flags.defeated, undefined);
  assert.equal(h.state.entities.get(h.state.playerId), player, 'it is the same body, not a replacement');

  // The revived ship is a live player again: the sweep keeps it across the next second of flight.
  h.sim.runTicks(60);
  assert.equal(h.state.entities.get(h.state.playerId), player);
  assert.equal(player.alive, true);

  h.sim.dispose();
});

test('a second defeat after a recovery is recoverable too', () => {
  const h = helios(11);
  const { player } = h;

  h.combat.kill(player, h.attacker.id, {});
  h.sim.runTicks(30);
  h.bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(count(h, 'player:respawn'), 1);

  h.combat.kill(player, h.attacker.id, {});
  assert.equal(player.alive, false);
  h.sim.runTicks(30);
  assert.equal(h.state.entities.get(player.id), player, 'the second wreck is still in the world');
  h.bus.emit('player:recoveryRequested', { source: 'after_action' });

  assert.equal(count(h, 'player:respawn'), 2);
  assert.equal(count(h, 'player:recoveryFailed'), 0);
  assert.equal(player.alive, true);

  h.sim.dispose();
});
