// 350 — Lane duel. Two gunslingers on a hunting-pair frame: one marks, one orbits,
// and they take the measure of a lone hull before either commits. Measured, then sudden.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 350;
export const trigger = deepFreeze({
  id: 'lane_duel',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['ambush_lane', 'derelict_field', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 38,
  cooldownS: 480,
  proximity: true,
  gates: {
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'lancer_sniper',
  },
  motive: 'assassination',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_free',
  context: 'encounter',
  title: 'A MEASURED DRAW',
  primaryLine: 'LANE CONTACT: two hulls holding your bearing at standoff. They are deciding which of them you get.',
  squad: {
    anchorArchetype: 'lancer_sniper',
    archetypes: ['lancer_sniper', 'corsair_raider'],
    size: [2, 2],
    doctrine: 'balanced',
    squadRecipe: 'hunter_pair',
    formation: 'loose',
    terrain: 'lee',
  },
  bark: 'hunter_iask',
  telegraph: 'One holds. One closes. Pick your dead eye.',
});
