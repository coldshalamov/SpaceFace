// VARIANCE ON THE APRON — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "variance_apron",
  "title": "VARIANCE ON THE APRON",
  "factionId": "faction_helix",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": 0,
      "dz": 0,
      "scanLabel": "HX-04 1"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Initial the file",
      "playerLine": "Initialed."
    },
    {
      "id": "b",
      "label": "Wait out the mug",
      "playerLine": "I'll wait the mug."
    },
    {
      "id": "c",
      "label": "Depart unsigned",
      "playerLine": "Departing unsigned."
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
      "line": "HX-04 — VARIANCE FILE OPEN. CREW IS DRINKING. BERTH IS NOT. NO ACTION REQUIRED.",
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
      "line": "Helix does not raise its voice. The file does not blink.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "No action required is not the same as nothing happened.",
      "channel": "info",
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
      "line": "HX-04: Still on the border checkpoint. The variance on the apron does not hurry.",
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
      "line": "The fine and the tea share a hand. You initialed.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "variance_apron",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "variance_apron",
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
      "line": "The mug ended. The file noticed you waiting.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "variance_apron",
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
      "line": "Unsigned. The variance remains open, which is its hobby.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": -1,
      "reason": "variance_apron",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 387;
export const trigger = deepFreeze({
  "id": "variance_apron",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "border_checkpoint"
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
    "situation": "puzzle",
    "place": "border_checkpoint",
    "twist": "none",
    "actor": "faction_helix"
  },
  "livedVignette": true,
  "title": "VARIANCE ON THE APRON",
  "primaryLine": "HX-04 — VARIANCE FILE OPEN. CREW IS DRINKING. BERTH IS NOT. NO ACTION REQUIRED.",
  "factionId": "faction_helix",
  "choices": [
    {
      "id": "a",
      "label": "Initial the file",
      "playerLine": "Initialed."
    },
    {
      "id": "b",
      "label": "Wait out the mug",
      "playerLine": "I'll wait the mug."
    },
    {
      "id": "c",
      "label": "Depart unsigned",
      "playerLine": "Departing unsigned."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The fine and the tea share a hand. You initialed.",
    "b": "The mug ended. The file noticed you waiting.",
    "c": "Unsigned. The variance remains open, which is its hobby."
  }
});
