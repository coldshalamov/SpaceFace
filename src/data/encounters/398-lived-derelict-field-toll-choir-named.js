// SATCHEL ON THE DERELICT FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_derelict_field_toll_choir_named",
  "title": "SATCHEL ON THE DERELICT FIELD",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "hull_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Tend the satchel",
      "playerLine": "I'll tend the satchel."
    },
    {
      "id": "b",
      "label": "Witness and leave",
      "playerLine": "Witnessed. Leaving."
    },
    {
      "id": "c",
      "label": "Refuse the stop",
      "playerLine": "Not my stop."
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
      "line": "CANTOR: The satchel is the whole reason we are stopped. Do not improve it.",
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
      "line": "CANTOR: This is not a fight. If it becomes one, you started it.",
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
      "line": "CANTOR: SATCHEL ON THE DERELICT FIELD has a receipt. Make yours short.",
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
      "line": "The satchel has a serial someone still loves.",
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
      "line": "CANTOR: Holding. This does not hurry.",
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
      "line": "You tended the satchel. The lane kept its reason.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_derelict_field_toll_choir_named",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_derelict_field_toll_choir_named",
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
      "line": "Witnessed. The satchel stays their problem and their pride.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_derelict_field_toll_choir_named",
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
      "line": "You refused. The stop continues without a guest.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "lived_derelict_field_toll_choir_named",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 398;
export const trigger = deepFreeze({
  "id": "lived_derelict_field_toll_choir_named",
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
    "twist": "named",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SATCHEL ON THE DERELICT FIELD",
  "primaryLine": "CANTOR: The satchel is the whole reason we are stopped. Do not improve it.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Tend the satchel",
      "playerLine": "I'll tend the satchel."
    },
    {
      "id": "b",
      "label": "Witness and leave",
      "playerLine": "Witnessed. Leaving."
    },
    {
      "id": "c",
      "label": "Refuse the stop",
      "playerLine": "Not my stop."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You tended the satchel. The lane kept its reason.",
    "b": "Witnessed. The satchel stays their problem and their pride.",
    "c": "You refused. The stop continues without a guest."
  }
});
