// 355 — Relay convoy raid. A wolfpack quarters a running convoy — the haulers run the
// lane while raiders peel off the escort. The player can raid the hold or guard it.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 355;
export const trigger = deepFreeze({
  id: 'relay_convoy_raid',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['trade_lane', 'refinery_approach'],
  script: 'convoy',
  pressureCost: 48,
  cooldownS: 580,
  proximity: true,
  gates: {
    maxSecurity: 0.75,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'PACK ON THE RELAY',
  primaryLine: 'TRAFFIC ALERT: convoy under quartering attack. The raiders are peeling the escort off the lane.',
  squad: {
    anchorArchetype: 'reaver_pirate',
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [4, 5],
    doctrine: 'scavenger',
    squadRecipe: 'wolfpack_quarter',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [2, 3],
    factionId: 'faction_free',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: 'convoy_depart',
  telegraph: 'The pack quarters the lane. The haulers do not slow down.',
});
