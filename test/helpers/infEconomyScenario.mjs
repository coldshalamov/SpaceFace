import { createSimulation } from '../../src/core/sim.js';
import { economy } from '../../src/systems/economy.js';
import { missions } from '../../src/systems/missions.js';

export const STATION = 'station_ceres';
export const GOOD = 'cmdty_ore_iron';

export function economyScenario() {
  const sim = createSimulation({ seed: 4242, systems: [economy, missions] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 200000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 };
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  const econ = sim.registry.get('economy');
  const market = econ.ensureMarket(STATION);
  const events = [];
  bus.on('economy:tradeCompleted', (payload) => events.push(payload));
  return { sim, state, bus, econ, market, events, missionSystem: sim.registry.get('missions') };
}
