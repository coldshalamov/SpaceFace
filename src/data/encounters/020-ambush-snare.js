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
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_reach',
  },
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
    "formation": "wedge",
    // WF-02 terrain lee: a snare waits in a rock's lee on the player's bearing — the spring
    // happens when you round the cover, not in open space (director spawnShips applies it).
    "terrain": "lee"
  },
  "bark": "ambush_tele"
});
