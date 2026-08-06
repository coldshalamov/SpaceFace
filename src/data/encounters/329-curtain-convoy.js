// 329 — PD curtain over a fleeing trader. Player can defend or take the kill.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 329;
export const trigger = deepFreeze({
  id: 'curtain_convoy',
  tier: 'minor',
  deck: 'combat',
  weight: 1.3,
  zoneTypes: ['trade_lane', 'ambush_lane', 'refinery_approach'],
  script: 'convoy',
  pressureCost: 40,
  cooldownS: 450,
  proximity: true,
  gates: {
    maxSecurity: 0.65,
    minStoryBeat: 1,
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'CURTAIN OVER THE CONVOY',
  primaryLine: 'TRAFFIC ALERT: freighter under PD screen. Raiders want the hold; the escort wants the lane.',
  squad: {
    archetypes: ['pd_screen_escort', 'reaver_pirate', 'mine_layer_jackal'],
    size: [2, 4],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
  },
  bark: 'attack',
  choices: [
    { id: 'defend', label: 'Cover the freighter' },
    { id: 'raid', label: 'Join the claim' },
    { id: 'pass', label: 'Keep clear' },
  ],
  timeoutChoice: 'pass',
});
