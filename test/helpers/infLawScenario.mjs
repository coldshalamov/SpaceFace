import { createSimulation } from '../../src/core/sim.js';
import { cargo } from '../../src/systems/cargo.js';
import { economy } from '../../src/systems/economy.js';
import { heat } from '../../src/systems/heat.js';
import { lawSecurity } from '../../src/systems/lawSecurity.js';
import { survivorPod } from '../../src/systems/survivorPod.js';
import { customsPrompt } from '../../src/ui/customsPrompt.js';

export const STATION = 'station_helios';
export const SECTOR = 'sector_helios_prime';

export function lawScenario() {
  const sim = createSimulation({ seed: 4242, systems: [lawSecurity, cargo, economy, heat, survivorPod, customsPrompt] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.world.currentSectorId = SECTOR;
  state.provenance = { chains: [], openIncidents: {} };
  const player = sim.spawn({
    type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8, data: { intent: {}, combat: {} },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: STATION, factionId: 'faction_scn', dockRadius: 72 },
  });
  const patrol = (worldRecordId) => sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 180, z: 0 },
    hull: 140, hullMax: 140, radius: 7,
    data: {
      trafficRole: 'patrol', worldRecordId, homeSectorId: SECTOR, sectorId: SECTOR, durable: true,
      ai: { lawful: true, spawnContext: 'patrol' }, intent: {}, combat: {},
    },
  });
  const events = (name) => {
    const rows = [];
    bus.on(name, (row) => rows.push(structuredClone(row)));
    return rows;
  };
  return {
    sim, state, bus, player, patrol, events,
    law: sim.registry.get('lawSecurity'), econ: sim.registry.get('economy'),
    pods: sim.registry.get('survivorPod'),
  };
}
