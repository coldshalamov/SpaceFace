import { createSimulation } from '../../src/core/sim.js';
import { createMarketNews } from '../../src/ui/marketNews.js';

export const STORY_SECTOR = 'sector_helios_prime';

export function infStoryScenario(systems = [], { news = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  state.world.currentSectorId = STORY_SECTOR;
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 30 }, radius: 8,
    hull: 200, hullMax: 200, data: { defId: 'ship_hitch' },
  });
  state.playerId = player.id;
  const headlines = [];
  bus.on('news:headline', (p) => headlines.push(p));
  const wire = news ? createMarketNews({ state, bus }) : null;
  return {
    sim, state, bus, player, wire, headlines,
    dispose() { wire?.destroy(); sim.dispose(); },
  };
}
