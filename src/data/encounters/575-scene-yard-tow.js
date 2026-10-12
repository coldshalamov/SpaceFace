// Yard Tow — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_yard_tow",
  "title": "Yard Tow",
  "factionId": "faction_dmc",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": 0,
      "dz": 0,
      "scanLabel": "TUG"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DEAD HAULER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Clear the tow",
      "playerLine": "I will get the dead hull into the yard intact."
    },
    {
      "id": "b",
      "label": "Claim salvage first",
      "playerLine": "I will mark the salvage before that tow reaches the yard."
    },
    {
      "id": "c",
      "label": "Leave the tag",
      "playerLine": "I will leave the claim crews to settle the hull."
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
      "line": "FOREMAN: Long Berth has a dead hull. One tow line is enough.",
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
      "line": "The dead hauler is still carrying somebody else’s claim tag.",
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
      "line": "The tug reached the yard with its claim tag visible.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_yard_tow",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "scene_yard_tow",
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
      "line": "The salvage mark went on before the yard gate.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 1,
      "reason": "scene_yard_tow",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "scene_yard_tow",
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
      "line": "You left the hull between the tug and the yard.",
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

export const encounterOrder = 575;
export const trigger = deepFreeze({
  "id": "scene_yard_tow",
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
    "situation": "yard",
    "place": "refinery_approach",
    "twist": "k1",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_ceres_belt",
    "sector_vesta_forge",
    "sector_charon_expanse",
    "sector_hyperion_cut"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Yard Tow",
  "primaryLine": "FOREMAN: Long Berth has a dead hull. One tow line is enough.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Clear the tow",
      "playerLine": "I will get the dead hull into the yard intact."
    },
    {
      "id": "b",
      "label": "Claim salvage first",
      "playerLine": "I will mark the salvage before that tow reaches the yard."
    },
    {
      "id": "c",
      "label": "Leave the tag",
      "playerLine": "I will leave the claim crews to settle the hull."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The tug reached the yard with its claim tag visible.",
    "b": "The salvage mark went on before the yard gate.",
    "c": "You left the hull between the tug and the yard."
  }
});
