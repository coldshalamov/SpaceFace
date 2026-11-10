// SLOT ON THE RADIATION FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_radiation_field_yard_choir_none",
  "title": "SLOT ON THE RADIATION FIELD",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "hull_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Relay the slot past both hulls",
      "playerLine": "I carry the slot past your hull, then the far one — in that order — and let go dead slow."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, CANTOR — send the relief to Radiation Field; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, CANTOR — my hull is leaving Radiation Field."
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
      "scanLabel": "SLOT",
      "dx": 170,
      "dz": -100,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CANTOR: The slot needs a hand at Radiation Field. The shift is already short. — SLOT ON THE RADIATION FIELD.",
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
      "line": "CANTOR: Carry the slot a hundred-twenty on the line — inside sixty of our hull first, then inside sixty of the far hull, in that order. Let go under five, held a two-count. — SLOT ON THE RADIATION FIELD.",
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
      "reason": "lived_radiation_field_yard_choir_none:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "CANTOR: Time ran out on the work ask — SLOT ON THE RADIATION FIELD. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "CANTOR: The 24 cr stays spent — the relief still runs on your credit at Radiation Field; the close-in just never came — SLOT ON THE RADIATION FIELD.",
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
      "timeoutLine": "CANTOR: Time ran out on the work ask — SLOT ON THE RADIATION FIELD. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_radiation_field_yard_choir_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_radiation_field_yard_choir_none",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 3,
      "reason": "lived_radiation_field_yard_choir_none:sponsor",
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

export const encounterOrder = 414;
export const trigger = deepFreeze({
  "id": "lived_radiation_field_yard_choir_none",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "radiation_field"
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
    "place": "radiation_field",
    "twist": "none",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SLOT ON THE RADIATION FIELD",
  "primaryLine": "CANTOR: The slot needs a hand at Radiation Field. The shift is already short.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Relay the slot past both hulls",
      "playerLine": "I carry the slot past your hull, then the far one — in that order — and let go dead slow."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, CANTOR — send the relief to Radiation Field; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, CANTOR — my hull is leaving Radiation Field."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The slot passed both hulls in order and rests loose at Radiation Field. — SLOT ON THE RADIATION FIELD.",
    "b": "24 cr funded the relief call — CANTOR sends the shift at Radiation Field on your credit. — SLOT ON THE RADIATION FIELD.",
    "c": "You left Radiation Field. The work stayed with the crew that owned it. — SLOT ON THE RADIATION FIELD."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "relay",
    "hasProp": true
  }
});
