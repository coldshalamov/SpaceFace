// MANIFEST ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_trade_lane_archive_understory_depth",
  "title": "MANIFEST ON THE TRADE LANE",
  "factionId": "faction_understory",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SABLE 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SABLE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Read the name",
      "playerLine": "I will read the manifest plate exactly as it is cut."
    },
    {
      "id": "b",
      "label": "Copy the record",
      "playerLine": "Copy the shift mark too; names are not the whole record."
    },
    {
      "id": "c",
      "label": "Leave the plate",
      "playerLine": "I will not alter it. Leave the manifest in the archive."
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
      "line": "SABLE: The manifest carries a name at trade lane. Read it without adding one.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "depart",
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
      "motion": "depart",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "SABLE reads the date before reading the name.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The manifest has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "trade lane does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "depart",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "depart",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "SABLE: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "depart",
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
      "reason": "lived_trade_lane_archive_understory_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_trade_lane_archive_understory_depth",
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
      "line": "Record copied. SABLE left the blank field blank.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_trade_lane_archive_understory_depth",
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
      "line": "You left the plate. Its lettering stayed at trade lane.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": -1,
      "reason": "lived_trade_lane_archive_understory_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 532;
export const trigger = deepFreeze({
  "id": "lived_trade_lane_archive_understory_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "trade_lane"
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
    "place": "trade_lane",
    "twist": "depth",
    "actor": "faction_understory"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "MANIFEST ON THE TRADE LANE",
  "primaryLine": "SABLE: The manifest carries a name at trade lane. Read it without adding one.",
  "factionId": "faction_understory",
  "choices": [
    {
      "id": "a",
      "label": "Read the name",
      "playerLine": "I will read the manifest plate exactly as it is cut."
    },
    {
      "id": "b",
      "label": "Copy the record",
      "playerLine": "Copy the shift mark too; names are not the whole record."
    },
    {
      "id": "c",
      "label": "Leave the plate",
      "playerLine": "I will not alter it. Leave the manifest in the archive."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Name read once. The plate gives no second line.",
    "b": "Record copied. SABLE left the blank field blank.",
    "c": "You left the plate. Its lettering stayed at trade lane."
  }
});
