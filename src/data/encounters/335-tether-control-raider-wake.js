// 335 - Tether-control wake. Rare specialist placed in outlaw wake fights.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 335;
export const trigger = deepFreeze({
  id: 'tether_control_raider_wake',
  tier: 'minor',
  deck: 'combat',
  weight: 0.35,
  zoneTypes: ['derelict_field', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 56,
  cooldownS: 1020,
  proximity: true,
  rare: true,
  gates: {
    minSectorTier: 3,
    maxSecurity: 0.5,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  motive: 'wake_control',
  engagementTrigger: 'player_crosses_salvage_wake',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'WAKE CONTROL RAIDER',
  primaryLine: 'WAKE CONTACT: Massline specialist holding the crossing. Throw it, break it, or outweigh it.',
  squad: {
    anchorArchetype: 'tether_control_raider',
    archetypes: ['mine_layer_jackal', 'wasp_swarmer'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'Massline specialist holding the crossing. Throw it, break it, or outweigh it.',
  aftermath: {
    flee: 'The wake clears as the controller drops anchor and runs.',
    kill: 'The specialist line collapses across the salvage wake.',
  },
});
