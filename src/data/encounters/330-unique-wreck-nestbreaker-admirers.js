// Direct-only Nestbreaker claim pursuit. Fires after CLAIM takes the shrine rack.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 330;
export const trigger = deepFreeze({
  id: 'unique_wreck_nestbreaker_admirers',
  tier: 'major',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckNestbreakerAdmirers',
  pressureCost: 55,
  cooldownS: 1500,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_nestbreaker',
  },
});

export default defineEncounter(trigger, {
  triggerKind: 'shrine_admirers',
  motive: 'recover_nestbreaker_rack',
  engagementTrigger: 'unique_wreck_hardware_claimed',
  factionId: 'faction_reach',
  context: 'encounter',
  squad: {
    archetypes: ['corsair_raider', 'pd_screen_escort', 'mine_layer_jackal'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bossName: 'NESTBREAKER ADMIRERS',
  telegraph: 'Reach admirers break silence: the shrine does not leave Sker with strangers.',
  windowS: 300,
  aftermath: {
    news: 'NESTBREAKER ADMIRERS HUNT THE RACK THIEF ACROSS THE OUTER BELTS.',
    graffiti: 'THE SHRINE REMEMBERS WHO TOOK THE RACK.',
  },
});
