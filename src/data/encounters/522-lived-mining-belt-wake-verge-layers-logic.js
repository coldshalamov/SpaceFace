// FILTER ON THE MINING BELT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_mining_belt_wake_verge_layers_logic",
  "title": "FILTER ON THE MINING BELT",
  "factionId": "faction_verge_layers",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": 0,
      "dz": 0,
      "scanLabel": "VERGE 1"
    },
    {
      "role": "hull_1",
      "archetype": "quiet_ghost",
      "factionId": "faction_verge_layers",
      "dx": -150,
      "dz": 90,
      "scanLabel": "VERGE 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Log the crossing",
      "playerLine": "I crossed the filter marker. Put my hull on the record."
    },
    {
      "id": "b",
      "label": "Reset the marker",
      "playerLine": "I can reset the buoy before another wake hits it."
    },
    {
      "id": "c",
      "label": "Leave the mark",
      "playerLine": "I will not file it. Leave the filter marker where it drifted."
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
      "scanLabel": "FILTER",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "VERGE: Your wake crossed the filter marker at mining belt. Log it or clear it.",
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
      "line": "The buoy records the wake long after the water has gone quiet.",
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
      "line": "VERGE checks the bearing before clearing the channel.",
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
      "line": "The filter has a serial someone still loves.",
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
      "line": "VERGE: Holding. This does not hurry.",
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
      "line": "Crossing logged. The wake line is now attached to your hull.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_mining_belt_wake_verge_layers_logic",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_mining_belt_wake_verge_layers_logic",
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
      "line": "Marker reset. VERGE watched its light settle back on bearing.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": 2,
      "reason": "lived_mining_belt_wake_verge_layers_logic",
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
      "line": "You left the mark. The filter buoy drifted through mining belt.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_verge_layers",
      "delta": -1,
      "reason": "lived_mining_belt_wake_verge_layers_logic",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 522;
export const trigger = deepFreeze({
  "id": "lived_mining_belt_wake_verge_layers_logic",
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
    "situation": "wake",
    "place": "mining_belt",
    "twist": "logic",
    "actor": "faction_verge_layers"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "FILTER ON THE MINING BELT",
  "primaryLine": "VERGE: Your wake crossed the filter marker at mining belt. Log it or clear it.",
  "factionId": "faction_verge_layers",
  "choices": [
    {
      "id": "a",
      "label": "Log the crossing",
      "playerLine": "I crossed the filter marker. Put my hull on the record."
    },
    {
      "id": "b",
      "label": "Reset the marker",
      "playerLine": "I can reset the buoy before another wake hits it."
    },
    {
      "id": "c",
      "label": "Leave the mark",
      "playerLine": "I will not file it. Leave the filter marker where it drifted."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Crossing logged. The wake line is now attached to your hull.",
    "b": "Marker reset. VERGE watched its light settle back on bearing.",
    "c": "You left the mark. The filter buoy drifted through mining belt."
  }
});
