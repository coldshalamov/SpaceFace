// RC-27: freighters greet you on arrival — at least 2 ambient hulls materialize within
// 600 wu of the player's arrival point 5 s after entering Helios. The pocket station is
// deliberately parked far away so a station-clustered roster cannot fake the greeting.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const HELIOS = SECTORS.find((s) => s.id === 'sector_helios_prime');

test('RC-27: two freighters materialize within 600 wu of the arrival point in Helios', () => {
  const sim = createSimulation({ seed: 4242, systems: [traffic] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight';
    state.world.currentSectorId = HELIOS.id;
    const origin = sectorGlobalOrigin(HELIOS.id);
    // Pocket station far from the arrival point: a roster anchored on station_helios
    // alone would leave the arrival sky empty.
    sim.spawn({
      type: 'station', name: 'Helios Station',
      pos: { x: origin.x + 4000, z: origin.z },
      radius: 30, mass: 1000, collides: true,
      data: { stationId: 'station_helios', id: 'station_helios', dockRadius: 30 },
    });
    const arrival = { x: origin.x, z: origin.z };
    state.playerId = sim.spawn({
      type: 'ship', pos: { ...arrival }, hull: 100, hullMax: 100,
      data: { isPlayer: true },
    }).id;

    bus.emit('sector:enter', {
      sectorId: HELIOS.id, sector: HELIOS, entryPoint: arrival, firstVisit: true,
    });
    sim.runTicks(300); // 5 s of simulation time

    const player = state.entities.get(state.playerId);
    const near = (state.traffic.freighters || []).filter((rec) => {
      const ent = state.entities.get(rec.id);
      if (!ent || !ent.pos) return false;
      const dx = ent.pos.x - player.pos.x;
      const dz = ent.pos.z - player.pos.z;
      return dx * dx + dz * dz <= 600 * 600;
    });
    assert.ok(
      near.length >= 2,
      `expected >=2 freighters within 600 wu of the arrival point 5 s after entering Helios, got ${near.length}`,
    );
  } finally {
    sim.dispose();
  }
});
