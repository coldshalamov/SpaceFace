// STAMP ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_trade_lane_patrol_fulfillment_literalized",
  "title": "STAMP ON THE TRADE LANE",
  "factionId": "faction_fulfillment",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_fulfillment",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DISPATCH 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_fulfillment",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DISPATCH 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Answer the scan",
      "playerLine": "I am holding. Read the stamp against my manifest."
    },
    {
      "id": "b",
      "label": "File a question",
      "playerLine": "Log the stop, DISPATCH; I want the rule in writing."
    },
    {
      "id": "c",
      "label": "Leave the lane",
      "playerLine": "I decline the scan. My hull is leaving trade lane."
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
      "line": "DISPATCH: Hold at trade lane. The stamp is not on your manifest.",
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
      "line": "The patrol has one working lamp and no spare explanation.",
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
      "line": "DISPATCH marks the stop before the scanner warms.",
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
      "line": "The stamp has a serial someone still loves.",
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
      "line": "DISPATCH: Holding. This does not hurry.",
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
      "line": "Scan complete. The stamp remains in the same place.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_trade_lane_patrol_fulfillment_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_trade_lane_patrol_fulfillment_literalized",
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
      "line": "Question filed. DISPATCH has to answer it next shift.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_trade_lane_patrol_fulfillment_literalized",
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
      "line": "You left. The patrol kept its route through trade lane.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": -1,
      "reason": "lived_trade_lane_patrol_fulfillment_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 392;
export const trigger = deepFreeze({
  "id": "lived_trade_lane_patrol_fulfillment_literalized",
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
    "situation": "patrol",
    "place": "trade_lane",
    "twist": "literalized",
    "actor": "faction_fulfillment"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "STAMP ON THE TRADE LANE",
  "primaryLine": "DISPATCH: Hold at trade lane. The stamp is not on your manifest.",
  "factionId": "faction_fulfillment",
  "choices": [
    {
      "id": "a",
      "label": "Answer the scan",
      "playerLine": "I am holding. Read the stamp against my manifest."
    },
    {
      "id": "b",
      "label": "File a question",
      "playerLine": "Log the stop, DISPATCH; I want the rule in writing."
    },
    {
      "id": "c",
      "label": "Leave the lane",
      "playerLine": "I decline the scan. My hull is leaving trade lane."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Scan complete. The stamp remains in the same place.",
    "b": "Question filed. DISPATCH has to answer it next shift.",
    "c": "You left. The patrol kept its route through trade lane."
  }
});
