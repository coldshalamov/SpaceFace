// 357 — Gauntlet crossing. Reach discipline for once: a squad bounds the corridor by
// alternating pairs — cover, bound, cover — herding the player down a lane they chose.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 357;
export const trigger = deepFreeze({
  id: 'gauntlet_crossing',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  zoneTypes: ['patrol_corridor', 'ambush_lane', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 46,
  cooldownS: 500,
  proximity: true,
  gates: {
    minSectorTier: 2,
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
  title: 'THE GAUNTLET',
  primaryLine: 'LANE CONTACT: raider element bounding the corridor by pairs. One covers, one moves — they want you running.',
  squad: {
    anchorArchetype: 'corsair_raider',
    archetypes: ['corsair_raider', 'lancer_sniper'],
    size: [4, 4],
    doctrine: 'balanced',
    squadRecipe: 'leapfrog_bounds',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'The bounds alternate. The corridor narrows.',
});
