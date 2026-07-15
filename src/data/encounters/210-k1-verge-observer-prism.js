// K1 presence-owned hook. Indexed by F2, never drawn by the ambient encounter deck.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 210;
export const trigger = deepFreeze({
  id: 'k1_verge_observer_prism', tier: 'ambient', deck: 'mystery', weight: 0,
  zoneTypes: [], script: 'whisper', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  factionId: 'faction_verge_layers', presenceNodeId: 'presence_verge_layers',
  phaseGate: 'vergeLayersRevealed', behavior: 'observer_prism',
});
