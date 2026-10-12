// Field Scar Survey — lived vignette (AEP P1 / PP-1). A work crew marking a fresh cut through a
// belt: the field-silhouette beat — a worked scar mouth reading as a landmark.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_field_scar_survey",
  "title": "Field Scar Survey",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    { "role": "runner", "archetype": "mule_trader", "factionId": "faction_free", "dx": 0, "dz": 0, "scanLabel": "SURVEY LEAD" },
    { "role": "ship_1", "archetype": "mule_trader", "factionId": "faction_free", "dx": -140, "dz": 80, "scanLabel": "SKIFF 2" },
    { "role": "ship_2", "archetype": "customs_cutter", "factionId": "faction_reach", "dx": 150, "dz": 60, "scanLabel": "ESCORT" }
  ],
  "choices": [
    { "id": "a", "label": "Mark the scar", "playerLine": "I will drop my own beacon on the cut so traffic reads it." },
    { "id": "b", "label": "Warn traffic off", "playerLine": "I will call the lane clear of the crew until they finish." },
    { "id": "c", "label": "Leave them to it", "playerLine": "I will keep clear of a worked scar." }
  ],
  "timeoutChoice": "c",
  "phases": [
    { "id": "spawn", "verb": "spawn", "next": "prop" },
    { "id": "prop", "verb": "prop", "scanLabel": "SEAMED SCAR", "dx": 60, "dz": -40, "radius": 14, "mass": 120, "next": "hail" },
    { "id": "hail", "verb": "say", "line": "SLIP: Survey crew on the scar — they are cutting a clean mouth through the belt.", "channel": "info", "primary": true, "next": "run" },
    { "id": "run", "verb": "motion", "motion": "orbit", "seconds": 6, "next": "a0" },
    { "id": "a0", "verb": "say", "line": "The cut is already reading like a gate on the scope. Someone will owe someone for it.", "channel": "info", "next": "offer" },
    { "id": "offer", "verb": "offer", "motion": "orbit", "windowS": 22, "onChoice": { "a": "say_a", "b": "say_b", "c": "say_c" } },
    { "id": "say_a", "verb": "say", "line": "Your mark goes on the chart next to theirs — first light wins the name.", "channel": "info", "next": "grant_a" },
    { "id": "grant_a", "verb": "grant", "amount": 30, "reason": "scene_field_scar_survey", "next": "rep_a" },
    { "id": "rep_a", "verb": "rep", "factionId": "faction_free", "delta": 2, "reason": "scene_field_scar_survey", "next": "resolve_a" },
    { "id": "resolve_a", "verb": "resolve", "outcome": "a" },
    { "id": "say_b", "verb": "say", "line": "Traffic holds at the marks. The survey crew finishes the cut in quiet.", "channel": "info", "next": "rep_b_runner" },
    { "id": "rep_b_runner", "verb": "rep", "factionId": "faction_reach", "delta": 1, "reason": "scene_field_scar_survey", "next": "rep_b_authority" },
    { "id": "rep_b_authority", "verb": "rep", "factionId": "faction_free", "delta": -1, "reason": "scene_field_scar_survey", "next": "resolve_b" },
    { "id": "resolve_b", "verb": "resolve", "outcome": "b" },
    { "id": "say_c", "verb": "say", "line": "You keep the scar off your bearing. Their marks stay behind you.", "channel": "info", "next": "resolve_c" },
    { "id": "resolve_c", "verb": "resolve", "outcome": "c" }
  ]
};

export const encounterOrder = 586;
export const trigger = deepFreeze({
  "id": "scene_field_scar_survey",
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
  "shape": { "situation": "salvage", "place": "mining_belt", "twist": "depth", "actor": "faction_free" },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_helios_prime", "sector_veil_nebula", "sector_pallas_drift", "sector_hyperion_cut",
    "sector_kepler_scar", "sector_rhea_cinder", "sector_haumea_rift", "sector_phoebe_echo",
    "sector_nereid_shoal", "sector_proteus_well", "sector_eunomia_gulf"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Field Scar Survey",
  "primaryLine": "SLIP: Survey crew on the scar — they are cutting a clean mouth through the belt.",
  "factionId": "faction_free",
  "choices": spec.choices
});
