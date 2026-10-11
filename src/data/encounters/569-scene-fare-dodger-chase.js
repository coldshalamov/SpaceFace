// Fare Dodger Chase — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_fare_dodger_chase",
  "title": "Fare Dodger Chase",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "WARD 1"
    },
    {
      "role": "ship_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "WARD 2"
    }
  ],
  "choices": {
    "a": {
      "id": "a",
      "label": "Read the fee",
      "playerLine": "I will back the patrol and settle the harbour fee."
    },
    "b": {
      "id": "b",
      "label": "Wave it through",
      "playerLine": "Let the skiff pass; the harbour can wait one run."
    },
    "c": {
      "id": "c",
      "label": "Stay clear",
      "playerLine": "I am staying clear; finish the crossing without me."
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
      "line": "WARD: The Answering Buoy clocks one skiff skipping the harbour fee.",
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
      "line": "It cuts the freight spine with the fee still unpaid.",
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
      "line": "Fee recorded. The skiff keeps its engine and its route.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_fare_dodger_chase",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "scene_fare_dodger_chase",
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
      "line": "The skiff cleared the spine before the buoy could answer.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 1,
      "reason": "scene_fare_dodger_chase",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "scene_fare_dodger_chase",
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
      "line": "You stayed out. The patrol kept counting hulls.",
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

export const encounterOrder = 569;
export const trigger = deepFreeze({
  "id": "scene_fare_dodger_chase",
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
    "situation": "patrol",
    "place": "trade_lane",
    "twist": "named",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_helios_prime"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Fare Dodger Chase",
  "primaryLine": "WARD: The Answering Buoy clocks one skiff skipping the harbour fee.",
  "factionId": "faction_scn",
  "choices": {
    "a": {
      "id": "a",
      "label": "Read the fee",
      "playerLine": "I will back the patrol and settle the harbour fee."
    },
    "b": {
      "id": "b",
      "label": "Wave it through",
      "playerLine": "Let the skiff pass; the harbour can wait one run."
    },
    "c": {
      "id": "c",
      "label": "Stay clear",
      "playerLine": "I am staying clear; finish the crossing without me."
    }
  },
  "timeoutChoice": "c",
  "receipts": {
    "a": "Fee recorded. The skiff keeps its engine and its route.",
    "b": "The skiff cleared the spine before the buoy could answer.",
    "c": "You stayed out. The patrol kept counting hulls."
  }
});
