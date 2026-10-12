// SLOT ON THE AMBUSH LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_ambush_lane_wake_fulfillment_none",
  "title": "SLOT ON THE AMBUSH LANE",
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
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Log the crossing",
      "playerLine": "I crossed the slot marker. Put my hull on the record."
    },
    {
      "id": "b",
      "label": "Reset the marker",
      "playerLine": "I can reset the buoy before another wake hits it."
    },
    {
      "id": "c",
      "label": "Leave the mark",
      "playerLine": "I will not file it. Leave the slot marker where it drifted."
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
      "line": "DISPATCH: Your wake crossed the slot marker at ambush lane. Log it or clear it.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "hold",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The buoy records the wake long after the water has gone quiet.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "DISPATCH checks the bearing before clearing the channel.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The slot has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "ambush lane does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "hold",
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
      "motion": "hold",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Crossing logged. The wake line is now attached to your hull.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_ambush_lane_wake_fulfillment_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_ambush_lane_wake_fulfillment_none",
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
      "line": "Marker reset. DISPATCH watched its light settle back on bearing.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_ambush_lane_wake_fulfillment_none",
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
      "line": "You left the mark. The slot buoy drifted through ambush lane.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": -1,
      "reason": "lived_ambush_lane_wake_fulfillment_none",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 444;
export const trigger = deepFreeze({
  "id": "lived_ambush_lane_wake_fulfillment_none",
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
    "situation": "wake",
    "place": "ambush_lane",
    "twist": "none",
    "actor": "faction_fulfillment"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SLOT ON THE AMBUSH LANE",
  "primaryLine": "DISPATCH: Your wake crossed the slot marker at ambush lane. Log it or clear it.",
  "factionId": "faction_fulfillment",
  "choices": [
    {
      "id": "a",
      "label": "Log the crossing",
      "playerLine": "I crossed the slot marker. Put my hull on the record."
    },
    {
      "id": "b",
      "label": "Reset the marker",
      "playerLine": "I can reset the buoy before another wake hits it."
    },
    {
      "id": "c",
      "label": "Leave the mark",
      "playerLine": "I will not file it. Leave the slot marker where it drifted."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Crossing logged. The wake line is now attached to your hull.",
    "b": "Marker reset. DISPATCH watched its light settle back on bearing.",
    "c": "You left the mark. The slot buoy drifted through ambush lane."
  }
});
