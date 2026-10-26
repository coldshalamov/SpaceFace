// INTERLUDE — THE SMELL TICKET (W-CANON, build_map row 537, §34.7).
// Quiet scene: the twelve-point-four-tonne catalyst grid still racked off the bay, tag on.
// External-only — requested by the campaign interlude stepper, never rolled by planners.
// Canon text: docs/worldbuilding/story/THE-STORYLINE.md — INTERLUDE: THE SMELL TICKET.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "interlude_the_smell_ticket",
  "title": "INTERLUDE — THE SMELL TICKET",
  "factionId": "faction_free",
  "start": "prop",
  "cast": [],
  "choices": [
    {
      "id": "a",
      "label": "Read the tag",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "phases": [
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "RECYCLER CATALYST GRID — 12.4 T — RACKED",
      "dx": 40,
      "dz": -24,
      "radius": 10,
      "mass": 62,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "A recycler catalyst grid hangs racked off the bay apron, and the tag is still on it.",
      "channel": "info",
      "primary": true,
      "next": "await_approach"
    },
    {
      "id": "await_approach",
      "verb": "await",
      "timeoutS": 480,
      "timeoutLine": "The grid sits. The ticket stays closed.",
      "steps": [
        {
          "kind": "near",
          "of": "prop",
          "dist": 110
        }
      ],
      "next": "log_0"
    },
    {
      "id": "log_0",
      "verb": "say",
      "line": "TAG: RECEIVED YEAR 3 / INSTALL PENDING. ISSUED YEAR 17 — WEEK OF 47-A.",
      "channel": "info",
      "next": "beat_0"
    },
    {
      "id": "beat_0",
      "verb": "motion",
      "seconds": 4,
      "motion": "hold",
      "next": "log_1"
    },
    {
      "id": "log_1",
      "verb": "say",
      "line": "Bay maintenance queue, ticket 88,214: the new air smelled faintly of machine oil. Duration: one week. Status: CLOSED — NO ACTION REQUIRED.",
      "channel": "info",
      "next": "beat_1"
    },
    {
      "id": "beat_1",
      "verb": "motion",
      "seconds": 4,
      "motion": "hold",
      "next": "log_2"
    },
    {
      "id": "log_2",
      "verb": "say",
      "line": "Forty thousand people breathing chalk for the fourteenth consecutive year. The form was correct. The form had always been correct.",
      "channel": "info",
      "next": "done"
    },
    {
      "id": "done",
      "verb": "resolve",
      "outcome": "seen"
    }
  ]
};

export const encounterOrder = 931;
export const trigger = deepFreeze({
  "id": "interlude_the_smell_ticket",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "trade_lane"
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
    "situation": "salvage",
    "place": "trade_lane",
    "twist": "none",
    "actor": "none"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "found",
  "title": "INTERLUDE — THE SMELL TICKET",
  "primaryLine": "A recycler catalyst grid hangs racked off the bay apron, and the tag is still on it.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Read the tag",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "receipts": {
    "seen": "Ticket 88,214. CLOSED — NO ACTION REQUIRED. The form was correct."
  }
});
