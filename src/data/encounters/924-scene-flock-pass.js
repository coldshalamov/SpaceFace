// Flock Pass — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_flock_pass",
  "title": "Flock Pass",
  "factionId": "faction_archive",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_archive",
      "dx": 0,
      "dz": 0,
      "scanLabel": "FLOCK READER"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SHADOW WARDEN"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Log the strays",
      "playerLine": "I will help the archive count the strays back into the flock."
    },
    {
      "id": "b",
      "label": "Hold the corridor",
      "playerLine": "I will hold the warden's corridor clear while the flock passes."
    },
    {
      "id": "c",
      "label": "Keep the dim",
      "playerLine": "I am not scanning a flock that counts itself."
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
      "scanLabel": "DEBRIS FLOCK",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "ARCHIVIST: The flock is passing. Whatever herded it still counts the strays.",
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
      "line": "A ring of dead hulls turns around nothing; the count comes out even anyway.",
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
      "line": "The archive has a count. The strays rejoined on the next pass.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_flock_pass",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "scene_flock_pass",
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
      "line": "The corridor held. The warden logged your patience.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 1,
      "reason": "scene_flock_pass",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": -1,
      "reason": "scene_flock_pass",
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
      "line": "You kept the dim. The flock kept its number.",
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

export const encounterOrder = 924;
export const trigger = deepFreeze({
  "id": "scene_flock_pass",
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
    "place": "anomaly_deep",
    "twist": "logic",
    "actor": "faction_verge_layers"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_orcus_shadow"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Flock Pass",
  "primaryLine": "ARCHIVIST: The flock is passing. Whatever herded it still counts the strays.",
  "factionId": "faction_archive",
  "choices": [
    {
      "id": "a",
      "label": "Log the strays",
      "playerLine": "I will help the archive count the strays back into the flock."
    },
    {
      "id": "b",
      "label": "Hold the corridor",
      "playerLine": "I will hold the warden's corridor clear while the flock passes."
    },
    {
      "id": "c",
      "label": "Keep the dim",
      "playerLine": "I am not scanning a flock that counts itself."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The archive has a count. The strays rejoined on the next pass.",
    "b": "The corridor held. The warden logged your patience.",
    "c": "You kept the dim. The flock kept its number."
  }
});
