// Dead Drop Lift — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_dead_drop_lift",
  "title": "Dead Drop Lift",
  "factionId": "faction_quiet",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "quiet_ghost",
      "factionId": "faction_quiet",
      "dx": 0,
      "dz": 0,
      "scanLabel": "DROP RUNNER"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "CUSTOMS CUTTER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Cover the lift",
      "playerLine": "I will hold a line between the runner and the sweep."
    },
    {
      "id": "b",
      "label": "Nudge the cutter",
      "playerLine": "I will give the cutter the runner's bearing."
    },
    {
      "id": "c",
      "label": "Fly past it",
      "playerLine": "I saw nothing; the drop keeps its own silence."
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
      "scanLabel": "SEALED CRATE",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "NINEOLA: The drop is sealed. One lift, one look away, and the march forgets it happened.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "hold",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "A runner hangs on the drop while the cutter's sweep comes around.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "hold",
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
      "line": "The lift went clean. The march forgot on schedule.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_dead_drop_lift",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": 2,
      "reason": "scene_dead_drop_lift",
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
      "line": "The cutter read the runner off the drop. The crate stayed sealed.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 1,
      "reason": "scene_dead_drop_lift",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": -1,
      "reason": "scene_dead_drop_lift",
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
      "line": "You flew past. The march kept its own ledger.",
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

export const encounterOrder = 923;
export const trigger = deepFreeze({
  "id": "scene_dead_drop_lift",
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
    "twist": "depth",
    "actor": "faction_quiet"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_nyx_march"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Dead Drop Lift",
  "primaryLine": "NINEOLA: The drop is sealed. One lift, one look away, and the march forgets it happened.",
  "factionId": "faction_quiet",
  "choices": [
    {
      "id": "a",
      "label": "Cover the lift",
      "playerLine": "I will hold a line between the runner and the sweep."
    },
    {
      "id": "b",
      "label": "Nudge the cutter",
      "playerLine": "I will give the cutter the runner's bearing."
    },
    {
      "id": "c",
      "label": "Fly past it",
      "playerLine": "I saw nothing; the drop keeps its own silence."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The lift went clean. The march forgot on schedule.",
    "b": "The cutter read the runner off the drop. The crate stayed sealed.",
    "c": "You flew past. The march kept its own ledger."
  }
});
