// Refuel Hookup — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_refuel_hookup",
  "title": "Refuel Hookup",
  "factionId": "faction_mts",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DESK 1"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DESK 2"
    }
  ],
  "choices": {
    "a": {
      "id": "a",
      "label": "Take the lamp",
      "playerLine": "I will hold the work lamp while they finish refueling."
    },
    "b": {
      "id": "b",
      "label": "Back the hauler",
      "playerLine": "I will lend the free crew a clear line out."
    },
    "c": {
      "id": "c",
      "label": "Leave them coupled",
      "playerLine": "I will leave the fuel line to its own hands."
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
      "line": "DESK: Two hulls are coupled; the lamp-holder still has no shift.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "face",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "Fuel is moving through the line one quiet measure at a time.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "face",
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
      "line": "The lamp stayed steady until the coupler went dry.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_refuel_hookup",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 2,
      "reason": "scene_refuel_hookup",
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
      "line": "The free hauler left with its fuel line capped.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 1,
      "reason": "scene_refuel_hookup",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": -1,
      "reason": "scene_refuel_hookup",
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
      "line": "You left the two hulls facing each other.",
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

export const encounterOrder = 581;
export const trigger = deepFreeze({
  "id": "scene_refuel_hookup",
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
    "place": "patrol_corridor",
    "twist": "literalized",
    "actor": "faction_mts"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_pallas_drift",
    "sector_nereid_shoal",
    "sector_dione_lane"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Refuel Hookup",
  "primaryLine": "DESK: Two hulls are coupled; the lamp-holder still has no shift.",
  "factionId": "faction_mts",
  "choices": {
    "a": {
      "id": "a",
      "label": "Take the lamp",
      "playerLine": "I will hold the work lamp while they finish refueling."
    },
    "b": {
      "id": "b",
      "label": "Back the hauler",
      "playerLine": "I will lend the free crew a clear line out."
    },
    "c": {
      "id": "c",
      "label": "Leave them coupled",
      "playerLine": "I will leave the fuel line to its own hands."
    }
  },
  "timeoutChoice": "c",
  "receipts": {
    "a": "The lamp stayed steady until the coupler went dry.",
    "b": "The free hauler left with its fuel line capped.",
    "c": "You left the two hulls facing each other."
  }
});
