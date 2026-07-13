// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 90;
export const trigger = deepFreeze({
  "id": "patrol_beat",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 2,
  "zoneTypes": [
    "patrol_corridor",
    "civilian_core",
    "border_checkpoint"
  ],
  "script": "patrolBeat",
  "pressureCost": 15,
  "cooldownS": 240,
  "proximity": false,
  "gates": {}
});

export default defineEncounter(trigger, {
  "factionId": "faction_scn",
  "context": "patrol",
  "squad": {
    "archetypes": [
      "patrol_lawman"
    ],
    "size": [
      2,
      3
    ],
    "doctrine": "official",
    "formation": "wedge"
  },
  "bark": "patrol_beat_hail",
  "beatS": 120
});
