// ADDENDUM ON THE MINING BELT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_mining_belt_escort_dmc_admirers",
  "title": "ADDENDUM ON THE MINING BELT",
  "factionId": "faction_dmc",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": 0,
      "dz": 0,
      "scanLabel": "FOREMAN 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": -150,
      "dz": 90,
      "scanLabel": "FOREMAN 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the lead",
      "playerLine": "I will take the lead and keep the addendum in my wake."
    },
    {
      "id": "b",
      "label": "Cover the flank",
      "playerLine": "I can cover the outside while your slow hull crosses."
    },
    {
      "id": "c",
      "label": "Leave the escort",
      "playerLine": "I cannot escort this run. Keep the addendum on course."
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
      "scanLabel": "ADDENDUM",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "FOREMAN: Keep the addendum behind your drive through mining belt. No passing.",
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
      "line": "The escort beacon has been taped over at the wrong end.",
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
      "line": "FOREMAN checks the trailing lamp before calling the lead clear.",
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
      "line": "The addendum has a serial someone still loves.",
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
      "line": "FOREMAN: Holding. This does not hurry.",
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
      "line": "Lead taken. The escorted hull kept its lamps behind yours.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_mining_belt_escort_dmc_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_mining_belt_escort_dmc_admirers",
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
      "line": "Flank clear. No second signal followed the crossing.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_mining_belt_escort_dmc_admirers",
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
      "line": "You left. FOREMAN kept the addendum on the marked course.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "lived_mining_belt_escort_dmc_admirers",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 494;
export const trigger = deepFreeze({
  "id": "lived_mining_belt_escort_dmc_admirers",
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
    "situation": "escort",
    "place": "mining_belt",
    "twist": "admirers",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "ADDENDUM ON THE MINING BELT",
  "primaryLine": "FOREMAN: Keep the addendum behind your drive through mining belt. No passing.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Take the lead",
      "playerLine": "I will take the lead and keep the addendum in my wake."
    },
    {
      "id": "b",
      "label": "Cover the flank",
      "playerLine": "I can cover the outside while your slow hull crosses."
    },
    {
      "id": "c",
      "label": "Leave the escort",
      "playerLine": "I cannot escort this run. Keep the addendum on course."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Lead taken. The escorted hull kept its lamps behind yours.",
    "b": "Flank clear. No second signal followed the crossing.",
    "c": "You left. FOREMAN kept the addendum on the marked course."
  }
});
