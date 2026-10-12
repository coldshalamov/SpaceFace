// ASH ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_refinery_approach_yard_fulfillment_admirers",
  "title": "ASH ON THE REFINERY APPROACH",
  "factionId": "faction_fulfillment",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_fulfillment",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DISPATCH 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_fulfillment",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DISPATCH 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the tool",
      "playerLine": "I will take the ash tool and finish the loose bracket."
    },
    {
      "id": "b",
      "label": "Call relief",
      "playerLine": "Send the next shift before the yard light goes dark."
    },
    {
      "id": "c",
      "label": "Leave the shift",
      "playerLine": "I cannot stay. Leave the ash for the next crew."
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
      "line": "DISPATCH: The ash needs a hand at refinery approach. The shift is already short.",
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
      "line": "The work light marks one empty station on the bench.",
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
      "line": "DISPATCH records the tool before recording the delay.",
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
      "line": "The ash has a serial someone still loves.",
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
      "line": "DISPATCH: Holding. This does not hurry.",
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
      "line": "Bracket seated. The work light held through the last turn.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_refinery_approach_yard_fulfillment_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_refinery_approach_yard_fulfillment_admirers",
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
      "line": "Relief called. DISPATCH kept the tool on the bench.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": 2,
      "reason": "lived_refinery_approach_yard_fulfillment_admirers",
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
      "line": "You left. The unfinished ash stayed inside the yard line.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_fulfillment",
      "delta": -1,
      "reason": "lived_refinery_approach_yard_fulfillment_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 479;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_yard_fulfillment_admirers",
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
    "situation": "yard",
    "place": "refinery_approach",
    "twist": "admirers",
    "actor": "faction_fulfillment"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "ASH ON THE REFINERY APPROACH",
  "primaryLine": "DISPATCH: The ash needs a hand at refinery approach. The shift is already short.",
  "factionId": "faction_fulfillment",
  "choices": [
    {
      "id": "a",
      "label": "Take the tool",
      "playerLine": "I will take the ash tool and finish the loose bracket."
    },
    {
      "id": "b",
      "label": "Call relief",
      "playerLine": "Send the next shift before the yard light goes dark."
    },
    {
      "id": "c",
      "label": "Leave the shift",
      "playerLine": "I cannot stay. Leave the ash for the next crew."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Bracket seated. The work light held through the last turn.",
    "b": "Relief called. DISPATCH kept the tool on the bench.",
    "c": "You left. The unfinished ash stayed inside the yard line."
  }
});
