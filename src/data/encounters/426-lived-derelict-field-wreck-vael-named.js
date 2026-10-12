// HYMN ON THE DERELICT FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_derelict_field_wreck_vael_named",
  "title": "HYMN ON THE DERELICT FIELD",
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
      "label": "Read the plate",
      "playerLine": "I will read the hymn plate before anyone starts the tow."
    },
    {
      "id": "b",
      "label": "Hold the wreck",
      "playerLine": "I can hold the wreck clear while you check the registry."
    },
    {
      "id": "c",
      "label": "Leave it drifting",
      "playerLine": "I am leaving it here. Keep the hymn out of my route."
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
      "line": "VAEL: The hymn is stamped on a wreck at derelict field. Do not cut yet.",
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
      "line": "The hull number stops halfway through the last digit.",
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
      "line": "VAEL keeps the cutting torch pointed at the deck.",
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
      "line": "The hymn has a serial someone still loves.",
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
      "line": "VAEL: Holding. This does not hurry.",
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
      "line": "Plate read. The registry lists a shift, not a final owner.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_derelict_field_wreck_vael_named",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_derelict_field_wreck_vael_named",
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
      "line": "Wreck held. The next registry pass can happen without drift.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_derelict_field_wreck_vael_named",
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
      "line": "You left it. The hymn keeps its slow turn at derelict field.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": -1,
      "reason": "lived_derelict_field_wreck_vael_named",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 426;
export const trigger = deepFreeze({
  "id": "lived_derelict_field_wreck_vael_named",
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
    "situation": "wreck",
    "place": "derelict_field",
    "twist": "named",
    "actor": "faction_vael"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "HYMN ON THE DERELICT FIELD",
  "primaryLine": "VAEL: The hymn is stamped on a wreck at derelict field. Do not cut yet.",
  "factionId": "faction_vael",
  "choices": [
    {
      "id": "a",
      "label": "Read the plate",
      "playerLine": "I will read the hymn plate before anyone starts the tow."
    },
    {
      "id": "b",
      "label": "Hold the wreck",
      "playerLine": "I can hold the wreck clear while you check the registry."
    },
    {
      "id": "c",
      "label": "Leave it drifting",
      "playerLine": "I am leaving it here. Keep the hymn out of my route."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Plate read. The registry lists a shift, not a final owner.",
    "b": "Wreck held. The next registry pass can happen without drift.",
    "c": "You left it. The hymn keeps its slow turn at derelict field."
  }
});
