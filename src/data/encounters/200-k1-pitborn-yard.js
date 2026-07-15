// K1 presence-owned hook. Indexed by F2, never drawn by the ambient encounter deck.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 200;
export const trigger = deepFreeze({
  id: 'k1_pitborn_yard', tier: 'ambient', deck: 'civilian', weight: 0,
  zoneTypes: [], script: 'traderRun', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  factionId: 'faction_pitborn', presenceNodeId: 'presence_pitborn_yards',
  services: ['yard', 'fence'], behavior: 'disable_and_run',
});
