// STAMP ON THE MINING BELT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_mining_belt_toll_free_admirers",
  "title": "STAMP ON THE MINING BELT",
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
      "label": "Tend the stamp",
      "playerLine": "I'll tend the stamp."
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
      "next": "prop"
    },
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "STAMP",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "NELL: The stamp is the whole reason we are stopped. Do not improve it.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "creep",
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
      "line": "NELL: STAMP ON THE MINING BELT has a receipt. Make yours short.",
      "channel": "info",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The stamp has a serial someone still loves.",
      "channel": "info",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "mining belt does not get quieter if you boost.",
      "channel": "info",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "creep",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "NELL: Still on the mining belt. The stamp on the mining belt does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "creep",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "You tended the stamp. The lane kept its reason.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_mining_belt_toll_free_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_mining_belt_toll_free_admirers",
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
      "line": "Witnessed. The stamp stays their problem and their pride.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_mining_belt_toll_free_admirers",
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
      "reason": "lived_mining_belt_toll_free_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 452;
export const trigger = deepFreeze({
  "id": "lived_mining_belt_toll_free_admirers",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "mining_belt"
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
    "place": "mining_belt",
    "twist": "admirers",
    "actor": "faction_free"
  },
  "livedVignette": true,
  "title": "STAMP ON THE MINING BELT",
  "primaryLine": "NELL: The stamp is the whole reason we are stopped. Do not improve it.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Tend the stamp",
      "playerLine": "I'll tend the stamp."
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
    "a": "You tended the stamp. The lane kept its reason.",
    "b": "Witnessed. The stamp stays their problem and their pride.",
    "c": "You refused. The stop continues without a guest."
  }
});
