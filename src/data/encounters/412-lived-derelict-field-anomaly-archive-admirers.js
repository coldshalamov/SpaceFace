// MANIFEST ON THE DERELICT FIELD — lived vignette. External-only: the day planner must not roll this.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "lived_derelict_field_anomaly_archive_admirers",
  "title": "MANIFEST ON THE DERELICT FIELD",
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
      "label": "Circle to the far side of the hull",
      "playerLine": "I cross a hundred-twenty of your flank to the far side, inside the band at Derelict Field."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 30 cr",
      "playerLine": "Take 30 cr, ARCHIVIST — send the relief to Derelict Field instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, ARCHIVIST — my hull is leaving Derelict Field."
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
      "line": "ARCHIVIST: The manifest signal repeats from derelict field. Do not answer its second voice. — MANIFEST ON THE DERELICT FIELD.",
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
      "verb": "noop",
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
      "verb": "noop",
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
      "verb": "noop",
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
      "verb": "noop",
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
      "line": "ARCHIVIST: Circle us — start one side, cross a hundred-twenty through to the other, inside the hundred-sixty band. — MANIFEST ON THE DERELICT FIELD.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "windowS": 56,
      "motion": "ring",
      "onChoice": {
        "a": "await_a",
        "b": "charge_b",
        "c": "await_c"
      }
    },
    {
      "id": "charge_b",
      "verb": "charge",
      "amount": 30,
      "reason": "lived_derelict_field_anomaly_archive_admirers:sponsor",
      "next": "await_b"
    },
    {
      "id": "await_a",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "ARCHIVIST: Time ran out on the work ask — MANIFEST ON THE DERELICT FIELD. Nothing owed either way — the lane forgets it.",
      "keepMotion": false,
      "steps": [
        {
          "kind": "oppositeSides",
          "of": "hull_0",
          "min": 100,
          "max": 160,
          "travel": 120
        }
      ],
      "next": "grant_a"
    },
    {
      "id": "await_b",
      "verb": "await",
      "timeoutS": 120,
      "timeoutLine": "ARCHIVIST: Time ran out on the work ask — MANIFEST ON THE DERELICT FIELD. Nothing owed either way — the lane forgets it.",
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
      "timeoutLine": "ARCHIVIST: Time ran out on the work ask — MANIFEST ON THE DERELICT FIELD. Nothing owed either way — the lane forgets it.",
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
      "amount": 48,
      "reason": "lived_derelict_field_anomaly_archive_admirers",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 2,
      "reason": "lived_derelict_field_anomaly_archive_admirers",
      "next": "done_a"
    },
    {
      "id": "rep_b",
      "verb": "rep",
      "factionId": "faction_archive",
      "delta": 3,
      "reason": "lived_derelict_field_anomaly_archive_admirers:sponsor",
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

export const encounterOrder = 412;
export const trigger = deepFreeze({
  "id": "lived_derelict_field_anomaly_archive_admirers",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "derelict_field"
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
    "situation": "anomaly",
    "place": "derelict_field",
    "twist": "admirers",
    "actor": "faction_archive"
  },
  "livedVignette": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "MANIFEST ON THE DERELICT FIELD",
  "primaryLine": "ARCHIVIST: The manifest signal repeats from derelict field. Do not answer its second voice.",
  "factionId": "faction_archive",
  "choices": [
    {
      "id": "a",
      "label": "Circle to the far side of the hull",
      "playerLine": "I cross a hundred-twenty of your flank to the far side, inside the band at Derelict Field."
    },
    {
      "id": "b",
      "label": "Sponsor relief — 30 cr",
      "playerLine": "Take 30 cr, ARCHIVIST — send the relief to Derelict Field instead of my hands."
    },
    {
      "id": "c",
      "label": "Decline and depart",
      "playerLine": "Not my work, ARCHIVIST — my hull is leaving Derelict Field."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You crossed to the hull's far side inside the band at Derelict Field. — MANIFEST ON THE DERELICT FIELD.",
    "b": "30 cr funded the relief call — ARCHIVIST sends the shift at Derelict Field on your credit. — MANIFEST ON THE DERELICT FIELD.",
    "c": "You left Derelict Field. The work stayed with the crew that owned it. — MANIFEST ON THE DERELICT FIELD."
  },
  "livedRotation": true,
  "livedPhysical": {
    "recipeId": "sides",
    "hasProp": false
  }
});
