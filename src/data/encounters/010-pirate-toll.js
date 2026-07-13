// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 10;
export const trigger = deepFreeze({
  "id": "pirate_toll",
  "tier": "minor",
  "deck": "combat",
  "weight": 3,
  "zoneTypes": [
    "trade_lane",
    "ambush_lane",
    "outlaw_zone",
    "refinery_approach"
  ],
  "script": "toll",
  "pressureCost": 40,
  "cooldownS": 300,
  "proximity": true,
  "gates": {
    "minCargoValue": 240,
    "maxSecurity": 0.75
  }
});

export default defineEncounter(trigger, {
  "motive": "cargo_extortion",
  "engagementTrigger": "demand_pending",
  "factionId": "faction_reach",
  "context": "encounter",
  "squad": {
    "archetypes": [
      "reaver_pirate",
      "corsair_raider"
    ],
    "size": [
      2,
      3
    ],
    "doctrine": "scavenger",
    "formation": "wedge"
  },
  "bark": "toll_demand",
  "offerS": 14,
  "choices": [
    {
      "id": "pay",
      "label": "Pay toll",
      "needs": "credits"
    },
    {
      "id": "refuse",
      "label": "Refuse"
    },
    {
      "id": "run",
      "label": "Run"
    }
  ],
  "timeoutChoice": "refuse"
});
