// Compost Run — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_compost_run",
  "title": "Compost Run",
  "factionId": "faction_understory",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": 0,
      "dz": 0,
      "scanLabel": "COMPOST HAULER"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": -150,
      "dz": 90,
      "scanLabel": "BOARD HULL"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Escort the sled",
      "playerLine": "I will keep the compost sled moving until the stamp clears."
    },
    {
      "id": "b",
      "label": "Slow the board",
      "playerLine": "I will give the board hull a form to read while the sled runs."
    },
    {
      "id": "c",
      "label": "Stay off the row",
      "playerLine": "I am not standing between a sled and its licence clock."
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
      "scanLabel": "COMPOST SLED",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "STEWARD: Compost sled runs before the licence clock lapses. The board hull is watching.",
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
      "line": "Wreck-grown gardens do not wait on paperwork. The stamp does not wait on gardens.",
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
      "line": "The sled reached the garden row inside the licence window.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_compost_run",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "scene_compost_run",
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
      "line": "The board hull read the form twice. The sled made its row.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 1,
      "reason": "scene_compost_run",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": -1,
      "reason": "scene_compost_run",
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
      "line": "You left the clock to the board and the sled to the row.",
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

export const encounterOrder = 921;
export const trigger = deepFreeze({
  "id": "scene_compost_run",
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
    "place": "derelict_field",
    "twist": "named",
    "actor": "faction_understory"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_eunomia_gulf"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Compost Run",
  "primaryLine": "STEWARD: Compost sled runs before the licence clock lapses. The board hull is watching.",
  "factionId": "faction_understory",
  "choices": [
    {
      "id": "a",
      "label": "Escort the sled",
      "playerLine": "I will keep the compost sled moving until the stamp clears."
    },
    {
      "id": "b",
      "label": "Slow the board",
      "playerLine": "I will give the board hull a form to read while the sled runs."
    },
    {
      "id": "c",
      "label": "Stay off the row",
      "playerLine": "I am not standing between a sled and its licence clock."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The sled reached the garden row inside the licence window.",
    "b": "The board hull read the form twice. The sled made its row.",
    "c": "You left the clock to the board and the sled to the row."
  }
});
