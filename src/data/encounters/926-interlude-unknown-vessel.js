// INTERLUDE — THE UNKNOWN VESSEL (W-CANON, build_map row 537, §34.7).
// Quiet scene: the hull-spotter's buoy on the 47-A lane still holds the Cycle 17 log.
// External-only — requested by the campaign interlude stepper, never rolled by planners.
// Canon text: docs/worldbuilding/story/THE-STORYLINE.md — INTERLUDE: THE UNKNOWN VESSEL.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "interlude_unknown_vessel",
  "title": "INTERLUDE — THE UNKNOWN VESSEL",
  "factionId": "faction_free",
  "start": "prop",
  "cast": [],
  "choices": [
    {
      "id": "a",
      "label": "Read the log",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "phases": [
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "HULL-SPOTTER BUOY — S4",
      "dx": 40,
      "dz": -24,
      "radius": 7,
      "mass": 40,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "A hull-spotter's buoy still broadcasts on the 47-A lane. Its log is a cycle old.",
      "channel": "info",
      "primary": true,
      "next": "await_approach"
    },
    {
      "id": "await_approach",
      "verb": "await",
      "timeoutS": 480,
      "timeoutLine": "The buoy keeps its loop. The log waits for another pass.",
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
      "line": "SPOTTER LOG / S4 / CYCLE 17 — UNKNOWN HULL. NO REGISTRY. NO TRANSPONDER ECHO.",
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
      "line": "DEPARTED THE 47-A INTERCEPT WINDOW FOUR MINUTES AFTER CARGO DRONE 03.",
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
      "line": "IT DID NOT RUN. IT LEFT. Whoever it was had not been hunting — they had been confirming the bait was loaded.",
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

export const encounterOrder = 926;
export const trigger = deepFreeze({
  "id": "interlude_unknown_vessel",
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
  "title": "INTERLUDE — THE UNKNOWN VESSEL",
  "primaryLine": "A hull-spotter's buoy still broadcasts on the 47-A lane. Its log is a cycle old.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Read the log",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "receipts": {
    "seen": "The buoy kept the number. IT DID NOT RUN. IT LEFT."
  }
});
