// AC-10 external-only populated-island contact. The encounter director owns the one-shot entry
// admission and supplies the threat-tier roster/position; this definition keeps the result on the
// ordinary catalog, ambush runtime, doctrine, causality, and spawn-budget route without turning the
// authored ambush_snare into a generic all-space encounter.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 25;
export const trigger = deepFreeze({
  id: 'arcade_island_contact',
  tier: 'minor',
  deck: 'combat',
  weight: 1,
  zoneTypes: [
    'mining_belt',
    'refinery_approach',
    'outlaw_zone',
    'ambush_lane',
    'derelict_field',
  ],
  script: 'ambush',
  pressureCost: 0,
  cooldownS: 0,
  proximity: true,
  gates: { externalOnly: true },
});

export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  context: 'encounter',
  squad: {
    archetypes: ['wasp_swarmer'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
});
