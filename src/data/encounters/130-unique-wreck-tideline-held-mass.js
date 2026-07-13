// Direct-only R2 encounter hook. It is indexed by F2 but never enters the ambient weighted deck.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 130;
export const trigger = deepFreeze({
  id: 'unique_wreck_tideline_held_mass',
  tier: 'major',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckHeldMass',
  pressureCost: 80,
  cooldownS: 1800,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_gravhand_tideline',
  },
});
export default defineEncounter(trigger, {
  triggerKind: 'held_mass',
  motive: 'guard_held_mass',
  engagementTrigger: 'unique_wreck_held_mass_revealed',
  factionId: 'faction_vael',
  context: 'encounter',
  squad: {
    archetypes: ['bruiser_brawler'],
    size: [1, 1],
    doctrine: 'anchor',
    formation: 'ring',
  },
  bossName: 'THE HELD THING',
  telegraph: 'The tractor line tightens. The mass at its far end turns toward you.',
  windowS: 360,
});
