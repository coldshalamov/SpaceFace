// PUCK ON THE PATROL CORRIDOR — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_patrol_corridor_distress_dmc_literalized",
  "title": "PUCK ON THE PATROL CORRIDOR",
  "factionId": "faction_dmc",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": 0,
      "dz": 0,
      "scanLabel": "FOREMAN 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": -150,
      "dz": 90,
      "scanLabel": "FOREMAN 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Drag the puck clear of the lane",
      "playerLine": "Line on the puck — I pull it a hundred-twenty out of the Patrol Corridor lane and let it settle."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 30 cr",
      "playerLine": "Take 30 cr, FOREMAN — send the relief to Patrol Corridor instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, FOREMAN — my hull is leaving Patrol Corridor."
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
      "scanLabel": "PUCK",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "FOREMAN: A distress call names the puck near patrol corridor. Answer or stand clear. — PUCK ON THE PATROL CORRIDOR.",
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
      "line": "FOREMAN: Line on the puck. Drag it past the hundred-twenty mark, drop the line, let it settle. — PUCK ON THE PATROL CORRIDOR.",
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
      "amount": 30,
      "reason": "lived_patrol_corridor_distress_dmc_literalized:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "FOREMAN: Time ran out on the work ask — PUCK ON THE PATROL CORRIDOR. Nothing owed either way — the lane forgets it.",
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
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "FOREMAN: Time ran out on the work ask — PUCK ON THE PATROL CORRIDOR. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "FOREMAN: Time ran out on the work ask — PUCK ON THE PATROL CORRIDOR. Nothing owed either way — the lane forgets it.",
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
      "amount": 60,
      "reason": "lived_patrol_corridor_distress_dmc_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_patrol_corridor_distress_dmc_literalized",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 3,
      "reason": "lived_patrol_corridor_distress_dmc_literalized:sponsor",
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

export const encounterOrder = 407;
export const trigger = deepFreeze({
  "id": "lived_patrol_corridor_distress_dmc_literalized",
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
    "situation": "distress",
    "place": "patrol_corridor",
    "twist": "literalized",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "PUCK ON THE PATROL CORRIDOR",
  "primaryLine": "FOREMAN: A distress call names the puck near patrol corridor. Answer or stand clear.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Drag the puck clear of the lane",
      "playerLine": "Line on the puck — I pull it a hundred-twenty out of the Patrol Corridor lane and let it settle."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 30 cr",
      "playerLine": "Take 30 cr, FOREMAN — send the relief to Patrol Corridor instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, FOREMAN — my hull is leaving Patrol Corridor."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The puck drifted a hundred-twenty clear of its berth at Patrol Corridor and settled on its own. — PUCK ON THE PATROL CORRIDOR.",
    "b": "30 cr funded the relief call — FOREMAN sends the shift at Patrol Corridor on your credit. — PUCK ON THE PATROL CORRIDOR.",
    "c": "You left Patrol Corridor. The work stayed with the crew that owned it. — PUCK ON THE PATROL CORRIDOR."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "tow_clear",
    "hasProp": true
  }
});
