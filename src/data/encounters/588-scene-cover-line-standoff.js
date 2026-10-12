// Cover Line Standoff — lived vignette (AEP P1 / PP-2). Two lines holding a debris cover line
// nose to nose: the staged front-line beat (cover lines + escalation silhouettes).
import { deepFreeze, defineEncounter } from './catalog.js';
import { compileVignette } from '../../systems/vignetteInterpreter.js';

export const spec = {
  "id": "scene_cover_line_standoff",
  "title": "Cover Line Standoff",
  "factionId": "faction_free",
  "start": "spawn",
  "cast": [
    { "role": "runner", "archetype": "patrol_lawman", "factionId": "faction_reach", "dx": 0, "dz": 0, "scanLabel": "REACH LINE" },
    { "role": "ship_1", "archetype": "patrol_lawman", "factionId": "faction_reach", "dx": -170, "dz": 40, "scanLabel": "REACH 2" },
    { "role": "ship_2", "archetype": "corsair_raider", "factionId": "faction_quiet", "dx": 30, "dz": -160, "scanLabel": "QUIET LINE" },
    { "role": "ship_3", "archetype": "reaver_pirate", "factionId": "faction_quiet", "dx": 200, "dz": -200, "scanLabel": "QUIET 2" }
  ],
  "choices": [
    { "id": "a", "label": "Broker a hold", "playerLine": "I will run the middle and keep both lines talking." },
    { "id": "b", "label": "Back the Reach line", "playerLine": "I will put my hull on the law side of the line." },
    { "id": "c", "label": "Withdraw", "playerLine": "I will not stand between two armed lines." }
  ],
  "timeoutChoice": "c",
  "phases": [
    { "id": "spawn", "verb": "spawn", "next": "prop" },
    { "id": "prop", "verb": "prop", "scanLabel": "COVER LINE", "dx": -60, "dz": 60, "radius": 16, "mass": 90, "next": "hail" },
    { "id": "hail", "verb": "say", "line": "SLIP: Two lines on a debris seam — Reach on one side, Quiet on the other. Nobody is moving.", "channel": "info", "primary": true, "next": "run" },
    { "id": "run", "verb": "motion", "motion": "face", "seconds": 6, "next": "a0" },
    { "id": "a0", "verb": "say", "line": "The seam between them is all spent plate. This fight already happened once and nobody won it.", "channel": "info", "next": "offer" },
    { "id": "offer", "verb": "offer", "motion": "face", "windowS": 22, "onChoice": { "a": "say_a", "b": "say_b", "c": "say_c" } },
    { "id": "say_a", "verb": "say", "line": "Both lines take a half-step back at once. Your hull is the only one that moved and it mattered.", "channel": "info", "next": "grant_a" },
    { "id": "grant_a", "verb": "grant", "amount": 30, "reason": "scene_cover_line_standoff", "next": "rep_a" },
    { "id": "rep_a", "verb": "rep", "factionId": "faction_free", "delta": 2, "reason": "scene_cover_line_standoff", "next": "resolve_a" },
    { "id": "resolve_a", "verb": "resolve", "outcome": "a" },
    { "id": "say_b", "verb": "say", "line": "The Quiet line reads four against two and slides off the seam. The lawmen hold.", "channel": "info", "next": "rep_b_runner" },
    { "id": "rep_b_runner", "verb": "rep", "factionId": "faction_reach", "delta": 1, "reason": "scene_cover_line_standoff", "next": "rep_b_authority" },
    { "id": "rep_b_authority", "verb": "rep", "factionId": "faction_free", "delta": -1, "reason": "scene_cover_line_standoff", "next": "resolve_b" },
    { "id": "resolve_b", "verb": "resolve", "outcome": "b" },
    { "id": "say_c", "verb": "say", "line": "You withdraw before either line can recruit your mass. The seam stays contested.", "channel": "info", "next": "resolve_c" },
    { "id": "resolve_c", "verb": "resolve", "outcome": "c" }
  ]
};

export const encounterOrder = 588;
export const trigger = deepFreeze({
  "id": "scene_cover_line_standoff",
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
  "shape": { "situation": "hunt", "place": "ambush_lane", "twist": "none", "actor": "faction_quiet" },
  "livedVignette": true,
  "ambientScene": true,
  "sectorIds": [
    "sector_helios_prime", "sector_io_reach", "sector_dione_lane", "sector_eris_margin",
    "sector_nyx_march", "sector_orcus_shadow", "sector_proteus_well", "sector_nereid_shoal"
  ],
  "noCombat": true,
  "motive": "lane_courtesy",
  "engagementTrigger": "hailed",
  "title": "Cover Line Standoff",
  "primaryLine": "SLIP: Two lines on a debris seam — Reach on one side, Quiet on the other. Nobody is moving.",
  "factionId": "faction_free",
  "choices": spec.choices
});
