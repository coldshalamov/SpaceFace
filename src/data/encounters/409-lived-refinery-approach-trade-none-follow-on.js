// CAN ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_refinery_approach_trade_none_follow_on",
  "title": "CAN ON THE REFINERY APPROACH",
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
      "label": "Relay the can past both hulls",
      "playerLine": "I carry the can past your hull, then the far one — in that order — and let go dead slow."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 18 cr, then close in slow",
      "playerLine": "Take 18 cr, BUOY — send the relief to Refinery Approach; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, BUOY — my hull is leaving Refinery Approach."
    }
  ],
  "timeoutChoice": "c",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "prop"
    },
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "CAN",
      "dx": 170,
      "dz": -100,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "BUOY: The can is the whole lot. Refinery Approach has room to bargain. — CAN ON THE REFINERY APPROACH.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "ring",
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
      "motion": "ring",
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
      "motion": "ring",
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
      "motion": "ring",
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
      "motion": "ring",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "ring",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "BUOY: Carry the can a hundred-twenty on the line — past our hull first, then the far hull, in that order. Let go dead slow. — CAN ON THE REFINERY APPROACH.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "ring",
      "onChoice": {
        "a": "await_a",
        "b": "charge_b",
        "c": "await_c"
      }
    },
    {
      "id": "charge_b",
      "verb": "charge",
      "amount": 18,
      "reason": "lived_refinery_approach_trade_none_follow_on:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "BUOY: Time ran out on the work ask — CAN ON THE REFINERY APPROACH. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "latched"
        },
        {
          "kind": "displaced",
          "dist": 120
        },
        {
          "kind": "near",
          "subject": "prop",
          "of": "hull_0",
          "dist": 60
        },
        {
          "kind": "near",
          "subject": "prop",
          "of": "hull_1",
          "dist": 60
        },
        {
          "kind": "released"
        },
        {
          "kind": "settled",
          "maxSpeed": 5,
          "holdS": 2
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "BUOY: The 18 cr stays spent — the relief still runs on your credit at Refinery Approach; the close-in just never came — CAN ON THE REFINERY APPROACH.",
      "keepMotion": false,
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
      "timeoutLine": "BUOY: Time ran out on the work ask — CAN ON THE REFINERY APPROACH. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
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
      "amount": 36,
      "reason": "lived_refinery_approach_trade_none_follow_on",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_refinery_approach_trade_none_follow_on",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 3,
      "reason": "lived_refinery_approach_trade_none_follow_on:sponsor",
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

export const encounterOrder = 409;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_trade_none_follow_on",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "refinery_approach"
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
    "situation": "trade",
    "place": "refinery_approach",
    "twist": "follow_on",
    "actor": "none"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CAN ON THE REFINERY APPROACH",
  "primaryLine": "BUOY: The can is the whole lot. Refinery Approach has room to bargain.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Relay the can past both hulls",
      "playerLine": "I carry the can past your hull, then the far one — in that order — and let go dead slow."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 18 cr, then close in slow",
      "playerLine": "Take 18 cr, BUOY — send the relief to Refinery Approach; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, BUOY — my hull is leaving Refinery Approach."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The can passed both hulls in order and rests loose at Refinery Approach. — CAN ON THE REFINERY APPROACH.",
    "b": "18 cr funded the relief call — BUOY sends the shift at Refinery Approach on your credit. — CAN ON THE REFINERY APPROACH.",
    "c": "You left Refinery Approach. The work stayed with the crew that owned it. — CAN ON THE REFINERY APPROACH."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "relay",
    "hasProp": true
  }
});
