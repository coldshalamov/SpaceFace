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
  shape: {
    situation: 'anomaly',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'none',
  },
  "bark": null,
  // Discovery-chain tuning: the whisper line is the clue; a physical source is
  // placed 120–380 WU out (same readability band as salvage_signal caches).
  "windowS": 420,
  "investigateR": 70,
  "scanTellR": 700,
  "identifyPay": 90,
  "identifyPayStep": 30,
  "brokenPay": 30,
  "cachePool": {
    "cmdty_salvage_electronics": 2,
    "cmdty_scrap_metal": 2
  },
  "choices": [
    {
      "id": "approach",
      "label": "Close in"
    },
    {
      "id": "scan",
      "label": "Scan first"
    },
    {
      "id": "ignore",
      "label": "Ignore"
    }
  ],
  "timeoutChoice": "ignore"
});
