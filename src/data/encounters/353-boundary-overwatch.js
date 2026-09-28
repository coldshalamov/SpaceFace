// 353 — Boundary overwatch. An SCN customs element works a corridor in bounding pairs:
// one element parks and covers while the other bounds forward. Disciplined, unhurried,
// and very hard to slip.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 353;
export const trigger = deepFreeze({
  id: 'boundary_overwatch',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  zoneTypes: ['patrol_corridor', 'border_checkpoint', 'trade_lane'],
  script: 'patrolScan',
  pressureCost: 36,
  cooldownS: 540,
  proximity: true,
  gates: {
    minSectorTier: 2,
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
  title: 'BOUNDARY OVERWATCH',
  primaryLine: 'TRAFFIC ALERT: SCN overwatch element bounding the corridor. Hold for scan or clear the lane.',
  squad: {
    anchorArchetype: 'patrol_lawman',
    archetypes: ['patrol_lawman', 'customs_cutter'],
    size: [3, 4],
    doctrine: 'official',
    squadRecipe: 'overwatch_ladder',
    formation: 'loose',
  },
  bark: 'patrol_scan_hail',
  telegraph: 'The covering element parks. The bounding element moves.',
});
