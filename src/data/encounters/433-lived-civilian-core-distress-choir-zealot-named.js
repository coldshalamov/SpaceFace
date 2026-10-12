// VISOR ON THE CIVILIAN CORE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_civilian_core_distress_choir_zealot_named",
  "title": "VISOR ON THE CIVILIAN CORE",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "choir_zealot",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "hull_1",
      "archetype": "choir_zealot",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the visor call. Send its last clean bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I can hold a lamp outside the caller’s approach."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I cannot answer. Keep my hull clear of civilian core."
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
      "line": "CANTOR: A distress call names the visor near civilian core. Answer or stand clear.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "face",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The distress tone repeats on the same damaged second.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "CANTOR leaves the rescue channel open after the call ends.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The visor has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "civilian core does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "face",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "CANTOR: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "face",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Call answered. The bearing stopped moving while you listened.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_civilian_core_distress_choir_zealot_named",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_civilian_core_distress_choir_zealot_named",
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
      "line": "Lamp held. CANTOR took the caller through the marked gap.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_civilian_core_distress_choir_zealot_named",
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
      "line": "You left. The visor call stayed open on their board.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_civilian_core_distress_choir_zealot_named",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 433;
export const trigger = deepFreeze({
  "id": "lived_civilian_core_distress_choir_zealot_named",
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
    "situation": "distress",
    "place": "civilian_core",
    "twist": "named",
    "actor": "choir_zealot"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "VISOR ON THE CIVILIAN CORE",
  "primaryLine": "CANTOR: A distress call names the visor near civilian core. Answer or stand clear.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the visor call. Send its last clean bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I can hold a lamp outside the caller’s approach."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I cannot answer. Keep my hull clear of civilian core."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Call answered. The bearing stopped moving while you listened.",
    "b": "Lamp held. CANTOR took the caller through the marked gap.",
    "c": "You left. The visor call stayed open on their board."
  }
});
