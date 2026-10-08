// COURTESY HONK — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "courtesy_honk",
  "title": "COURTESY HONK",
  "factionId": "faction_scn",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": 0,
      "dz": 0,
      "scanLabel": "WARD 1"
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "WARD 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Trade flashes",
      "playerLine": "Flashing back."
    },
    {
      "id": "b",
      "label": "File both",
      "playerLine": "File both of us."
    },
    {
      "id": "c",
      "label": "Pretend no overlap",
      "playerLine": "No overlap."
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
      "line": "WARD: You were inside my number. I flashed. You did not. File, or don't.",
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
      "line": "Two pins, one near-miss, no mines.",
      "channel": "info",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "Courtesy is a flash, not a fine.",
      "channel": "info",
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
      "line": "WARD: Still on the trade lane. The courtesy honk does not hurry.",
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
      "line": "A horn instead of a report.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "courtesy_honk",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "courtesy_honk",
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
      "line": "Two reports. The lane learns your name.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 2,
      "reason": "courtesy_honk",
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
      "line": "You pretended. The flash is still on their log.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": -1,
      "reason": "courtesy_honk",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 385;
export const trigger = deepFreeze({
  "id": "courtesy_honk",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "trade_lane"
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
    "place": "trade_lane",
    "twist": "none",
    "actor": "patrol_lawman"
  },
  "livedVignette": true,
  "title": "COURTESY HONK",
  "primaryLine": "WARD: You were inside my number. I flashed. You did not. File, or don't.",
  "factionId": "faction_scn",
  "choices": [
    {
      "id": "a",
      "label": "Trade flashes",
      "playerLine": "Flashing back."
    },
    {
      "id": "b",
      "label": "File both",
      "playerLine": "File both of us."
    },
    {
      "id": "c",
      "label": "Pretend no overlap",
      "playerLine": "No overlap."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "A horn instead of a report.",
    "b": "Two reports. The lane learns your name.",
    "c": "You pretended. The flash is still on their log."
  }
});
