// 331 — PD screen wall. Forces peel-the-escort / hold-missiles play.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 331;
export const trigger = deepFreeze({
  id: 'pd_screen_wall',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'trade_lane'],
  script: 'ambush',
  pressureCost: 44,
  cooldownS: 500,
  proximity: true,
  gates: {
    maxSecurity: 0.6,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'PD SCREEN WALL',
  primaryLine: 'SQUAD CONTACT: flak curtain ahead of a prize ship. Missiles die first.',
  squad: {
    archetypes: ['pd_screen_escort', 'reaver_pirate'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'attack',
  telegraph: 'Point-defense curtain spinning up. Hold missiles.',
  aftermath: {
    flee: 'Escort dumps chaff and tows the prize out of sensor range.',
    kill: 'Flak barrels and scorched plating mark the curtain line.',
  },
});
