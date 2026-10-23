// HYMN ON THE DERELICT FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_derelict_field_wreck_vael_named",
  "title": "HYMN ON THE DERELICT FIELD",
  "factionId": "faction_vael",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VAEL 1"
    },
    {
      "role": "hull_1",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VAEL 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Deliver the hymn to the second hull",
      "playerLine": "The hymn berths at the second hull — I tow it there and park it inside thirty."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, VAEL — send the relief to Derelict Field instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, VAEL — my hull is leaving Derelict Field."
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
      "scanLabel": "HYMN",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "VAEL: The hymn is stamped on a wreck at derelict field. Do not cut yet. — HYMN ON THE DERELICT FIELD.",
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
      "line": "VAEL: The hymn goes to the second hull, not ours. Tow it there, release, park it inside thirty. — HYMN ON THE DERELICT FIELD.",
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
      "amount": 24,
      "reason": "lived_derelict_field_wreck_vael_named:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "VAEL: Time ran out on the work ask — HYMN ON THE DERELICT FIELD. Nothing owed either way — the lane forgets it.",
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
          "at": "hull_1",
          "dist": 30,
          "maxSpeed": 3,
          "holdS": 3
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "VAEL: Time ran out on the work ask — HYMN ON THE DERELICT FIELD. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "VAEL: Time ran out on the work ask — HYMN ON THE DERELICT FIELD. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_derelict_field_wreck_vael_named",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_derelict_field_wreck_vael_named",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 3,
      "reason": "lived_derelict_field_wreck_vael_named:sponsor",
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

export const encounterOrder = 426;
export const trigger = deepFreeze({
  "id": "lived_derelict_field_wreck_vael_named",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "derelict_field"
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
    "situation": "wreck",
    "place": "derelict_field",
    "twist": "named",
    "actor": "faction_vael"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "HYMN ON THE DERELICT FIELD",
  "primaryLine": "VAEL: The hymn is stamped on a wreck at derelict field. Do not cut yet.",
  "factionId": "faction_vael",
  "choices": [
    {
      "id": "a",
      "label": "Deliver the hymn to the second hull",
      "playerLine": "The hymn berths at the second hull — I tow it there and park it inside thirty."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, VAEL — send the relief to Derelict Field instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, VAEL — my hull is leaving Derelict Field."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The hymn is parked inside thirty of the second hull at Derelict Field — the first kept its hands off. — HYMN ON THE DERELICT FIELD.",
    "b": "24 cr funded the relief call — VAEL sends the shift at Derelict Field on your credit. — HYMN ON THE DERELICT FIELD.",
    "c": "You left Derelict Field. The work stayed with the crew that owned it. — HYMN ON THE DERELICT FIELD."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "deliver_second",
    "hasProp": true
  }
});
