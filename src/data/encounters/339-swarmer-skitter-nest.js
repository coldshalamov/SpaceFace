// Skitter nest — terrain-hugging lights using a worked belt as cover.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 339;
export const trigger = deepFreeze({
  id: 'swarmer_skitter_nest',
  tier: 'minor',
  deck: 'combat',
  weight: 0.55,
  zoneTypes: ['mining_belt'],
  script: 'ambush',
  pressureCost: 38,
  cooldownS: 720,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.72,
  },
});

export default defineEncounter(trigger, {
  motive: 'rock_nest_ambush',
  engagementTrigger: 'player_closes_on_nested_cover',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'SKITTER NEST',
  primaryLine: 'DUST ON THE ROCKS: a Skitter nest is waking behind the worked cover.',
  squad: {
    archetypes: ['skitter_swarmer'],
    size: [3, 6],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'Dust kicks off the near rocks. Break or move the cover.',
  aftermath: {
    flee: 'The remaining Skitters thread deeper into the rock field.',
    kill: 'Mining ore spills from the broken nest among the cover rocks.',
  },
});
