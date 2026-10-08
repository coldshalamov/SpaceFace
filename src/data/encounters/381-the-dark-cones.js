// DARK CONES — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "dark_cones",
  "title": "DARK CONES",
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
    },
    {
      "role": "hull_2",
      "archetype": "mule_trader",
      "factionId": "faction_dmc",
      "dx": 160,
      "dz": 70,
      "scanLabel": "FOREMAN 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Hold outside",
      "playerLine": "Holding outside."
    },
    {
      "id": "b",
      "label": "Carry water",
      "playerLine": "I brought water."
    },
    {
      "id": "c",
      "label": "Cross a dark face",
      "playerLine": "Crossing."
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
      "line": "FOREMAN: Cones dark on purpose. Ore stays. You cut it, you cut us.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "ring",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "Work lamps are off. That is the picket.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "Ore in the face is not abandoned. It is refused.",
      "channel": "info",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "ring",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "FOREMAN: Still on the mining belt. The dark cones does not hurry.",
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
      "line": "Faces stay uncut. You were not the incident.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "dark_cones",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "dark_cones",
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
      "line": "Water across the dark. The strike drank.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "dark_cones",
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
      "line": "You are the incident. The cones stay dark anyway.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "dark_cones",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 381;
export const trigger = deepFreeze({
  "id": "dark_cones",
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
    "twist": "none",
    "actor": "faction_dmc"
  },
  "livedVignette": true,
  "title": "DARK CONES",
  "primaryLine": "FOREMAN: Cones dark on purpose. Ore stays. You cut it, you cut us.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Hold outside",
      "playerLine": "Holding outside."
    },
    {
      "id": "b",
      "label": "Carry water",
      "playerLine": "I brought water."
    },
    {
      "id": "c",
      "label": "Cross a dark face",
      "playerLine": "Crossing."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Faces stay uncut. You were not the incident.",
    "b": "Water across the dark. The strike drank.",
    "c": "You are the incident. The cones stay dark anyway."
  }
});
