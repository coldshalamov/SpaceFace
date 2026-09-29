// Direct-only R2 encounter hook. The Long Chord's seeded sim-time deadline requests it explicitly:
// her old crew never filed her dead, and they keep the grave off the charts. When the deadline
// lands they come out along the chord to see who is poking the dark where nothing charts.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 171;
export const trigger = deepFreeze({
  id: 'unique_wreck_long_chord_warden',
  tier: 'minor',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckLongChordWarden',
  pressureCost: 45,
  cooldownS: 1200,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_long_chord',
  },
});
export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: trigger.zoneTypes,
    twist: 'unique_wreck',
    actor: 'faction_reach',
  },
  triggerKind: 'seeded_cleaner',
  motive: 'keep_the_toll_grave_unfiled',
  engagementTrigger: 'unique_wreck_cleaner_deadline',
  factionId: 'faction_reach',
  context: 'encounter',
  squad: {
    archetypes: ['corsair_raider'],
    size: [1, 2],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bossName: 'CHORD TOLL-WARDEN',
  telegraph: 'A transponder that has filed her dead for years lights up on the chord: the grave stays uncharted.',
  windowS: 300,
  aftermath: {
    graffiti: 'THE CHORD KEEPS ITS OWN LEDGER.',
  },
});
