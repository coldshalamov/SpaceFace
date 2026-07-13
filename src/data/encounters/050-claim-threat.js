// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 50;
export const trigger = deepFreeze({
  "id": "claim_threat",
  "tier": "minor",
  "deck": "combat",
  "weight": 1,
  "zoneTypes": [
    "mining_belt",
    "derelict_field"
  ],
  "script": "claimThreat",
  "pressureCost": 30,
  "cooldownS": 600,
  "proximity": false,
  "gates": {
    "claimsOnly": true,
    "externalOnly": true
  }
});

export default defineEncounter(trigger, {
  "factionId": "faction_reach",
  "context": "encounter",
  "motive": "strip_player_claim_storage",
  "engagementTrigger": "claim_defense_arrival",
  "squad": {
    "archetypes": [
      "wasp_swarmer",
      "reaver_pirate"
    ],
    "size": [
      2,
      2
    ],
    "doctrine": "scavenger",
    "formation": "wedge"
  },
  "bark": "claim_ping"
});
