// SCOOP ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_refinery_approach_puzzle_pitborn_follow_on",
  "title": "SCOOP ON THE REFINERY APPROACH",
  "factionId": "faction_pitborn",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "bruiser_brawler",
      "factionId": "faction_pitborn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "PIT 1"
    },
    {
      "role": "hull_1",
      "archetype": "bruiser_brawler",
      "factionId": "faction_pitborn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "PIT 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Check the first mark",
      "playerLine": "I will check the scoop mark against the older count."
    },
    {
      "id": "b",
      "label": "Compare both books",
      "playerLine": "Put both ledgers side by side and read the gap aloud."
    },
    {
      "id": "c",
      "label": "Leave it unsolved",
      "playerLine": "I will not guess. Leave the scoop count open."
    }
  ],
  "timeoutChoice": "c",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "PIT: The scoop count fails at refinery approach. Find which mark does not belong.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "ring",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The answer is written in the part the clerk crossed out.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "PIT keeps the pencil beside the blank, not the sum.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The scoop has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "refinery approach does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "ring",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "PIT: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "ring",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "First mark checked. The mismatch begins one line below it.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_refinery_approach_puzzle_pitborn_follow_on",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_pitborn",
      "delta": 2,
      "reason": "lived_refinery_approach_puzzle_pitborn_follow_on",
      "next": "done_a"
    },
    {
      "id": "done_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "Books compared. PIT found the same missing entry twice.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_pitborn",
      "delta": 2,
      "reason": "lived_refinery_approach_puzzle_pitborn_follow_on",
      "next": "done_b"
    },
    {
      "id": "done_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left it open. The count still waits at refinery approach.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_pitborn",
      "delta": -1,
      "reason": "lived_refinery_approach_puzzle_pitborn_follow_on",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 521;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_puzzle_pitborn_follow_on",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "refinery_approach"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 900,
  "proximity": true,
  "rare": true,
  "gates": {
    "externalOnly": true
  }
});
export const runtime = compileVignette(spec);
export default defineEncounter(trigger, {
  "shape": {
    "situation": "puzzle",
    "place": "refinery_approach",
    "twist": "follow_on",
    "actor": "faction_pitborn"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SCOOP ON THE REFINERY APPROACH",
  "primaryLine": "PIT: The scoop count fails at refinery approach. Find which mark does not belong.",
  "factionId": "faction_pitborn",
  "choices": [
    {
      "id": "a",
      "label": "Check the first mark",
      "playerLine": "I will check the scoop mark against the older count."
    },
    {
      "id": "b",
      "label": "Compare both books",
      "playerLine": "Put both ledgers side by side and read the gap aloud."
    },
    {
      "id": "c",
      "label": "Leave it unsolved",
      "playerLine": "I will not guess. Leave the scoop count open."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "First mark checked. The mismatch begins one line below it.",
    "b": "Books compared. PIT found the same missing entry twice.",
    "c": "You left it open. The count still waits at refinery approach."
  }
});
