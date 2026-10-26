// DENT ON THE AMBUSH LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_ambush_lane_escort_patrol_lawman_k1",
  "title": "DENT ON THE AMBUSH LANE",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "WARD 1"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the wake station behind the lead",
      "playerLine": "I fall in behind your wake at matched speed and hold it for the six-count through Ambush Lane."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, WARD — send the relief to Ambush Lane; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, WARD — my hull is leaving Ambush Lane."
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
      "line": "WARD: Keep the dent behind your drive through Ambush Lane. No passing. — DENT ON THE AMBUSH LANE.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "hold",
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
      "motion": "hold",
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
      "motion": "hold",
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
      "motion": "hold",
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
      "motion": "hold",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "hold",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "WARD: Fall in behind our wake — sixty to a hundred-eighty, matched speed, six-count. — DENT ON THE AMBUSH LANE.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "hold",
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
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "WARD: Time ran out on the work ask — DENT ON THE AMBUSH LANE. Nothing owed either way — the lane forgets it.",
      "keepMotion": true,
      "steps": [
        {
          "kind": "trail",
          "of": "hull_0",
          "min": 60,
          "max": 180,
          "holdS": 6,
          "maxRelSpeed": 8,
          "leaderProgress": 100
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "WARD: The 24 cr stays spent — the relief still runs on your credit at Ambush Lane; the close-in just never came — DENT ON THE AMBUSH LANE.",
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
      "timeoutLine": "WARD: Time ran out on the work ask — DENT ON THE AMBUSH LANE. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 3,
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1:sponsor",
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

export const encounterOrder = 416;
export const trigger = deepFreeze({
  "id": "lived_ambush_lane_escort_patrol_lawman_k1",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "ambush_lane"
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
    "situation": "escort",
    "place": "ambush_lane",
    "twist": "k1",
    "actor": "patrol_lawman"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "DENT ON THE AMBUSH LANE",
  "primaryLine": "WARD: Keep the dent behind your drive through Ambush Lane. No passing.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Take the wake station behind the lead",
      "playerLine": "I fall in behind your wake at matched speed and hold it for the six-count through Ambush Lane."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, WARD — send the relief to Ambush Lane; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, WARD — my hull is leaving Ambush Lane."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You rode the wake station behind the lead while it made its hundred at Ambush Lane. — DENT ON THE AMBUSH LANE.",
    "b": "24 cr funded the relief call — WARD sends the shift at Ambush Lane on your credit. — DENT ON THE AMBUSH LANE.",
    "c": "You left Ambush Lane. The work stayed with the crew that owned it. — DENT ON THE AMBUSH LANE."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "trail",
    "hasProp": false
  }
});
