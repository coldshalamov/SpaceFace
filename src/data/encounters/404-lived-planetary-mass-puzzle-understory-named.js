// ADDENDUM ON THE PLANETARY MASS — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_planetary_mass_puzzle_understory_named",
  "title": "ADDENDUM ON THE PLANETARY MASS",
  "factionId": "faction_understory",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SABLE 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SABLE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Make the round trip between hulls",
      "playerLine": "Ours, theirs, ours again — three separate ring entries logged at Planetary Mass."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, SABLE — send the relief to Planetary Mass instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, SABLE — my hull is leaving Planetary Mass."
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
      "line": "SABLE: The addendum count fails at planetary mass. Find which mark does not belong. — ADDENDUM ON THE PLANETARY MASS.",
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
      "line": "SABLE: Ours, theirs, ours again. Three separate ring entries — the record needs the round trip. — ADDENDUM ON THE PLANETARY MASS.",
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
      "reason": "lived_planetary_mass_puzzle_understory_named:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "SABLE: Time ran out on the work ask — ADDENDUM ON THE PLANETARY MASS. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "SABLE: Time ran out on the work ask — ADDENDUM ON THE PLANETARY MASS. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "SABLE: Time ran out on the work ask — ADDENDUM ON THE PLANETARY MASS. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_planetary_mass_puzzle_understory_named",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_planetary_mass_puzzle_understory_named",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 3,
      "reason": "lived_planetary_mass_puzzle_understory_named:sponsor",
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

export const encounterOrder = 404;
export const trigger = deepFreeze({
  "id": "lived_planetary_mass_puzzle_understory_named",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "planetary_mass"
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
    "situation": "puzzle",
    "place": "planetary_mass",
    "twist": "named",
    "actor": "faction_understory"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "ADDENDUM ON THE PLANETARY MASS",
  "primaryLine": "SABLE: The addendum count fails at planetary mass. Find which mark does not belong.",
  "factionId": "faction_understory",
  "choices": [
    {
      "id": "a",
      "label": "Make the round trip between hulls",
      "playerLine": "Ours, theirs, ours again — three separate ring entries logged at Planetary Mass."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, SABLE — send the relief to Planetary Mass instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, SABLE — my hull is leaving Planetary Mass."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The round trip is logged — three separate ring entries at Planetary Mass. — ADDENDUM ON THE PLANETARY MASS.",
    "b": "24 cr funded the relief call — SABLE sends the shift at Planetary Mass on your credit. — ADDENDUM ON THE PLANETARY MASS.",
    "c": "You left Planetary Mass. The work stayed with the crew that owned it. — ADDENDUM ON THE PLANETARY MASS."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "visit_aba",
    "hasProp": false
  }
});
