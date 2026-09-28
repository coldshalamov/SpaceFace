// 356 — Mourning vigil. A choir element wheels a fresh wreck in a slow crescent —
// not salvage, not a trap: a funeral orbit. Shooting into the vigil is a choice.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 356;
export const trigger = deepFreeze({
  id: 'mourning_vigil',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.8,
  zoneTypes: ['derelict_field', 'nebula_fog'],
  script: 'salvage',
  pressureCost: 14,
  cooldownS: 700,
  proximity: true,
  gates: {
    minSectorTier: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_choir',
  },
  motive: 'guard_held_mass',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_choir',
  context: 'encounter',
  title: 'MOURNING VIGIL',
  primaryLine: 'FIELD NOTE: choir hulls wheeling a wreck at funeral standoff. They have not armed. Yet.',
  squad: {
    anchorArchetype: 'choir_zealot',
    archetypes: ['choir_zealot'],
    size: [4, 4],
    doctrine: 'official',
    squadRecipe: 'funeral_orbit',
    formation: 'loose',
  },
  bark: 'salvage_ping',
  telegraph: 'The wheel does not break. It is not waiting for you.',
});
