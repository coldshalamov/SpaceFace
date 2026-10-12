// Fresh Wreck Vultures — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_fresh_wreck_vultures",
  "title": "Fresh Wreck Vultures",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VULTURE 1"
    },
    {
      "role": "ship_1",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VULTURE 2"
    },
    {
      "role": "ship_2",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 160,
      "dz": 70,
      "scanLabel": "VULTURE 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Protect the claim",
      "playerLine": "I will hold the wreck clear until its owner answers."
    },
    {
      "id": "b",
      "label": "Back the cutters",
      "playerLine": "I will leave the wreck to the Reach salvage crews."
    },
    {
      "id": "c",
      "label": "Keep clear",
      "playerLine": "I will not enter a field where the claim is still warm."
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
      "scanLabel": "FRESH WRECK",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "SLIP: Fresh wreck. Reach cutters are already measuring the gaps.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "vulture",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The beacon is still warm. The vultures have stopped pretending.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "vulture",
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
      "line": "The owner kept the first claim on the beacon.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_fresh_wreck_vultures",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "scene_fresh_wreck_vultures",
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
      "line": "Reach marked three cuts and called the wreck open.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 1,
      "reason": "scene_fresh_wreck_vultures",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "scene_fresh_wreck_vultures",
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
      "line": "You stayed outside the wreck field.",
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

export const encounterOrder = 576;
export const trigger = deepFreeze({
  "id": "scene_fresh_wreck_vultures",
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
    "situation": "wreck",
    "place": "derelict_field",
    "twist": "unique_wreck",
    "actor": "faction_reach"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_pallas_drift",
    "sector_ashfall_reach",
    "sector_kepler_scar",
    "sector_io_reach"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Fresh Wreck Vultures",
  "primaryLine": "SLIP: Fresh wreck. Reach cutters are already measuring the gaps.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Protect the claim",
      "playerLine": "I will hold the wreck clear until its owner answers."
    },
    {
      "id": "b",
      "label": "Back the cutters",
      "playerLine": "I will leave the wreck to the Reach salvage crews."
    },
    {
      "id": "c",
      "label": "Keep clear",
      "playerLine": "I will not enter a field where the claim is still warm."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The owner kept the first claim on the beacon.",
    "b": "Reach marked three cuts and called the wreck open.",
    "c": "You stayed outside the wreck field."
  }
});
