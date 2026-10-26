// LAMP ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_trade_lane_hunt_verge_layers_none",
  "title": "LAMP ON THE TRADE LANE",
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
      "label": "Take the wake station behind the lead",
      "playerLine": "I fall in behind your wake at matched speed and hold it for the six-count through Trade Lane."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, VERGE — send the relief to Trade Lane; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, VERGE — my hull is leaving Trade Lane."
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
      "line": "VERGE: We found the lamp trail crossing Trade Lane. Stay outside it. — LAMP ON THE TRADE LANE.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "depart",
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
      "motion": "depart",
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
      "motion": "depart",
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
      "motion": "depart",
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
      "motion": "depart",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "depart",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "VERGE: Fall in behind our wake — sixty to a hundred-eighty, matched speed, six-count. — LAMP ON THE TRADE LANE.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "depart",
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
      "reason": "lived_trade_lane_hunt_verge_layers_none:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "VERGE: Time ran out on the work ask — LAMP ON THE TRADE LANE. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "VERGE: The 24 cr stays spent — the relief still runs on your credit at Trade Lane; the close-in just never came — LAMP ON THE TRADE LANE.",
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
      "timeoutLine": "VERGE: Time ran out on the work ask — LAMP ON THE TRADE LANE. Nothing owed either way — the lane forgets it.",
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
      "amount": 42,
      "reason": "lived_trade_lane_hunt_verge_layers_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_trade_lane_hunt_verge_layers_none",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 3,
      "reason": "lived_trade_lane_hunt_verge_layers_none:sponsor",
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

export const encounterOrder = 406;
export const trigger = deepFreeze({
  "id": "lived_trade_lane_hunt_verge_layers_none",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "trade_lane"
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
    "situation": "hunt",
    "place": "trade_lane",
    "twist": "none",
    "actor": "faction_verge_layers"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "LAMP ON THE TRADE LANE",
  "primaryLine": "VERGE: We found the lamp trail crossing Trade Lane. Stay outside it.",
  "factionId": "faction_verge_layers",
  "choices": [
    {
      "id": "a",
      "label": "Take the wake station behind the lead",
      "playerLine": "I fall in behind your wake at matched speed and hold it for the six-count through Trade Lane."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 24 cr, then close in slow",
      "playerLine": "Take 24 cr, VERGE — send the relief to Trade Lane; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, VERGE — my hull is leaving Trade Lane."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You rode the wake station behind the lead while it made its hundred at Trade Lane. — LAMP ON THE TRADE LANE.",
    "b": "24 cr funded the relief call — VERGE sends the shift at Trade Lane on your credit. — LAMP ON THE TRADE LANE.",
    "c": "You left Trade Lane. The work stayed with the crew that owned it. — LAMP ON THE TRADE LANE."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "trail",
    "hasProp": false
  }
});
