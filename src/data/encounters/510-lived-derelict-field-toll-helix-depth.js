// KETTLE ON THE DERELICT FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_derelict_field_toll_helix_depth",
  "title": "KETTLE ON THE DERELICT FIELD",
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
      "label": "Pay the count",
      "playerLine": "HX-12, I will pay for the kettle and take the marked lane."
    },
    {
      "id": "b",
      "label": "Ask for proof",
      "playerLine": "Show me the kettle count before I enter derelict field."
    },
    {
      "id": "c",
      "label": "Leave the toll",
      "playerLine": "I decline the kettle; clear my hull from derelict field."
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
      "line": "HX-12 — VARIANCE FILE OPEN. KETTLE IS IN THE LANE. NO ACTION REQUIRED.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "ring",
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
      "motion": "ring",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "HX-12 counts the queue by hull, not by promise.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
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
      "motion": "ring",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "derelict field does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "ring",
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
      "motion": "ring",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Count cleared. The kettle crossed derelict field under your name.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_derelict_field_toll_helix_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_derelict_field_toll_helix_depth",
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
      "line": "Dispute logged. HX-12 kept the original count intact.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_derelict_field_toll_helix_depth",
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
      "line": "Declined. The kettle stays on their side of derelict field.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": -1,
      "reason": "lived_derelict_field_toll_helix_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 510;
export const trigger = deepFreeze({
  "id": "lived_derelict_field_toll_helix_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "derelict_field"
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
    "place": "derelict_field",
    "twist": "depth",
    "actor": "faction_helix"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "KETTLE ON THE DERELICT FIELD",
  "primaryLine": "HX-12 — VARIANCE FILE OPEN. KETTLE IS IN THE LANE. NO ACTION REQUIRED.",
  "factionId": "faction_helix",
  "choices": [
    {
      "id": "a",
      "label": "Pay the count",
      "playerLine": "HX-12, I will pay for the kettle and take the marked lane."
    },
    {
      "id": "b",
      "label": "Ask for proof",
      "playerLine": "Show me the kettle count before I enter derelict field."
    },
    {
      "id": "c",
      "label": "Leave the toll",
      "playerLine": "I decline the kettle; clear my hull from derelict field."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Count cleared. The kettle crossed derelict field under your name.",
    "b": "Dispute logged. HX-12 kept the original count intact.",
    "c": "Declined. The kettle stays on their side of derelict field."
  }
});
