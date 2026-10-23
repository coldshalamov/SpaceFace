// BOOT ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_refinery_approach_convoy_helix_k1",
  "title": "BOOT ON THE REFINERY APPROACH",
  "factionId": "faction_helix",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": 0,
      "dz": 0,
      "scanLabel": "HX-12 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": -150,
      "dz": 90,
      "scanLabel": "HX-12 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Match the lead through Refinery Approach",
      "playerLine": "I hold station off your bow while your lead makes its hundred through Refinery Approach."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, HX-12 — send the relief to Refinery Approach instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, HX-12 — my hull is leaving Refinery Approach."
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
      "line": "HX-12 — VARIANCE FILE OPEN. BOOT IS IN THE LANE. NO ACTION REQUIRED. — BOOT ON THE REFINERY APPROACH.",
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
      "line": "HX-12: Hold station sixty to a hundred-eighty off our bow while we make a hundred on the lead. — BOOT ON THE REFINERY APPROACH.",
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
      "reason": "lived_refinery_approach_convoy_helix_k1:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "HX-12: Time ran out on the work ask — BOOT ON THE REFINERY APPROACH. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "HX-12: Time ran out on the work ask — BOOT ON THE REFINERY APPROACH. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "HX-12: Time ran out on the work ask — BOOT ON THE REFINERY APPROACH. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_refinery_approach_convoy_helix_k1",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_refinery_approach_convoy_helix_k1",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 3,
      "reason": "lived_refinery_approach_convoy_helix_k1:sponsor",
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

export const encounterOrder = 423;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_convoy_helix_k1",
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
    "situation": "convoy",
    "place": "refinery_approach",
    "twist": "k1",
    "actor": "faction_helix"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "BOOT ON THE REFINERY APPROACH",
  "primaryLine": "HX-12 — VARIANCE FILE OPEN. BOOT IS IN THE LANE. NO ACTION REQUIRED.",
  "factionId": "faction_helix",
  "choices": [
    {
      "id": "a",
      "label": "Match the lead through Refinery Approach",
      "playerLine": "I hold station off your bow while your lead makes its hundred through Refinery Approach."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, HX-12 — send the relief to Refinery Approach instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, HX-12 — my hull is leaving Refinery Approach."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You held station off the lead for the whole hundred it made at Refinery Approach. — BOOT ON THE REFINERY APPROACH.",
    "b": "24 cr funded the relief call — HX-12 sends the shift at Refinery Approach on your credit. — BOOT ON THE REFINERY APPROACH.",
    "c": "You left Refinery Approach. The work stayed with the crew that owned it. — BOOT ON THE REFINERY APPROACH."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "match_lead",
    "hasProp": false
  }
});
