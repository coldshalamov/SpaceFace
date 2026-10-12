// CRADLE ON THE NEBULA FOG — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_nebula_fog_convoy_understory_depth",
  "title": "CRADLE ON THE NEBULA FOG",
  "factionId": "faction_understory",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SABLE 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_understory",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SABLE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take rear watch",
      "playerLine": "I will take the rear and count every convoy lamp."
    },
    {
      "id": "b",
      "label": "Open a lane",
      "playerLine": "I can clear the nebula fog crossing for the last hull."
    },
    {
      "id": "c",
      "label": "Let them pass",
      "playerLine": "I am not joining. Keep the cradle inside your formation."
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
      "line": "SABLE: The cradle rides with this convoy through nebula fog. Hold formation.",
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
      "line": "The convoy keeps one empty slot for a hull that never came.",
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
      "line": "SABLE calls each lamp by position, not by name.",
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
      "line": "The cradle has a serial someone still loves.",
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
      "line": "nebula fog does not get quieter if you boost.",
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
      "seconds": 8,
      "motion": "orbit",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "SABLE: Holding. This does not hurry.",
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
      "line": "Rear watch held. Every lamp came through in the same order.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_nebula_fog_convoy_understory_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_nebula_fog_convoy_understory_depth",
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
      "line": "Lane opened. The last hull passed without spending its reserve.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": 2,
      "reason": "lived_nebula_fog_convoy_understory_depth",
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
      "line": "You let them pass. The cradle stayed in convoy.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_understory",
      "delta": -1,
      "reason": "lived_nebula_fog_convoy_understory_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 555;
export const trigger = deepFreeze({
  "id": "lived_nebula_fog_convoy_understory_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "nebula_fog"
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
    "place": "nebula_fog",
    "twist": "depth",
    "actor": "faction_understory"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CRADLE ON THE NEBULA FOG",
  "primaryLine": "SABLE: The cradle rides with this convoy through nebula fog. Hold formation.",
  "factionId": "faction_understory",
  "choices": [
    {
      "id": "a",
      "label": "Take rear watch",
      "playerLine": "I will take the rear and count every convoy lamp."
    },
    {
      "id": "b",
      "label": "Open a lane",
      "playerLine": "I can clear the nebula fog crossing for the last hull."
    },
    {
      "id": "c",
      "label": "Let them pass",
      "playerLine": "I am not joining. Keep the cradle inside your formation."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Rear watch held. Every lamp came through in the same order.",
    "b": "Lane opened. The last hull passed without spending its reserve.",
    "c": "You let them pass. The cradle stayed in convoy."
  }
});
