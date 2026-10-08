// FILE CLOSED, CREW NOT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "file_closed_crew",
  "title": "FILE CLOSED, CREW NOT",
  "factionId": "faction_helix",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": 0,
      "dz": 0,
      "scanLabel": "HX-19 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": -150,
      "dz": 90,
      "scanLabel": "HX-19 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Join the slow file",
      "playerLine": "Joining the file."
    },
    {
      "id": "b",
      "label": "Name the missing",
      "playerLine": "Naming the missing."
    },
    {
      "id": "c",
      "label": "Let it close wrong",
      "playerLine": "Close it wrong."
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
      "line": "HX-19 — VARIANCE FILE CLOSED. CREW COUNT DOES NOT MATCH. DO NOT RESOLVE.",
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
      "line": "A closure parade whose headcount disagrees with the door.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "Do not resolve is an order, not a mood.",
      "channel": "info",
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
      "line": "HX-19: Still on the patrol corridor. The file closed, crew not does not hurry.",
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
      "line": "You joined. Paper stays shut. A bunk does not.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "file_closed_crew",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "file_closed_crew",
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
      "line": "You named them. The file did not reopen. The bunk did.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "file_closed_crew",
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
      "line": "Closed wrong. Helix will keep the discrepancy as a souvenir.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": -1,
      "reason": "file_closed_crew",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 388;
export const trigger = deepFreeze({
  "id": "file_closed_crew",
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
    "situation": "archive",
    "place": "patrol_corridor",
    "twist": "none",
    "actor": "faction_helix"
  },
  "livedVignette": true,
  "title": "FILE CLOSED, CREW NOT",
  "primaryLine": "HX-19 — VARIANCE FILE CLOSED. CREW COUNT DOES NOT MATCH. DO NOT RESOLVE.",
  "factionId": "faction_helix",
  "choices": [
    {
      "id": "a",
      "label": "Join the slow file",
      "playerLine": "Joining the file."
    },
    {
      "id": "b",
      "label": "Name the missing",
      "playerLine": "Naming the missing."
    },
    {
      "id": "c",
      "label": "Let it close wrong",
      "playerLine": "Close it wrong."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You joined. Paper stays shut. A bunk does not.",
    "b": "You named them. The file did not reopen. The bunk did.",
    "c": "Closed wrong. Helix will keep the discrepancy as a souvenir."
  }
});
