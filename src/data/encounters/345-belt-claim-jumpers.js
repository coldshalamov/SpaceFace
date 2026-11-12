// 345 — Belt claim-jumpers. Ceres only.
// Two light hulls on a miner who is still cutting. Not a renamed ambush, and not a
// shape Vesta or Tethys can be left alone with.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 345;
export const trigger = deepFreeze({
  id: 'belt_claim_jumpers',
  tier: 'minor',
  deck: 'combat',
  weight: 2,
  zoneTypes: ['mining_belt', 'refinery_approach'],
  script: 'ambush',
  pressureCost: 25,
  cooldownS: 420,
  proximity: true,
  gates: {
    sectorIds: ['sector_ceres_belt'],
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'claim',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  factionId: 'faction_reach',
  context: 'encounter',
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  title: 'CLAIM JUMPERS',
  primaryLine: 'Two Wasps are on a miner who is still cutting. Drive them off or the claim is theirs.',
  telegraph: 'Claim jumpers on a live miner. The cut is already started.',
  squad: {
    archetypes: ['wasp_swarmer'],
    size: [2, 2],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  claimVictim: {
    archetype: 'mule_trader',
    factionId: 'faction_dmc',
    scanLabel: 'Miner — still cutting the claim',
  },
  bark: 'ambush_tele',
  receipts: {
    cleared: 'The jumpers are gone. The miner goes back to the cut.',
    escaped: 'The jumpers peel off. The miner is still on the claim.',
  },
});
