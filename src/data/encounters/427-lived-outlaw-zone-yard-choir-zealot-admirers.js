// CONE ON THE OUTLAW ZONE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_outlaw_zone_yard_choir_zealot_admirers",
  "title": "CONE ON THE OUTLAW ZONE",
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
      "label": "Take the tool",
      "playerLine": "I will take the cone tool and finish the loose bracket."
    },
    {
      "id": "b",
      "label": "Call relief",
      "playerLine": "Send the next shift before the yard light goes dark."
    },
    {
      "id": "c",
      "label": "Leave the shift",
      "playerLine": "I cannot stay. Leave the cone for the next crew."
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
      "line": "CANTOR: The cone needs a hand at outlaw zone. The shift is already short.",
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
      "line": "The work light marks one empty station on the bench.",
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
      "line": "CANTOR records the tool before recording the delay.",
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
      "line": "The cone has a serial someone still loves.",
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
      "line": "CANTOR: Holding. This does not hurry.",
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
      "line": "Bracket seated. The work light held through the last turn.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers",
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
      "line": "Relief called. CANTOR kept the tool on the bench.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers",
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
      "line": "You left. The unfinished cone stayed inside the yard line.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_outlaw_zone_yard_choir_zealot_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 427;
export const trigger = deepFreeze({
  "id": "lived_outlaw_zone_yard_choir_zealot_admirers",
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
    "situation": "yard",
    "place": "outlaw_zone",
    "twist": "admirers",
    "actor": "choir_zealot"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CONE ON THE OUTLAW ZONE",
  "primaryLine": "CANTOR: The cone needs a hand at outlaw zone. The shift is already short.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Take the tool",
      "playerLine": "I will take the cone tool and finish the loose bracket."
    },
    {
      "id": "b",
      "label": "Call relief",
      "playerLine": "Send the next shift before the yard light goes dark."
    },
    {
      "id": "c",
      "label": "Leave the shift",
      "playerLine": "I cannot stay. Leave the cone for the next crew."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Bracket seated. The work light held through the last turn.",
    "b": "Relief called. CANTOR kept the tool on the bench.",
    "c": "You left. The unfinished cone stayed inside the yard line."
  }
});
