// 358 — Shepherd storm. A wasp cloud flies the net recipe — spread wide, close slow,
// and herd the mark toward the deep rocks where smaller hulls win the turning fight.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 358;
export const trigger = deepFreeze({
  id: 'shepherd_storm',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['derelict_field', 'outlaw_zone', 'mining_belt'],
  script: 'ambush',
  pressureCost: 40,
  cooldownS: 440,
  proximity: true,
  gates: {
    minSectorTier: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE NET CLOSES',
  primaryLine: 'LANE CONTACT: wasp cloud spread wide and closing slow. The rocks behind you just became the plan.',
  squad: {
    anchorArchetype: 'wasp_swarmer',
    archetypes: ['wasp_swarmer'],
    size: [4, 6],
    doctrine: 'scavenger',
    squadRecipe: 'shepherd_net',
    formation: 'loose',
  },
  bark: 'ambush_spring',
  telegraph: 'The net does not charge. It just stops being far.',
});
