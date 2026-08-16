// One guaranteed Carrier-lite enters with an ordinary escort, then its two physical bays launch
// the bounded five-craft screen. Stripping a bay removes exactly that bay's remaining capacity.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 344;
export const trigger = deepFreeze({
  id: 'heavy_carrier_lite_screen',
  tier: 'minor',
  deck: 'combat',
  weight: 0.38,
  zoneTypes: ['trade_lane', 'patrol_corridor', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 82,
  cooldownS: 1320,
  proximity: true,
  gates: { minSectorTier: 3, maxSecurity: 0.58 },
});

export default defineEncounter(trigger, {
  motive: 'carrier_screen_interdiction',
  engagementTrigger: 'player_enters_launch_lane',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'HANGAR FLASH',
  primaryLine: 'HEAVY CONTACT: paired bays are throwing a light screen into the lane.',
  squad: {
    anchorArchetype: 'heavy_carrier_lite',
    archetypes: ['reaver_pirate', 'dart_swarmer'],
    size: [2, 3],
    doctrine: 'anchor',
    formation: 'screen',
  },
  bark: 'ambush_tele',
  telegraph: 'The bay mouths are live. Strip one before its share of the screen clears the hull.',
  aftermath: {
    flee: 'The surviving screen breaks away from the dark bays.',
    kill: 'The carrier drifts with its launch mouths cold.',
  },
});
