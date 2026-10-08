// HYMN ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_trade_lane_toll_helix_k1",
  "title": "HYMN ON THE TRADE LANE",
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
      "label": "Tend the hymn",
      "playerLine": "I'll tend the hymn."
    },
    {
      "id": "b",
      "label": "Witness and leave",
      "playerLine": "Witnessed. Leaving."
    },
    {
      "id": "c",
      "label": "Refuse the stop",
      "playerLine": "Not my stop."
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
      "line": "HX-12 — VARIANCE FILE OPEN. HYMN IS IN THE LANE. NO ACTION REQUIRED.",
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
      "line": "HX-12: This is not a fight. If it becomes one, you started it.",
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
      "line": "HX-12: HYMN ON THE TRADE LANE has a receipt. Make yours short.",
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
      "line": "The hymn has a serial someone still loves.",
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
      "line": "HX-12: Holding. This does not hurry.",
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
      "line": "You tended the hymn. The lane kept its reason.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_trade_lane_toll_helix_k1",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_trade_lane_toll_helix_k1",
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
      "line": "Witnessed. The hymn stays their problem and their pride.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_trade_lane_toll_helix_k1",
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
      "line": "You refused. The stop continues without a guest.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": -1,
      "reason": "lived_trade_lane_toll_helix_k1",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 546;
export const trigger = deepFreeze({
  "id": "lived_trade_lane_toll_helix_k1",
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
    "situation": "toll",
    "place": "trade_lane",
    "twist": "k1",
    "actor": "faction_helix"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "HYMN ON THE TRADE LANE",
  "primaryLine": "HX-12 — VARIANCE FILE OPEN. HYMN IS IN THE LANE. NO ACTION REQUIRED.",
  "factionId": "faction_helix",
  "choices": [
    {
      "id": "a",
      "label": "Tend the hymn",
      "playerLine": "I'll tend the hymn."
    },
    {
      "id": "b",
      "label": "Witness and leave",
      "playerLine": "Witnessed. Leaving."
    },
    {
      "id": "c",
      "label": "Refuse the stop",
      "playerLine": "Not my stop."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You tended the hymn. The lane kept its reason.",
    "b": "Witnessed. The hymn stays their problem and their pride.",
    "c": "You refused. The stop continues without a guest."
  }
});
