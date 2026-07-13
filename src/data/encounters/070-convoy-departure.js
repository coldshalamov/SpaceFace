// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 70;
export const trigger = deepFreeze({
  "id": "convoy_departure",
  "tier": "minor",
  "deck": "civilian",
  "weight": 3,
  "zoneTypes": [
    "trade_lane",
    "refinery_approach",
    "border_checkpoint"
  ],
  "script": "convoy",
  "pressureCost": 35,
  "cooldownS": 420,
  "proximity": false,
  "gates": {}
});

export default defineEncounter(trigger, {
  "factionId": "faction_mts",
  "context": "convoy_civilian",
  "squad": {
    "archetypes": [
      "mule_trader"
    ],
    "size": [
      2,
      3
    ],
    "doctrine": "balanced",
    "formation": "column"
  },
  "escort": {
    "archetypes": [
      "patrol_lawman"
    ],
    "size": [
      1,
      2
    ],
    "doctrine": "official",
    "formation": "wedge",
    "context": "patrol",
    "factionId": "faction_scn"
  },
  "bark": "convoy_depart",
  "transitS": 220,
  "unitsPerHauler": [
    6,
    10
  ],
  "guardPay": 200
});
