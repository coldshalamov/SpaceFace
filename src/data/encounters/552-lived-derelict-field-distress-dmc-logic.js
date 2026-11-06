// FILTER ON THE DERELICT FIELD — lived vignette. External-only: the day planner must not roll this.
// DUST P1d voice pass: Ceres Refinery card (src/data/communityPersonality.js). Text only.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_derelict_field_distress_dmc_logic",
  "title": "FILTER ON THE DERELICT FIELD",
  "factionId": "faction_dmc",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": 0,
      "dz": 0,
      "scanLabel": "FOREMAN 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": -150,
      "dz": 90,
      "scanLabel": "FOREMAN 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the filter call. Send its last graded bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I’ll hold a lamp off the caller’s approach. Lamps are free."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I can’t answer. File my hull clear of the field."
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
      "line": "FOREMAN: Distress call off the field names a filter. Answer, or the Board files it.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "ring",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The distress tone repeats on the same damaged second, shift-stamped and patient.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "FOREMAN leaves the rescue channel open. Open channels are how the belt grieves.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The filter was sold twice. Both buyers signed. Neither surfaced.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "The Board logs the call beside the tonnage, in the same tidy hand.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "ring",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "FOREMAN: Holding. Rescue keeps the shift; the shift keeps the books.",
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
      "line": "Call answered. The bearing stopped moving, and the Board stamped it received.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_derelict_field_distress_dmc_logic",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_derelict_field_distress_dmc_logic",
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
      "line": "Lamp held. FOREMAN walked the caller through the gap, line by line.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_derelict_field_distress_dmc_logic",
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
      "line": "You left. The filter call stayed open, filed under pending, patiently.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "lived_derelict_field_distress_dmc_logic",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 552;
export const trigger = deepFreeze({
  "id": "lived_derelict_field_distress_dmc_logic",
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
    "situation": "distress",
    "place": "derelict_field",
    "twist": "logic",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "FILTER ON THE DERELICT FIELD",
  "primaryLine": "FOREMAN: Distress call off the field names a filter. Answer, or the Board files it.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the filter call. Send its last graded bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I’ll hold a lamp off the caller’s approach. Lamps are free."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I can’t answer. File my hull clear of the field."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Call answered. The bearing stopped moving while you listened.",
    "b": "Lamp held. FOREMAN took the caller through the marked gap.",
    "c": "You left. The filter call stayed open on their board."
  }
});
