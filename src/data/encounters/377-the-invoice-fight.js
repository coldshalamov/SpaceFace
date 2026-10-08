// INVOICE FIGHT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "invoice_fight",
  "title": "INVOICE FIGHT",
  "factionId": "faction_mts",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DESK 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_mts",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DESK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Certify the shadow",
      "playerLine": "The shadow is his."
    },
    {
      "id": "b",
      "label": "Split the delay",
      "playerLine": "Split the minute."
    },
    {
      "id": "c",
      "label": "Leave them on the clock",
      "playerLine": "Not my invoice."
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
      "line": "DESK: Your account is standing. His is not. He is in your shadow. Nothing personal.",
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
      "line": "Nothing personal is how MTS starts a fight.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "The shadow is a real occlusion, not a metaphor.",
      "channel": "info",
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
      "line": "DESK: Still on the trade lane. The invoice fight does not hurry.",
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
      "line": "One account eats the minute. The shadow was certified.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "invoice_fight",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 2,
      "reason": "invoice_fight",
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
      "line": "The delay split. Both desks hate you politely.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": 2,
      "reason": "invoice_fight",
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
      "line": "You left. The clock kept both of them.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_mts",
      "delta": -1,
      "reason": "invoice_fight",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 377;
export const trigger = deepFreeze({
  "id": "invoice_fight",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "trade_lane"
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
    "situation": "trade",
    "place": "trade_lane",
    "twist": "none",
    "actor": "faction_mts"
  },
  "livedVignette": true,
  "title": "INVOICE FIGHT",
  "primaryLine": "DESK: Your account is standing. His is not. He is in your shadow. Nothing personal.",
  "factionId": "faction_mts",
  "choices": [
    {
      "id": "a",
      "label": "Certify the shadow",
      "playerLine": "The shadow is his."
    },
    {
      "id": "b",
      "label": "Split the delay",
      "playerLine": "Split the minute."
    },
    {
      "id": "c",
      "label": "Leave them on the clock",
      "playerLine": "Not my invoice."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "One account eats the minute. The shadow was certified.",
    "b": "The delay split. Both desks hate you politely.",
    "c": "You left. The clock kept both of them."
  }
});
