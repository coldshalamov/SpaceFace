// INTERLUDE — THE TICKER (W-CANON, build_map row 537, §34.7).
// Quiet scene: a market relay pylon prices the news the player made — no names, just numbers.
// External-only — requested by the campaign interlude stepper, never rolled by planners.
// Canon text: docs/worldbuilding/story/THE-STORYLINE.md — INTERLUDE: THE TICKER.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "interlude_the_ticker",
  "title": "INTERLUDE — THE TICKER",
  "factionId": "faction_free",
  "start": "prop",
  "cast": [],
  "choices": [
    {
      "id": "a",
      "label": "Read the tape",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "phases": [
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "EXCHANGE RELAY PYLON — TAPE RUNNING",
      "dx": 40,
      "dz": -24,
      "radius": 7,
      "mass": 40,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "An exchange relay pylon hangs at the lane edge, still spooling the Meridian tape.",
      "channel": "info",
      "primary": true,
      "next": "await_approach"
    },
    {
      "id": "await_approach",
      "verb": "await",
      "timeoutS": 480,
      "timeoutLine": "The tape keeps spooling. The market does not wait for readers.",
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
      "line": "ATMO TOKEN (PIT-LINKED) +2.1% — [INDEX DECLINE, SECTOR 0]",
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
      "line": "SILT FUTURES, Q+1 -0.4% — [LANE SECURITY PREMIUM EASED — B2 CORRIDOR]",
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
      "line": "CLEAR AIR INDEX, SECTOR 0 — FLOOR — [VIABILITY REVIEW: CONTINUING]. The market moved on news the player made. Nobody knew the player's name. The market knew.",
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

export const encounterOrder = 929;
export const trigger = deepFreeze({
  "id": "interlude_the_ticker",
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
  "title": "INTERLUDE — THE TICKER",
  "primaryLine": "An exchange relay pylon hangs at the lane edge, still spooling the Meridian tape.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Read the tape",
      "playerLine": "Reading."
    }
  ],
  "timeoutChoice": "a",
  "receipts": {
    "seen": "The market moved on news the player made. The market knew."
  }
});
