// WINCH ON THE RADIATION FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_radiation_field_toll_free_follow_on",
  "title": "WINCH ON THE RADIATION FIELD",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "NELL 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "NELL 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Tend the winch",
      "playerLine": "I'll tend the winch."
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
      "line": "NELL: The winch is the whole reason we are stopped. Do not improve it.",
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
      "line": "NELL: This is not a fight. If it becomes one, you started it.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "NELL: WINCH ON THE RADIATION FIELD has a receipt. Make yours short.",
      "channel": "info",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The winch has a serial someone still loves.",
      "channel": "info",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "radiation field does not get quieter if you boost.",
      "channel": "info",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 9,
      "motion": "orbit",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "NELL: Still on the radiation field. The winch on the radiation field does not hurry.",
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
      "line": "You tended the winch. The lane kept its reason.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_radiation_field_toll_free_follow_on",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_radiation_field_toll_free_follow_on",
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
      "line": "Witnessed. The winch stays their problem and their pride.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_radiation_field_toll_free_follow_on",
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
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_radiation_field_toll_free_follow_on",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 470;
export const trigger = deepFreeze({
  "id": "lived_radiation_field_toll_free_follow_on",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "radiation_field"
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
    "place": "radiation_field",
    "twist": "follow_on",
    "actor": "faction_free"
  },
  "livedVignette": true,
  "title": "WINCH ON THE RADIATION FIELD",
  "primaryLine": "NELL: The winch is the whole reason we are stopped. Do not improve it.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Tend the winch",
      "playerLine": "I'll tend the winch."
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
    "a": "You tended the winch. The lane kept its reason.",
    "b": "Witnessed. The winch stays their problem and their pride.",
    "c": "You refused. The stop continues without a guest."
  }
});
