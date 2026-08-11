// 336 - Tether-control hunter. Rare higher-tier control duel.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 336;
export const trigger = deepFreeze({
  id: 'tether_control_raider_hunter',
  tier: 'minor',
  deck: 'combat',
  weight: 0.25,
  zoneTypes: ['ambush_lane', 'border_checkpoint', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 60,
  cooldownS: 1200,
  proximity: true,
  rare: true,
  gates: {
    minSectorTier: 4,
    maxSecurity: 0.6,
    storyBeatMin: 2,
  },
});

export default defineEncounter(trigger, {
  motive: 'massline_counter_hunt',
  engagementTrigger: 'player_signature_massline_use',
  factionId: 'faction_quiet',
  context: 'bounty_hunter',
  title: 'CONTROL HUNTER',
  primaryLine: 'HUNTER CONTACT: hostile Massline specialist committing to your line.',
  squad: {
    anchorArchetype: 'tether_control_raider',
    archetypes: ['quiet_ghost', 'corsair_raider'],
    size: [2, 3],
    doctrine: 'balanced',
    formation: 'loose',
  },
  bark: 'bounty_notice',
  telegraph: 'Hostile Massline specialist committing to your line.',
  aftermath: {
    flee: 'The hunter loses anchor and ghosts out of the lane.',
    kill: 'The control hunter is gone; your Massline runs uncontested.',
  },
});
