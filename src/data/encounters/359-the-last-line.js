// 359 — The last line. A remnant patrol element — hulls the sector wrote off — holds a
// standoff gunline across the corridor. They do not chase. They volley, and they wait.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 359;
export const trigger = deepFreeze({
  id: 'the_last_line',
  tier: 'major',
  deck: 'combat',
  weight: 0.8,
  zoneTypes: ['patrol_corridor', 'border_checkpoint'],
  script: 'patrolScan',
  pressureCost: 55,
  cooldownS: 640,
  proximity: true,
  gates: {
    minSectorTier: 3,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'patrol',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_scn',
  },
  motive: 'lawful_inspection',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_scn',
  context: 'encounter',
  title: 'THE LAST LINE',
  primaryLine: 'TRAFFIC ALERT: remnant patrol element holding the corridor on a firing line. They are not coming to you.',
  squad: {
    anchorArchetype: 'patrol_lawman',
    archetypes: ['patrol_lawman', 'pd_screen_escort'],
    size: [4, 5],
    doctrine: 'official',
    squadRecipe: 'standoff_gunline',
    formation: 'loose',
  },
  bark: 'patrol_scan_hail',
  telegraph: 'The line forms. The volley cycle starts.',
});
