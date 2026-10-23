// CONE ON THE OUTLAW ZONE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_outlaw_zone_yard_choir_zealot_admirers",
  "title": "CONE ON THE OUTLAW ZONE",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "choir_zealot",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "hull_1",
      "archetype": "choir_zealot",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Park the cone beside the receiver",
      "playerLine": "I set the cone inside twenty of your receiver hull and hold it dead slow for the count."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, CANTOR — send the relief to Outlaw Zone instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, CANTOR — my hull is leaving Outlaw Zone."
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
      "scanLabel": "CONE",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CANTOR: The cone needs a hand at outlaw zone. The shift is already short. — CONE ON THE OUTLAW ZONE.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "weave",
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
      "motion": "weave",
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
      "motion": "weave",
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
      "motion": "weave",
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
      "motion": "weave",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "weave",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "CANTOR: Park the cone inside twenty of the receiver, dead slow for a four-count. — CONE ON THE OUTLAW ZONE.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "weave",
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
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "CANTOR: Time ran out on the work ask — CONE ON THE OUTLAW ZONE. Nothing owed either way — the lane forgets it.",
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
          "kind": "released"
        },
        {
          "kind": "parked",
          "at": "hull_0",
          "dist": 20,
          "maxSpeed": 2,
          "holdS": 4
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "CANTOR: Time ran out on the work ask — CONE ON THE OUTLAW ZONE. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "CANTOR: Time ran out on the work ask — CONE ON THE OUTLAW ZONE. Nothing owed either way — the lane forgets it.",
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
      "amount": 48,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 3,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers:sponsor",
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

export const encounterOrder = 427;
export const trigger = deepFreeze({
  "id": "lived_outlaw_zone_yard_choir_zealot_admirers",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "outlaw_zone"
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
    "situation": "yard",
    "place": "outlaw_zone",
    "twist": "admirers",
    "actor": "choir_zealot"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CONE ON THE OUTLAW ZONE",
  "primaryLine": "CANTOR: The cone needs a hand at outlaw zone. The shift is already short.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Park the cone beside the receiver",
      "playerLine": "I set the cone inside twenty of your receiver hull and hold it dead slow for the count."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, CANTOR — send the relief to Outlaw Zone instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, CANTOR — my hull is leaving Outlaw Zone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The cone sits parked inside twenty of the receiver at Outlaw Zone, delivered dead slow. — CONE ON THE OUTLAW ZONE.",
    "b": "24 cr funded the relief call — CANTOR sends the shift at Outlaw Zone on your credit. — CONE ON THE OUTLAW ZONE.",
    "c": "You left Outlaw Zone. The work stayed with the crew that owned it. — CONE ON THE OUTLAW ZONE."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "park_tight",
    "hasProp": true
  }
});
