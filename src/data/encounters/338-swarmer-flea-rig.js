// Flea rig — a light anchor-snare pack working a lawless or industrial approach.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 338;
export const trigger = deepFreeze({
  id: 'swarmer_flea_rig',
  tier: 'minor',
  deck: 'combat',
  weight: 0.45,
  zoneTypes: ['outlaw_zone', 'refinery_approach', 'ambush_lane'],
  script: 'ambush',
  pressureCost: 40,
  cooldownS: 780,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.65,
  },
});

export default defineEncounter(trigger, {
  motive: 'drag_rig_interdiction',
  engagementTrigger: 'player_enters_anchor_geometry',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'FLEA RIG',
  primaryLine: 'FIELD CONTACTS: Fleas are planting drag rigs. Move the anchors before they hold.',
  squad: {
    archetypes: ['flea_swarmer'],
    size: [3, 5],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'Red grapplers opening. Displace the hulls or clear their weak fields.',
  aftermath: {
    flee: 'The Fleas drop their fields and scatter beyond the approach.',
    kill: 'Loose field components tumble through the failed anchor pattern.',
  },
});
