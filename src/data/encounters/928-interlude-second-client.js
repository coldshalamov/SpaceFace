// INTERLUDE — THE SECOND CLIENT (W-CANON, build_map row 537, §34.7).
// Quiet scene: a booth-broker's tally buoy rides the drift — two payers, one redaction.
// External-only — requested by the campaign interlude stepper, never rolled by planners.
// Canon text: docs/worldbuilding/story/THE-STORYLINE.md — INTERLUDE: THE SECOND CLIENT.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "interlude_second_client",
  "title": "INTERLUDE — THE SECOND CLIENT",
  "factionId": "faction_free",
  "start": "prop",
  "cast": [],
  "choices": [
    {
      "id": "a",
      "label": "Read the tally",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "phases": [
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "BROKER'S TALLY BUOY — UNPOWERED",
      "dx": 40,
      "dz": -24,
      "radius": 7,
      "mass": 40,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "A broker's tally buoy rides the drift off-Grid, still holding a dead booth's ledger.",
      "channel": "info",
      "primary": true,
      "next": "await_approach"
    },
    {
      "id": "await_approach",
      "verb": "await",
      "timeoutS": 480,
      "timeoutLine": "The buoy tumbles on. The tally keeps itself.",
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
      "line": "TALLY: two clients paid. The first names an office — mid-sector, logistics oversight.",
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
      "line": "The second client field is redacted — the same redaction glyph that sits in the co-author field of Contract 47-A.",
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
      "line": "\"Two payers is good business.\" The booth heard it the eleventh time and filed it as a confession.",
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

export const encounterOrder = 928;
export const trigger = deepFreeze({
  "id": "interlude_second_client",
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
  "title": "INTERLUDE — THE SECOND CLIENT",
  "primaryLine": "A broker's tally buoy rides the drift off-Grid, still holding a dead booth's ledger.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Read the tally",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "receipts": {
    "seen": "Two payers is twice the business. The second field stayed redacted."
  }
});
