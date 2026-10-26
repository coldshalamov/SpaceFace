// DENT ON THE MINING BELT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_mining_belt_toll_choir_follow_on",
  "title": "DENT ON THE MINING BELT",
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
      "label": "Pay the count — 36 cr",
      "playerLine": "Take thirty-six, CANTOR — my hull passes the marker on the far side at Mining Belt."
    },
    {
      "id": "b",
      "label": "Tow the dent clear of the lane",
      "playerLine": "No coin — I tow your dent a hundred-twenty clear of the Mining Belt lane and cut it quiet."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "No coin and no tow, CANTOR — my hull departs Mining Belt."
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
      "scanLabel": "DENT",
      "dx": 170,
      "dz": -100,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CANTOR: The dent is due at Mining Belt. Pay, dispute, or keep moving. — DENT ON THE MINING BELT.",
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
      "line": "CANTOR: 36 cr clears the count — then cross a hundred-twenty past the hull to the far side, between a hundred and a hundred-sixty of us. Or tow our dent a hundred-twenty clear. — DENT ON THE MINING BELT.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "creep",
      "onChoice": {
        "a": "charge_a",
        "b": "await_b",
        "c": "await_c"
      }
    },
    {
      "id": "charge_a",
      "verb": "charge",
      "amount": 36,
      "reason": "lived_mining_belt_toll_choir_follow_on",
      "next": "await_a"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "CANTOR: Count paid, no pass. The lane reopens when the hull crosses — or the count stands and we log the stop at Mining Belt.",
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
      "timeoutLine": "CANTOR: Time ran out on the dent ask — DENT ON THE MINING BELT. Nothing owed either way — the lane forgets it.",
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
          "kind": "settled",
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
      "timeoutLine": "CANTOR: Time ran out on the dent ask — DENT ON THE MINING BELT. Nothing owed either way — the lane forgets it.",
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
      "amount": 0,
      "reason": "lived_mining_belt_toll_choir_follow_on",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_mining_belt_toll_choir_follow_on",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 1,
      "reason": "lived_mining_belt_toll_choir_follow_on:sponsor",
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

export const encounterOrder = 536;
export const trigger = deepFreeze({
  "id": "lived_mining_belt_toll_choir_follow_on",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "mining_belt"
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
    "situation": "toll",
    "place": "mining_belt",
    "twist": "follow_on",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "DENT ON THE MINING BELT",
  "primaryLine": "CANTOR: The dent is due at Mining Belt. Pay, dispute, or keep moving.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Pay the count — 36 cr",
      "playerLine": "Take thirty-six, CANTOR — my hull passes the marker on the far side at Mining Belt."
    },
    {
      "id": "b",
      "label": "Tow the dent clear of the lane",
      "playerLine": "No coin — I tow your dent a hundred-twenty clear of the Mining Belt lane and cut it quiet."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "No coin and no tow, CANTOR — my hull departs Mining Belt."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Thirty-six paid, and your hull passed the marker on the far side at Mining Belt. — DENT ON THE MINING BELT.",
    "b": "The dent moved a hundred-twenty clear of the Mining Belt lane — no coin moved. — DENT ON THE MINING BELT.",
    "c": "You left the dent on their board and cleared Mining Belt. — DENT ON THE MINING BELT."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "toll",
    "hasProp": true
  }
});
