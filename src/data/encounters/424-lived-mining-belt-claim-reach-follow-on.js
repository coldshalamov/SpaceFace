// GASKET ON THE MINING BELT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_mining_belt_claim_reach_follow_on",
  "title": "GASKET ON THE MINING BELT",
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
      "label": "Mark the boundary",
      "playerLine": "I will mark the gasket face and leave your cutters room."
    },
    {
      "id": "b",
      "label": "Check the survey",
      "playerLine": "Show me the survey pin before you call this ground yours."
    },
    {
      "id": "c",
      "label": "Leave the claim",
      "playerLine": "I will not work it. Keep the gasket inside your line."
    }
  ],
  "timeoutChoice": "c",
  "phases": [
    {
      "id": "spawn",
      "verb": "spawn",
      "next": "prop"
    },
    {
      "id": "prop",
      "verb": "prop",
      "scanLabel": "GASKET",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "SLIP: The gasket sits inside our claim at mining belt. Keep your cutter out.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "creep",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The claim pins lean away from the deepest cut.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "SLIP counts a boundary by the gaps between markers.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The gasket has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "mining belt does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "creep",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "creep",
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
      "motion": "creep",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Boundary marked. Both cutter tracks stayed on their own side.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_mining_belt_claim_reach_follow_on",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 2,
      "reason": "lived_mining_belt_claim_reach_follow_on",
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
      "line": "Survey checked. SLIP added one pin where the line bends.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 2,
      "reason": "lived_mining_belt_claim_reach_follow_on",
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
      "line": "You left. The gasket face remains under their claim.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": -1,
      "reason": "lived_mining_belt_claim_reach_follow_on",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 424;
export const trigger = deepFreeze({
  "id": "lived_mining_belt_claim_reach_follow_on",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "mining_belt"
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
    "situation": "claim",
    "place": "mining_belt",
    "twist": "follow_on",
    "actor": "faction_reach"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "GASKET ON THE MINING BELT",
  "primaryLine": "SLIP: The gasket sits inside our claim at mining belt. Keep your cutter out.",
  "factionId": "faction_reach",
  "choices": [
    {
      "id": "a",
      "label": "Mark the boundary",
      "playerLine": "I will mark the gasket face and leave your cutters room."
    },
    {
      "id": "b",
      "label": "Check the survey",
      "playerLine": "Show me the survey pin before you call this ground yours."
    },
    {
      "id": "c",
      "label": "Leave the claim",
      "playerLine": "I will not work it. Keep the gasket inside your line."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Boundary marked. Both cutter tracks stayed on their own side.",
    "b": "Survey checked. SLIP added one pin where the line bends.",
    "c": "You left. The gasket face remains under their claim."
  }
});
