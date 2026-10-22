// Struck Bell — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_struck_bell",
  "title": "Struck Bell",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "BELL KEEPER"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -150,
      "dz": 90,
      "scanLabel": "BELL KEEPER"
    },
    {
      "role": "ship_2",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": 160,
      "dz": 70,
      "scanLabel": "VAEL OBSERVER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Strike the low bell",
      "playerLine": "I will throw at the low spire on the keeper's count."
    },
    {
      "id": "b",
      "label": "Hold the observer's fix",
      "playerLine": "I will hold the observer's bearing while the bells answer."
    },
    {
      "id": "c",
      "label": "Leave the song",
      "playerLine": "I am not the hand this song is waiting for."
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
      "scanLabel": "SINGING CRYSTAL",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CANTOR: The garden answers one struck stone at a time. Throw low, and in order.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "orbit",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The crystal spires ring when anything moves; the keepers are tuning for a song nobody finished.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "orbit",
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
      "line": "The low bell answered in order. The keepers marked your count.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_struck_bell",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "scene_struck_bell",
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
      "line": "The observer's trace held. The song stayed unfinished, but written.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_vael",
      "delta": 1,
      "reason": "scene_struck_bell",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "scene_struck_bell",
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
      "line": "You left the garden to the keepers and the ringing.",
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

export const encounterOrder = 925;
export const trigger = deepFreeze({
  "id": "scene_struck_bell",
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
    "situation": "anomaly",
    "place": "mining_belt",
    "twist": "admirers",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_phoebe_echo"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Struck Bell",
  "primaryLine": "CANTOR: The garden answers one struck stone at a time. Throw low, and in order.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Strike the low bell",
      "playerLine": "I will throw at the low spire on the keeper's count."
    },
    {
      "id": "b",
      "label": "Hold the observer's fix",
      "playerLine": "I will hold the observer's bearing while the bells answer."
    },
    {
      "id": "c",
      "label": "Leave the song",
      "playerLine": "I am not the hand this song is waiting for."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The low bell answered in order. The keepers marked your count.",
    "b": "The observer's trace held. The song stayed unfinished, but written.",
    "c": "You left the garden to the keepers and the ringing."
  }
});
