// Direct-only R2 encounter hook. Repeated authored pings summon it; ambient planning cannot.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 140;
export const trigger = deepFreeze({
  id: 'unique_wreck_deepsurvey_ping_elite',
  tier: 'minor',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckPingElite',
  pressureCost: 55,
  cooldownS: 1200,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_deepsurvey',
  },
});
export default defineEncounter(trigger, {
  triggerKind: 'ping_elite',
  motive: 'answer_deep_ping',
  engagementTrigger: 'unique_wreck_repeated_ping',
  factionId: 'faction_vael',
  context: 'encounter',
  requiredPings: 3,
  squad: {
    archetypes: ['lancer_sniper'],
    size: [1, 1],
    doctrine: 'standoff',
    formation: 'loose',
  },
  bossName: 'RIFT ANSWER',
  telegraph: 'The third ping comes back with thrust behind it.',
  windowS: 300,
});
