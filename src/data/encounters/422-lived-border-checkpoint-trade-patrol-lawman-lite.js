// STAMP ON THE BORDER CHECKPOINT — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

const spec = {
  "id": "lived_border_checkpoint_trade_patrol_lawman_literalized",
  "title": "STAMP ON THE BORDER CHECKPOINT",
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
    },
    {
      "role": "hull_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "WARD 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Take the lot",
      "playerLine": "I will take the stamp if the seal still reads clean."
    },
    {
      "id": "b",
      "label": "Change the terms",
      "playerLine": "Cut the price or split the stamp across both holds."
    },
    {
      "id": "c",
      "label": "Pass the trade",
      "playerLine": "No deal from me. Keep the stamp off my manifest."
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
      "line": "WARD: The stamp is the whole lot. border checkpoint has room to bargain.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 7,
      "motion": "orbit",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The price is chalked on a panel that still has heat.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "WARD weighs the seal before looking at the buyer.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The stamp has a serial someone still loves.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": "border checkpoint does not get quieter if you boost.",
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 5,
      "motion": "orbit",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 8,
      "motion": "orbit",
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
      "motion": "orbit",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Lot transferred. The seal stayed legible through the handoff.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_border_checkpoint_trade_patrol_lawman_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_border_checkpoint_trade_patrol_lawman_literalized",
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
      "line": "Terms changed. WARD wrote the smaller number by hand.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_border_checkpoint_trade_patrol_lawman_literalized",
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
      "line": "You passed. Their stamp goes back under the tarp.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_border_checkpoint_trade_patrol_lawman_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 422;
export const trigger = deepFreeze({
  "id": "lived_border_checkpoint_trade_patrol_lawman_literalized",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "border_checkpoint"
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
    "situation": "trade",
    "place": "border_checkpoint",
    "twist": "literalized",
    "actor": "patrol_lawman"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "STAMP ON THE BORDER CHECKPOINT",
  "primaryLine": "WARD: The stamp is the whole lot. border checkpoint has room to bargain.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Take the lot",
      "playerLine": "I will take the stamp if the seal still reads clean."
    },
    {
      "id": "b",
      "label": "Change the terms",
      "playerLine": "Cut the price or split the stamp across both holds."
    },
    {
      "id": "c",
      "label": "Pass the trade",
      "playerLine": "No deal from me. Keep the stamp off my manifest."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Lot transferred. The seal stayed legible through the handoff.",
    "b": "Terms changed. WARD wrote the smaller number by hand.",
    "c": "You passed. Their stamp goes back under the tarp."
  }
});
