// Scorched Convoy — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_scorched_convoy",
  "title": "Scorched Convoy",
  "factionId": "faction_dmc",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SCORCHED HAULER"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SCORCHED HAULER"
    },
    {
      "role": "ship_2",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 160,
      "dz": 70,
      "scanLabel": "LANE RAIDER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Ride the rear lamp",
      "playerLine": "I will ride the rear lamp until the lot clears the thin lane."
    },
    {
      "id": "b",
      "label": "Back the raiders",
      "playerLine": "I will let the lane take its percentage and hold the escort's attention."
    },
    {
      "id": "c",
      "label": "Let the lane eat",
      "playerLine": "I am not buying a share of a hot convoy."
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
      "scanLabel": "SCORCHED ORE SLED",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "DISPATCH: Hot lot crossing the thin lane; the cinder crews count every lamp.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "column",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The ore is still warm. The ambush line already knows the schedule.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "column",
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
      "line": "The lot reached the yard still glowing. Dispatch logged your lamp.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_scorched_convoy",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "scene_scorched_convoy",
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
      "line": "The raiders came away lighter than they planned; the convoy kept its order.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 1,
      "reason": "scene_scorched_convoy",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "scene_scorched_convoy",
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
      "line": "You left the lane to take its percentage.",
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

export const encounterOrder = 918;
export const trigger = deepFreeze({
  "id": "scene_scorched_convoy",
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
    "situation": "convoy",
    "place": "ambush_lane",
    "twist": "depth",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_rhea_cinder"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Scorched Convoy",
  "primaryLine": "DISPATCH: Hot lot crossing the thin lane; the cinder crews count every lamp.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Ride the rear lamp",
      "playerLine": "I will ride the rear lamp until the lot clears the thin lane."
    },
    {
      "id": "b",
      "label": "Back the raiders",
      "playerLine": "I will let the lane take its percentage and hold the escort's attention."
    },
    {
      "id": "c",
      "label": "Let the lane eat",
      "playerLine": "I am not buying a share of a hot convoy."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The lot reached the yard still glowing. Dispatch logged your lamp.",
    "b": "The raiders came away lighter than they planned; the convoy kept its order.",
    "c": "You left the lane to take its percentage."
  }
});
