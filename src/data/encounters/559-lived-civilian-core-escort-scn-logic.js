// CAN ON THE CIVILIAN CORE — lived vignette. External-only: the day planner must not roll this.
// DUST P1d voice pass: Helios Station card (src/data/communityPersonality.js). Text only.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';
import { sectorLine } from '../communityPersonality.js';

const spec = {
  "id": "lived_civilian_core_escort_scn_logic",
  "title": "CAN ON THE CIVILIAN CORE",
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
      "label": "Take the lead",
      "playerLine": "I’ll take the lead. The can rides my wake, manifest first."
    },
    {
      "id": "b",
      "label": "Cover the flank",
      "playerLine": "I’ll hold the outside. Nothing unfiled crosses with us."
    },
    {
      "id": "c",
      "label": "Leave the escort",
      "playerLine": "Not my run. File the can as self-propelled."
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
      "line": "CLERK: Concord Core escort. Keep the can behind your drive. Bay 7 is expecting it.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "face",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The can’s manifest is older than the can. The hub honors both.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 1,
      "motion": "face",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "CLERK checks the trailing lamp, then the paperwork, then the lamp again.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 1,
      "motion": "face",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The can was lost twice and found twice. Bay 7 kept both tickets.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 1,
      "motion": "face",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": sectorLine('sector_helios_prime', 0) || 'The hub keeps what the war left behind, alphabetically.',
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 1,
      "motion": "face",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "face",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "CLERK: Holding position. The can is not late; the war was.",
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
      "line": "Lead taken. The can crossed in convoy order, paperwork intact.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_civilian_core_escort_scn_logic",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_civilian_core_escort_scn_logic",
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
      "line": "Flank held. Nothing followed the crossing that wasn’t filed first.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "lived_civilian_core_escort_scn_logic",
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
      "line": "You left. CLERK logged the can as self-propelled. Bay 7 disagreed.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "lived_civilian_core_escort_scn_logic",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 559;
export const trigger = deepFreeze({
  "id": "lived_civilian_core_escort_scn_logic",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core"
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
    "place": "civilian_core",
    "twist": "logic",
    "actor": "faction_scn"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "CAN ON THE CIVILIAN CORE",
  "primaryLine": "CLERK: Concord Core escort. Keep the can behind your drive. Bay 7 is expecting it.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Take the lead",
      "playerLine": "I’ll take the lead. The can rides my wake, manifest first."
    },
    {
      "id": "b",
      "label": "Cover the flank",
      "playerLine": "I’ll hold the outside. Nothing unfiled crosses with us."
    },
    {
      "id": "c",
      "label": "Leave the escort",
      "playerLine": "Not my run. File the can as self-propelled."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Lead taken. The escorted hull kept its lamps behind yours.",
    "b": "Flank clear. No second signal followed the crossing.",
    "c": "You left. CLERK kept the can on the marked course."
  }
});
