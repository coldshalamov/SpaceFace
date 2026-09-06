// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 120;
export const trigger = deepFreeze({
  "id": "anomaly_whisper",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "anomaly_deep",
    "nebula_fog",
    "radiation_field"
  ],
  "script": "whisper",
  "pressureCost": 5,
  "cooldownS": 300,
  "proximity": false,
  "gates": {}
});

export default defineEncounter(trigger, {
  "bark": null
});
