// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 30;
export const trigger = deepFreeze({
  "id": "patrol_scan",
  "tier": "minor",
  "deck": "combat",
  "weight": 3,
  "zoneTypes": [
    "patrol_corridor",
    "border_checkpoint",
    "civilian_core"
  ],
  "script": "patrolScan",
  "pressureCost": 25,
  "cooldownS": 360,
  "proximity": true,
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
      2
    ],
    "doctrine": "official",
    "formation": "wedge"
  },
  "bark": "patrol_scan_hail",
  "scanS": 10,
  "choices": [
    {
      "id": "submit",
      "label": "Submit to scan"
    },
    {
      "id": "bribe",
      "label": "Bribe",
      "needs": "contraband+credits"
    },
    {
      "id": "dump",
      "label": "Dump cargo",
      "needs": "contraband"
    },
    {
      "id": "run",
      "label": "Run"
    }
  ],
  "timeoutChoice": "submit"
});
