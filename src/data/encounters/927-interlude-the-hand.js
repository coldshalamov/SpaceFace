// INTERLUDE — THE HAND (W-CANON, build_map row 537, §34.7).
// Quiet scene: Ivo's maintenance skiff works the bulkhead; the wall comes back.
// External-only — requested by the campaign interlude stepper, never rolled by planners.
// Canon text: docs/worldbuilding/story/THE-STORYLINE.md — INTERLUDE: THE HAND.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "interlude_the_hand",
  "title": "INTERLUDE — THE HAND",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "PIT MAINTENANCE — IVO"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Watch the work",
      "playerLine": "Watching."
    }
  ],
  "timeoutChoice": "a",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "prop"
    },
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "BULKHEAD PANEL — WET PAINT",
      "dx": 54,
      "dz": -28,
      "radius": 8,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "A maintenance skiff works the pit-side bulkheads, third shift. The manifest calls the hull Ivo.",
      "channel": "info",
      "primary": true,
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 5,
      "motion": "weave",
      "next": "await_approach"
    },
    {
      "id": "await_approach",
      "verb": "await",
      "timeoutS": 480,
      "timeoutLine": "The skiff moves to the next panel. The shift log stays a single sentence.",
      "keepMotion": true,
      "steps": [
        {
          "kind": "near",
          "of": "prop",
          "dist": 120
        }
      ],
      "next": "log_0"
    },
    {
      "id": "log_0",
      "verb": "say",
      "line": "Shift log, four years, every page: BULKHEAD 4. PAINT. WALL WAS CLEAN AT START OF SHIFT.",
      "channel": "info",
      "next": "beat_0"
    },
    {
      "id": "beat_0",
      "verb": "motion",
      "seconds": 4,
      "motion": "weave",
      "next": "log_1"
    },
    {
      "id": "log_1",
      "verb": "say",
      "line": "He never writes the second sentence. The wall was not clean at the end of it.",
      "channel": "info",
      "next": "beat_1"
    },
    {
      "id": "beat_1",
      "verb": "motion",
      "seconds": 4,
      "motion": "weave",
      "next": "log_2"
    },
    {
      "id": "log_2",
      "verb": "say",
      "line": "The paint is a filing. The wall is a record. You watch, and the wall comes back.",
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

export const encounterOrder = 927;
export const trigger = deepFreeze({
  "id": "interlude_the_hand",
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
    "actor": "faction_free"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "found",
  "title": "INTERLUDE — THE HAND",
  "primaryLine": "A maintenance skiff works the pit-side bulkheads, third shift. The manifest calls the hull Ivo.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Watch the work",
      "playerLine": "Watching."
    }
  ],
  "timeoutChoice": "a",
  "receipts": {
    "seen": "BULKHEAD 4. PAINT. The wall comes back."
  }
});
