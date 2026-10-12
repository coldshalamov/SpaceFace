// SHADE ON THE CIVILIAN CORE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_civilian_core_anomaly_understory_none",
  "title": "SHADE ON THE CIVILIAN CORE",
  "factionId": "faction_understory",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SABLE 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SABLE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first shade trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the shade signal alone."
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
      "line": "SABLE: The shade signal repeats from civilian core. Do not answer its second voice.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "face",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The instrument needle returns to zero one beat too late.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "SABLE keeps the receiver muted between each pass.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The shade has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "civilian core does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "face",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "SABLE: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "face",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Return recorded. The second voice arrived on the old timestamp.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_civilian_core_anomaly_understory_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_civilian_core_anomaly_understory_none",
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
      "line": "Traces aligned. SABLE found the same missing interval.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_civilian_core_anomaly_understory_none",
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
      "line": "You left it unread. The signal stayed at civilian core.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": -1,
      "reason": "lived_civilian_core_anomaly_understory_none",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 503;
export const trigger = deepFreeze({
  "id": "lived_civilian_core_anomaly_understory_none",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core"
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
    "situation": "anomaly",
    "place": "civilian_core",
    "twist": "none",
    "actor": "faction_understory"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SHADE ON THE CIVILIAN CORE",
  "primaryLine": "SABLE: The shade signal repeats from civilian core. Do not answer its second voice.",
  "factionId": "faction_understory",
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first shade trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the shade signal alone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Return recorded. The second voice arrived on the old timestamp.",
    "b": "Traces aligned. SABLE found the same missing interval.",
    "c": "You left it unread. The signal stayed at civilian core."
  }
});
