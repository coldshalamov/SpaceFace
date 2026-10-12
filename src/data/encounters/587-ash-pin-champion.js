// 587 — Ash-pin champion. A Sker duel champion holds the ring and hails for a bounded
// exchange: accept and it squares, announces, and flies rule-bound passes; run and the
// ring lets you go. Silence counts as acceptance — a champion reads a held bearing as a yes.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 587;
export const trigger = deepFreeze({
  id: 'ash_pin_champion',
  tier: 'minor',
  deck: 'combat',
  weight: 0.8,
  zoneTypes: ['outlaw_zone', 'ambush_lane', 'mining_belt'],
  script: 'ambush',
  pressureCost: 44,
  cooldownS: 660,
  proximity: false,
  rare: true,
  gates: {
    // Sker payday-duel territory (the ash-pin rings) and the wider Reach sectors the circuit
    // tours. Never lawful space: nobody sells a ring seat under a Concord flag.
    sectorIds: ['sector_sker_haven', 'sector_ashfall_reach'],
    maxSecurity: 0.3,
    storyBeatMin: 2,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
  motive: 'sport_duel',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE ASH-PIN CHALLENGE',
  primaryLine: 'DUEL CHALLENGE: a champion holds the ring ahead. Ring rules — bounded passes, first to yield. Answer or keep burning.',
  squad: {
    anchorArchetype: 'enemy_duel_champion',
    archetypes: ['enemy_duel_champion'],
    size: [1, 1],
    doctrine: 'balanced',
    formation: 'loose',
  },
  bark: 'duel_challenge_demand',
  offerS: 14,
  timeoutChoice: 'accept',
  choices: [
    { id: 'accept', label: 'Take the ring', playerLine: 'Ring rules. Square us up.' },
    { id: 'run', label: 'Decline and burn off', playerLine: 'Not my ring. I am already gone.' },
  ],
  springBark: 'duel_ring_live',
  ackBarks: {
    refused: 'duel_accept_spring',
    flee: 'duel_decline_ack',
  },
  telegraph: 'The champion is squaring. Watch for the challenge cue, then win the exchange.',
  aftermath: {
    flee: 'The ring keeps its ledger. The champion counts your name among the declines.',
    kill: 'The ash-pin ring pays out on your name tonight.',
  },
});
