// A pursuit file with one guaranteed medium Interceptor and fast lights that make its cutoff role
// legible on a lane without replacing the medium's Momentum Sink counter.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 347;
export const trigger = deepFreeze({
  id: 'medium_interceptor_cutoff',
  tier: 'minor',
  deck: 'combat',
  weight: 0.65,
  zoneTypes: ['ambush_lane', 'trade_lane', 'patrol_corridor'],
  script: 'ambush',
  pressureCost: 44,
  cooldownS: 780,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.72,
  },
});
export default defineEncounter(trigger, {
  motive: 'escape_lane_cutoff',
  engagementTrigger: 'player_crosses_pursuit_lane',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'CUTOFF FILE',
  primaryLine: 'PURSUIT CONTACTS: an Interceptor is taking the far exit while Darts close the lane.',
  squad: {
    anchorArchetype: 'hostile_interceptor',
    archetypes: ['dart_swarmer'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Twin nose on the exit vector. Sink its momentum and walk the inherited frame into cover.',
  aftermath: {
    flee: 'The pursuit file overshoots and breaks apart.',
    kill: 'The cutoff ends where the borrowed frame meets terrain.',
  },
});
