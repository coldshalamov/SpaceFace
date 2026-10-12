// Battle Drift — lived vignette (AEP P1 / PP-2). Vultures circling a drifting battle line:
// the aftermath beat staged over a battlescar site.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_battle_drift",
  "title": "Battle Drift",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    { "role": "runner", "archetype": "reaver_pirate", "factionId": "faction_reach", "dx": 0, "dz": 0, "scanLabel": "VULTURE 1" },
    { "role": "ship_1", "archetype": "reaver_pirate", "factionId": "faction_reach", "dx": -140, "dz": 80, "scanLabel": "VULTURE 2" },
    { "role": "ship_2", "archetype": "wasp_swarmer", "factionId": "faction_reach", "dx": 170, "dz": 60, "scanLabel": "VULTURE 3" }
  ],
  "choices": [
    { "id": "a", "label": "Hold the line for the owner", "playerLine": "I will stand over the drift until the owner's tally posts." },
    { "id": "b", "label": "Scatter for a share", "playerLine": "I will take one cut off the drift and be gone." },
    { "id": "c", "label": "Keep clear", "playerLine": "I will not feed on a line that is still settling." }
  ],
  "timeoutChoice": "c",
  "phases": [
    { "id": "spawn", "verb": "spawn", "next": "prop" },
    { "id": "prop", "verb": "prop", "scanLabel": "DRIFTING LINE", "dx": 50, "dz": -40, "radius": 18, "mass": 110, "next": "hail" },
    { "id": "hail", "verb": "say", "line": "SLIP: A whole battle line drifting loose — vultures already working the edges.", "channel": "info", "primary": true, "next": "run" },
    { "id": "run", "verb": "motion", "motion": "vulture", "seconds": 6, "next": "a0" },
    { "id": "a0", "verb": "say", "line": "The line is still in formation, just dead. Whoever flew it never got to scatter.", "channel": "info", "next": "offer" },
    { "id": "offer", "verb": "offer", "motion": "vulture", "windowS": 22, "onChoice": { "a": "say_a", "b": "say_b", "c": "say_c" } },
    { "id": "say_a", "verb": "say", "line": "The vultures give your hull the wide arc. The owner's tally posts against your patience.", "channel": "info", "next": "grant_a" },
    { "id": "grant_a", "verb": "grant", "amount": 30, "reason": "scene_battle_drift", "next": "rep_a" },
    { "id": "rep_a", "verb": "rep", "factionId": "faction_free", "delta": 2, "reason": "scene_battle_drift", "next": "resolve_a" },
    { "id": "resolve_a", "verb": "resolve", "outcome": "a" },
    { "id": "say_b", "verb": "say", "line": "One plate off the edge, like the vultures taught you. The line does not miss it.", "channel": "info", "next": "rep_b_runner" },
    { "id": "rep_b_runner", "verb": "rep", "factionId": "faction_reach", "delta": 1, "reason": "scene_battle_drift", "next": "rep_b_authority" },
    { "id": "rep_b_authority", "verb": "rep", "factionId": "faction_free", "delta": -1, "reason": "scene_battle_drift", "next": "resolve_b" },
    { "id": "resolve_b", "verb": "resolve", "outcome": "b" },
    { "id": "say_c", "verb": "say", "line": "You leave the drift to the vultures. The dead keep their formation.", "channel": "info", "next": "resolve_c" },
    { "id": "resolve_c", "verb": "resolve", "outcome": "c" }
  ]
};

export const encounterOrder = 591;
export const trigger = deepFreeze({
  "id": "scene_battle_drift",
  "tier": "ambient",
  "deck": "civilian",
  "weight": 1,
  "zoneTypes": [
    "civilian_core", "trade_lane", "patrol_corridor", "border_checkpoint", "refinery_approach",
    "mining_belt", "colony", "derelict_field", "outlaw_zone", "radiation_field", "nebula_fog",
    "ambush_lane", "anomaly_deep", "planetary_mass"
  ],
  "script": "selfRegistered",
  "fallbackScript": "whisper",
  "pressureCost": 6,
  "cooldownS": 1200,
  "proximity": true,
  "rare": true,
  "gates": { "externalOnly": true }
});
export const runtime = compileVignette(spec);
export default defineEncounter(trigger, {
  "shape": { "situation": "wreck", "place": "derelict_field", "twist": "unique_wreck", "actor": "faction_reach" },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_io_reach", "sector_pallas_drift", "sector_kepler_scar", "sector_eunomia_gulf",
    "sector_proteus_well", "sector_sedna_dark", "sector_phoebe_echo", "sector_rhea_cinder",
    "sector_eris_margin", "sector_triton_wake"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Battle Drift",
  "primaryLine": "SLIP: A whole battle line drifting loose — vultures already working the edges.",
  "factionId": "faction_free",
  "choices": spec.choices
});
