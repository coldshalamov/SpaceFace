// ASH ON THE OUTLAW ZONE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_outlaw_zone_distress_helix_admirers",
  "title": "ASH ON THE OUTLAW ZONE",
  "factionId": "faction_helix",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": 0,
      "dz": 0,
      "scanLabel": "HX-12 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_helix",
      "dx": -150,
      "dz": 90,
      "scanLabel": "HX-12 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the ash call. Send its last clean bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I can hold a lamp outside the caller’s approach."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I cannot answer. Keep my hull clear of outlaw zone."
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
      "line": "HX-12 — VARIANCE FILE OPEN. ASH IS IN THE LANE. NO ACTION REQUIRED.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "weave",
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
      "motion": "weave",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "HX-12 leaves the rescue channel open after the call ends.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "weave",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The ash has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "weave",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "outlaw zone does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "weave",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "weave",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "HX-12: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "weave",
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
      "reason": "lived_outlaw_zone_distress_helix_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_outlaw_zone_distress_helix_admirers",
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
      "line": "Lamp held. HX-12 took the caller through the marked gap.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": 2,
      "reason": "lived_outlaw_zone_distress_helix_admirers",
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
      "line": "You left. The ash call stayed open on their board.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_helix",
      "delta": -1,
      "reason": "lived_outlaw_zone_distress_helix_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 539;
export const trigger = deepFreeze({
  "id": "lived_outlaw_zone_distress_helix_admirers",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "outlaw_zone"
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
    "place": "outlaw_zone",
    "twist": "admirers",
    "actor": "faction_helix"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "ASH ON THE OUTLAW ZONE",
  "primaryLine": "HX-12 — VARIANCE FILE OPEN. ASH IS IN THE LANE. NO ACTION REQUIRED.",
  "factionId": "faction_helix",
  "choices": [
    {
      "id": "a",
      "label": "Answer the call",
      "playerLine": "I have the ash call. Send its last clean bearing."
    },
    {
      "id": "b",
      "label": "Hold a lamp",
      "playerLine": "I can hold a lamp outside the caller’s approach."
    },
    {
      "id": "c",
      "label": "Leave the call",
      "playerLine": "I cannot answer. Keep my hull clear of outlaw zone."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Call answered. The bearing stopped moving while you listened.",
    "b": "Lamp held. HX-12 took the caller through the marked gap.",
    "c": "You left. The ash call stayed open on their board."
  }
});
