// Waymark Relight — lived vignette (AEP P1 / PP-1). A tender walking a nav-buoy chain back to
// life: the readable-approach-lane beat.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_waymark_relight",
  "title": "Waymark Relight",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    { "role": "runner", "archetype": "mule_trader", "factionId": "faction_free", "dx": 0, "dz": 0, "scanLabel": "TENDER" },
    { "role": "ship_1", "archetype": "mule_trader", "factionId": "faction_free", "dx": -130, "dz": 90, "scanLabel": "TENDER 2" },
    { "role": "ship_2", "archetype": "patrol_lawman", "factionId": "faction_reach", "dx": 160, "dz": -40, "scanLabel": "LANE WATCH" }
  ],
  "choices": [
    { "id": "a", "label": "Cover the tender", "playerLine": "I will hold the lane quiet while they relight the marks." },
    { "id": "b", "label": "Report the dead buoy", "playerLine": "I will log the dark marks for the tally office." },
    { "id": "c", "label": "Pass on through", "playerLine": "I will take the lane as marked and move on." }
  ],
  "timeoutChoice": "c",
  "phases": [
    { "id": "spawn", "verb": "spawn", "next": "prop" },
    { "id": "prop", "verb": "prop", "scanLabel": "DEAD MARK", "dx": -90, "dz": -40, "radius": 8, "mass": 24, "next": "hail" },
    { "id": "hail", "verb": "say", "line": "SLIP: Tender crew relighting the lane marks — half the chain was dark.", "channel": "info", "primary": true, "next": "run" },
    { "id": "run", "verb": "motion", "motion": "column", "seconds": 6, "next": "a0" },
    { "id": "a0", "verb": "say", "line": "A dark chain eats hulls. The tenders buy the lane back one light at a time.", "channel": "info", "next": "offer" },
    { "id": "offer", "verb": "offer", "motion": "column", "windowS": 22, "onChoice": { "a": "say_a", "b": "say_b", "c": "say_c" } },
    { "id": "say_a", "verb": "say", "line": "You keep the lane quiet. The last mark comes up green behind you.", "channel": "info", "next": "grant_a" },
    { "id": "grant_a", "verb": "grant", "amount": 30, "reason": "scene_waymark_relight", "next": "rep_a" },
    { "id": "rep_a", "verb": "rep", "factionId": "faction_free", "delta": 2, "reason": "scene_waymark_relight", "next": "resolve_a" },
    { "id": "resolve_a", "verb": "resolve", "outcome": "a" },
    { "id": "say_b", "verb": "say", "line": "The tally office logs the dark marks against the lane's account.", "channel": "info", "next": "rep_b_runner" },
    { "id": "rep_b_runner", "verb": "rep", "factionId": "faction_reach", "delta": 1, "reason": "scene_waymark_relight", "next": "rep_b_authority" },
    { "id": "rep_b_authority", "verb": "rep", "factionId": "faction_free", "delta": -1, "reason": "scene_waymark_relight", "next": "resolve_b" },
    { "id": "resolve_b", "verb": "resolve", "outcome": "b" },
    { "id": "say_c", "verb": "say", "line": "You run the marks as relit. The lane reads whole again.", "channel": "info", "next": "resolve_c" },
    { "id": "resolve_c", "verb": "resolve", "outcome": "c" }
  ]
};

export const encounterOrder = 590;
export const trigger = deepFreeze({
  "id": "scene_waymark_relight",
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
  "shape": { "situation": "trade", "place": "trade_lane", "twist": "none", "actor": "faction_free" },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_helios_prime", "sector_nyx_march", "sector_hyperion_cut", "sector_rhea_cinder",
    "sector_nereid_shoal", "sector_proteus_well", "sector_eunomia_gulf", "sector_dione_lane",
    "sector_triton_wake", "sector_sedna_dark", "sector_phoebe_echo", "sector_kepler_scar"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Waymark Relight",
  "primaryLine": "SLIP: Tender crew relighting the lane marks — half the chain was dark.",
  "factionId": "faction_free",
  "choices": spec.choices
});
