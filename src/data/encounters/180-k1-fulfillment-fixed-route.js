// K1 presence-owned hook. Indexed by F2, never drawn by the ambient encounter deck.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 180;
export const trigger = deepFreeze({
  id: 'k1_fulfillment_fixed_route', tier: 'ambient', deck: 'civilian', weight: 0,
  zoneTypes: [], script: 'convoy', pressureCost: 0, cooldownS: 0, proximity: false,
  gates: { externalOnly: true },
});
export default defineEncounter(trigger, {
  factionId: 'faction_fulfillment', presenceNodeId: 'presence_fulfillment_route_01',
  routeId: 'fulfillment_tethys_helios', behavior: 'administrative_boarding',
});
