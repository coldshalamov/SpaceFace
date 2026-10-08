// VEIL WALK — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "veil_walk",
  "title": "VEIL WALK",
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
    },
    {
      "role": "hull_2",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 160,
      "dz": 70,
      "scanLabel": "CANTOR 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Escort the last voice",
      "playerLine": "I have the last voice."
    },
    {
      "id": "b",
      "label": "Parallel outside",
      "playerLine": "Paralleling."
    },
    {
      "id": "c",
      "label": "Jump the hymn",
      "playerLine": "Jumping the hymn."
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
      "line": "CANTOR: The fog takes order. Half burn. Pass outside the voices.",
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
      "line": "Pilgrims at half burn. The hymn is the formation.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "Jumping a hymn is a kind of cut.",
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
      "line": "CANTOR: Still on the nebula fog. The veil walk does not hurry.",
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
      "line": "The verse exits the fog together.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "veil_walk",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "veil_walk",
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
      "line": "You stayed outside the voices. They still made it.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "veil_walk",
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
      "line": "One voice short. The fog kept a name.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "veil_walk",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 389;
export const trigger = deepFreeze({
  "id": "veil_walk",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "nebula_fog"
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
    "situation": "convoy",
    "place": "nebula_fog",
    "twist": "none",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "title": "VEIL WALK",
  "primaryLine": "CANTOR: The fog takes order. Half burn. Pass outside the voices.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Escort the last voice",
      "playerLine": "I have the last voice."
    },
    {
      "id": "b",
      "label": "Parallel outside",
      "playerLine": "Paralleling."
    },
    {
      "id": "c",
      "label": "Jump the hymn",
      "playerLine": "Jumping the hymn."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The verse exits the fog together.",
    "b": "You stayed outside the voices. They still made it.",
    "c": "One voice short. The fog kept a name."
  }
});
