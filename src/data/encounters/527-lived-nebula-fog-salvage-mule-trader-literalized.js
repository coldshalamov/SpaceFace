// PUCK ON THE NEBULA FOG — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_nebula_fog_salvage_mule_trader_literalized",
  "title": "PUCK ON THE NEBULA FOG",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "MOSS 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "MOSS 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Secure the piece",
      "playerLine": "I will secure the puck before it hits the lane."
    },
    {
      "id": "b",
      "label": "Mark the owner",
      "playerLine": "Put the last owner on record before anyone cuts metal."
    },
    {
      "id": "c",
      "label": "Leave the wreck",
      "playerLine": "I will not claim it. Leave the puck at nebula fog."
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
      "line": "MOSS: The puck came loose at nebula fog. We have not called it scrap.",
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
      "line": "MOSS tags loose mass before anyone brings a torch.",
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
      "line": "The puck has a serial someone still loves.",
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
      "line": "MOSS: Holding. This does not hurry.",
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
      "reason": "lived_nebula_fog_salvage_mule_trader_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_nebula_fog_salvage_mule_trader_literalized",
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
      "line": "Owner marked. MOSS kept the saws cold for one shift.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_nebula_fog_salvage_mule_trader_literalized",
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
      "line": "You left it. The puck remains loose at nebula fog.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_nebula_fog_salvage_mule_trader_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 527;
export const trigger = deepFreeze({
  "id": "lived_nebula_fog_salvage_mule_trader_literalized",
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
    "situation": "salvage",
    "place": "nebula_fog",
    "twist": "literalized",
    "actor": "mule_trader"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "PUCK ON THE NEBULA FOG",
  "primaryLine": "MOSS: The puck came loose at nebula fog. We have not called it scrap.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Secure the piece",
      "playerLine": "I will secure the puck before it hits the lane."
    },
    {
      "id": "b",
      "label": "Mark the owner",
      "playerLine": "Put the last owner on record before anyone cuts metal."
    },
    {
      "id": "c",
      "label": "Leave the wreck",
      "playerLine": "I will not claim it. Leave the puck at nebula fog."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Piece secured. The cut starts after the ownership mark.",
    "b": "Owner marked. MOSS kept the saws cold for one shift.",
    "c": "You left it. The puck remains loose at nebula fog."
  }
});
