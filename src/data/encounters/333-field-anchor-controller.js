// 333 — Field-anchor controller. Rare specialist packet: one heavy anchor + escorts.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 333;
export const trigger = deepFreeze({
  id: 'field_anchor_controller',
  tier: 'minor',
  deck: 'combat',
  weight: 0.55,
  zoneTypes: ['ambush_lane', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 52,
  cooldownS: 900,
  proximity: true,
  rare: true,
  gates: {
    minSectorTier: 3,
    maxSecurity: 0.55,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  motive: 'area_control_interdiction',
  engagementTrigger: 'player_in_anchor_radius',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'ANCHOR FIELD CONTROLLER',
  primaryLine: 'HEAVY CONTACT: anchor hull winding a drag field. Move the hull or leave the radius.',
  squad: {
    anchorArchetype: 'field_anchor_controller',
    archetypes: ['wasp_swarmer', 'corsair_raider'],
    size: [4, 5],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Anchor field winding. Break radius or move the hull.',
  aftermath: {
    flee: 'Anchor drops formation and the escorts scatter out of the wake.',
    kill: 'The field collapses with the command hull.',
  },
});
