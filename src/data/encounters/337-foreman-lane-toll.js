// 337 — Foreman lane toll. A Mirrorjaw Foreman holds the lane with throwable
// swarmers: pay the tithe, refuse the charge, or burn off-axis. First open-route
// toll anchored by a heavy; pirate_toll stays the light crew.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 337;
export const trigger = deepFreeze({
  id: 'foreman_lane_toll',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  zoneTypes: ['trade_lane', 'ambush_lane'],
  script: 'toll',
  pressureCost: 60,
  cooldownS: 600,
  proximity: true,
  gates: {
    minCargoValue: 200,
    maxSecurity: 0.7,
    storyBeatMin: 1,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'toll',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_extortion',
  engagementTrigger: 'demand_pending',
  factionId: 'faction_reach',
  context: 'encounter',
  squad: {
    anchorArchetype: 'mirrorjaw_foreman',
    archetypes: ['wasp_swarmer'],
    size: [3, 4],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'toll_demand',
  offerS: 14,
  choices: [
    {
      id: 'pay',
      label: 'Pay the tithe',
      needs: 'credits',
    },
    {
      id: 'refuse',
      label: 'Refuse the charge',
    },
    {
      id: 'run',
      label: 'Burn off-axis',
    },
  ],
  timeoutChoice: 'refuse',
});
