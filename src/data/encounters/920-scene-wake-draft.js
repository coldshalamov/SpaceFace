// Wake Draft — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_wake_draft",
  "title": "Wake Draft",
  "factionId": "faction_vael",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": 0,
      "dz": 0,
      "scanLabel": "WAKE WARDEN"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_archive",
      "dx": -150,
      "dz": 90,
      "scanLabel": "ARCHIVE READER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Ride the draft",
      "playerLine": "I will ride the wake line at the warden's pace."
    },
    {
      "id": "b",
      "label": "Hold the lab's bearing",
      "playerLine": "I will keep a fix on the field lab while the survey passes."
    },
    {
      "id": "c",
      "label": "Leave the trail",
      "playerLine": "I am not riding a wake that is still departing."
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
      "scanLabel": "WAKE BUOY",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "SURVEYOR: The wake still reads as a wake. Ride the line slow — the readings like slow.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "creep",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "Something huge passed here once; the instrument needle has not finished agreeing.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "creep",
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
      "line": "The survey logged one clean pass; the wake kept its reading.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_wake_draft",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 2,
      "reason": "scene_wake_draft",
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
      "line": "The lab's bearing held. The warden logged your patience.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 1,
      "reason": "scene_wake_draft",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": -1,
      "reason": "scene_wake_draft",
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
      "line": "You left the wake to whoever passed first.",
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

export const encounterOrder = 920;
export const trigger = deepFreeze({
  "id": "scene_wake_draft",
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
    "situation": "wake",
    "place": "anomaly_deep",
    "twist": "named",
    "actor": "faction_vael"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_triton_wake"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Wake Draft",
  "primaryLine": "SURVEYOR: The wake still reads as a wake. Ride the line slow — the readings like slow.",
  "factionId": "faction_vael",
  "choices": [
    {
      "id": "a",
      "label": "Ride the draft",
      "playerLine": "I will ride the wake line at the warden's pace."
    },
    {
      "id": "b",
      "label": "Hold the lab's bearing",
      "playerLine": "I will keep a fix on the field lab while the survey passes."
    },
    {
      "id": "c",
      "label": "Leave the trail",
      "playerLine": "I am not riding a wake that is still departing."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The survey logged one clean pass; the wake kept its reading.",
    "b": "The lab's bearing held. The warden logged your patience.",
    "c": "You left the wake to whoever passed first."
  }
});
