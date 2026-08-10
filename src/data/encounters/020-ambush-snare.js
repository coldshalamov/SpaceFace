// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 20;
export const trigger = deepFreeze({
  "id": "ambush_snare",
  "tier": "minor",
  "deck": "combat",
  "weight": 2,
  "zoneTypes": [
    "ambush_lane",
    "outlaw_zone",
    "derelict_field"
  ],
  "script": "ambush",
  "pressureCost": 45,
  "cooldownS": 420,
  "proximity": true,
  "gates": {
    "minSectorTier": 2
  }
});

export default defineEncounter(trigger, {
  "factionId": "faction_reach",
  "context": "encounter",
  "squad": {
    // The controller is guaranteed once; remaining slots are disposable light ammunition.
    "anchorArchetype": "reaver_pirate",
    "archetypes": [
      "wasp_swarmer"
    ],
    "size": [
      4,
      6
    ],
    "doctrine": "scavenger",
    "formation": "wedge"
  },
  "bark": "ambush_tele"
});
