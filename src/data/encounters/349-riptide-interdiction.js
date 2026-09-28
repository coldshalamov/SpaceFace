// 349 — Riptide interdiction. A corsair knife-dance pack works the lane: they don't line
// up, they orbit — four hulls sawing a circle around the mark while the toll runs.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 349;
export const trigger = deepFreeze({
  id: 'riptide_interdiction',
  tier: 'minor',
  deck: 'combat',
  weight: 1.3,
  zoneTypes: ['trade_lane', 'outlaw_zone', 'ambush_lane'],
  script: 'toll',
  pressureCost: 40,
  cooldownS: 420,
  proximity: true,
  gates: {
    minCargoValue: 120,
    maxSecurity: 0.7,
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
  title: 'RIPTIDE ON THE LANE',
  primaryLine: 'LANE CONTACT: raider pack circling the toll buoy. They want a cut, not a corpse.',
  squad: {
    anchorArchetype: 'corsair_raider',
    archetypes: ['corsair_raider', 'wasp_swarmer'],
    size: [4, 4],
    doctrine: 'scavenger',
    squadRecipe: 'knife_dance',
    formation: 'loose',
  },
  bark: 'toll_demand',
  telegraph: 'The pack starts its wheel. The knife is already out.',
  offerS: 14,
  choices: [
    { id: 'pay', label: 'Cut the toll', needs: 'cargo' },
    { id: 'refuse', label: 'Break the wheel' },
    { id: 'run', label: 'Burn for the gate' },
  ],
  timeoutChoice: 'refuse',
});
