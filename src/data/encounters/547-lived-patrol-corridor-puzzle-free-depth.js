// CONE ON THE PATROL CORRIDOR — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_patrol_corridor_puzzle_free_depth",
  "title": "CONE ON THE PATROL CORRIDOR",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "NELL 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "NELL 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Check the first mark",
      "playerLine": "I will check the cone mark against the older count."
    },
    {
      "id": "b",
      "label": "Compare both books",
      "playerLine": "Put both ledgers side by side and read the gap aloud."
    },
    {
      "id": "c",
      "label": "Leave it unsolved",
      "playerLine": "I will not guess. Leave the cone count open."
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
      "line": "NELL: The cone count fails at patrol corridor. Find which mark does not belong.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "face",
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
      "motion": "face",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "NELL keeps the pencil beside the blank, not the sum.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The cone has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "patrol corridor does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "face",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "NELL: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "face",
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
      "reason": "lived_patrol_corridor_puzzle_free_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_patrol_corridor_puzzle_free_depth",
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
      "line": "Books compared. NELL found the same missing entry twice.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_patrol_corridor_puzzle_free_depth",
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
      "line": "You left it open. The count still waits at patrol corridor.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_patrol_corridor_puzzle_free_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 547;
export const trigger = deepFreeze({
  "id": "lived_patrol_corridor_puzzle_free_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "patrol_corridor"
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
    "place": "patrol_corridor",
    "twist": "depth",
    "actor": "faction_free"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CONE ON THE PATROL CORRIDOR",
  "primaryLine": "NELL: The cone count fails at patrol corridor. Find which mark does not belong.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Check the first mark",
      "playerLine": "I will check the cone mark against the older count."
    },
    {
      "id": "b",
      "label": "Compare both books",
      "playerLine": "Put both ledgers side by side and read the gap aloud."
    },
    {
      "id": "c",
      "label": "Leave it unsolved",
      "playerLine": "I will not guess. Leave the cone count open."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "First mark checked. The mismatch begins one line below it.",
    "b": "Books compared. NELL found the same missing entry twice.",
    "c": "You left it open. The count still waits at patrol corridor."
  }
});
