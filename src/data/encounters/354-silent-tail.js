// 354 — Silent tail. A quiet_ghost element shadows the lane from extreme standoff —
// never closes, never fires unless cornered. The player decides what a shadow is worth.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 354;
export const trigger = deepFreeze({
  id: 'silent_tail',
  tier: 'ambient',
  deck: 'combat',
  weight: 0.9,
  zoneTypes: ['nebula_fog', 'derelict_field', 'outlaw_zone'],
  script: 'whisper',
  pressureCost: 18,
  cooldownS: 620,
  proximity: true,
  gates: {
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'anomaly',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_quiet',
  },
  motive: 'manifest_predation',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_quiet',
  context: 'encounter',
  title: 'A SHADOW ON THE SCOPE',
  primaryLine: 'SCOPE NOTE: contacts matching your heading at extreme range for nine minutes now. They are not lost.',
  squad: {
    anchorArchetype: 'quiet_ghost',
    archetypes: ['quiet_ghost'],
    size: [3, 4],
    doctrine: 'balanced',
    squadRecipe: 'recon_shadow',
    formation: 'loose',
  },
  bark: 'scan_tell_bait',
  telegraph: 'The tail holds its distance. It has learned it.',
});
