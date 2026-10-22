// No Weapons Brawl — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_no_weapons_brawl",
  "title": "No Weapons Brawl",
  "factionId": "faction_pitborn",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "bruiser_brawler",
      "factionId": "faction_pitborn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "RING BRAWLER"
    },
    {
      "role": "ship_1",
      "archetype": "bruiser_brawler",
      "factionId": "faction_pitborn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "RING BRAWLER"
    },
    {
      "role": "ship_2",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 160,
      "dz": 70,
      "scanLabel": "YARD WATCH"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Back the underhull",
      "playerLine": "I will put my count on the smaller brawler."
    },
    {
      "id": "b",
      "label": "Back the yard",
      "playerLine": "I will back the watch and call the ring closed."
    },
    {
      "id": "c",
      "label": "Watch the throw",
      "playerLine": "I am staying outside the ring until the crate lands."
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
      "scanLabel": "THROWN CRATE",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CALLER: No guns in the ring — rocks are legal. Place your count before the throw.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "ring",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "Two hulls are circling a crate mid-air; the yard watch pretends not to count.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "ring",
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
      "line": "The underhull took the count. The crate never touched a hull.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_no_weapons_brawl",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_pitborn",
      "delta": 2,
      "reason": "scene_no_weapons_brawl",
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
      "line": "The watch cleared the ring; the brawlers kept their rocks.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 1,
      "reason": "scene_no_weapons_brawl",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_pitborn",
      "delta": -1,
      "reason": "scene_no_weapons_brawl",
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
      "line": "You watched. The crate is still turning.",
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

export const encounterOrder = 919;
export const trigger = deepFreeze({
  "id": "scene_no_weapons_brawl",
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
    "situation": "ambush",
    "place": "outlaw_zone",
    "twist": "literalized",
    "actor": "faction_pitborn"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_kepler_scar"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "No Weapons Brawl",
  "primaryLine": "CALLER: No guns in the ring — rocks are legal. Place your count before the throw.",
  "factionId": "faction_pitborn",
  "choices": [
    {
      "id": "a",
      "label": "Back the underhull",
      "playerLine": "I will put my count on the smaller brawler."
    },
    {
      "id": "b",
      "label": "Back the yard",
      "playerLine": "I will back the watch and call the ring closed."
    },
    {
      "id": "c",
      "label": "Watch the throw",
      "playerLine": "I am staying outside the ring until the crate lands."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The underhull took the count. The crate never touched a hull.",
    "b": "The watch cleared the ring; the brawlers kept their rocks.",
    "c": "You watched. The crate is still turning."
  }
});
