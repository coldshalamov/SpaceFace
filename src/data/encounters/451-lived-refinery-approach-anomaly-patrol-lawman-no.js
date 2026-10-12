// CASKET ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_refinery_approach_anomaly_patrol_lawman_none",
  "title": "CASKET ON THE REFINERY APPROACH",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "WARD 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "WARD 2"
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
      "playerLine": "Put the first casket trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the casket signal alone."
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
      "line": "WARD: The casket signal repeats from refinery approach. Do not answer its second voice.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "ring",
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
      "motion": "ring",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "WARD keeps the receiver muted between each pass.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The casket has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "refinery approach does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "ring",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "ring",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "WARD: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "ring",
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
      "reason": "lived_refinery_approach_anomaly_patrol_lawman_none",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_refinery_approach_anomaly_patrol_lawman_none",
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
      "line": "Traces aligned. WARD found the same missing interval.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_refinery_approach_anomaly_patrol_lawman_none",
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
      "line": "You left it unread. The signal stayed at refinery approach.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_refinery_approach_anomaly_patrol_lawman_none",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 451;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_anomaly_patrol_lawman_none",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "refinery_approach"
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
    "place": "refinery_approach",
    "twist": "none",
    "actor": "patrol_lawman"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CASKET ON THE REFINERY APPROACH",
  "primaryLine": "WARD: The casket signal repeats from refinery approach. Do not answer its second voice.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Record the return",
      "playerLine": "I will record one return and keep the transmitter closed."
    },
    {
      "id": "b",
      "label": "Compare the traces",
      "playerLine": "Put the first casket trace beside the newest return."
    },
    {
      "id": "c",
      "label": "Leave it unread",
      "playerLine": "I will not answer. Leave the casket signal alone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Return recorded. The second voice arrived on the old timestamp.",
    "b": "Traces aligned. WARD found the same missing interval.",
    "c": "You left it unread. The signal stayed at refinery approach."
  }
});
