// CONE ON THE ANOMALY DEEP — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_anomaly_deep_distress_verge_layers_admirers",
  "title": "CONE ON THE ANOMALY DEEP",
  "factionId": "faction_verge_layers",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VERGE 1"
    },
    {
      "role": "hull_1",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VERGE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the cone call. Send its last clean bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I can hold a lamp outside the caller’s approach."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I cannot answer. Keep my hull clear of anomaly deep."
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
      "line": "VERGE: A distress call names the cone near anomaly deep. Answer or stand clear.",
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
      "line": "The distress tone repeats on the same damaged second.",
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
      "line": "VERGE leaves the rescue channel open after the call ends.",
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
      "line": "The cone has a serial someone still loves.",
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
      "line": "VERGE: Holding. This does not hurry.",
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
      "line": "Call answered. The bearing stopped moving while you listened.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_anomaly_deep_distress_verge_layers_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_anomaly_deep_distress_verge_layers_admirers",
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
      "line": "Lamp held. VERGE took the caller through the marked gap.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_anomaly_deep_distress_verge_layers_admirers",
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
      "line": "You left. The cone call stayed open on their board.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": -1,
      "reason": "lived_anomaly_deep_distress_verge_layers_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 487;
export const trigger = deepFreeze({
  "id": "lived_anomaly_deep_distress_verge_layers_admirers",
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
    "situation": "distress",
    "place": "anomaly_deep",
    "twist": "admirers",
    "actor": "faction_verge_layers"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CONE ON THE ANOMALY DEEP",
  "primaryLine": "VERGE: A distress call names the cone near anomaly deep. Answer or stand clear.",
  "factionId": "faction_verge_layers",
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the cone call. Send its last clean bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I can hold a lamp outside the caller’s approach."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I cannot answer. Keep my hull clear of anomaly deep."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Call answered. The bearing stopped moving while you listened.",
    "b": "Lamp held. VERGE took the caller through the marked gap.",
    "c": "You left. The cone call stayed open on their board."
  }
});
