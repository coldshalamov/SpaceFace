// 351 — Hammer fall. A bruiser packs the anvil — heavy hull dead ahead holding your
// nose — while corsair wings swing wide off a rock lee and come down like a hammer.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 351;
export const trigger = deepFreeze({
  id: 'hammer_fall',
  tier: 'major',
  deck: 'combat',
  weight: 0.9,
  zoneTypes: ['ambush_lane', 'derelict_field'],
  script: 'ambush',
  pressureCost: 58,
  cooldownS: 560,
  proximity: true,
  gates: {
    minSectorTier: 3,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'area_control_interdiction',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'HAMMER FALL',
  primaryLine: 'LANE CONTACT: mass signature dead ahead and wings splitting wide. The rock has a shadow and the shadow has teeth.',
  squad: {
    anchorArchetype: 'bruiser_brawler',
    archetypes: ['corsair_raider', 'wasp_swarmer'],
    size: [4, 5],
    doctrine: 'scavenger',
    squadRecipe: 'hammer_anvil',
    formation: 'loose',
    terrain: 'lee',
  },
  bark: 'ambush_tele',
  telegraph: 'The anvil holds your nose. The hammer swings.',
});
