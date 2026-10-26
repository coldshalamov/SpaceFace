// FILTER ON THE AMBUSH LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_ambush_lane_archive_scn_follow_on",
  "title": "FILTER ON THE AMBUSH LANE",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CLERK 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CLERK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Read both hulls in order",
      "playerLine": "I enter each ring in turn — your hull first, then the far one at Ambush Lane."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 18 cr, then close in slow",
      "playerLine": "Take 18 cr, CLERK — send the relief to Ambush Lane; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, CLERK — my hull is leaving Ambush Lane."
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
      "line": "CLERK: The filter carries a name at Ambush Lane. Read it without adding one. — FILTER ON THE AMBUSH LANE.",
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
      "line": "CLERK: Read both hulls in order — ours first, then theirs. Enter each seventy ring. — FILTER ON THE AMBUSH LANE.",
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
      "amount": 18,
      "reason": "lived_ambush_lane_archive_scn_follow_on:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "CLERK: Time ran out on the work ask — FILTER ON THE AMBUSH LANE. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "visit",
          "of": "hull_0"
        },
        {
          "kind": "visit",
          "of": "hull_1"
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "CLERK: The 18 cr stays spent — the relief still runs on your credit at Ambush Lane; the close-in just never came — FILTER ON THE AMBUSH LANE.",
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
      "timeoutLine": "CLERK: Time ran out on the work ask — FILTER ON THE AMBUSH LANE. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_ambush_lane_archive_scn_follow_on",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_ambush_lane_archive_scn_follow_on",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 3,
      "reason": "lived_ambush_lane_archive_scn_follow_on:sponsor",
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

export const encounterOrder = 402;
export const trigger = deepFreeze({
  "id": "lived_ambush_lane_archive_scn_follow_on",
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
    "situation": "archive",
    "place": "ambush_lane",
    "twist": "follow_on",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "FILTER ON THE AMBUSH LANE",
  "primaryLine": "CLERK: The filter carries a name at Ambush Lane. Read it without adding one.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Read both hulls in order",
      "playerLine": "I enter each ring in turn — your hull first, then the far one at Ambush Lane."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 18 cr, then close in slow",
      "playerLine": "Take 18 cr, CLERK — send the relief to Ambush Lane; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, CLERK — my hull is leaving Ambush Lane."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Both hulls read in order — the Ambush Lane record has its comparison. — FILTER ON THE AMBUSH LANE.",
    "b": "18 cr funded the relief call — CLERK sends the shift at Ambush Lane on your credit. — FILTER ON THE AMBUSH LANE.",
    "c": "You left Ambush Lane. The work stayed with the crew that owned it. — FILTER ON THE AMBUSH LANE."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "visit_ab",
    "hasProp": false
  }
});
