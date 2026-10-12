// BELL ON THE ANOMALY DEEP — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_anomaly_deep_salvage_choir_named",
  "title": "BELL ON THE ANOMALY DEEP",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "hull_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Secure the piece",
      "playerLine": "I will secure the bell before it hits the lane."
    },
    {
      "id": "b",
      "label": "Mark the owner",
      "playerLine": "Put the last owner on record before anyone cuts metal."
    },
    {
      "id": "c",
      "label": "Leave the wreck",
      "playerLine": "I will not claim it. Leave the bell at anomaly deep."
    }
  ],
  "timeoutChoice": "c",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "CANTOR: The bell came loose at anomaly deep. We have not called it scrap.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "orbit",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "Their salvage clamp has one tooth bent toward the wreck.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "CANTOR tags loose mass before anyone brings a torch.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The bell has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "anomaly deep does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 9,
      "motion": "orbit",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "CANTOR: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "orbit",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Piece secured. The cut starts after the ownership mark.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_anomaly_deep_salvage_choir_named",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_anomaly_deep_salvage_choir_named",
      "next": "done_a"
    },
    {
      "id": "done_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "Owner marked. CANTOR kept the saws cold for one shift.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "lived_anomaly_deep_salvage_choir_named",
      "next": "done_b"
    },
    {
      "id": "done_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left it. The bell remains loose at anomaly deep.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "lived_anomaly_deep_salvage_choir_named",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 501;
export const trigger = deepFreeze({
  "id": "lived_anomaly_deep_salvage_choir_named",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "anomaly_deep"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 900,
  "proximity": true,
  "rare": true,
  "gates": {
    "externalOnly": true
  }
});
export const runtime = compileVignette(spec);
export default defineEncounter(trigger, {
  "shape": {
    "situation": "salvage",
    "place": "anomaly_deep",
    "twist": "named",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "BELL ON THE ANOMALY DEEP",
  "primaryLine": "CANTOR: The bell came loose at anomaly deep. We have not called it scrap.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Secure the piece",
      "playerLine": "I will secure the bell before it hits the lane."
    },
    {
      "id": "b",
      "label": "Mark the owner",
      "playerLine": "Put the last owner on record before anyone cuts metal."
    },
    {
      "id": "c",
      "label": "Leave the wreck",
      "playerLine": "I will not claim it. Leave the bell at anomaly deep."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Piece secured. The cut starts after the ownership mark.",
    "b": "Owner marked. CANTOR kept the saws cold for one shift.",
    "c": "You left it. The bell remains loose at anomaly deep."
  }
});
