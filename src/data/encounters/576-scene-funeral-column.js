// Funeral Column — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_funeral_column",
  "title": "Funeral Column",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "PILGRIM 1"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -150,
      "dz": 90,
      "scanLabel": "PILGRIM 2"
    },
    {
      "role": "ship_2",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 160,
      "dz": 70,
      "scanLabel": "PILGRIM 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Hold the lane",
      "playerLine": "I will keep the crossing clear until the column passes."
    },
    {
      "id": "b",
      "label": "Cross the column",
      "playerLine": "I will cross their line before the dark berth closes."
    },
    {
      "id": "c",
      "label": "Wait outside",
      "playerLine": "I will wait beyond the route and let them pass."
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
      "line": "CANTOR: The Candle Fleet held one dark place for this column.",
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
      "line": "Three hulls keep the same distance from the empty fourth berth.",
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
      "line": "The column crossed without changing its order.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_funeral_column",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "scene_funeral_column",
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
      "line": "The hymn broke once. The column kept its bearing.",
      "channel": "info",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "scene_funeral_column",
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
      "line": "You waited beyond the empty berth.",
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
  "id": "scene_funeral_column",
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
    "place": "civilian_core",
    "twist": "admirers",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_helios_prime",
    "sector_veil_nebula",
    "sector_phoebe_echo",
    "sector_triton_wake"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Funeral Column",
  "primaryLine": "CANTOR: The Candle Fleet held one dark place for this column.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Hold the lane",
      "playerLine": "I will keep the crossing clear until the column passes."
    },
    {
      "id": "b",
      "label": "Cross the column",
      "playerLine": "I will cross their line before the dark berth closes."
    },
    {
      "id": "c",
      "label": "Wait outside",
      "playerLine": "I will wait beyond the route and let them pass."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The column crossed without changing its order.",
    "b": "The hymn broke once. The column kept its bearing.",
    "c": "You waited beyond the empty berth."
  }
});
