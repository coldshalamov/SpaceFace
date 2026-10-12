// PLAQUE ON THE PLANETARY MASS — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_planetary_mass_hunt_scn_literalized",
  "title": "PLAQUE ON THE PLANETARY MASS",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CLERK 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CLERK 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Track the mark",
      "playerLine": "I will follow the plaque trail, slow and outside your line."
    },
    {
      "id": "b",
      "label": "Share the bearing",
      "playerLine": "Send me the last bearing before the mark went cold."
    },
    {
      "id": "c",
      "label": "Leave the search",
      "playerLine": "I am not joining this hunt. Keep planetary mass clear."
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
      "line": "CLERK: We found the plaque trail crossing planetary mass. Stay outside it.",
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
      "line": "The search grid has a gap where the old beacon failed.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "CLERK reads each empty square before moving the scope.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The plaque has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "planetary mass does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "face",
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
      "line": "CLERK: Holding. This does not hurry.",
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
      "line": "The mark held. Your bearing put the trail back together.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_planetary_mass_hunt_scn_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_planetary_mass_hunt_scn_literalized",
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
      "line": "Bearing shared. CLERK kept the original search lead.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_planetary_mass_hunt_scn_literalized",
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
      "line": "You left. The plaque trail kept crossing planetary mass.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "lived_planetary_mass_hunt_scn_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 460;
export const trigger = deepFreeze({
  "id": "lived_planetary_mass_hunt_scn_literalized",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "planetary_mass"
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
    "situation": "hunt",
    "place": "planetary_mass",
    "twist": "literalized",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "PLAQUE ON THE PLANETARY MASS",
  "primaryLine": "CLERK: We found the plaque trail crossing planetary mass. Stay outside it.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Track the mark",
      "playerLine": "I will follow the plaque trail, slow and outside your line."
    },
    {
      "id": "b",
      "label": "Share the bearing",
      "playerLine": "Send me the last bearing before the mark went cold."
    },
    {
      "id": "c",
      "label": "Leave the search",
      "playerLine": "I am not joining this hunt. Keep planetary mass clear."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The mark held. Your bearing put the trail back together.",
    "b": "Bearing shared. CLERK kept the original search lead.",
    "c": "You left. The plaque trail kept crossing planetary mass."
  }
});
