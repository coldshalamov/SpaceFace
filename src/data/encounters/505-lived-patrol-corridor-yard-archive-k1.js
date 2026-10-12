// SPAR ON THE PATROL CORRIDOR — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_patrol_corridor_yard_archive_k1",
  "title": "SPAR ON THE PATROL CORRIDOR",
  "factionId": "faction_archive",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_archive",
      "dx": 0,
      "dz": 0,
      "scanLabel": "ARCHIVIST 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_archive",
      "dx": -150,
      "dz": 90,
      "scanLabel": "ARCHIVIST 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the tool",
      "playerLine": "I will take the spar tool and finish the loose bracket."
    },
    {
      "id": "b",
      "label": "Call relief",
      "playerLine": "Send the next shift before the yard light goes dark."
    },
    {
      "id": "c",
      "label": "Leave the shift",
      "playerLine": "I cannot stay. Leave the spar for the next crew."
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
      "line": "ARCHIVIST: The spar needs a hand at patrol corridor. The shift is already short.",
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
      "line": "The work light marks one empty station on the bench.",
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
      "line": "ARCHIVIST records the tool before recording the delay.",
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
      "line": "The spar has a serial someone still loves.",
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
      "line": "patrol corridor does not get quieter if you boost.",
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
      "line": "ARCHIVIST: Holding. This does not hurry.",
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
      "line": "Bracket seated. The work light held through the last turn.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_patrol_corridor_yard_archive_k1",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "lived_patrol_corridor_yard_archive_k1",
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
      "line": "Relief called. ARCHIVIST kept the tool on the bench.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "lived_patrol_corridor_yard_archive_k1",
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
      "line": "You left. The unfinished spar stayed inside the yard line.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": -1,
      "reason": "lived_patrol_corridor_yard_archive_k1",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 505;
export const trigger = deepFreeze({
  "id": "lived_patrol_corridor_yard_archive_k1",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "patrol_corridor"
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
    "place": "patrol_corridor",
    "twist": "k1",
    "actor": "faction_archive"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SPAR ON THE PATROL CORRIDOR",
  "primaryLine": "ARCHIVIST: The spar needs a hand at patrol corridor. The shift is already short.",
  "factionId": "faction_archive",
  "choices": [
    {
      "id": "a",
      "label": "Take the tool",
      "playerLine": "I will take the spar tool and finish the loose bracket."
    },
    {
      "id": "b",
      "label": "Call relief",
      "playerLine": "Send the next shift before the yard light goes dark."
    },
    {
      "id": "c",
      "label": "Leave the shift",
      "playerLine": "I cannot stay. Leave the spar for the next crew."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Bracket seated. The work light held through the last turn.",
    "b": "Relief called. ARCHIVIST kept the tool on the bench.",
    "c": "You left. The unfinished spar stayed inside the yard line."
  }
});
