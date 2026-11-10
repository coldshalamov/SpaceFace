// SLED ON THE COLONY — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_colony_anomaly_free_logic",
  "title": "SLED ON THE COLONY",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "NELL 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "NELL 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Circle to the far side of the hull",
      "playerLine": "I cross a hundred-twenty of your flank to the far side, inside the band at Colony."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 30 cr, then close in slow",
      "playerLine": "Take 30 cr, NELL — send the relief to Colony; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, NELL — my hull is leaving Colony."
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
      "line": "NELL: The sled signal repeats from Colony. Do not answer its second voice. — SLED ON THE COLONY.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "creep",
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
      "motion": "creep",
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
      "motion": "creep",
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
      "motion": "creep",
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
      "motion": "creep",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "creep",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "NELL: Circle us — start one side, cross a hundred-twenty through to the other, between a hundred and a hundred-sixty of us. — SLED ON THE COLONY.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "creep",
      "onChoice": {
        "a": "await_a",
        "b": "charge_b",
        "c": "await_c"
      }
    },
    {
      "id": "charge_b",
      "verb": "charge",
      "amount": 30,
      "reason": "lived_colony_anomaly_free_logic:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "NELL: Time ran out on the work ask — SLED ON THE COLONY. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "oppositeSides",
          "of": "hull_0",
          "min": 100,
          "max": 160,
          "travel": 120
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "NELL: The 30 cr stays spent — the relief still runs on your credit at Colony; the close-in just never came — SLED ON THE COLONY.",
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
      "timeoutLine": "NELL: Time ran out on the work ask — SLED ON THE COLONY. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_colony_anomaly_free_logic",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_colony_anomaly_free_logic",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 3,
      "reason": "lived_colony_anomaly_free_logic:sponsor",
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

export const encounterOrder = 425;
export const trigger = deepFreeze({
  "id": "lived_colony_anomaly_free_logic",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "colony"
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
    "situation": "anomaly",
    "place": "colony",
    "twist": "logic",
    "actor": "faction_free"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SLED ON THE COLONY",
  "primaryLine": "NELL: The sled signal repeats from Colony. Do not answer its second voice.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Circle to the far side of the hull",
      "playerLine": "I cross a hundred-twenty of your flank to the far side, inside the band at Colony."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 30 cr, then close in slow",
      "playerLine": "Take 30 cr, NELL — send the relief to Colony; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, NELL — my hull is leaving Colony."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You crossed to the hull's far side inside the band at Colony. — SLED ON THE COLONY.",
    "b": "30 cr funded the relief call — NELL sends the shift at Colony on your credit. — SLED ON THE COLONY.",
    "c": "You left Colony. The work stayed with the crew that owned it. — SLED ON THE COLONY."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "sides",
    "hasProp": false
  }
});
