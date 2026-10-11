// Pilgrim Lamp Walk — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_pilgrim_lamp_walk",
  "title": "Pilgrim Lamp Walk",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    },
    {
      "role": "ship_2",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 160,
      "dz": 70,
      "scanLabel": "CANTOR 3"
    }
  ],
  "choices": {
    "a": {
      "id": "a",
      "label": "Keep their passage",
      "playerLine": "I will hold the lane while the lamp procession passes."
    },
    "b": {
      "id": "b",
      "label": "Cross the line",
      "playerLine": "I will cross their bearing before the last lamp fades."
    },
    "c": {
      "id": "c",
      "label": "Wait beyond",
      "playerLine": "I will wait beyond the procession and its lamps."
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
      "line": "CANTOR: We walk the lamp line where the Veil loses its edges.",
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
      "line": "Each hull leaves one measured length for the next.",
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
      "line": "The last lamp crossed without losing the first.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_pilgrim_lamp_walk",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "scene_pilgrim_lamp_walk",
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
      "line": "The line opened once, then closed behind your hull.",
      "channel": "info",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "scene_pilgrim_lamp_walk",
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
      "line": "You waited beyond the measured wake.",
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

export const encounterOrder = 580;
export const trigger = deepFreeze({
  "id": "scene_pilgrim_lamp_walk",
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
    "place": "colony",
    "twist": "follow_on",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_veil_nebula",
    "sector_sedna_dark",
    "sector_phoebe_echo"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Pilgrim Lamp Walk",
  "primaryLine": "CANTOR: We walk the lamp line where the Veil loses its edges.",
  "factionId": "faction_choir",
  "choices": {
    "a": {
      "id": "a",
      "label": "Keep their passage",
      "playerLine": "I will hold the lane while the lamp procession passes."
    },
    "b": {
      "id": "b",
      "label": "Cross the line",
      "playerLine": "I will cross their bearing before the last lamp fades."
    },
    "c": {
      "id": "c",
      "label": "Wait beyond",
      "playerLine": "I will wait beyond the procession and its lamps."
    }
  },
  "timeoutChoice": "c",
  "receipts": {
    "a": "The last lamp crossed without losing the first.",
    "b": "The line opened once, then closed behind your hull.",
    "c": "You waited beyond the measured wake."
  }
});
