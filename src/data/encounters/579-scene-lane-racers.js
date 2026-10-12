// Lane Racers — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_lane_racers",
  "title": "Lane Racers",
  "factionId": "faction_mts",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "RACER 1"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "RACER 2"
    },
    {
      "role": "ship_2",
      "archetype": "patrol_lawman",
      "factionId": "faction_mts",
      "dx": 160,
      "dz": 70,
      "scanLabel": "MTS PATROL"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Clear the lane",
      "playerLine": "I will ask the racers to leave room for freight."
    },
    {
      "id": "b",
      "label": "Pick a hull",
      "playerLine": "I will back the lead hauler through the next marker."
    },
    {
      "id": "c",
      "label": "Stay off course",
      "playerLine": "I will keep my hull out of their race."
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
      "line": "DESK: Two haulers have made the weigh a starting line.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "chase",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The patrol follows at a speed no freight invoice can explain.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "chase",
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
      "line": "The haulers opened one lane for the waiting freight.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_lane_racers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 2,
      "reason": "scene_lane_racers",
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
      "line": "One mule crossed first. The patrol kept the time.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 1,
      "reason": "scene_lane_racers",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": -1,
      "reason": "scene_lane_racers",
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
      "line": "You left the racers to their own marker.",
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

export const encounterOrder = 579;
export const trigger = deepFreeze({
  "id": "scene_lane_racers",
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
    "place": "trade_lane",
    "twist": "admirers",
    "actor": "faction_mts"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_dione_lane",
    "sector_tethys_junction"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Lane Racers",
  "primaryLine": "DESK: Two haulers have made the weigh a starting line.",
  "factionId": "faction_mts",
  "choices": [
    {
      "id": "a",
      "label": "Clear the lane",
      "playerLine": "I will ask the racers to leave room for freight."
    },
    {
      "id": "b",
      "label": "Pick a hull",
      "playerLine": "I will back the lead hauler through the next marker."
    },
    {
      "id": "c",
      "label": "Stay off course",
      "playerLine": "I will keep my hull out of their race."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The haulers opened one lane for the waiting freight.",
    "b": "One mule crossed first. The patrol kept the time.",
    "c": "You left the racers to their own marker."
  }
});
