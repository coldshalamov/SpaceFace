// Ember pack — volatile lights staged where nearby hulls and debris make cook-offs meaningful.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 340;
export const trigger = deepFreeze({
  id: 'swarmer_ember_pack',
  tier: 'minor',
  deck: 'combat',
  weight: 0.4,
  zoneTypes: ['derelict_field', 'outlaw_zone', 'ambush_lane'],
  script: 'ambush',
  pressureCost: 44,
  cooldownS: 900,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.6,
  },
});

export default defineEncounter(trigger, {
  motive: 'volatile_pack_assault',
  engagementTrigger: 'player_enters_cookoff_geometry',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'EMBER PACK',
  primaryLine: 'HOT CORES: an Ember pack is pressing into the wrecks. Choose where they die.',
  squad: {
    archetypes: ['ember_swarmer'],
    size: [2, 4],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Orange cores closing through the debris. Keep the blast geometry in view.',
  aftermath: {
    flee: 'The surviving hot cores peel away from the debris cluster.',
    kill: 'Only scorched chips remain where the volatile pack folded.',
  },
});
