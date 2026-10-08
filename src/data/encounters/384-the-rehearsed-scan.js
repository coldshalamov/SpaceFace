// REHEARSED SCAN — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "rehearsed_scan",
  "title": "REHEARSED SCAN",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CLERK 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CLERK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Play the hull",
      "playerLine": "Playing along."
    },
    {
      "id": "b",
      "label": "Ask who grades drills",
      "playerLine": "Who grades this?"
    },
    {
      "id": "c",
      "label": "Refuse the scene",
      "playerLine": "Not your stage."
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
      "line": "CLERK: Stand by. This verification is a drill. Ref 44-C still applies.",
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
      "line": "They already graded the boarding before you arrived.",
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
      "line": "Theater with a real reference number.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
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
      "line": "CLERK: Holding. This does not hurry.",
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
      "line": "Drill signed. Your hold never opened.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "rehearsed_scan",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "rehearsed_scan",
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
      "line": "The grader is a desk you will not meet. The drill still signed.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "rehearsed_scan",
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
      "line": "You refused. Ref 44-C noted a temperament.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "rehearsed_scan",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 384;
export const trigger = deepFreeze({
  "id": "rehearsed_scan",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "border_checkpoint"
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
    "situation": "patrol",
    "place": "border_checkpoint",
    "twist": "logic",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "REHEARSED SCAN",
  "primaryLine": "CLERK: Stand by. This verification is a drill. Ref 44-C still applies.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Play the hull",
      "playerLine": "Playing along."
    },
    {
      "id": "b",
      "label": "Ask who grades drills",
      "playerLine": "Who grades this?"
    },
    {
      "id": "c",
      "label": "Refuse the scene",
      "playerLine": "Not your stage."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Drill signed. Your hold never opened.",
    "b": "The grader is a desk you will not meet. The drill still signed.",
    "c": "You refused. Ref 44-C noted a temperament."
  }
});
