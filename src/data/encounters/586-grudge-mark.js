// 586 — Grudge mark. A Reach contract assassin shadows one hull through grudge territory:
// it never fires during the stalk, locks once, flies a single committed pass, and leaves.
// Choiceless by design — a grudge has no price (the Quiet contract fork owns buyout).
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 586;
export const trigger = deepFreeze({
  id: 'grudge_mark',
  tier: 'minor',
  deck: 'combat',
  weight: 0.7,
  zoneTypes: ['outlaw_zone', 'ambush_lane', 'derelict_field'],
  script: 'ambush',
  pressureCost: 46,
  cooldownS: 720,
  proximity: false,
  rare: true,
  gates: {
    // Sker/Reach grudge territory only: the assassin is a Reach instrument, never a lane event.
    sectorIds: ['sector_sker_haven', 'sector_ashfall_reach', 'sector_veil_nebula'],
    maxSecurity: 0.35,
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
  motive: 'assassination',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'A MARK IN THE GRUDGE LEDGER',
  primaryLine: 'GRUDGE MARK: something has been on your bearing for a while and has not fired. It is waiting for a lock, not a lane.',
  squad: {
    anchorArchetype: 'enemy_assassin',
    archetypes: ['enemy_assassin'],
    size: [1, 1],
    doctrine: 'balanced',
    formation: 'loose',
  },
  bark: 'assassin_mark_tele',
  telegraph: 'Mark lock winding. Move before it finishes counting.',
  aftermath: {
    flee: 'The mark follows the grudge ledger — it will find you on a later bearing.',
    kill: 'The Reach writes the contract off a dead hand. The grudge ledger stays open.',
  },
});
