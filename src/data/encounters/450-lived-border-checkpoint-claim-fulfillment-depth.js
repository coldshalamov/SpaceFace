// KETTLE ON THE BORDER CHECKPOINT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_border_checkpoint_claim_fulfillment_depth",
  "title": "KETTLE ON THE BORDER CHECKPOINT",
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
      "label": "Mark the boundary",
      "playerLine": "I will mark the kettle face and leave your cutters room."
    },
    {
      "id": "b",
      "label": "Check the survey",
      "playerLine": "Show me the survey pin before you call this ground yours."
    },
    {
      "id": "c",
      "label": "Leave the claim",
      "playerLine": "I will not work it. Keep the kettle inside your line."
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
      "line": "DISPATCH: The kettle sits inside our claim at border checkpoint. Keep your cutter out.",
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
      "line": "The claim pins lean away from the deepest cut.",
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
      "line": "DISPATCH counts a boundary by the gaps between markers.",
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
      "line": "The kettle has a serial someone still loves.",
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
      "line": "DISPATCH: Holding. This does not hurry.",
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
      "line": "Boundary marked. Both cutter tracks stayed on their own side.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_border_checkpoint_claim_fulfillment_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_border_checkpoint_claim_fulfillment_depth",
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
      "line": "Survey checked. DISPATCH added one pin where the line bends.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_border_checkpoint_claim_fulfillment_depth",
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
      "line": "You left. The kettle face remains under their claim.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": -1,
      "reason": "lived_border_checkpoint_claim_fulfillment_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 450;
export const trigger = deepFreeze({
  "id": "lived_border_checkpoint_claim_fulfillment_depth",
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
    "situation": "claim",
    "place": "border_checkpoint",
    "twist": "depth",
    "actor": "faction_fulfillment"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "KETTLE ON THE BORDER CHECKPOINT",
  "primaryLine": "DISPATCH: The kettle sits inside our claim at border checkpoint. Keep your cutter out.",
  "factionId": "faction_fulfillment",
  "choices": [
    {
      "id": "a",
      "label": "Mark the boundary",
      "playerLine": "I will mark the kettle face and leave your cutters room."
    },
    {
      "id": "b",
      "label": "Check the survey",
      "playerLine": "Show me the survey pin before you call this ground yours."
    },
    {
      "id": "c",
      "label": "Leave the claim",
      "playerLine": "I will not work it. Keep the kettle inside your line."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Boundary marked. Both cutter tracks stayed on their own side.",
    "b": "Survey checked. DISPATCH added one pin where the line bends.",
    "c": "You left. The kettle face remains under their claim."
  }
});
