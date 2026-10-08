// BERTH VOWS — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "berth_vows",
  "title": "BERTH VOWS",
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
    },
    {
      "role": "hull_2",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 160,
      "dz": 70,
      "scanLabel": "CANTOR 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Witness the berth",
      "playerLine": "I witness the berth."
    },
    {
      "id": "b",
      "label": "Keep the lane clear",
      "playerLine": "I'll keep the outside."
    },
    {
      "id": "c",
      "label": "Decline the circle",
      "playerLine": "Not my vow."
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
      "line": "CANTOR: Two hulls. One berth. The Choir observes. Hold, or the lane does.",
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
      "line": "They asked for quiet thrust, not a sermon.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "The berth number is painted twice.",
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
      "line": "CANTOR: Still on the civilian core. The berth vows does not hurry.",
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
      "line": "Vow logged. The berth has two names for one shift.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "berth_vows",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "berth_vows",
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
      "line": "The lane stayed a lane. The berth still married.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "berth_vows",
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
      "line": "You declined. The circle closed without you.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "berth_vows",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 373;
export const trigger = deepFreeze({
  "id": "berth_vows",
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
    "situation": "convoy",
    "place": "civilian_core",
    "twist": "named",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "title": "BERTH VOWS",
  "primaryLine": "CANTOR: Two hulls. One berth. The Choir observes. Hold, or the lane does.",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Witness the berth",
      "playerLine": "I witness the berth."
    },
    {
      "id": "b",
      "label": "Keep the lane clear",
      "playerLine": "I'll keep the outside."
    },
    {
      "id": "c",
      "label": "Decline the circle",
      "playerLine": "Not my vow."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Vow logged. The berth has two names for one shift.",
    "b": "The lane stayed a lane. The berth still married.",
    "c": "You declined. The circle closed without you."
  }
});
