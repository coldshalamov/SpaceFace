// DENT ON THE AMBUSH LANE — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_ambush_lane_escort_patrol_lawman_k1",
  "title": "DENT ON THE AMBUSH LANE",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "WARD 1"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the lead",
      "playerLine": "I will take the lead and keep the dent in my wake."
    },
    {
      "id": "b",
      "label": "Cover the flank",
      "playerLine": "I can cover the outside while your slow hull crosses."
    },
    {
      "id": "c",
      "label": "Leave the escort",
      "playerLine": "I cannot escort this run. Keep the dent on course."
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
      "line": "WARD: Keep the dent behind your drive through ambush lane. No passing.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "hold",
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
      "motion": "hold",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "WARD checks the trailing lamp before calling the lead clear.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The dent has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "ambush lane does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "hold",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "hold",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "WARD: Holding. This does not hurry.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "hold",
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
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1",
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
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1",
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
      "line": "You left. WARD kept the dent on the marked course.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_ambush_lane_escort_patrol_lawman_k1",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 416;
export const trigger = deepFreeze({
  "id": "lived_ambush_lane_escort_patrol_lawman_k1",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "ambush_lane"
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
    "place": "ambush_lane",
    "twist": "k1",
    "actor": "patrol_lawman"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "DENT ON THE AMBUSH LANE",
  "primaryLine": "WARD: Keep the dent behind your drive through ambush lane. No passing.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Take the lead",
      "playerLine": "I will take the lead and keep the dent in my wake."
    },
    {
      "id": "b",
      "label": "Cover the flank",
      "playerLine": "I can cover the outside while your slow hull crosses."
    },
    {
      "id": "c",
      "label": "Leave the escort",
      "playerLine": "I cannot escort this run. Keep the dent on course."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Lead taken. The escorted hull kept its lamps behind yours.",
    "b": "Flank clear. No second signal followed the crossing.",
    "c": "You left. WARD kept the dent on the marked course."
  }
});
