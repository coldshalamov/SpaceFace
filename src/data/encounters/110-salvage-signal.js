// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 110;
export const trigger = deepFreeze({
  "id": "salvage_signal",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 2,
  "zoneTypes": [
    "derelict_field",
    "outlaw_zone"
  ],
  "script": "salvageSignal",
  "pressureCost": 20,
  "cooldownS": 420,
  "proximity": false,
  "gates": {}
});

export default defineEncounter(trigger, {
  "bark": "salvage_ping",
  "windowS": 300,
  "cachePool": {
    "cmdty_salvage_electronics": 2,
    "cmdty_scrap_metal": 3
  }
});
