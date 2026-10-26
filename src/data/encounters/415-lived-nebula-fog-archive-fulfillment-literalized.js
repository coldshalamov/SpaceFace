// SPAR ON THE NEBULA FOG — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_nebula_fog_archive_fulfillment_literalized",
  "title": "SPAR ON THE NEBULA FOG",
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
      "label": "Make the round trip between hulls",
      "playerLine": "Ours, theirs, ours again — three separate ring entries logged at Nebula Fog."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 18 cr, then close in slow",
      "playerLine": "Take 18 cr, DISPATCH — send the relief to Nebula Fog; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, DISPATCH — my hull is leaving Nebula Fog."
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
      "line": "DISPATCH: The spar carries a name at Nebula Fog. Read it without adding one. — SPAR ON THE NEBULA FOG.",
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
      "line": "DISPATCH: Ours, theirs, ours again. Three separate ring entries — the record needs the round trip. — SPAR ON THE NEBULA FOG.",
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
      "amount": 18,
      "reason": "lived_nebula_fog_archive_fulfillment_literalized:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "DISPATCH: Time ran out on the work ask — SPAR ON THE NEBULA FOG. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "visit",
          "of": "hull_0"
        },
        {
          "kind": "visit",
          "of": "hull_1"
        },
        {
          "kind": "visit",
          "of": "hull_0"
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "DISPATCH: The 18 cr stays spent — the relief still runs on your credit at Nebula Fog; the close-in just never came — SPAR ON THE NEBULA FOG.",
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
      "timeoutLine": "DISPATCH: Time ran out on the work ask — SPAR ON THE NEBULA FOG. Nothing owed either way — the lane forgets it.",
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
      "amount": 24,
      "reason": "lived_nebula_fog_archive_fulfillment_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_nebula_fog_archive_fulfillment_literalized",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 3,
      "reason": "lived_nebula_fog_archive_fulfillment_literalized:sponsor",
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

export const encounterOrder = 415;
export const trigger = deepFreeze({
  "id": "lived_nebula_fog_archive_fulfillment_literalized",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "nebula_fog"
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
    "situation": "archive",
    "place": "nebula_fog",
    "twist": "literalized",
    "actor": "faction_fulfillment"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SPAR ON THE NEBULA FOG",
  "primaryLine": "DISPATCH: The spar carries a name at Nebula Fog. Read it without adding one.",
  "factionId": "faction_fulfillment",
  "choices": [
    {
      "id": "a",
      "label": "Make the round trip between hulls",
      "playerLine": "Ours, theirs, ours again — three separate ring entries logged at Nebula Fog."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 18 cr, then close in slow",
      "playerLine": "Take 18 cr, DISPATCH — send the relief to Nebula Fog; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, DISPATCH — my hull is leaving Nebula Fog."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The round trip is logged — three separate ring entries at Nebula Fog. — SPAR ON THE NEBULA FOG.",
    "b": "18 cr funded the relief call — DISPATCH sends the shift at Nebula Fog on your credit. — SPAR ON THE NEBULA FOG.",
    "c": "You left Nebula Fog. The work stayed with the crew that owned it. — SPAR ON THE NEBULA FOG."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "visit_aba",
    "hasProp": false
  }
});
