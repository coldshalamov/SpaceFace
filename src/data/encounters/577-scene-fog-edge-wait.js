// Fog Edge Wait — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_fog_edge_wait",
  "title": "Fog Edge Wait",
  "factionId": "faction_mts",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "quiet_ghost",
      "factionId": "faction_quiet",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DESK 1"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_mts",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DESK 2"
    }
  ],
  "choices": {
    "a": {
      "id": "a",
      "label": "Back the cutter",
      "playerLine": "I will help customs hold the fog edge for inspection."
    },
    "b": {
      "id": "b",
      "label": "Warn the runner",
      "playerLine": "I will give the freight hull time to turn away."
    },
    "c": {
      "id": "c",
      "label": "Stay quiet",
      "playerLine": "I will keep this channel empty and my bearing clear."
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
      "line": "DESK: Cutter holds the fog edge. One unlisted freight hull should arrive.",
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
      "line": "The engines idle where the scan line loses its name.",
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
      "line": "The cutter kept the edge and logged the empty approach.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_fog_edge_wait",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 2,
      "reason": "scene_fog_edge_wait",
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
      "line": "The ghost turned before the scan line closed.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": 1,
      "reason": "scene_fog_edge_wait",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": -1,
      "reason": "scene_fog_edge_wait",
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
      "line": "You left the fog to keep its own count.",
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

export const encounterOrder = 577;
export const trigger = deepFreeze({
  "id": "scene_fog_edge_wait",
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
    "situation": "hunt",
    "place": "radiation_field",
    "twist": "depth",
    "actor": "faction_mts"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_pallas_drift",
    "sector_io_reach"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Fog Edge Wait",
  "primaryLine": "DESK: Cutter holds the fog edge. One unlisted freight hull should arrive.",
  "factionId": "faction_mts",
  "choices": {
    "a": {
      "id": "a",
      "label": "Back the cutter",
      "playerLine": "I will help customs hold the fog edge for inspection."
    },
    "b": {
      "id": "b",
      "label": "Warn the runner",
      "playerLine": "I will give the freight hull time to turn away."
    },
    "c": {
      "id": "c",
      "label": "Stay quiet",
      "playerLine": "I will keep this channel empty and my bearing clear."
    }
  },
  "timeoutChoice": "c",
  "receipts": {
    "a": "The cutter kept the edge and logged the empty approach.",
    "b": "The ghost turned before the scan line closed.",
    "c": "You left the fog to keep its own count."
  }
});
