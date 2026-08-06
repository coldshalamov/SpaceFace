// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 60;
export const trigger = deepFreeze({
  "id": "named_hunter",
  "tier": "major",
  "deck": "combat",
  "weight": 1,
  "rare": true,
  "zoneTypes": [
    "ambush_lane",
    "outlaw_zone"
  ],
  "script": "namedHunter",
  "pressureCost": 90,
  "cooldownS": 900,
  "proximity": false,
  "gates": {
    "namedPool": true,
    "minSectorTier": 2
  }
});

export default defineEncounter(trigger, {
  "motive": "personal_vendetta",
  "engagementTrigger": "named_hunter_grudge",
  "factionId": "faction_reach",
  "context": "encounter",
  "entranceS": 8,
  "bark": null
});
