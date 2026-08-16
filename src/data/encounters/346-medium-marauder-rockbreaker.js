// A Marauder uses a light screen to pin the player against worked cover, where its RCS counter
// can turn the brawler's mass into the encounter's answer instead of another hull-damage race.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 346;
export const trigger = deepFreeze({
  id: 'medium_marauder_rockbreaker',
  tier: 'minor',
  deck: 'combat',
  weight: 0.7,
  zoneTypes: ['mining_belt', 'derelict_field', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 48,
  cooldownS: 840,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.68,
  },
});
export default defineEncounter(trigger, {
  motive: 'worked_cover_breach',
  engagementTrigger: 'player_enters_rockbreaker_box',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'ROCKBREAKER BOX',
  primaryLine: 'HEAVY CONTACT: a Marauder is closing through the worked rocks behind a Skitter screen.',
  squad: {
    anchorArchetype: 'marauder_brawler',
    archetypes: ['skitter_swarmer'],
    size: [2, 3],
    doctrine: 'balanced',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'The slab-hull commits through cover. Break its RCS, then use the wall.',
  aftermath: {
    flee: 'The Skitter screen scatters as the slab-hull dumps mass.',
    kill: 'The rockbreaker folds into the cover it tried to own.',
  },
});
