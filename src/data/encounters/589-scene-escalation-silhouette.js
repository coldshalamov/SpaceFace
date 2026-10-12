// Escalation Silhouette — lived vignette (AEP P1 / PP-2). A dead-capital silhouette looming
// over a wreck field while salvors scatter: the escalation silhouette beat.
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_escalation_silhouette",
  "title": "Escalation Silhouette",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    { "role": "runner", "archetype": "mule_trader", "factionId": "faction_free", "dx": 0, "dz": 0, "scanLabel": "SALVOR 1" },
    { "role": "ship_1", "archetype": "mule_trader", "factionId": "faction_free", "dx": -150, "dz": 70, "scanLabel": "SALVOR 2" },
    { "role": "ship_2", "archetype": "reaver_pirate", "factionId": "faction_free", "dx": 160, "dz": 50, "scanLabel": "LATE VULTURE" }
  ],
  "choices": [
    { "id": "a", "label": "Hold for the big hull", "playerLine": "I will anchor and wait for the silhouette to finish drifting in." },
    { "id": "b", "label": "Mark the site", "playerLine": "I will drop a mark on the field and tell the lane what is down there." },
    { "id": "c", "label": "Follow the salvors out", "playerLine": "I will take the hint the crews just gave me." }
  ],
  "timeoutChoice": "c",
  "phases": [
    { "id": "spawn", "verb": "spawn", "next": "prop" },
    { "id": "prop", "verb": "prop", "scanLabel": "DEAD CAPITAL", "dx": 220, "dz": -180, "radius": 90, "mass": 480, "next": "hail" },
    { "id": "hail", "verb": "say", "line": "SLIP: Something big is drifting over the wreck field — the salvors just left in a hurry.", "channel": "info", "primary": true, "next": "run" },
    { "id": "run", "verb": "motion", "motion": "depart", "seconds": 6, "next": "a0" },
    { "id": "a0", "verb": "say", "line": "The silhouette does not answer hails. The spill below it is worth a fortune and nobody wants it.", "channel": "info", "next": "offer" },
    { "id": "offer", "verb": "offer", "motion": "depart", "windowS": 22, "onChoice": { "a": "say_a", "b": "say_b", "c": "say_c" } },
    { "id": "say_a", "verb": "say", "line": "You anchor where the salvors ran from. The big hull drifts past and does not mind you.", "channel": "info", "next": "grant_a" },
    { "id": "grant_a", "verb": "grant", "amount": 30, "reason": "scene_escalation_silhouette", "next": "rep_a" },
    { "id": "rep_a", "verb": "rep", "factionId": "faction_free", "delta": 2, "reason": "scene_escalation_silhouette", "next": "resolve_a" },
    { "id": "resolve_a", "verb": "resolve", "outcome": "a" },
    { "id": "say_b", "verb": "say", "line": "Your mark goes on the chart. Every lane that reads it owes you the warning.", "channel": "info", "next": "rep_b_runner" },
    { "id": "rep_b_runner", "verb": "rep", "factionId": "faction_reach", "delta": 1, "reason": "scene_escalation_silhouette", "next": "rep_b_authority" },
    { "id": "rep_b_authority", "verb": "rep", "factionId": "faction_free", "delta": -1, "reason": "scene_escalation_silhouette", "next": "resolve_b" },
    { "id": "resolve_b", "verb": "resolve", "outcome": "b" },
    { "id": "say_c", "verb": "say", "line": "You take the hint. The silhouette keeps growing on the scope behind you.", "channel": "info", "next": "resolve_c" },
    { "id": "resolve_c", "verb": "resolve", "outcome": "c" }
  ]
};

export const encounterOrder = 589;
export const trigger = deepFreeze({
  "id": "scene_escalation_silhouette",
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
  "shape": { "situation": "anomaly", "place": "anomaly_deep", "twist": "depth", "actor": "faction_free" },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_veil_nebula", "sector_pallas_drift", "sector_orcus_shadow", "sector_haumea_rift",
    "sector_phoebe_echo", "sector_triton_wake", "sector_sedna_dark", "sector_eunomia_gulf"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Escalation Silhouette",
  "primaryLine": "SLIP: Something big is drifting over the wreck field — the salvors just left in a hurry.",
  "factionId": "faction_free",
  "choices": spec.choices
});
