// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 40;
export const trigger = deepFreeze({
  "id": "bounty_hunter",
  "tier": "minor",
  "deck": "combat",
  "weight": 1,
  "zoneTypes": [
    "ambush_lane",
    "outlaw_zone",
    "trade_lane",
    "border_checkpoint"
  ],
  "script": "bountyHunter",
  "pressureCost": 50,
  "cooldownS": 600,
  "proximity": false,
  "gates": {
    "bountyOnly": true
  }
});

export default defineEncounter(trigger, {
  "motive": "bounty_collection",
  "engagementTrigger": "active_bounty_contract",
  "factionId": "faction_quiet",
  "context": "bounty_hunter",
  "squad": {
    "archetypes": [
      "corsair_raider"
    ],
    "size": [
      1,
      2
    ],
    "doctrine": "balanced",
    "formation": "loose"
  },
  "bark": "bounty_notice"
});
