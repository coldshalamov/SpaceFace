// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 80;
export const trigger = deepFreeze({
  "id": "trader_run",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 4,
  "zoneTypes": [
    "trade_lane",
    "civilian_core",
    "refinery_approach",
    "mining_belt"
  ],
  "script": "traderRun",
  "pressureCost": 15,
  "cooldownS": 180,
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
      1,
      1
    ],
    "doctrine": "balanced",
    "formation": "loose"
  },
  "bark": "trader_pass",
  "transitS": 160,
  "unitsPerHauler": [
    3,
    6
  ]
});
