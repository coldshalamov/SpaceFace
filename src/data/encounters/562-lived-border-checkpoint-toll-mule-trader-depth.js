// MANIFEST ON THE BORDER CHECKPOINT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_border_checkpoint_toll_mule_trader_depth",
  "title": "MANIFEST ON THE BORDER CHECKPOINT",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "MOSS 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "MOSS 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Pay the count",
      "playerLine": "MOSS, I will pay for the manifest and take the marked lane."
    },
    {
      "id": "b",
      "label": "Ask for proof",
      "playerLine": "Show me the manifest count before I enter border checkpoint."
    },
    {
      "id": "c",
      "label": "Leave the toll",
      "playerLine": "I decline the manifest; clear my hull from border checkpoint."
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
      "line": "MOSS: The manifest is due at border checkpoint. Pay, dispute, or keep moving.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "orbit",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The toll board has one number and three kinds of handwriting.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "MOSS counts the queue by hull, not by promise.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The manifest has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "border checkpoint does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "orbit",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "MOSS: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "orbit",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Count cleared. The manifest crossed border checkpoint under your name.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_border_checkpoint_toll_mule_trader_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_border_checkpoint_toll_mule_trader_depth",
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
      "line": "Dispute logged. MOSS kept the original count intact.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_border_checkpoint_toll_mule_trader_depth",
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
      "line": "Declined. The manifest stays on their side of border checkpoint.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_border_checkpoint_toll_mule_trader_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 562;
export const trigger = deepFreeze({
  "id": "lived_border_checkpoint_toll_mule_trader_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "border_checkpoint"
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
    "place": "border_checkpoint",
    "twist": "depth",
    "actor": "mule_trader"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "MANIFEST ON THE BORDER CHECKPOINT",
  "primaryLine": "MOSS: The manifest is due at border checkpoint. Pay, dispute, or keep moving.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Pay the count",
      "playerLine": "MOSS, I will pay for the manifest and take the marked lane."
    },
    {
      "id": "b",
      "label": "Ask for proof",
      "playerLine": "Show me the manifest count before I enter border checkpoint."
    },
    {
      "id": "c",
      "label": "Leave the toll",
      "playerLine": "I decline the manifest; clear my hull from border checkpoint."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Count cleared. The manifest crossed border checkpoint under your name.",
    "b": "Dispute logged. MOSS kept the original count intact.",
    "c": "Declined. The manifest stays on their side of border checkpoint."
  }
});
