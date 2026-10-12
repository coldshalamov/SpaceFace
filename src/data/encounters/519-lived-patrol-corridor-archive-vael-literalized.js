// RIBBON ON THE PATROL CORRIDOR — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_patrol_corridor_archive_vael_literalized",
  "title": "RIBBON ON THE PATROL CORRIDOR",
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
      "label": "Read the name",
      "playerLine": "I will read the ribbon plate exactly as it is cut."
    },
    {
      "id": "b",
      "label": "Copy the record",
      "playerLine": "Copy the shift mark too; names are not the whole record."
    },
    {
      "id": "c",
      "label": "Leave the plate",
      "playerLine": "I will not alter it. Leave the ribbon in the archive."
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
      "line": "VAEL: The ribbon carries a name at patrol corridor. Read it without adding one.",
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
      "line": "The archive keeps a space where a crew count should be.",
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
      "line": "VAEL reads the date before reading the name.",
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
      "line": "The ribbon has a serial someone still loves.",
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
      "line": "patrol corridor does not get quieter if you boost.",
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
      "line": "VAEL: Holding. This does not hurry.",
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
      "line": "Name read once. The plate gives no second line.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_patrol_corridor_archive_vael_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_patrol_corridor_archive_vael_literalized",
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
      "line": "Record copied. VAEL left the blank field blank.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "lived_patrol_corridor_archive_vael_literalized",
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
      "line": "You left the plate. Its lettering stayed at patrol corridor.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": -1,
      "reason": "lived_patrol_corridor_archive_vael_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 519;
export const trigger = deepFreeze({
  "id": "lived_patrol_corridor_archive_vael_literalized",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "patrol_corridor"
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
    "situation": "archive",
    "place": "patrol_corridor",
    "twist": "literalized",
    "actor": "faction_vael"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "RIBBON ON THE PATROL CORRIDOR",
  "primaryLine": "VAEL: The ribbon carries a name at patrol corridor. Read it without adding one.",
  "factionId": "faction_vael",
  "choices": [
    {
      "id": "a",
      "label": "Read the name",
      "playerLine": "I will read the ribbon plate exactly as it is cut."
    },
    {
      "id": "b",
      "label": "Copy the record",
      "playerLine": "Copy the shift mark too; names are not the whole record."
    },
    {
      "id": "c",
      "label": "Leave the plate",
      "playerLine": "I will not alter it. Leave the ribbon in the archive."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Name read once. The plate gives no second line.",
    "b": "Record copied. VAEL left the blank field blank.",
    "c": "You left the plate. Its lettering stayed at patrol corridor."
  }
});
