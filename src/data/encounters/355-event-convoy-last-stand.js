// Rare Plan 20 convoy defense: ordinary freighters and raiders leave physical results either way.
import { deepFreeze, defineEncounter } from './catalog.js';
import { SETPIECE_EVENT_RUNTIMES } from '../../systems/setpieceEventRuntime.js';

export const encounterOrder = 355;
export const trigger = deepFreeze({
  id: 'event_convoy_last_stand',
  tier: 'major',
  deck: 'combat',
  weight: 0.1,
  rare: true,
  zoneTypes: ['trade_lane', 'ambush_lane', 'patrol_corridor'],
  script: 'selfRegistered',
  pressureCost: 94,
  cooldownS: 86_400,
  proximity: true,
  gates: { storyBeatMin: 2, minSectorTier: 2, maxSecurity: 0.68 },
});

export const runtime = SETPIECE_EVENT_RUNTIMES.convoyLastStand;
export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  title: 'CONVOY LAST STAND',
  primaryLine: 'FREIGHT BAND: three haulers are boxed in and turning to face the raiders.',
  telegraph: 'A traffic rumor identifies the trapped convoy before weapons range closes.',
  receipts: {
    convoy_survived: 'CONVOY SURVIVED — remaining haulers hold for recovery tugs.',
    convoy_destroyed: 'CONVOY LOST — debris and the freight-band record remain.',
  },
});
