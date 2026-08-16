// A sparse two-hull denial team leaves enough open geometry to bait, cross, and reverse the
// Torcher's physical trail rather than burying the counter in a crowded damage scrum.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 349;
export const trigger = deepFreeze({
  id: 'medium_torcher_fireline',
  tier: 'minor',
  deck: 'combat',
  weight: 0.5,
  zoneTypes: ['derelict_field', 'outlaw_zone', 'ambush_lane'],
  script: 'ambush',
  pressureCost: 46,
  cooldownS: 900,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.68,
  },
});
export default defineEncounter(trigger, {
  motive: 'plasma_lane_denial',
  engagementTrigger: 'player_enters_fireline',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'FIRELINE TURN',
  primaryLine: 'THERMAL WAKE: a Torcher is laying a fireline with one fast spotter holding the turn.',
  squad: {
    anchorArchetype: 'torcher_denial',
    archetypes: ['flea_swarmer'],
    size: [2, 2],
    doctrine: 'balanced',
    formation: 'loose',
  },
  bark: 'ambush_tele',
  telegraph: 'Two contacts, open lane. Bait the trail, reverse, and put the Torcher through its own line.',
  aftermath: {
    flee: 'The spotter drops its rig as the fireline collapses.',
    kill: 'The Torcher crosses its own wake and the denial lane opens.',
  },
});
