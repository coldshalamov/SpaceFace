// Mail Through Crossfire — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_mail_through_crossfire",
  "title": "Mail Through Crossfire",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": 0,
      "dz": 0,
      "scanLabel": "COURIER 1"
    },
    {
      "role": "ship_1",
      "archetype": "mule_trader",
      "factionId": "faction_free",
      "dx": -150,
      "dz": 90,
      "scanLabel": "COURIER 2"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Escort the mail",
      "playerLine": "I will hold a clear lane for the couriers."
    },
    {
      "id": "b",
      "label": "Back the Reach",
      "playerLine": "I will let the Reach keep the next bearing."
    },
    {
      "id": "c",
      "label": "Stay out",
      "playerLine": "I will leave the packet to its own route."
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
      "line": "MOSS: The Reach mail still runs; keep the packet on the marked bearing.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "column",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The dock flag changed. The courier pouch did not.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "column",
      "windowS": 22,
      "onChoice": {
        "a": "say_a",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "Both couriers carried the packet past the held dock.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_mail_through_crossfire",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": 2,
      "reason": "scene_mail_through_crossfire",
      "next": "resolve_a"
    },
    {
      "id": "resolve_a",
      "verb": "resolve",
      "outcome": "a"
    },
    {
      "id": "say_b",
      "verb": "say",
      "line": "The Reach took the lane. The mail kept moving.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 1,
      "reason": "scene_mail_through_crossfire",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_free",
      "delta": -1,
      "reason": "scene_mail_through_crossfire",
      "next": "resolve_b"
    },
    {
      "id": "resolve_b",
      "verb": "resolve",
      "outcome": "b"
    },
    {
      "id": "say_c",
      "verb": "say",
      "line": "You left the courier line unchanged.",
      "channel": "info",
      "next": "resolve_c"
    },
    {
      "id": "resolve_c",
      "verb": "resolve",
      "outcome": "c"
    }
  ]
};

export const encounterOrder = 579;
export const trigger = deepFreeze({
  "id": "scene_mail_through_crossfire",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core",
    "trade_lane",
    "patrol_corridor",
    "border_checkpoint",
    "refinery_approach",
    "mining_belt",
    "colony",
    "derelict_field",
    "outlaw_zone",
    "radiation_field",
    "nebula_fog",
    "ambush_lane",
    "anomaly_deep",
    "planetary_mass"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 1200,
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
    "place": "ambush_lane",
    "twist": "named",
    "actor": "faction_free"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_io_reach"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Mail Through Crossfire",
  "primaryLine": "MOSS: The Reach mail still runs; keep the packet on the marked bearing.",
  "factionId": "faction_free",
  "choices": [
    {
      "id": "a",
      "label": "Escort the mail",
      "playerLine": "I will hold a clear lane for the couriers."
    },
    {
      "id": "b",
      "label": "Back the Reach",
      "playerLine": "I will let the Reach keep the next bearing."
    },
    {
      "id": "c",
      "label": "Stay out",
      "playerLine": "I will leave the packet to its own route."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "Both couriers carried the packet past the held dock.",
    "b": "The Reach took the lane. The mail kept moving.",
    "c": "You left the courier line unchanged."
  }
});
