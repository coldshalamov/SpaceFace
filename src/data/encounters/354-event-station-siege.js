// Rare Plan 20 wave defense: station guns and attackers are ordinary physical combat actors.
import { deepFreeze, defineEncounter } from './catalog.js';
import { SETPIECE_EVENT_RUNTIMES } from '../../systems/setpieceEventRuntime.js';

export const encounterOrder = 354;
export const trigger = deepFreeze({
  id: 'event_station_siege',
  tier: 'major',
  deck: 'combat',
  weight: 0.1,
  rare: true,
  zoneTypes: ['civilian_core', 'refinery_approach', 'colony'],
  script: 'selfRegistered',
  pressureCost: 96,
  cooldownS: 86_400,
  proximity: true,
  gates: { storyBeatMin: 2, minSectorTier: 2, maxSecurity: 0.72 },
});

export const runtime = SETPIECE_EVENT_RUNTIMES.stationSiege;
export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  title: 'STATION SIEGE',
  primaryLine: 'LOCAL DEFENSE: siege screen inbound. Station turrets are hot; every lost module will stay in the approach.',
  telegraph: 'A rare siege bulletin precedes the attacking wave by six seconds.',
  receipts: {
    station_held: 'STATION HELD — surviving guns reopen the lane.',
    station_overrun: 'STATION OVERRUN — module wreckage blocks the approach.',
  },
});
