// Press Gang Tow — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_press_gang_tow",
  "title": "Press Gang Tow",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 0,
      "dz": 0,
      "scanLabel": "PRESS GANG TUG"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "PRESSED HAULER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Cut the tow",
      "playerLine": "I will help the hauler break free of that line."
    },
    {
      "id": "b",
      "label": "Look away",
      "playerLine": "I will leave the Reach crew to finish its business."
    },
    {
      "id": "c",
      "label": "Keep your distance",
      "playerLine": "I will keep clear of both hulls and their paperwork."
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
      "line": "SLIP: The Concealed Harbour can see this tow. Call it a transfer.",
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
      "line": "The aft clamps are closed. Nobody aboard signed the release.",
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
      "line": "The tow line went slack. The hauler kept its people.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_press_gang_tow",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "scene_press_gang_tow",
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
      "line": "The pirate kept the line and took the quiet approach.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 1,
      "reason": "scene_press_gang_tow",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "scene_press_gang_tow",
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
      "line": "You left the harbour to name the transfer.",
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
  "id": "scene_press_gang_tow",
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
    "situation": "escort",
    "place": "outlaw_zone",
    "twist": "depth",
    "actor": "faction_reach"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_sker_haven",
    "sector_kepler_scar"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Press Gang Tow",
  "primaryLine": "SLIP: The Concealed Harbour can see this tow. Call it a transfer.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Cut the tow",
      "playerLine": "I will help the hauler break free of that line."
    },
    {
      "id": "b",
      "label": "Look away",
      "playerLine": "I will leave the Reach crew to finish its business."
    },
    {
      "id": "c",
      "label": "Keep your distance",
      "playerLine": "I will keep clear of both hulls and their paperwork."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The tow line went slack. The hauler kept its people.",
    "b": "The pirate kept the line and took the quiet approach.",
    "c": "You left the harbour to name the transfer."
  }
});
