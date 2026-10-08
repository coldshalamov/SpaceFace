// SKIFF SATURDAY — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "skiff_saturday",
  "title": "SKIFF SATURDAY",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "HOLLIS 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "HOLLIS 2"
    },
    {
      "role": "hull_2",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 160,
      "dz": 70,
      "scanLabel": "HOLLIS 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Marshal the can",
      "playerLine": "I'll marshal the can."
    },
    {
      "id": "b",
      "label": "Time a lap",
      "playerLine": "Timing one lap."
    },
    {
      "id": "c",
      "label": "Order it stopped",
      "playerLine": "Stop the loop."
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
      "line": "HOLLIS: No adults in the loop. Hold the outside.",
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
      "line": "Three kid skiffs. One water-can buoy. No guns.",
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
      "line": "Adults in the loop become the hazard.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
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
      "line": "HOLLIS: Holding. This does not hurry.",
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
      "line": "A can changes hands. Nobody files a kill.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "skiff_saturday",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "skiff_saturday",
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
      "line": "You timed it. The winner already knew.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "skiff_saturday",
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
      "line": "You ordered it stopped. They will do it tomorrow, wider.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "skiff_saturday",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 382;
export const trigger = deepFreeze({
  "id": "skiff_saturday",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "colony"
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
    "place": "colony",
    "twist": "none",
    "actor": "mule_trader"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SKIFF SATURDAY",
  "primaryLine": "HOLLIS: No adults in the loop. Hold the outside.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Marshal the can",
      "playerLine": "I'll marshal the can."
    },
    {
      "id": "b",
      "label": "Time a lap",
      "playerLine": "Timing one lap."
    },
    {
      "id": "c",
      "label": "Order it stopped",
      "playerLine": "Stop the loop."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "A can changes hands. Nobody files a kill.",
    "b": "You timed it. The winner already knew.",
    "c": "You ordered it stopped. They will do it tomorrow, wider."
  }
});
