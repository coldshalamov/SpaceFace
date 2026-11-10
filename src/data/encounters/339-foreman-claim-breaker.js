// 339 — Foreman claim breaker. A Mirrorjaw Foreman with corsair muscle strips a
// working NPC claim in the belt; the player walks into the middle of the job.
// claim_threat stays the player-claim defense script — this is the other side.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 339;
export const trigger = deepFreeze({
  id: 'foreman_claim_breaker',
  tier: 'minor',
  deck: 'combat',
  weight: 0.8,
  zoneTypes: ['mining_belt'],
  script: 'ambush',
  pressureCost: 55,
  cooldownS: 720,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.65,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'claim',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'FOREMAN CLAIM BREAKER',
  primaryLine: 'HEAVY CONTACT: a Mirrorjaw Foreman strips the claim. Drive it off or pick the scraps.',
  squad: {
    anchorArchetype: 'mirrorjaw_foreman',
    archetypes: ['corsair_raider'],
    size: [2, 3],
    doctrine: 'scavenger',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Foreman breaking the claim. It has already committed.',
  aftermath: {
    flee: 'The breakers withdraw with what they already cut.',
    kill: 'The claim goes back to work; the Foreman does not.',
  },
});
