// RIBBON ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_refinery_approach_toll_choir_zealot_literalized",
  "title": "RIBBON ON THE REFINERY APPROACH",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "choir_zealot",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CANTOR 1"
    },
    {
      "role": "hull_1",
      "archetype": "choir_zealot",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CANTOR 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Pay the count",
      "playerLine": "CANTOR, I will pay for the ribbon and take the marked lane."
    },
    {
      "id": "b",
      "label": "Ask for proof",
      "playerLine": "Show me the ribbon count before I enter refinery approach."
    },
    {
      "id": "c",
      "label": "Leave the toll",
      "playerLine": "I decline the ribbon; clear my hull from refinery approach."
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
      "line": "CANTOR: The ribbon is due at refinery approach. Pay, dispute, or keep moving.",
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
      "line": "The toll board has one number and three kinds of handwriting.",
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
      "line": "CANTOR counts the queue by hull, not by promise.",
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
      "line": "The ribbon has a serial someone still loves.",
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
      "line": "CANTOR: Holding. This does not hurry.",
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
      "line": "Count cleared. The ribbon crossed refinery approach under your name.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_refinery_approach_toll_choir_zealot_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_refinery_approach_toll_choir_zealot_literalized",
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
      "line": "Dispute logged. CANTOR kept the original count intact.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_refinery_approach_toll_choir_zealot_literalized",
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
      "line": "Declined. The ribbon stays on their side of refinery approach.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_refinery_approach_toll_choir_zealot_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 549;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_toll_choir_zealot_literalized",
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
    "situation": "toll",
    "place": "refinery_approach",
    "twist": "literalized",
    "actor": "choir_zealot"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "RIBBON ON THE REFINERY APPROACH",
  "primaryLine": "CANTOR: The ribbon is due at refinery approach. Pay, dispute, or keep moving.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Pay the count",
      "playerLine": "CANTOR, I will pay for the ribbon and take the marked lane."
    },
    {
      "id": "b",
      "label": "Ask for proof",
      "playerLine": "Show me the ribbon count before I enter refinery approach."
    },
    {
      "id": "c",
      "label": "Leave the toll",
      "playerLine": "I decline the ribbon; clear my hull from refinery approach."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Count cleared. The ribbon crossed refinery approach under your name.",
    "b": "Dispute logged. CANTOR kept the original count intact.",
    "c": "Declined. The ribbon stays on their side of refinery approach."
  }
});
