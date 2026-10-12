// Wreck Cordon — lived vignette (AEP P1 / PP-2). A patrol pair holds an interdiction ring on a
// fresh wreck: the crime-scene cordon beat staged at a battle site.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_wreck_cordon",
  "title": "Wreck Cordon",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    { "role": "runner", "archetype": "patrol_lawman", "factionId": "faction_reach", "dx": 0, "dz": 0, "scanLabel": "CORDON LEAD" },
    { "role": "ship_1", "archetype": "patrol_lawman", "factionId": "faction_reach", "dx": -160, "dz": 90, "scanLabel": "CORDON 2" },
    { "role": "ship_2", "archetype": "mule_trader", "factionId": "faction_free", "dx": 170, "dz": -60, "scanLabel": "OWNER'S RUNNER" }
  ],
  "choices": [
    { "id": "a", "label": "Reinforce the cordon", "playerLine": "I will stand the ring until the tally office arrives." },
    { "id": "b", "label": "Ask for a look", "playerLine": "I will request a pass through the ring for one sweep." },
    { "id": "c", "label": "Give them the field", "playerLine": "I will not crowd a live cordon." }
  ],
  "timeoutChoice": "c",
  "phases": [
    { "id": "spawn", "verb": "spawn", "next": "prop" },
    { "id": "prop", "verb": "prop", "scanLabel": "CORDONED WRECK", "dx": 40, "dz": -50, "radius": 22, "mass": 140, "next": "hail" },
    { "id": "hail", "verb": "say", "line": "SLIP: Cordon up. Reach law is holding the wreck until the tally office lands.", "channel": "info", "primary": true, "next": "run" },
    { "id": "run", "verb": "motion", "motion": "ring", "seconds": 6, "next": "a0" },
    { "id": "a0", "verb": "say", "line": "Two hulls pacing a dead one. Whatever killed it is not done being measured.", "channel": "info", "next": "offer" },
    { "id": "offer", "verb": "offer", "motion": "ring", "windowS": 22, "onChoice": { "a": "say_a", "b": "say_b", "c": "say_c" } },
    { "id": "say_a", "verb": "say", "line": "Your hull slots into the ring. The cordon reads three now.", "channel": "info", "next": "grant_a" },
    { "id": "grant_a", "verb": "grant", "amount": 30, "reason": "scene_wreck_cordon", "next": "rep_a" },
    { "id": "rep_a", "verb": "rep", "factionId": "faction_free", "delta": 2, "reason": "scene_wreck_cordon", "next": "resolve_a" },
    { "id": "resolve_a", "verb": "resolve", "outcome": "a" },
    { "id": "say_b", "verb": "say", "line": "One sweep, logged. The lawmen do not look up.", "channel": "info", "next": "rep_b_runner" },
    { "id": "rep_b_runner", "verb": "rep", "factionId": "faction_reach", "delta": 1, "reason": "scene_wreck_cordon", "next": "rep_b_authority" },
    { "id": "rep_b_authority", "verb": "rep", "factionId": "faction_free", "delta": -1, "reason": "scene_wreck_cordon", "next": "resolve_b" },
    { "id": "resolve_b", "verb": "resolve", "outcome": "b" },
    { "id": "say_c", "verb": "say", "line": "You give the ring its room. The buoys keep blinking behind you.", "channel": "info", "next": "resolve_c" },
    { "id": "resolve_c", "verb": "resolve", "outcome": "c" }
  ]
};

export const encounterOrder = 587;
export const trigger = deepFreeze({
  "id": "scene_wreck_cordon",
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
    "sector_helios_prime", "sector_pallas_drift", "sector_io_reach", "sector_kepler_scar",
    "sector_eris_margin", "sector_dione_lane", "sector_nereid_shoal", "sector_nyx_march"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Wreck Cordon",
  "primaryLine": "SLIP: Cordon up. Reach law is holding the wreck until the tally office lands.",
  "factionId": "faction_free",
  "choices": spec.choices
});
