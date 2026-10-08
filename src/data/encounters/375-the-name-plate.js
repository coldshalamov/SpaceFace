// NAME PLATE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "name_plate",
  "title": "NAME PLATE",
  "factionId": "faction_archive",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_archive",
      "dx": 0,
      "dz": 0,
      "scanLabel": "ARCHIVIST 1"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Read JUNO",
      "playerLine": "Reading JUNO."
    },
    {
      "id": "b",
      "label": "Copy the shift",
      "playerLine": "Copying shift four."
    },
    {
      "id": "c",
      "label": "Leave the letters",
      "playerLine": "Leaving the letters."
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
      "line": "ARCHIVIST: The plate reads. The rock does not. Read, or leave the letters.",
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
      "line": "The plate is bolted where a beacon used to be.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "Archive does not invent the missing crew.",
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
      "line": "ARCHIVIST: Still on the derelict field. The name plate does not hurry.",
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
      "line": "One name back in a mouth. JUNO, shift four.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "name_plate",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "name_plate",
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
      "line": "The shift is copied. The rock stays mute.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "name_plate",
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
      "line": "Still only on metal.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": -1,
      "reason": "name_plate",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 375;
export const trigger = deepFreeze({
  "id": "name_plate",
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
    "situation": "anomaly",
    "place": "derelict_field",
    "twist": "none",
    "actor": "faction_archive"
  },
  "livedVignette": true,
  "title": "NAME PLATE",
  "primaryLine": "ARCHIVIST: The plate reads. The rock does not. Read, or leave the letters.",
  "factionId": "faction_archive",
  "choices": [
    {
      "id": "a",
      "label": "Read JUNO",
      "playerLine": "Reading JUNO."
    },
    {
      "id": "b",
      "label": "Copy the shift",
      "playerLine": "Copying shift four."
    },
    {
      "id": "c",
      "label": "Leave the letters",
      "playerLine": "Leaving the letters."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "One name back in a mouth. JUNO, shift four.",
    "b": "The shift is copied. The rock stays mute.",
    "c": "Still only on metal."
  }
});
