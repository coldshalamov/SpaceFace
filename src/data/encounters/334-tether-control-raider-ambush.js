// 334 - Tether-control raider. Rare specialist: enemy Massline contest.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 334;
export const trigger = deepFreeze({
  id: 'tether_control_raider_ambush',
  tier: 'minor',
  deck: 'combat',
  weight: 0.5,
  zoneTypes: ['ambush_lane', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 54,
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
  motive: 'massline_interdiction',
  engagementTrigger: 'player_massline_active',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'TETHER-CONTROL RAIDER',
  primaryLine: 'SPECIALIST CONTACT: enemy Massline spooling. Displace, break anchor, or outmass it.',
  squad: {
    anchorArchetype: 'tether_control_raider',
    archetypes: ['wasp_swarmer', 'reaver_pirate'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Enemy Massline spooling. Displace, break anchor, or outmass it.',
  aftermath: {
    flee: 'The specialist drops the contested line and burns out of the wake.',
    kill: 'The hostile Massline dies with the specialist hull.',
  },
});
