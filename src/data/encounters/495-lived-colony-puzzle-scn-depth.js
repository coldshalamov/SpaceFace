// CRADLE ON THE COLONY — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_colony_puzzle_scn_depth",
  "title": "CRADLE ON THE COLONY",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CLERK 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CLERK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Check the first mark",
      "playerLine": "I will check the cradle mark against the older count."
    },
    {
      "id": "b",
      "label": "Compare both books",
      "playerLine": "Put both ledgers side by side and read the gap aloud."
    },
    {
      "id": "c",
      "label": "Leave it unsolved",
      "playerLine": "I will not guess. Leave the cradle count open."
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
      "line": "CLERK: The cradle count fails at colony. Find which mark does not belong.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "creep",
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
      "motion": "creep",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "CLERK keeps the pencil beside the blank, not the sum.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The cradle has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "colony does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "creep",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "CLERK: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "creep",
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
      "reason": "lived_colony_puzzle_scn_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_colony_puzzle_scn_depth",
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
      "line": "Books compared. CLERK found the same missing entry twice.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_colony_puzzle_scn_depth",
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
      "line": "You left it open. The count still waits at colony.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "lived_colony_puzzle_scn_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 495;
export const trigger = deepFreeze({
  "id": "lived_colony_puzzle_scn_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "colony"
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
    "place": "colony",
    "twist": "depth",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CRADLE ON THE COLONY",
  "primaryLine": "CLERK: The cradle count fails at colony. Find which mark does not belong.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Check the first mark",
      "playerLine": "I will check the cradle mark against the older count."
    },
    {
      "id": "b",
      "label": "Compare both books",
      "playerLine": "Put both ledgers side by side and read the gap aloud."
    },
    {
      "id": "c",
      "label": "Leave it unsolved",
      "playerLine": "I will not guess. Leave the cradle count open."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "First mark checked. The mismatch begins one line below it.",
    "b": "Books compared. CLERK found the same missing entry twice.",
    "c": "You left it open. The count still waits at colony."
  }
});
