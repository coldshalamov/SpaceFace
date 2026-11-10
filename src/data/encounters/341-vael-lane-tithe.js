// 341 — Vael lane tithe. Wardens hold the lane for a transit tax: pay the tithe,
// refuse the screen, or burn off-axis. The toll script's rep now follows the shape's
// faction, so Vael payers cool Vael lanes instead of Reach ones.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 341;
export const trigger = deepFreeze({
  id: 'vael_lane_tithe',
  tier: 'minor',
  deck: 'combat',
  weight: 0.9,
  zoneTypes: ['trade_lane', 'ambush_lane'],
  script: 'toll',
  pressureCost: 55,
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
    actor: 'faction_vael',
  },
  motive: 'cargo_extortion',
  engagementTrigger: 'demand_pending',
  factionId: 'faction_vael',
  context: 'encounter',
  squad: {
    anchorArchetype: 'warden_escort',
    archetypes: ['warden_escort'],
    size: [2, 3],
    doctrine: 'official',
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
      label: 'Refuse the screen',
    },
    {
      id: 'run',
      label: 'Burn off-axis',
    },
  ],
  timeoutChoice: 'refuse',
});
