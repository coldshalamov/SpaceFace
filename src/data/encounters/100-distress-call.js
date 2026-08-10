// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 100;
export const trigger = deepFreeze({
  "id": "distress_call",
  "tier": "minor",
  "deck": "civilian",
  "weight": 2,
  "zoneTypes": [
    "trade_lane",
    "derelict_field",
    "nebula_fog",
    "radiation_field",
    "mining_belt"
  ],
  "script": "distress",
  "pressureCost": 35,
  "cooldownS": 480,
  "proximity": false,
  "gates": {
    "minSectorTier": 2
  }
});

export default defineEncounter(trigger, {
  "variant": "distress",
  "genuineChance": 0.6,
  "bark": "distress_call",
  "springR": 650,
  "approachR": 900,
  "windowS": 240,
  "rescuePay": 120,
  "genuine": {
    "factionId": "faction_free",
    "context": "convoy_civilian",
    "squad": {
      "archetypes": [
        "mule_trader"
      ],
      "size": [
        1,
        1
      ],
      "doctrine": "balanced",
      "formation": "loose"
    },
    "threat": {
      // Exactly one visible pirate controller, then light-ammunition pressure.
      "anchorArchetype": "reaver_pirate",
      "archetypes": [
        "wasp_swarmer"
      ],
      "size": [
        4,
        6
      ],
      "doctrine": "scavenger",
      "formation": "loose",
      "context": "encounter",
      "factionId": "faction_reach"
    }
  },
  "bait": {
    "factionId": "faction_reach",
    "context": "encounter",
    "squad": {
      // The bait springs as disposable Wasps around one guaranteed elite blade.
      "anchorArchetype": "corsair_raider",
      "archetypes": [
        "wasp_swarmer"
      ],
      "size": [
        4,
        6
      ],
      "doctrine": "scavenger",
      "formation": "ring"
    }
  },
  "choices": [
    {
      "id": "assist",
      "label": "Assist"
    },
    {
      "id": "scan",
      "label": "Scan first"
    },
    {
      "id": "ignore",
      "label": "Ignore"
    }
  ],
  "timeoutChoice": "ignore"
});
