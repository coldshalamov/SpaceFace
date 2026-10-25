// Struck Bell — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { createStruckBellRuntime } from '../../systems/struckBellRuntime.js';

export const spec = {
  "id": "scene_struck_bell",
  "title": "Struck Bell",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -20,
      "dz": 150,
      "scanLabel": "BELL KEEPER"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 130,
      "dz": 160,
      "scanLabel": "BELL KEEPER"
    },
    {
      "role": "ship_2",
      "archetype": "customs_cutter",
      "factionId": "faction_vael",
      "dx": -140,
      "dz": -160,
      "scanLabel": "VAEL OBSERVER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Strike the practice bell",
      "playerLine": "I will release the marked stone toward your practice bell."
    },
    {
      "id": "b",
      "label": "Hold Vael bearing · Choir disapproves",
      "playerLine": "I will hold a quiet bearing for eight measured readings."
    },
    {
      "id": "c",
      "label": "Leave the lesson",
      "playerLine": "I will leave your practice set alone."
    }
  ],
  "timeoutChoice": "c",
  "phases": []
};

export const encounterOrder = 925;
export const trigger = deepFreeze({
  "id": "scene_struck_bell",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core",
    "trade_lane",
    "patrol_corridor",
    "border_checkpoint",
    "refinery_approach",
    "mining_belt",
    "colony",
    "derelict_field",
    "outlaw_zone",
    "radiation_field",
    "nebula_fog",
    "ambush_lane",
    "anomaly_deep",
    "planetary_mass"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 1200,
  "proximity": true,
  "rare": true,
  "gates": {
    "externalOnly": true
  }
});
export const runtime = createStruckBellRuntime(spec);
export default defineEncounter(trigger, {
  "shape": {
    "situation": "anomaly",
    "place": "mining_belt",
    "twist": "admirers",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_phoebe_echo"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Struck Bell",
  "primaryLine": "CANTOR: Our practice bell is not the Shrine’s song. Throw your stone, or log a bearing for Vael; the keepers will resent that record.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Strike the practice bell",
      "playerLine": "I will release the marked stone toward your practice bell."
    },
    {
      "id": "b",
      "label": "Hold Vael bearing · Choir disapproves",
      "playerLine": "I will hold a quiet bearing for eight measured readings."
    },
    {
      "id": "c",
      "label": "Leave the lesson",
      "playerLine": "I will leave your practice set alone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Your released stone struck the practice bell. The keepers heard the real impact; the Shrine’s song remains its own work.",
    "b": "You held the observer’s quiet bearing for eight measured readings. No song fragment was claimed.",
    "c": "You left Cantor’s practice lesson untouched."
  }
});
