// K1 presence-owned hook. Indexed by F2, never drawn by the ambient encounter deck.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 190;
export const trigger = deepFreeze({
  id: 'k1_archive_reading_room', tier: 'ambient', deck: 'mystery', weight: 0,
  zoneTypes: [], script: 'whisper', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  factionId: 'faction_archive', presenceNodeId: 'presence_archive_reading_rooms',
  requiredRep: 25, behavior: 'rep_gated_reading_room',
});
