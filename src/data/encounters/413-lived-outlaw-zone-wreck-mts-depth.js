// SHADE ON THE OUTLAW ZONE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_outlaw_zone_wreck_mts_depth",
  "title": "SHADE ON THE OUTLAW ZONE",
  "factionId": "faction_mts",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DESK 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DESK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Haul the shade clear of both hulls",
      "playerLine": "I drag the shade a hundred-eighty off both scavenger hulls and leave it settled."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, DESK — send the relief to Outlaw Zone; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, DESK — my hull is leaving Outlaw Zone."
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
      "scanLabel": "SHADE",
      "dx": 40,
      "dz": -20,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "DESK: The shade is stamped on a wreck at Outlaw Zone. Do not cut yet. — SHADE ON THE OUTLAW ZONE.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "weave",
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
      "motion": "weave",
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
      "motion": "weave",
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
      "motion": "weave",
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
      "motion": "weave",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "weave",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "DESK: The shade sits inside the scavengers' ring. Drag it a hundred-eighty clear of both their hulls — a hundred-twenty of line work at least — release, settle under five for a two-count. — SHADE ON THE OUTLAW ZONE.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "weave",
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
      "reason": "lived_outlaw_zone_wreck_mts_depth:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "DESK: Time ran out on the work ask — SHADE ON THE OUTLAW ZONE. Nothing owed either way — the lane forgets it.",
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
          "kind": "clearOfActors",
          "of": [
            "hull_0",
            "hull_1"
          ],
          "dist": 180
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
      "timeoutLine": "DESK: The 24 cr stays spent — the relief still runs on your credit at Outlaw Zone; the close-in just never came — SHADE ON THE OUTLAW ZONE.",
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
      "timeoutLine": "DESK: Time ran out on the work ask — SHADE ON THE OUTLAW ZONE. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_outlaw_zone_wreck_mts_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 2,
      "reason": "lived_outlaw_zone_wreck_mts_depth",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 3,
      "reason": "lived_outlaw_zone_wreck_mts_depth:sponsor",
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

export const encounterOrder = 413;
export const trigger = deepFreeze({
  "id": "lived_outlaw_zone_wreck_mts_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "outlaw_zone"
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
    "place": "outlaw_zone",
    "twist": "depth",
    "actor": "faction_mts"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SHADE ON THE OUTLAW ZONE",
  "primaryLine": "DESK: The shade is stamped on a wreck at Outlaw Zone. Do not cut yet.",
  "factionId": "faction_mts",
  "choices": [
    {
      "id": "a",
      "label": "Haul the shade clear of both hulls",
      "playerLine": "I drag the shade a hundred-eighty off both scavenger hulls and leave it settled."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, DESK — send the relief to Outlaw Zone; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, DESK — my hull is leaving Outlaw Zone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The shade rests a hundred-eighty clear of both scavenger hulls at Outlaw Zone. — SHADE ON THE OUTLAW ZONE.",
    "b": "24 cr funded the relief call — DESK sends the shift at Outlaw Zone on your credit. — SHADE ON THE OUTLAW ZONE.",
    "c": "You left Outlaw Zone. The work stayed with the crew that owned it. — SHADE ON THE OUTLAW ZONE."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "clear_scav",
    "hasProp": true
  }
});
