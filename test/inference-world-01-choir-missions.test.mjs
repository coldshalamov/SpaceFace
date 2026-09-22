import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { stationTabServiceStatus } from '../src/ui/station/stationHubModel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { missions } from '../src/systems/missions.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { economy } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';

test('WORLD-01: Choir refuel depot (station_depot3) advertises and serves missions', () => {
  const vesta = SECTORS.find((s) => s.id === 'sector_vesta_forge');
  assert.ok(vesta, 'sector_vesta_forge exists');
  const depot = (vesta.stations || []).find((s) => s.id === 'station_depot3');
  assert.ok(depot, 'station_depot3 exists');
  assert.ok(depot.services.includes('missions'), 'station_depot3 services includes missions');
  assert.ok(depot.services.includes('refuel'), 'station_depot3 services includes refuel');

  const status = stationTabServiceStatus('missions', depot);
  assert.equal(status.offered, true);
  assert.equal(status.state, 'available');
});

test('WORLD-01: Docking at Choir refuel depot on seed 4242 populates mission board slots', () => {
  const SYSTEMS = [physics, world, economy, stationServices, npcJobsRuntime, missions];
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector('sector_vesta_forge');
  sim.step(SIM_DT);

  bus.emit('dock:docked', { stationId: 'station_depot3' });
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_depot3';
  sim.step(SIM_DT);

  const board = state.missions.boards['station_depot3'];
  assert.ok(board, 'station_depot3 missions board must exist');
  assert.ok(board.slots && board.slots.length > 0, 'board must contain missions');
});
