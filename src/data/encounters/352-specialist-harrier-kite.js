// One low-DPS Harrier on a long open bearing. Its light screen is the immediate damage race; the
// ordinary ambush runtime orders the surviving anchor out when that screen breaks.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 352;
export const trigger = deepFreeze({
  id: 'specialist_harrier_kite',
  tier: 'minor',
  deck: 'combat',
  weight: 0.45,
  zoneTypes: ['ambush_lane', 'trade_lane', 'patrol_corridor'],
  script: 'ambush',
  pressureCost: 42,
  cooldownS: 840,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.72,
  },
});
export default defineEncounter(trigger, {
  motive: 'long_bearing_harassment',
  engagementTrigger: 'player_crosses_long_bearing',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'HARRIER LONG TURN',
  primaryLine: 'DISTANT CONTACT: a Harrier is holding the long angle behind a light wing.',
  squad: {
    anchorArchetype: 'harrier_kiter',
    archetypes: ['dart_swarmer', 'wasp_swarmer'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'The far tracer is not the damage race. Clear the close wing first.',
  aftermath: {
    flee: 'The Harrier abandons the long bearing when its screen breaks.',
    kill: 'The distant tracer line goes dark over an empty lane.',
  },
});
