// KETTLE ON THE RADIATION FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_radiation_field_salvage_reach_depth",
  "title": "KETTLE ON THE RADIATION FIELD",
  "factionId": "faction_reach",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SLIP 1"
    },
    {
      "role": "hull_1",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SLIP 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Secure the piece",
      "playerLine": "I will secure the kettle before it hits the lane."
    },
    {
      "id": "b",
      "label": "Mark the owner",
      "playerLine": "Put the last owner on record before anyone cuts metal."
    },
    {
      "id": "c",
      "label": "Leave the wreck",
      "playerLine": "I will not claim it. Leave the kettle at radiation field."
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
      "line": "SLIP: The kettle came loose at radiation field. We have not called it scrap.",
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
      "line": "Their salvage clamp has one tooth bent toward the wreck.",
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
      "line": "SLIP tags loose mass before anyone brings a torch.",
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
      "line": "The kettle has a serial someone still loves.",
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
      "line": "radiation field does not get quieter if you boost.",
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
      "line": "SLIP: Holding. This does not hurry.",
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
      "line": "Piece secured. The cut starts after the ownership mark.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_radiation_field_salvage_reach_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 2,
      "reason": "lived_radiation_field_salvage_reach_depth",
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
      "line": "Owner marked. SLIP kept the saws cold for one shift.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 2,
      "reason": "lived_radiation_field_salvage_reach_depth",
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
      "line": "You left it. The kettle remains loose at radiation field.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": -1,
      "reason": "lived_radiation_field_salvage_reach_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 540;
export const trigger = deepFreeze({
  "id": "lived_radiation_field_salvage_reach_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "radiation_field"
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
    "situation": "salvage",
    "place": "radiation_field",
    "twist": "depth",
    "actor": "faction_reach"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "KETTLE ON THE RADIATION FIELD",
  "primaryLine": "SLIP: The kettle came loose at radiation field. We have not called it scrap.",
  "factionId": "faction_reach",
  "choices": [
    {
      "id": "a",
      "label": "Secure the piece",
      "playerLine": "I will secure the kettle before it hits the lane."
    },
    {
      "id": "b",
      "label": "Mark the owner",
      "playerLine": "Put the last owner on record before anyone cuts metal."
    },
    {
      "id": "c",
      "label": "Leave the wreck",
      "playerLine": "I will not claim it. Leave the kettle at radiation field."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Piece secured. The cut starts after the ownership mark.",
    "b": "Owner marked. SLIP kept the saws cold for one shift.",
    "c": "You left it. The kettle remains loose at radiation field."
  }
});
