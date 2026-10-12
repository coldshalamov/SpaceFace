// Self-registering encounter. Trigger metadata is the complete planner/pacing header.
// AEP U1: the quarantine corvette's encounter hook — a cordon squad on the Charon
// Quarantine Pylon Field. Warning shots then force, per spec §3.5: the squad hails the
// turn-back first and only leans on the player who pushes through.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 600;
export const trigger = deepFreeze({
  "id": "quarantine_cordon",
  "tier": "minor",
  "deck": "combat",
  "weight": 4,
  "zoneTypes": [
    "anomaly_deep"
  ],
  "script": "patrolScan",
  "pressureCost": 25,
  "cooldownS": 420,
  "proximity": true,
  "gates": {
    "sectorIds": [
      "sector_charon_expanse"
    ]
  }
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'patrol',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_verge_layers',
  },
  "factionId": "faction_verge_layers",
  "context": "patrol",
  "squad": {
    "archetypes": [
      "customs_cutter"
    ],
    "size": [
      2,
      3
    ],
    "doctrine": "official",
    "formation": "wedge"
  },
  "bark": "patrol_scan_hail",
  "scanS": 8,
  "choices": [
    {
      "id": "submit",
      "label": "Submit to cordon check"
    },
    {
      "id": "run",
      "label": "Push through the line"
    }
  ],
  "timeoutChoice": "submit"
});
