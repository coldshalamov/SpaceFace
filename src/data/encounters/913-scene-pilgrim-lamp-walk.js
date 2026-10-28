// Pilgrim Lamp Walk — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_pilgrim_lamp_walk",
  "title": "Pilgrim Lamp Walk",
  "factionId": "faction_choir",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": 0,
      "dz": 0,
      "scanLabel": "PILGRIM 1"
    },
    {
      "role": "ship_1",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -90,
      "dz": 0,
      "scanLabel": "PILGRIM 2"
    },
    {
      "role": "ship_2",
      "archetype": "choir_zealot",
      "factionId": "faction_choir",
      "dx": -180,
      "dz": 0,
      "scanLabel": "PILGRIM 3"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Escort the last lamp",
      "playerLine": "I will follow the last pilgrim and match its drift."
    },
    {
      "id": "b",
      "label": "Dismiss the cantor (-1 Choir standing)",
      "playerLine": "Your procession is not worth my time."
    },
    {
      "id": "c",
      "label": "Decline the escort",
      "playerLine": "Not this passage. Keep your lamps together."
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
      "line": "CANTOR: Three lamps are ready. Will you follow the last through the dark?",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "noop",
      "motion": "column",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The lamp line waits for your answer.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": null,
      "windowS": 22,
      "onChoice": {
        "a": "escort_instruction",
        "b": "say_b",
        "c": "say_c"
      }
    },
    {
      "id": "say_a",
      "verb": "say",
      "line": "You matched the last pilgrim's wake. The Choir acknowledges your escort.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_pilgrim_lamp_walk",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": 2,
      "reason": "scene_pilgrim_lamp_walk",
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
      "line": "The cantor heard your dismissal and closed the channel.",
      "channel": "info",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_choir",
      "delta": -1,
      "reason": "scene_pilgrim_lamp_walk",
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
      "line": "You declined the escort. The lamp line remains the crew's work.",
      "channel": "info",
      "next": "resolve_c"
    },
    {
      "id": "resolve_c",
      "verb": "resolve",
      "outcome": "c"
    },
    {
      "id": "escort_instruction",
      "verb": "say",
      "channel": "info",
      "line": "CANTOR: Stay 60–180 WU behind PILGRIM 3 and match its drift. Hold the wake for eight seconds once we're underway; wait for my acknowledgment.",
      "next": "escort_launch"
    },
    {
      "id": "escort_launch",
      "verb": "motion",
      "motion": "column",
      "seconds": 1,
      "next": "escort_last_lamp"
    },
    {
      "id": "escort_last_lamp",
      "verb": "await",
      "keepMotion": true,
      "timeoutS": 120,
      "timeoutLine": "CANTOR: The escort ended unfinished. No courtesy is owed.",
      "steps": [
        {
          "kind": "trail",
          "of": "ship_2",
          "min": 60,
          "max": 180,
          "maxRelSpeed": 8,
          "holdS": 8,
          "leaderProgress": 100
        }
      ],
      "next": "say_a"
    }
  ]
};

export const encounterOrder = 913;
export const trigger = deepFreeze({
  "id": "scene_pilgrim_lamp_walk",
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
const compiledRuntime = compileVignette(spec);
export const runtime = Object.freeze({
  ...compiledRuntime,
  fire(d, live, state) {
    const axis = live.data && live.data.sceneAxis;
    const length = axis && Math.hypot(axis.ux, axis.uz);
    const ux = length > 0 && Number.isFinite(length) ? axis.ux / length : 1;
    const uz = length > 0 && Number.isFinite(length) ? axis.uz / length : 0;
    // Only initial spawn coordinates rotate. Native navigation owns every later pose.
    const aligned = { ...spec, cast: spec.cast.map((member) => ({
      ...member, dx: member.dx * ux - member.dz * uz,
      dz: member.dx * uz + member.dz * ux,
    })) };
    compileVignette(aligned).fire(d, live, state);
  },
});
export default defineEncounter(trigger, {
  "shape": {
    "situation": "wake",
    "place": "colony",
    "twist": "follow_on",
    "actor": "faction_choir"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_veil_nebula",
    "sector_sedna_dark",
    "sector_phoebe_echo"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Pilgrim Lamp Walk",
  "primaryLine": "CANTOR: Three lamps are ready. Will you follow the last through the dark?",
  "factionId": "faction_choir",
  "choices": [
    {
      "id": "a",
      "label": "Escort the last lamp",
      "playerLine": "I will follow the last pilgrim and match its drift."
    },
    {
      "id": "b",
      "label": "Dismiss the cantor (-1 Choir standing)",
      "playerLine": "Your procession is not worth my time."
    },
    {
      "id": "c",
      "label": "Decline the escort",
      "playerLine": "Not this passage. Keep your lamps together."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "You matched the last pilgrim's wake. The Choir acknowledges your escort.",
    "b": "The cantor heard your dismissal and closed the channel.",
    "c": "You declined the escort. The lamp line remains the crew's work."
  },
  "livedRotation": true
});
