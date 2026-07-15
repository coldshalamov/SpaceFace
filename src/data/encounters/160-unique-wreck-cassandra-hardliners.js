// Direct-only R2 encounter hook. It can fire only after the Cassandra Treaty is durably claimed.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 160;
export const trigger = deepFreeze({
  id: 'unique_wreck_cassandra_hardliners',
  tier: 'major',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckCassandraHardliners',
  pressureCost: 65,
  cooldownS: 1800,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_choir_cassandra',
    requiredStoryRewardId: 'unique_cassandra_treaty',
  },
});
export default defineEncounter(trigger, {
  triggerKind: 'treaty_hardliners',
  motive: 'burn_cassandra_treaty',
  engagementTrigger: 'unique_wreck_treaty_claimed',
  factionId: 'faction_choir',
  context: 'encounter',
  squad: {
    archetypes: ['bruiser_brawler', 'lancer_sniper'],
    size: [2, 2],
    doctrine: 'anchor',
    formation: 'wedge',
  },
  bossName: 'CASSANDRA DENIAL WING',
  telegraph: 'Choir hardliners break radio silence: the treaty burns with its witness.',
  windowS: 360,
});
