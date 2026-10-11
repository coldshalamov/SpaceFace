// Archive Record Tail — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_archive_record_tail",
  "title": "Archive Record Tail",
  "factionId": "faction_archive",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "quiet_ghost",
      "factionId": "faction_quiet",
      "dx": 0,
      "dz": 0,
      "scanLabel": "ARCHIVIST 1"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_archive",
      "dx": -150,
      "dz": 90,
      "scanLabel": "ARCHIVIST 2"
    }
  ],
  "choices": {
    "a": {
      "id": "a",
      "label": "Recover the record",
      "playerLine": "I will help the archive bring the record back."
    },
    "b": {
      "id": "b",
      "label": "Cover the runner",
      "playerLine": "I will keep the quiet hull ahead of the archive."
    },
    "c": {
      "id": "c",
      "label": "Leave the file",
      "playerLine": "I will not take custody of a moving record."
    }
  },
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
      "line": "ARCHIVIST: A stolen record is running. Its last byte names Orcus.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "chase",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The record skips the same second each time it turns.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "chase",
      "windowS": 22,
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "The archive has a bearing. The record is still incomplete.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_archive_record_tail",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "scene_archive_record_tail",
      "next": "resolve_a"
    },
    {
      "id": "resolve_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "The ghost kept the file and its last missing second.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": 1,
      "reason": "scene_archive_record_tail",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": -1,
      "reason": "scene_archive_record_tail",
      "next": "resolve_b"
    },
    {
      "id": "resolve_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left the record running into the dark.",
      "channel": "info",
      "next": "resolve_c"
    },
    {
      "id": "resolve_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 583;
export const trigger = deepFreeze({
  "id": "scene_archive_record_tail",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core",
    "trade_lane",
    "patrol_corridor",
    "border_checkpoint",
    "refinery_approach",
    "mining_belt",
    "colony",
    "derelict_field",
    "outlaw_zone",
    "radiation_field",
    "nebula_fog",
    "ambush_lane",
    "anomaly_deep",
    "planetary_mass"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 1200,
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
    "place": "anomaly_deep",
    "twist": "depth",
    "actor": "faction_archive"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_orcus_shadow"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Archive Record Tail",
  "primaryLine": "ARCHIVIST: A stolen record is running. Its last byte names Orcus.",
  "factionId": "faction_archive",
  "choices": {
    "a": {
      "id": "a",
      "label": "Recover the record",
      "playerLine": "I will help the archive bring the record back."
    },
    "b": {
      "id": "b",
      "label": "Cover the runner",
      "playerLine": "I will keep the quiet hull ahead of the archive."
    },
    "c": {
      "id": "c",
      "label": "Leave the file",
      "playerLine": "I will not take custody of a moving record."
    }
  },
  "timeoutChoice": "c",
  "receipts": {
    "a": "The archive has a bearing. The record is still incomplete.",
    "b": "The ghost kept the file and its last missing second.",
    "c": "You left the record running into the dark."
  }
});
