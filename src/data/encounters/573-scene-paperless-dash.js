// Paperless Dash — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_paperless_dash",
  "title": "Paperless Dash",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "quiet_ghost",
      "factionId": "faction_quiet",
      "dx": 0,
      "dz": 0,
      "scanLabel": "PAPERLESS FREIGHT"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CUSTOMS CUTTER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Back the cutter",
      "playerLine": "I will help customs take the unlisted freight."
    },
    {
      "id": "b",
      "label": "Clear a path",
      "playerLine": "I will give the paperless hull one clean line into fog."
    },
    {
      "id": "c",
      "label": "Stay unlisted",
      "playerLine": "I am not adding my name to somebody else’s manifest."
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
      "line": "CLERK: Freight has no papers. The fog is not a stamp.",
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
      "line": "The cutter reads the empty manifest into an empty channel.",
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
      "line": "The cutter got a bearing. The cargo stayed covered.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_paperless_dash",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "scene_paperless_dash",
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
      "line": "The ghost went into the fog with its hold shut.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": 1,
      "reason": "scene_paperless_dash",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "scene_paperless_dash",
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
      "line": "You kept your name off the manifest.",
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

export const encounterOrder = 573;
export const trigger = deepFreeze({
  "id": "scene_paperless_dash",
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
    "situation": "trade",
    "place": "nebula_fog",
    "twist": "literalized",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_nyx_march",
    "sector_eris_margin",
    "sector_proteus_well",
    "sector_eunomia_gulf"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Paperless Dash",
  "primaryLine": "CLERK: Freight has no papers. The fog is not a stamp.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Back the cutter",
      "playerLine": "I will help customs take the unlisted freight."
    },
    {
      "id": "b",
      "label": "Clear a path",
      "playerLine": "I will give the paperless hull one clean line into fog."
    },
    {
      "id": "c",
      "label": "Stay unlisted",
      "playerLine": "I am not adding my name to somebody else’s manifest."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The cutter got a bearing. The cargo stayed covered.",
    "b": "The ghost went into the fog with its hold shut.",
    "c": "You kept your name off the manifest."
  }
});
