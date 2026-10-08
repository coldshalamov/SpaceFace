// KETTLE HOLD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "cold_kettle",
  "title": "KETTLE HOLD",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "BRACK 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "BRACK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the mug",
      "playerLine": "I'll take the mug."
    },
    {
      "id": "b",
      "label": "Wave the slot through",
      "playerLine": "The slot can move."
    },
    {
      "id": "c",
      "label": "Hold clear",
      "playerLine": "I'll hold outside."
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
      "line": "BRACK: Kettle's on. Pass now, pass dry.",
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
      "line": "The mug is chipped on the station side.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "Nobody files a kill for hot water.",
      "channel": "info",
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
      "line": "BRACK: Still on the civilian core. The kettle hold does not hurry.",
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
      "line": "Neighbor for a minute. The kettle outranks the slot.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "cold_kettle",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "cold_kettle",
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
      "line": "You waved them through. The kettle still sings.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "cold_kettle",
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
      "line": "You held clear. Weather, not a boarding.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "cold_kettle",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 372;
export const trigger = deepFreeze({
  "id": "cold_kettle",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core"
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
    "situation": "trade",
    "place": "civilian_core",
    "twist": "none",
    "actor": "mule_trader"
  },
  "livedVignette": true,
  "title": "KETTLE HOLD",
  "primaryLine": "BRACK: Kettle's on. Pass now, pass dry.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Take the mug",
      "playerLine": "I'll take the mug."
    },
    {
      "id": "b",
      "label": "Wave the slot through",
      "playerLine": "The slot can move."
    },
    {
      "id": "c",
      "label": "Hold clear",
      "playerLine": "I'll hold outside."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Neighbor for a minute. The kettle outranks the slot.",
    "b": "You waved them through. The kettle still sings.",
    "c": "You held clear. Weather, not a boarding."
  }
});
