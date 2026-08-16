// A guaranteed Gunship claims the open lane while ordinary raiders punish tunnel vision. Its
// mounts, not an abstract elite-health multiplier, are the readable way to dismantle the pressure.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 342;
export const trigger = deepFreeze({
  id: 'heavy_gunship_turret_boat',
  tier: 'minor',
  deck: 'combat',
  weight: 0.42,
  zoneTypes: ['trade_lane', 'patrol_corridor', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 76,
  cooldownS: 1200,
  proximity: true,
  gates: { minSectorTier: 3, maxSecurity: 0.62 },
});

export default defineEncounter(trigger, {
  motive: 'heavy_lane_interdiction',
  engagementTrigger: 'player_crosses_gunship_lane',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'RING BATTERY',
  primaryLine: 'HEAVY CONTACT: a Gunship is bringing every turret ring onto the lane.',
  squad: {
    anchorArchetype: 'heavy_gunship',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [2, 3],
    doctrine: 'anchor',
    formation: 'ring',
  },
  bark: 'ambush_tele',
  telegraph: 'The rings can bear in every direction. Strip the mounts; the hull is useful afterward.',
  aftermath: {
    flee: 'The screen breaks away from the disabled battery hull.',
    kill: 'The ring battery becomes another piece of moving terrain.',
  },
});
