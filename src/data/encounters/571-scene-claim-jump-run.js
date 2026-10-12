// Claim Jump Run — lived vignette. External-only: ambient world scene.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_claim_jump_run",
  "title": "Claim Jump Run",
  "factionId": "faction_dmc",
  "start": "spawn",
  "cast": [
    {
      "role": "runner",
      "archetype": "reaver_pirate",
      "factionId": "faction_reach",
      "dx": 0,
      "dz": 0,
      "scanLabel": "CLAIM JUMPER"
    },
    {
      "role": "ship_1",
      "archetype": "patrol_lawman",
      "factionId": "faction_dmc",
      "dx": -150,
      "dz": 90,
      "scanLabel": "DMC SEAM PATROL"
    },
    {
      "role": "ship_2",
      "archetype": "patrol_lawman",
      "factionId": "faction_dmc",
      "dx": 160,
      "dz": 70,
      "scanLabel": "DMC SEAM PATROL"
    }
  ],
  "choices": [
    {
      "id": "a",
      "label": "Hold the claim",
      "playerLine": "I will help the watch recover the stolen ore."
    },
    {
      "id": "b",
      "label": "Cover the jumper",
      "playerLine": "I will keep the claim crew looking at the wrong seam."
    },
    {
      "id": "c",
      "label": "Leave the seam",
      "playerLine": "I am leaving the belt to the crews already there."
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
      "line": "FOREMAN: That ore left the Quarry Cathedral without a receipt.",
      "channel": "info",
      "primary": true,
      "next": "run"
    },
    {
      "id": "run",
      "verb": "motion",
      "motion": "chase",
      "seconds": 6,
      "next": "a0"
    },
    {
      "id": "a0",
      "verb": "say",
      "line": "The seam is still loading while the claim mark runs.",
      "channel": "info",
      "next": "offer"
    },
    {
      "id": "offer",
      "verb": "offer",
      "motion": "chase",
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
      "line": "The watch logged the load. The seam remains open.",
      "channel": "info",
      "next": "grant_a"
    },
    {
      "id": "grant_a",
      "verb": "grant",
      "amount": 30,
      "reason": "scene_claim_jump_run",
      "next": "rep_a"
    },
    {
      "id": "rep_a",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": 2,
      "reason": "scene_claim_jump_run",
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
      "line": "The jumper kept the ore and lost the clean bearing.",
      "channel": "info",
      "next": "rep_b_runner"
    },
    {
      "id": "rep_b_runner",
      "verb": "rep",
      "factionId": "faction_reach",
      "delta": 1,
      "reason": "scene_claim_jump_run",
      "next": "rep_b_authority"
    },
    {
      "id": "rep_b_authority",
      "verb": "rep",
      "factionId": "faction_dmc",
      "delta": -1,
      "reason": "scene_claim_jump_run",
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
      "line": "You left the claim crew to count the empty cradle.",
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

export const encounterOrder = 571;
export const trigger = deepFreeze({
  "id": "scene_claim_jump_run",
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
    "situation": "claim",
    "place": "mining_belt",
    "twist": "follow_on",
    "actor": "faction_reach"
  },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_ceres_belt",
    "sector_hyperion_cut",
    "sector_rhea_cinder",
    "sector_nereid_shoal"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Claim Jump Run",
  "primaryLine": "FOREMAN: That ore left the Quarry Cathedral without a receipt.",
  "factionId": "faction_dmc",
  "choices": [
    {
      "id": "a",
      "label": "Hold the claim",
      "playerLine": "I will help the watch recover the stolen ore."
    },
    {
      "id": "b",
      "label": "Cover the jumper",
      "playerLine": "I will keep the claim crew looking at the wrong seam."
    },
    {
      "id": "c",
      "label": "Leave the seam",
      "playerLine": "I am leaving the belt to the crews already there."
    }
  ],
  "timeoutChoice": "c",
  "receipts": {
    "a": "The watch logged the load. The seam remains open.",
    "b": "The jumper kept the ore and lost the clean bearing.",
    "c": "You left the claim crew to count the empty cradle."
  }
});
