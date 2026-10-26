// PIN ON THE PLANETARY MASS — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_planetary_mass_wake_reach_logic",
  "title": "PIN ON THE PLANETARY MASS",
  "factionId": "faction_reach",
  "start": "spawn",
  "cast": [
    {
      "role": "hull_0",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 0,
      "dz": 0,
      "scanLabel": "SLIP 1"
    },
    {
      "role": "hull_1",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SLIP 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Park the pin beside the receiver",
      "playerLine": "I set the pin inside twenty of your receiver hull and hold it dead slow for the count."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 12 cr, then close in slow",
      "playerLine": "Take 12 cr, SLIP — send the relief to Planetary Mass; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, SLIP — my hull is leaving Planetary Mass."
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
      "scanLabel": "PIN",
      "dx": 170,
      "dz": -100,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "SLIP: Your wake crossed the pin marker at Planetary Mass. Log it or clear it. — PIN ON THE PLANETARY MASS.",
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
      "verb": "noop",
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
      "verb": "noop",
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
      "verb": "noop",
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
      "verb": "noop",
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
      "line": "SLIP: Tow the pin over — a hundred-twenty of drag — and park it inside twenty of the receiver, dead slow for a four-count. — PIN ON THE PLANETARY MASS.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "face",
      "onChoice": {
        "a": "await_a",
        "b": "charge_b",
        "c": "await_c"
      }
    },
    {
      "id": "charge_b",
      "verb": "charge",
      "amount": 12,
      "reason": "lived_planetary_mass_wake_reach_logic:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "SLIP: Time ran out on the work ask — PIN ON THE PLANETARY MASS. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "latched"
        },
        {
          "kind": "displaced",
          "dist": 120
        },
        {
          "kind": "released"
        },
        {
          "kind": "parked",
          "at": "hull_0",
          "dist": 20,
          "maxSpeed": 2,
          "holdS": 4
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "SLIP: The 12 cr stays spent — the relief still runs on your credit at Planetary Mass; the close-in just never came — PIN ON THE PLANETARY MASS.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "meet",
          "of": "hull_0",
          "dist": 60,
          "maxSpeed": 5,
          "holdS": 2
        }
      ],
      "next": "rep_b"
    },
    {
      "id": "await_c",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "SLIP: Time ran out on the work ask — PIN ON THE PLANETARY MASS. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "depart",
          "dist": 180,
          "far": 1000
        }
      ],
      "next": "done_c"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 18,
      "reason": "lived_planetary_mass_wake_reach_logic",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 2,
      "reason": "lived_planetary_mass_wake_reach_logic",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 3,
      "reason": "lived_planetary_mass_wake_reach_logic:sponsor",
      "next": "done_b"
    },
    {
      "id": "say_a",
      "verb": "noop"
    },
    {
      "id": "done_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "noop"
    },
    {
      "id": "done_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "noop"
    },
    {
      "id": "done_c",
      "verb": "resolve",
      "outcome": "c"
    },
    {
      "id": "cost_a",
      "verb": "noop"
    },
    {
      "id": "rep_c",
      "verb": "noop"
    },
    {
      "id": "grant_b",
      "verb": "noop"
    }
  ]
};

export const encounterOrder = 418;
export const trigger = deepFreeze({
  "id": "lived_planetary_mass_wake_reach_logic",
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
    "situation": "wake",
    "place": "planetary_mass",
    "twist": "logic",
    "actor": "faction_reach"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "PIN ON THE PLANETARY MASS",
  "primaryLine": "SLIP: Your wake crossed the pin marker at Planetary Mass. Log it or clear it.",
  "factionId": "faction_reach",
  "choices": [
    {
      "id": "a",
      "label": "Park the pin beside the receiver",
      "playerLine": "I set the pin inside twenty of your receiver hull and hold it dead slow for the count."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 12 cr, then close in slow",
      "playerLine": "Take 12 cr, SLIP — send the relief to Planetary Mass; I close your hull dead slow for the hand-off."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, SLIP — my hull is leaving Planetary Mass."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The pin sits parked inside twenty of the receiver at Planetary Mass, delivered dead slow. — PIN ON THE PLANETARY MASS.",
    "b": "12 cr funded the relief call — SLIP sends the shift at Planetary Mass on your credit. — PIN ON THE PLANETARY MASS.",
    "c": "You left Planetary Mass. The work stayed with the crew that owned it. — PIN ON THE PLANETARY MASS."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "park_tight",
    "hasProp": true
  }
});
