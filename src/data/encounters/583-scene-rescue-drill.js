// Rescue Drill — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_rescue_drill",
  "title": "Rescue Drill",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SCN PATROL"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DRILL CAPSULE"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Run the drill",
      "playerLine": "I will help the patrol keep the capsule on its line."
    },
    {
      "id": "b",
      "label": "Free the tow",
      "playerLine": "I will give the capsule a clear path out of the drill."
    },
    {
      "id": "c",
      "label": "Keep clear",
      "playerLine": "I will leave the exercise to the crews in uniform."
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
      "scanLabel": "DRILL CAPSULE",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "WARD: Drill capsule under tow. The beacon is not a call for help.",
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
      "line": "The capsule has a painted hatch and an empty rescue ledger.",
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
      "line": "The capsule stayed on course. The drill ledger is still blank.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_rescue_drill",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "scene_rescue_drill",
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
      "line": "The capsule cleared the tow line without a rescue call.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 1,
      "reason": "scene_rescue_drill",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "scene_rescue_drill",
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
      "line": "You left the drill to finish without another witness.",
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

export const encounterOrder = 583;
export const trigger = deepFreeze({
  "id": "scene_rescue_drill",
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
    "situation": "distress",
    "place": "civilian_core",
    "twist": "logic",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_helios_prime"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Rescue Drill",
  "primaryLine": "WARD: Drill capsule under tow. The beacon is not a call for help.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Run the drill",
      "playerLine": "I will help the patrol keep the capsule on its line."
    },
    {
      "id": "b",
      "label": "Free the tow",
      "playerLine": "I will give the capsule a clear path out of the drill."
    },
    {
      "id": "c",
      "label": "Keep clear",
      "playerLine": "I will leave the exercise to the crews in uniform."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The capsule stayed on course. The drill ledger is still blank.",
    "b": "The capsule cleared the tow line without a rescue call.",
    "c": "You left the drill to finish without another witness."
  }
});
