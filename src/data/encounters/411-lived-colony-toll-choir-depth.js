// BELL ON THE COLONY — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_colony_toll_choir_depth",
  "title": "BELL ON THE COLONY",
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
      "label": "Tend the bell",
      "playerLine": "I'll tend the bell."
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
      "line": "CANTOR: The bell is the whole reason we are stopped. Do not improve it.",
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
      "line": "CANTOR: This is not a fight. If it becomes one, you started it.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "CANTOR: BELL ON THE COLONY has a receipt. Make yours short.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The bell has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "colony does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
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
      "line": "CANTOR: Holding. This does not hurry.",
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
      "line": "You tended the bell. The lane kept its reason.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_colony_toll_choir_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_colony_toll_choir_depth",
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
      "line": "Witnessed. The bell stays their problem and their pride.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_colony_toll_choir_depth",
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
      "reason": "lived_colony_toll_choir_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 411;
export const trigger = deepFreeze({
  "id": "lived_colony_toll_choir_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "colony"
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
    "place": "colony",
    "twist": "depth",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "BELL ON THE COLONY",
  "primaryLine": "CANTOR: The bell is the whole reason we are stopped. Do not improve it.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Tend the bell",
      "playerLine": "I'll tend the bell."
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
    "a": "You tended the bell. The lane kept its reason.",
    "b": "Witnessed. The bell stays their problem and their pride.",
    "c": "You refused. The stop continues without a guest."
  }
});
