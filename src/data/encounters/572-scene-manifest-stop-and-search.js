// Manifest Stop And Search — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_manifest_stop_and_search",
  "title": "Manifest Stop And Search",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": 0,
      "dz": 0,
      "scanLabel": "HAULER"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CUSTOMS CUTTER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Back the search",
      "playerLine": "I will help customs match the pod to its manifest."
    },
    {
      "id": "b",
      "label": "Back the hauler",
      "playerLine": "I will keep the cutter from turning a mismatch into seizure."
    },
    {
      "id": "c",
      "label": "Stay outside",
      "playerLine": "I am not joining a count that has already started."
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
      "scanLabel": "OPENED POD",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CLERK: Opened pod sits at the weigh; read the seal back.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "hold",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The pod lid is open. The manifest still calls it sealed.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "hold",
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
      "line": "Customs marked the pod opened. The hauler kept its berth.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_manifest_stop_and_search",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "scene_manifest_stop_and_search",
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
      "line": "The hauler left with the seal still in its own hand.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 1,
      "reason": "scene_manifest_stop_and_search",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "scene_manifest_stop_and_search",
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
      "line": "You watched the weigh slip change desks.",
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

export const encounterOrder = 572;
export const trigger = deepFreeze({
  "id": "scene_manifest_stop_and_search",
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
    "situation": "patrol",
    "place": "border_checkpoint",
    "twist": "player_echo",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_tethys_junction",
    "sector_dione_lane"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Manifest Stop And Search",
  "primaryLine": "CLERK: Opened pod sits at the weigh; read the seal back.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Back the search",
      "playerLine": "I will help customs match the pod to its manifest."
    },
    {
      "id": "b",
      "label": "Back the hauler",
      "playerLine": "I will keep the cutter from turning a mismatch into seizure."
    },
    {
      "id": "c",
      "label": "Stay outside",
      "playerLine": "I am not joining a count that has already started."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Customs marked the pod opened. The hauler kept its berth.",
    "b": "The hauler left with the seal still in its own hand.",
    "c": "You watched the weigh slip change desks."
  }
});
