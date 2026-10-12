// LAMP ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
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
      "label": "Track the mark",
      "playerLine": "I will follow the lamp trail, slow and outside your line."
    },
    {
      "id": "b",
      "label": "Share the bearing",
      "playerLine": "Send me the last bearing before the mark went cold."
    },
    {
      "id": "c",
      "label": "Leave the search",
      "playerLine": "I am not joining this hunt. Keep trade lane clear."
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
      "line": "VERGE: We found the lamp trail crossing trade lane. Stay outside it.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "depart",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The search grid has a gap where the old beacon failed.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "VERGE reads each empty square before moving the scope.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The lamp has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "trade lane does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "depart",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "VERGE: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "depart",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "The mark held. Your bearing put the trail back together.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
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
      "id": "done_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "Bearing shared. VERGE kept the original search lead.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_trade_lane_hunt_verge_layers_none",
      "next": "done_b"
    },
    {
      "id": "done_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left. The lamp trail kept crossing trade lane.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": -1,
      "reason": "lived_trade_lane_hunt_verge_layers_none",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
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
  "primaryLine": "VERGE: We found the lamp trail crossing trade lane. Stay outside it.",
  "factionId": "faction_verge_layers",
  "choices": [
    {
      "id": "a",
      "label": "Track the mark",
      "playerLine": "I will follow the lamp trail, slow and outside your line."
    },
    {
      "id": "b",
      "label": "Share the bearing",
      "playerLine": "Send me the last bearing before the mark went cold."
    },
    {
      "id": "c",
      "label": "Leave the search",
      "playerLine": "I am not joining this hunt. Keep trade lane clear."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The mark held. Your bearing put the trail back together.",
    "b": "Bearing shared. VERGE kept the original search lead.",
    "c": "You left. The lamp trail kept crossing trade lane."
  }
});
