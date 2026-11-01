// SLOT ON THE TRADE LANE — lived vignette. External-only: the day planner must not roll this.
// DUST P1d voice pass: Tethys Trade Hub card (src/data/communityPersonality.js). Text only.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';
import { stationLine } from '../communityPersonality.js';

const spec = {
  "id": "lived_trade_lane_wreck_mule_trader_literalized",
  "title": "SLOT ON THE TRADE LANE",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "MOSS 1"
    },
    {
      "role": "hull_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "MOSS 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Read the plate",
      "playerLine": "I’ll read the slot plate before anyone quotes the wreck."
    },
    {
      "id": "b",
      "label": "Hold the wreck",
      "playerLine": "I’ll hold it clear while the desk checks its standing."
    },
    {
      "id": "c",
      "label": "Leave it drifting",
      "playerLine": "Not my lien. Let the slot keep its account."
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
      "line": "MOSS: That wreck’s slot stamp is exchange property. The board is live; no cutting.",
      "channel": "info",
      "primary": true,
      "next": "move"
    },
    {
      "id": "move",
      "verb": "motion",
      "seconds": 2,
      "motion": "depart",
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The hull number stops mid-digit, like a quote interrupted mid-war.",
      "channel": "info",
      "next": "p0"
    },
    {
      "id": "p0",
      "verb": "motion",
      "seconds": 1,
      "motion": "depart",
      "next": "a1"
    },
    {
      "id": "a1",
      "verb": "say",
      "line": "MOSS keeps the torch pointed at the deck until the desk certifies the shadow.",
      "channel": "info",
      "next": "p1"
    },
    {
      "id": "p1",
      "verb": "motion",
      "seconds": 1,
      "motion": "depart",
      "next": "a2"
    },
    {
      "id": "a2",
      "verb": "say",
      "line": "The slot has a standing account. Dead hulls keep worse credit than live ones.",
      "channel": "info",
      "next": "p2"
    },
    {
      "id": "p2",
      "verb": "motion",
      "seconds": 1,
      "motion": "depart",
      "next": "a3"
    },
    {
      "id": "a3",
      "verb": "say",
      "line": stationLine('station_tethys', 3) || 'The board quotes the wreck daily; the wreck never replies.',
      "channel": "info",
      "next": "p3"
    },
    {
      "id": "p3",
      "verb": "motion",
      "seconds": 1,
      "motion": "depart",
      "next": "work"
    },
    {
      "id": "work",
      "verb": "motion",
      "seconds": 4,
      "motion": "depart",
      "next": "work_line"
    },
    {
      "id": "work_line",
      "verb": "say",
      "line": "MOSS: Holding. The delay splits; my patience is the smaller half.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "depart",
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Plate read. The exchange lists a shift, a lien, and no final owner.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 36,
      "reason": "lived_trade_lane_wreck_mule_trader_literalized",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_trade_lane_wreck_mule_trader_literalized",
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
      "line": "Wreck held. DESK logged the hold as a delay, split two ways.",
      "channel": "info",
      "next": "rep_b"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "lived_trade_lane_wreck_mule_trader_literalized",
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
      "line": "You left it. The slot keeps its slow turn, accruing.",
      "channel": "info",
      "next": "rep_c"
    },
    {
      "id": "rep_c",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "lived_trade_lane_wreck_mule_trader_literalized",
      "next": "done_c"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 504;
export const trigger = deepFreeze({
  "id": "lived_trade_lane_wreck_mule_trader_literalized",
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
    "situation": "wreck",
    "place": "trade_lane",
    "twist": "literalized",
    "actor": "mule_trader"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "SLOT ON THE TRADE LANE",
  "primaryLine": "MOSS: That wreck’s slot stamp is exchange property. The board is live; no cutting.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Read the plate",
      "playerLine": "I’ll read the slot plate before anyone quotes the wreck."
    },
    {
      "id": "b",
      "label": "Hold the wreck",
      "playerLine": "I’ll hold it clear while the desk checks its standing."
    },
    {
      "id": "c",
      "label": "Leave it drifting",
      "playerLine": "Not my lien. Let the slot keep its account."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Plate read. The registry lists a shift, not a final owner.",
    "b": "Wreck held. The next registry pass can happen without drift.",
    "c": "You left it. The slot keeps its slow turn at trade lane."
  }
});
