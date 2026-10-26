// CASKET ON THE PATROL CORRIDOR — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_patrol_corridor_salvage_fulfillment_none",
  "title": "CASKET ON THE PATROL CORRIDOR",
  "factionId": "faction_fulfillment",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_fulfillment",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DISPATCH 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_fulfillment",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DISPATCH 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Relay the casket past both hulls",
      "playerLine": "I carry the casket past your hull, then the far one — in that order — and let go dead slow."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, DISPATCH — send the relief to Patrol Corridor; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, DISPATCH — my hull is leaving Patrol Corridor."
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
      "scanLabel": "CASKET",
      "dx": 170,
      "dz": -100,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "DISPATCH: The casket came loose at Patrol Corridor. We have not called it scrap. — CASKET ON THE PATROL CORRIDOR.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "face",
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
      "motion": "face",
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
      "motion": "face",
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
      "motion": "face",
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
      "motion": "face",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "face",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "DISPATCH: Carry the casket a hundred-twenty on the line — past our hull first, then the far hull, in that order. Let go dead slow. — CASKET ON THE PATROL CORRIDOR.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "face",
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
      "reason": "lived_patrol_corridor_salvage_fulfillment_none:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "DISPATCH: Time ran out on the work ask — CASKET ON THE PATROL CORRIDOR. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "DISPATCH: The 24 cr stays spent — the relief still runs on your credit at Patrol Corridor; the close-in just never came — CASKET ON THE PATROL CORRIDOR.",
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
      "timeoutLine": "DISPATCH: Time ran out on the work ask — CASKET ON THE PATROL CORRIDOR. Nothing owed either way — the lane forgets it.",
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
      "amount": 54,
      "reason": "lived_patrol_corridor_salvage_fulfillment_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_patrol_corridor_salvage_fulfillment_none",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 3,
      "reason": "lived_patrol_corridor_salvage_fulfillment_none:sponsor",
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

export const encounterOrder = 421;
export const trigger = deepFreeze({
  "id": "lived_patrol_corridor_salvage_fulfillment_none",
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
    "situation": "salvage",
    "place": "patrol_corridor",
    "twist": "none",
    "actor": "faction_fulfillment"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CASKET ON THE PATROL CORRIDOR",
  "primaryLine": "DISPATCH: The casket came loose at Patrol Corridor. We have not called it scrap.",
  "factionId": "faction_fulfillment",
  "choices": [
    {
      "id": "a",
      "label": "Relay the casket past both hulls",
      "playerLine": "I carry the casket past your hull, then the far one — in that order — and let go dead slow."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, DISPATCH — send the relief to Patrol Corridor; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, DISPATCH — my hull is leaving Patrol Corridor."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The casket passed both hulls in order and rests loose at Patrol Corridor. — CASKET ON THE PATROL CORRIDOR.",
    "b": "24 cr funded the relief call — DISPATCH sends the shift at Patrol Corridor on your credit. — CASKET ON THE PATROL CORRIDOR.",
    "c": "You left Patrol Corridor. The work stayed with the crew that owned it. — CASKET ON THE PATROL CORRIDOR."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "relay",
    "hasProp": true
  }
});
