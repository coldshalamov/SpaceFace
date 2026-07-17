// 327 — A Quiet ghost on long-range bearing. Sniper disengage after alpha.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 327;
export const trigger = deepFreeze({
  id: 'ghost_on_the_bearing',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field', 'border_checkpoint'],
  script: 'ambush',
  pressureCost: 48,
  cooldownS: 540,
  proximity: false,
  gates: {
    maxSecurity: 0.55,
    minStoryBeat: 2,
  },
});

export default defineEncounter(trigger, {
  motive: 'assassination',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_quiet',
  context: 'encounter',
  title: 'GHOST ON THE BEARING',
  primaryLine: 'SENSOR GHOST: one hard lock, then static. Someone is paid to miss the paperwork.',
  squad: {
    archetypes: ['quiet_ghost', 'lancer_sniper'],
    size: [1, 2],
    doctrine: 'balanced',
    formation: 'loose',
  },
  bark: 'bounty_notice',
  telegraph: 'Sensor ghost blooming. Trust the drive flare.',
  aftermath: {
    flee: 'The ghost reappears on a new bearing with the same lock tone.',
    kill: 'Quiet leaves no wreck name — only a blank receipt.',
  },
});
