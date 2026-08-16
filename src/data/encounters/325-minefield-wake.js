// 325 — Minefield in the wake. One guaranteed Jackal owns the specialist read; ordinary hulls
// screen it without adding a second specialist puzzle.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 325;
export const trigger = deepFreeze({
  id: 'minefield_wake',
  tier: 'minor',
  deck: 'combat',
  weight: 1.4,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'trade_lane', 'refinery_approach'],
  script: 'ambush',
  pressureCost: 45,
  cooldownS: 480,
  proximity: true,
  gates: {
    minCargoValue: 180,
    maxSecurity: 0.7,
    storyBeatMin: 1,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  motive: 'cargo_extortion',
  engagementTrigger: 'demand_pending',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'MINEFIELD IN THE WAKE',
  primaryLine: 'LANE CONTACT: seeded wake signature. Someone wants your cargo more than a clean fight.',
  squad: {
    anchorArchetype: 'mine_layer_jackal',
    archetypes: ['wasp_swarmer', 'reaver_pirate'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'loose',
  },
  bark: 'toll_demand',
  telegraph: 'Wake mines arming. Break the trail.',
  aftermath: {
    flee: 'Jackal dumps scrap and seeds a second wake on exit.',
    kill: 'Mine rack scrap and a half-finished weigh-slip remain.',
  },
  offerS: 12,
  choices: [
    { id: 'pay', label: 'Jettison a tithe', needs: 'cargo' },
    { id: 'refuse', label: 'Clear the wake' },
    { id: 'run', label: 'Burn off-axis' },
  ],
  timeoutChoice: 'refuse',
});
