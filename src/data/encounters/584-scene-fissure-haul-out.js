// Fissure Haul Out — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_fissure_haul_out",
  "title": "Fissure Haul Out",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "MOSS 1"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "MOSS 2"
    }
  ],
  "choices": {
    "a": {
      "id": "a",
      "label": "Guard the line",
      "playerLine": "I will keep the haul clear until both hulls are out."
    },
    "b": {
      "id": "b",
      "label": "Mark the salvage",
      "playerLine": "I will mark the load before it clears the fissure."
    },
    "c": {
      "id": "c",
      "label": "Stay above",
      "playerLine": "I will keep outside the seam and let them work."
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
      "line": "MOSS: Fissure haul is moving. Keep the second hull clear of the seam.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "tow",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The tow line has one clean pull left before the fissure shifts.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "tow",
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
      "line": "Both hulls cleared the fissure with the line still attached.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_fissure_haul_out",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "scene_fissure_haul_out",
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
      "line": "The salvage mark stayed on the load through the pull.",
      "channel": "info",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "scene_fissure_haul_out",
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
      "line": "You kept above the seam until the tow passed.",
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

export const encounterOrder = 584;
export const trigger = deepFreeze({
  "id": "scene_fissure_haul_out",
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
    "situation": "salvage",
    "place": "anomaly_deep",
    "twist": "k1",
    "actor": "faction_free"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_haumea_rift"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Fissure Haul Out",
  "primaryLine": "MOSS: Fissure haul is moving. Keep the second hull clear of the seam.",
  "factionId": "faction_free",
  "choices": {
    "a": {
      "id": "a",
      "label": "Guard the line",
      "playerLine": "I will keep the haul clear until both hulls are out."
    },
    "b": {
      "id": "b",
      "label": "Mark the salvage",
      "playerLine": "I will mark the load before it clears the fissure."
    },
    "c": {
      "id": "c",
      "label": "Stay above",
      "playerLine": "I will keep outside the seam and let them work."
    }
  },
  "timeoutChoice": "c",
  "receipts": {
    "a": "Both hulls cleared the fissure with the line still attached.",
    "b": "The salvage mark stayed on the load through the pull.",
    "c": "You kept above the seam until the tow passed."
  }
});
