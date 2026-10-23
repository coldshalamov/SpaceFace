// RIBBON ON THE NEBULA FOG — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_nebula_fog_escort_verge_layers_none",
  "title": "RIBBON ON THE NEBULA FOG",
  "factionId": "faction_verge_layers",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VERGE 1"
    },
    {
      "role": "hull_1",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VERGE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Thread the escort gap, then hold formation",
      "playerLine": "I cross between the escort pair and hold formation off your lead through Nebula Fog."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, VERGE — send the relief to Nebula Fog instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, VERGE — my hull is leaving Nebula Fog."
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
      "line": "VERGE: Keep the ribbon behind your drive through nebula fog. No passing. — RIBBON ON THE NEBULA FOG.",
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
      "line": "VERGE: Thread the gap between the two escort hulls, then hold formation off the lead. — RIBBON ON THE NEBULA FOG.",
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
      "amount": 24,
      "reason": "lived_nebula_fog_escort_verge_layers_none:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "VERGE: Time ran out on the work ask — RIBBON ON THE NEBULA FOG. Nothing owed either way — the lane forgets it.",
      "keepMotion": true,
      "steps": [
        {
          "kind": "gapCross",
          "of": [
            "hull_0",
            "hull_1"
          ],
          "within": 60
        },
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
      "timeoutLine": "VERGE: Time ran out on the work ask — RIBBON ON THE NEBULA FOG. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "VERGE: Time ran out on the work ask — RIBBON ON THE NEBULA FOG. Nothing owed either way — the lane forgets it.",
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
      "reason": "lived_nebula_fog_escort_verge_layers_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_nebula_fog_escort_verge_layers_none",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 3,
      "reason": "lived_nebula_fog_escort_verge_layers_none:sponsor",
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

export const encounterOrder = 429;
export const trigger = deepFreeze({
  "id": "lived_nebula_fog_escort_verge_layers_none",
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
    "situation": "escort",
    "place": "nebula_fog",
    "twist": "none",
    "actor": "faction_verge_layers"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "RIBBON ON THE NEBULA FOG",
  "primaryLine": "VERGE: Keep the ribbon behind your drive through nebula fog. No passing.",
  "factionId": "faction_verge_layers",
  "choices": [
    {
      "id": "a",
      "label": "Thread the escort gap, then hold formation",
      "playerLine": "I cross between the escort pair and hold formation off your lead through Nebula Fog."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr",
      "playerLine": "Take 24 cr, VERGE — send the relief to Nebula Fog instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, VERGE — my hull is leaving Nebula Fog."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You threaded the gap between the escorts and held formation off the lead at Nebula Fog. — RIBBON ON THE NEBULA FOG.",
    "b": "24 cr funded the relief call — VERGE sends the shift at Nebula Fog on your credit. — RIBBON ON THE NEBULA FOG.",
    "c": "You left Nebula Fog. The work stayed with the crew that owned it. — RIBBON ON THE NEBULA FOG."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "gap_formation",
    "hasProp": false
  }
});
