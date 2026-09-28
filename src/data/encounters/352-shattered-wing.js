// 352 — Shattered wing. Jackals circling a crippled patrol hull, tearing at it in a
// burst swarm — interrupt the feeding and the whole pack turns on you at once.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 352;
export const trigger = deepFreeze({
  id: 'shattered_wing',
  tier: 'minor',
  deck: 'combat',
  weight: 1.2,
  zoneTypes: ['derelict_field', 'outlaw_zone', 'ambush_lane'],
  script: 'ambush',
  pressureCost: 42,
  cooldownS: 460,
  proximity: true,
  gates: {
    minSectorTier: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE PACK AT A KILL',
  primaryLine: 'FIELD REPORT: patrol hull venting. A swarm is already on the wound — and it sees you seeing it.',
  squad: {
    anchorArchetype: 'wasp_swarmer',
    archetypes: ['wasp_swarmer', 'reaver_pirate'],
    size: [4, 6],
    doctrine: 'scavenger',
    squadRecipe: 'swarm_burst',
    formation: 'loose',
  },
  bark: 'ambush_spring',
  telegraph: 'Every hull in the pack turns at once.',
});
