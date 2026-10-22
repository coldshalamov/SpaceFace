// Sweep Window — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_sweep_window",
  "title": "Sweep Window",
  "factionId": "faction_quiet",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "quiet_ghost",
      "factionId": "faction_quiet",
      "dx": 0,
      "dz": 0,
      "scanLabel": "MARGIN RUNNER"
    },
    {
      "role": "ship_1",
      "archetype": "customs_cutter",
      "factionId": "faction_scn",
      "dx": -150,
      "dz": 90,
      "scanLabel": "SWEEP CUTTER"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Call the gap",
      "playerLine": "I will count the sweep with the runner and call the crossing gap."
    },
    {
      "id": "b",
      "label": "Flag the runner",
      "playerLine": "I will give the cutter one more hull to read."
    },
    {
      "id": "c",
      "label": "Keep your count",
      "playerLine": "I am not sharing my count with either side of the weir."
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
      "scanLabel": "FENCE POST",
      "dx": 54,
      "dz": -28,
      "radius": 9,
      "mass": 48,
      "next": "hail"
    },
    {
      "id": "hail",
      "verb": "say",
      "line": "LOOKOUT: The weir sweeps this lane on a count. Cross on the gap, not on the bell.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "weave",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "A runner holds at the fence post, reading the sweep like a timetable.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "weave",
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
      "line": "The runner crossed on your count. The sweep read an empty lane.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_sweep_window",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": 2,
      "reason": "scene_sweep_window",
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
      "line": "The cutter got one more bearing. The margin kept its count.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_scn",
      "delta": 1,
      "reason": "scene_sweep_window",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_quiet",
      "delta": -1,
      "reason": "scene_sweep_window",
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
      "line": "You kept your count. The weir kept its schedule.",
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

export const encounterOrder = 922;
export const trigger = deepFreeze({
  "id": "scene_sweep_window",
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
    "situation": "patrol",
    "place": "ambush_lane",
    "twist": "literalized",
    "actor": "faction_quiet"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_eris_margin"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Sweep Window",
  "primaryLine": "LOOKOUT: The weir sweeps this lane on a count. Cross on the gap, not on the bell.",
  "factionId": "faction_quiet",
  "choices": [
    {
      "id": "a",
      "label": "Call the gap",
      "playerLine": "I will count the sweep with the runner and call the crossing gap."
    },
    {
      "id": "b",
      "label": "Flag the runner",
      "playerLine": "I will give the cutter one more hull to read."
    },
    {
      "id": "c",
      "label": "Keep your count",
      "playerLine": "I am not sharing my count with either side of the weir."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The runner crossed on your count. The sweep read an empty lane.",
    "b": "The cutter got one more bearing. The margin kept its count.",
    "c": "You kept your count. The weir kept its schedule."
  }
});
