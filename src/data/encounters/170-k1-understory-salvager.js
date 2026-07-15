// K1 presence-owned hook. Indexed by F2, never drawn by the ambient encounter deck.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 170;
export const trigger = deepFreeze({
  id: 'k1_understory_salvager', tier: 'ambient', deck: 'civilian', weight: 0,
  zoneTypes: [], script: 'salvageSignal', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  factionId: 'faction_understory', presenceNodeId: 'presence_understory_charon',
  source: 'lossLedgerOnly', behavior: 'post_loss_salvager',
});
