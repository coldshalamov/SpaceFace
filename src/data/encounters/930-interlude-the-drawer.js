// INTERLUDE — THE DRAWER (W-CANON, build_map row 537, §34.7).
// Quiet scene: a records crate rides the annex drift — the drawer the system never locked.
// External-only — requested by the campaign interlude stepper, never rolled by planners.
// Canon text: docs/worldbuilding/story/THE-STORYLINE.md — INTERLUDE: THE DRAWER.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "interlude_the_drawer",
  "title": "INTERLUDE — THE DRAWER",
  "factionId": "faction_free",
  "start": "prop",
  "cast": [],
  "choices": [
    {
      "id": "a",
      "label": "Open the drawer",
      "playerLine": "Opening."
    }
  ],
  "timeoutChoice": "a",
  "phases": [
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "RECORDS CRATE — ADMINISTRATIVE / UNLOCKED",
      "dx": 40,
      "dz": -24,
      "radius": 8,
      "mass": 44,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "A records crate rides the annex drift. Yellowed tape, a code for a label, no lock — locking it would have admitted it held something.",
      "channel": "info",
      "primary": true,
      "next": "await_approach"
    },
    {
      "id": "await_approach",
      "verb": "await",
      "timeoutS": 480,
      "timeoutLine": "The crate drifts on, unopened. The system's theory of concealment holds.",
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
      "line": "Inside: berth-fee chits nineteen years deep, and initials — one per REG 44-C second fine, seventeen years of them, each one correct.",
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
      "line": "Inside: the moisture-loss column, and one entry in year 3 in a different hand.",
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
      "line": "It held everything, and it weighed 0.01 tonnes by the manifest's own rounding. File it where anyone can find it, and arrange for no one to have the time.",
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

export const encounterOrder = 930;
export const trigger = deepFreeze({
  "id": "interlude_the_drawer",
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
  "title": "INTERLUDE — THE DRAWER",
  "primaryLine": "A records crate rides the annex drift. Yellowed tape, a code for a label, no lock — locking it would have admitted it held something.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Open the drawer",
      "playerLine": "Opening."
    }
  ],
  "timeoutChoice": "a",
  "receipts": {
    "seen": "The drawer held everything. It weighed 0.01 tonnes."
  }
});
