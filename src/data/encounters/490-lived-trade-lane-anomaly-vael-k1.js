// PLAQUE ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_trade_lane_anomaly_vael_k1",
  "title": "PLAQUE ON THE TRADE LANE",
  "factionId": "faction_vael",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VAEL 1"
    },
    {
      "role": "hull_1",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VAEL 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first plaque trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the plaque signal alone."
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
      "line": "VAEL: The plaque signal repeats from trade lane. Do not answer its second voice.",
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
      "line": "The instrument needle returns to zero one beat too late.",
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
      "line": "VAEL keeps the receiver muted between each pass.",
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
      "line": "The plaque has a serial someone still loves.",
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
      "line": "VAEL: Holding. This does not hurry.",
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
      "line": "Return recorded. The second voice arrived on the old timestamp.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_trade_lane_anomaly_vael_k1",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_trade_lane_anomaly_vael_k1",
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
      "line": "Traces aligned. VAEL found the same missing interval.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_trade_lane_anomaly_vael_k1",
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
      "line": "You left it unread. The signal stayed at trade lane.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": -1,
      "reason": "lived_trade_lane_anomaly_vael_k1",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 490;
export const trigger = deepFreeze({
  "id": "lived_trade_lane_anomaly_vael_k1",
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
    "situation": "anomaly",
    "place": "trade_lane",
    "twist": "k1",
    "actor": "faction_vael"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "PLAQUE ON THE TRADE LANE",
  "primaryLine": "VAEL: The plaque signal repeats from trade lane. Do not answer its second voice.",
  "factionId": "faction_vael",
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first plaque trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the plaque signal alone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Return recorded. The second voice arrived on the old timestamp.",
    "b": "Traces aligned. VAEL found the same missing interval.",
    "c": "You left it unread. The signal stayed at trade lane."
  }
});
