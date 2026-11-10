// CRADLE ON THE REFINERY APPROACH — lived vignette. External-only: the day planner must not roll this.
// DUST P1d voice pass: Ceres Refinery card (src/data/communityPersonality.js). Text only.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';
import { stationLine } from '../communityPersonality.js';

const spec = {
  "id": "lived_refinery_approach_wreck_dmc_depth",
  "title": "CRADLE ON THE REFINERY APPROACH",
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
      "label": "Read the plate",
      "playerLine": "I’ll read the cradle plate before anyone quotes a grade."
    },
    {
      "id": "b",
      "label": "Hold the wreck",
      "playerLine": "I’ll hold it steady while the registry grades the cut."
    },
    {
      "id": "c",
      "label": "Leave it drifting",
      "playerLine": "I’m leaving it. File the cradle as pre-owned, barely sank."
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
      "line": "FOREMAN: Wreck on the approach carries a cradle stamp. Registry grades before torches.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "ring",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The hull number stops mid-digit, the way shift one stopped mid-shift.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "FOREMAN keeps the torch pointed at the deck. A cut here is a moral act.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The cradle has two prior owners. Both are listed; neither complained.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": stationLine('station_ceres', 1) || 'Pre-owned, barely sank, the registry says, with a straight face.',
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 1,
      "motion": "ring",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "ring",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "FOREMAN: Holding. Tragedy keeps hours; the scale keeps tonnage.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "ring",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Plate read. The registry lists a grade, a shift, and no final owner.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_refinery_approach_wreck_dmc_depth",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_refinery_approach_wreck_dmc_depth",
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
      "line": "Wreck held. The registry passed it twice; nothing drifted but its price.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "lived_refinery_approach_wreck_dmc_depth",
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
      "line": "You left it. The cradle keeps its slow turn, third owner pending.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "lived_refinery_approach_wreck_dmc_depth",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 465;
export const trigger = deepFreeze({
  "id": "lived_refinery_approach_wreck_dmc_depth",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "refinery_approach"
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
    "situation": "wreck",
    "place": "refinery_approach",
    "twist": "depth",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CRADLE ON THE REFINERY APPROACH",
  "primaryLine": "FOREMAN: Wreck on the approach carries a cradle stamp. Registry grades before torches.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Read the plate",
      "playerLine": "I’ll read the cradle plate before anyone quotes a grade."
    },
    {
      "id": "b",
      "label": "Hold the wreck",
      "playerLine": "I’ll hold it steady while the registry grades the cut."
    },
    {
      "id": "c",
      "label": "Leave it drifting",
      "playerLine": "I’m leaving it. File the cradle as pre-owned, barely sank."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Plate read. The registry lists a shift, not a final owner.",
    "b": "Wreck held. The next registry pass can happen without drift.",
    "c": "You left it. The cradle keeps its slow turn at refinery approach."
  }
});
