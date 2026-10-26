// VISOR ON THE ANOMALY DEEP — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_anomaly_deep_escort_none_logic",
  "title": "VISOR ON THE ANOMALY DEEP",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "BUOY 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "BUOY 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Match the lead through Anomaly Deep",
      "playerLine": "I hold station off your bow while your lead makes its hundred through Anomaly Deep."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, BUOY — send the relief to Anomaly Deep; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, BUOY — my hull is leaving Anomaly Deep."
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
      "line": "BUOY: Keep the visor behind your drive through Anomaly Deep. No passing. — VISOR ON THE ANOMALY DEEP.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "orbit",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "noop",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 1,
      "motion": "orbit",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "noop",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 1,
      "motion": "orbit",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "noop",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 1,
      "motion": "orbit",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "noop",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 1,
      "motion": "orbit",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "orbit",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "BUOY: Hold station sixty to a hundred-eighty off our bow while we make a hundred on the lead. — VISOR ON THE ANOMALY DEEP.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "orbit",
      "onChoice": {
        "a": "await_a",
        "b": "charge_b",
        "c": "await_c"
      }
    },
    {
      "id": "charge_b",
      "verb": "charge",
      "amount": 24,
      "reason": "lived_anomaly_deep_escort_none_logic:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "BUOY: Time ran out on the work ask — VISOR ON THE ANOMALY DEEP. Nothing owed either way — the lane forgets it.",
      "keepMotion": true,
      "steps": [
        {
          "kind": "formation",
          "of": "hull_0",
          "min": 60,
          "max": 180,
          "holdS": 8,
          "leaderProgress": 100
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "BUOY: The 24 cr stays spent — the relief still runs on your credit at Anomaly Deep; the close-in just never came — VISOR ON THE ANOMALY DEEP.",
      "keepMotion": true,
      "steps": [
        {
          "kind": "meet",
          "of": "hull_0",
          "dist": 60,
          "maxSpeed": 5,
          "holdS": 2
        }
      ],
      "next": "rep_b"
    },
    {
      "id": "await_c",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "BUOY: Time ran out on the work ask — VISOR ON THE ANOMALY DEEP. Nothing owed either way — the lane forgets it.",
      "keepMotion": true,
      "steps": [
        {
          "kind": "depart",
          "dist": 180,
          "far": 1000
        }
      ],
      "next": "done_c"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 48,
      "reason": "lived_anomaly_deep_escort_none_logic",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_anomaly_deep_escort_none_logic",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 3,
      "reason": "lived_anomaly_deep_escort_none_logic:sponsor",
      "next": "done_b"
    },
    {
      "id": "say_a",
      "verb": "noop"
    },
    {
      "id": "done_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "noop"
    },
    {
      "id": "done_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "noop"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    },
    {
      "id": "cost_a",
      "verb": "noop"
    },
    {
      "id": "rep_c",
      "verb": "noop"
    },
    {
      "id": "grant_b",
      "verb": "noop"
    }
  ]
};

export const encounterOrder = 403;
export const trigger = deepFreeze({
  "id": "lived_anomaly_deep_escort_none_logic",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "anomaly_deep"
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
    "situation": "escort",
    "place": "anomaly_deep",
    "twist": "logic",
    "actor": "none"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "VISOR ON THE ANOMALY DEEP",
  "primaryLine": "BUOY: Keep the visor behind your drive through Anomaly Deep. No passing.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Match the lead through Anomaly Deep",
      "playerLine": "I hold station off your bow while your lead makes its hundred through Anomaly Deep."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, BUOY — send the relief to Anomaly Deep; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, BUOY — my hull is leaving Anomaly Deep."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You held station off the lead for the whole hundred it made at Anomaly Deep. — VISOR ON THE ANOMALY DEEP.",
    "b": "24 cr funded the relief call — BUOY sends the shift at Anomaly Deep on your credit. — VISOR ON THE ANOMALY DEEP.",
    "c": "You left Anomaly Deep. The work stayed with the crew that owned it. — VISOR ON THE ANOMALY DEEP."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "match_lead",
    "hasProp": false
  }
});
