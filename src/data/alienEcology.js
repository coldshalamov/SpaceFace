// src/data/alienEcology.js — Vethari-linked contamination model, site registry, and
// scanner-language tables. Pure data + pure helpers (sectorZones.js contract): no imports of
// sim state shape beyond plain reads, no ambient randomness — callers pass an rng stream.
//
// Design authority: design/alien-ecology-program/ (docs 01 contamination model, 03 infestation
// kit, 08 engineering seams, 09 vertical slice, 12 migration rules).
//
// The ONE fungus colonizes dead hulls; it never flies a ship of its own and the Vethari stay
// off-frame. C (contamination) is a physical quantity; R (revelation) is player knowledge.
// They move independently: a wreck can read C3 while the pilot still knows nothing.

import { zonesForSector } from './sectorZones.js';
import { ensureAlienEcologyState } from './alienEcologyState.js';

// ── Contamination model (doc 01) ────────────────────────────────────────────────────────────
// C = clamp(G + L + T + E, 0, 1)
//   G geometry     — how much of the structure's surface/volume the filaments occupy
//   L leakage      — metabolic byproduct escaping into the surroundings (spores, film)
//   T topology     — how networked the colony is (edge node < distributed web)
//   E ecologySupport — supporting fauna/growth activity around the site
export function contaminationFromComponents({ geometry = 0, leakage = 0, topology = 0, ecologySupport = 0 } = {}) {
  const c = geometry + leakage + topology + ecologySupport;
  return Math.min(1, Math.max(0, c));
}

// C bands — the scanner + content vocabulary reads these, not raw floats.
export const CONTAMINATION_BANDS = Object.freeze([
  Object.freeze({ id: 'C0', min: 0.0, max: 0.05, label: 'CLEAN' }),
  Object.freeze({ id: 'C1', min: 0.05, max: 0.20, label: 'TRACE' }),
  Object.freeze({ id: 'C2', min: 0.20, max: 0.40, label: 'COLONIZED' }),
  Object.freeze({ id: 'C3', min: 0.40, max: 0.60, label: 'ACTIVE ECOLOGY' }),
  Object.freeze({ id: 'C4', min: 0.60, max: 0.80, label: 'NETWORKED REGION' }),
  Object.freeze({ id: 'C5', min: 0.80, max: 1.01, label: 'DOMAIN THRESHOLD' }),
]);

export function contaminationBand(c) {
  const v = Math.min(1, Math.max(0, Number(c) || 0));
  for (const band of CONTAMINATION_BANDS) {
    if (v >= band.min && v < band.max) return band.id;
  }
  return 'C5';
}

// Entity contamination states (doc 01 §entity axis). Per-hull colonization level — the same
// scale a wreck marker or recovered salvage speaks in.
export const ALIEN_ENTITY_STATES = Object.freeze(['none', 'exposed', 'colonized', 'integrated', 'carrier']);

// ── Regional baselines ──────────────────────────────────────────────────────────────────────
// Zone-type priors: a derelict field reads higher than a mining belt before any site speaks.
export const ZONE_CONTAMINATION_BASELINE = Object.freeze({
  civilian_core: 0.00,
  trade_lane: 0.00,
  patrol_corridor: 0.00,
  border_checkpoint: 0.00,
  refinery_approach: 0.02,
  mining_belt: 0.06,
  colony: 0.04,
  derelict_field: 0.30,
  outlaw_zone: 0.08,
  radiation_field: 0.18,
  nebula_fog: 0.15,
  ambush_lane: 0.05,
  anomaly_deep: 0.22,
  planetary_mass: 0.03,
});

// Sector lean — whole-region tendency on top of the zone prior. Canon sites list in doc 00/13.
export const SECTOR_CONTAMINATION_LEAN = Object.freeze({
  sector_charon_expanse: 0.08, // the Cinder Nursery anchors a networked pocket
  sector_veil_nebula: 0.06,
  sector_ashfall_reach: 0.05,
  sector_triton_wake: 0.03,
  sector_phoebe_echo: 0.03,
  sector_nyx_march: 0.02,
  sector_sker_haven: 0.04,   // the deep uncharted pocket — the Harvest Deep anchors it
});

// ── Strains (doc 01 §strains) ───────────────────────────────────────────────────────────────
// Strains are local lineages of the ONE fungus — different terrains, same organism.
export const ALIEN_STRAINS = Object.freeze({
  charon_grave: Object.freeze({
    id: 'charon_grave',
    name: 'Charon Grave strain',
    // Filament red against pale tissue; reads warm under the scanner's dark palette.
    filamentColor: 0xc94f3d,
    tissueColor: 0x9aa08e,
    glowColor: 0xff9a4a,
    note: 'Wreck-fed lineage inside the Charon graveyard seam; thick calcified collars, slow pulse.',
    // AE-052 host memory priors — a small deterministic vector, updated only at coarse
    // ecological events (doc 01 §memory). Fauna drives read these as drive biases.
    memoryPriors: Object.freeze({
      avoids_beam_band: 0.6,
      follows_reactor_heat: 0.8,
      precursor_signal_fear: 0.95,
      massline_contact_aversion: 0.2,
      vibration_wake_sensitivity: 0.8, // DMC pulse frequencies taught it to wake
    }),
  }),
  veil_glass: Object.freeze({
    id: 'veil_glass',
    name: 'Veil Glass strain',
    filamentColor: 0x7fd4c0,
    tissueColor: 0x8faebe,
    glowColor: 0x9fe8ff,
    note: 'Nebula lineage — glassy translucent sheeting, spores drift on charge gradients.',
    memoryPriors: Object.freeze({
      avoids_beam_band: 0.3,
      follows_reactor_heat: 0.2,
      precursor_signal_fear: 0.95, // strong prism-tone avoidance (doc 01)
      massline_contact_aversion: 0.4,
      scan_sensitivity: 0.9,       // inquisitive until illuminated by active scan
    }),
  }),
  ashfall_choir: Object.freeze({
    id: 'ashfall_choir',
    name: 'Ashfall Choir strain',
    filamentColor: 0xd8b45a,
    tissueColor: 0xa89070,
    glowColor: 0xffd070,
    note: 'Radiation-hardened lineage; resonant chimney stacks vent hot spores on the burn cycle.',
    memoryPriors: Object.freeze({
      avoids_beam_band: 0.8,
      follows_reactor_heat: 0.6,
      precursor_signal_fear: 0.7,
      massline_contact_aversion: 0.3,
      route_memory_strength: 0.95, // repeated approach vectors toward a deep-domain bearing
    }),
  }),
});

export function alienStrainById(id) {
  return ALIEN_STRAINS[id] || ALIEN_STRAINS.charon_grave;
}

// ── Machine protocol (doc 12 — Verge-Layer posture, NOT faction rep) ─────────────────────────
// How the precursor machine body currently reads the human craft. Distinct from relations.
export const ALIEN_MACHINE_PROTOCOLS = Object.freeze([
  'unknown', 'observed', 'compliant', 'witnessed', 'exception', 'violation', 'revoked',
]);

// ── Revelation axis (doc 01 §C-vs-R) ─────────────────────────────────────────────────────────
// R is what the player KNOWS, independent of what IS on the hull. Tiers gate scanner language.
export const REVELATION_TIERS = Object.freeze([
  Object.freeze({ tier: 0, label: 'UNRECOGNIZED' }),
  Object.freeze({ tier: 1, label: 'ANOMALOUS GROWTH' }),
  Object.freeze({ tier: 2, label: 'FILAMENTOUS CONTAMINATION' }),
  Object.freeze({ tier: 3, label: 'VETHARI-LINKED SIGNATURE' }),
]);

// Scanner vocabulary by tier — the same object reads differently as knowledge accrues
// (doc 03 §scanner language). signature = what is being read.
const SCANNER_BIOLOGY_TERMS = Object.freeze({
  site: Object.freeze([
    'CORROSION ANOMALY',
    'UNKNOWN ORGANIC FILM',
    'FILAMENT NETWORK — BIOLOGICAL',
    'VETHARI-LINKED SIGNATURE',
  ]),
  growth: Object.freeze([
    'HULL SCARRING',
    'ORGANIC MASS',
    'COLONIAL NODE — BIOLOGICAL',
    'VETHARI NODE',
  ]),
  fauna: Object.freeze([
    'DEBRIS DRIFT',
    'UNCLASSIFIED CONTACT',
    'COLONIAL FAUNA — BIOLOGICAL',
    'VETHARI-LINKED ORGANISM',
  ]),
  relay: Object.freeze([
    'SIGNAL REFLECTION',
    'COHERENT EMITTER',
    'RELAY ORGANISM — BIOLOGICAL',
    'VETHARI RELAY NODE',
  ]),
});

export function scannerBiologyLabel(revelation, signature = 'fauna') {
  const tier = Math.max(0, Math.min(REVELATION_TIERS.length - 1, Math.trunc(Number(revelation) || 0)));
  const terms = SCANNER_BIOLOGY_TERMS[signature] || SCANNER_BIOLOGY_TERMS.fauna;
  return terms[tier];
}

// ── Infestation module kit (doc 03) ─────────────────────────────────────────────────────────
// Deterministic dressing-module vocabulary. `placeId` family: alien_growth_<module>.
export const INFESTATION_MODULES = Object.freeze({
  filament_sheet:  { radius: 14, mass: 0, glow: 0.25, spread: 'surface' },
  nerve_bundle:    { radius: 6,  mass: 0, glow: 0.7,  spread: 'ridge' },
  node_bulb_small: { radius: 5,  mass: 0, glow: 0.9,  spread: 'node' },
  node_bulb_large: { radius: 10, mass: 0, glow: 1.0,  spread: 'node' },
  cyst_cluster:    { radius: 8,  mass: 0, glow: 0.55, spread: 'cluster' },
  membrane_patch:  { radius: 11, mass: 0, glow: 0.2,  spread: 'surface' },
  calcified_collar:{ radius: 9,  mass: 0, glow: 0.1,  spread: 'ring' },
  tendril_cluster: { radius: 7,  mass: 0, glow: 0.4,  spread: 'ridge' },
  vent_lung:       { radius: 12, mass: 0, glow: 0.5,  spread: 'vent' },
  spore_chimney:   { radius: 6,  mass: 0, glow: 0.8,  spread: 'vent' },
  mineral_root:    { radius: 8,  mass: 0, glow: 0.15, spread: 'cluster' },
  sensory_fan:     { radius: 9,  mass: 0, glow: 0.6,  spread: 'node' },
});

export function infestationModuleById(id) {
  return INFESTATION_MODULES[id] || null;
}

// ── Site registry (doc 09 — the vertical slice owns the only entry) ──────────────────────────
export const ALIEN_SITES = Object.freeze({
  cinder_nursery: Object.freeze({
    siteId: 'cinder_nursery',
    worldSiteId: 'world_site_charon_cinder_nursery',
    sectorId: 'sector_charon_expanse',
    zoneId: 'zone_charon_cinder_nursery',
    poiId: 'poi_charon_cinder_nursery',
    name: 'The Cinder Nursery',
    strainId: 'charon_grave',
    // Baseline C3 colonized wreck ecology — the scanner reads ACTIVE ECOLOGY once identified.
    baseContamination: 0.52,
    // Sector-local center; matches zone_charon_cinder_nursery / the site manifest placement.
    center: Object.freeze({ x: 1700, z: -1400 }),
    // Arrival bands (WU from site center) drive the staged reveal beats (doc 09 §arrival).
    arrivalBands: Object.freeze({ long: 2600, mid: 1500, close: 520 }),
    faunaCast: Object.freeze({
      needle_swarm: 6,
      veil_ray: 2,
      blind_shepherd: 1,
      hull_leech: 1,
    }),
    // The relay node site component severs coherence; see sever_relay_node operation.
    relayComponentId: 'relay_choir_node',
    powerComponentId: 'power_bus',
    growthRing: Object.freeze({ inner: 34, outer: 120, count: 22 }),
  }),

  // ── Phase 6 wave A sites (AE-065, AE-066) ────────────────────────────────────────────
  // These are ecology-only dressing sites (no beam-op manifest): materializeAlienEcology
  // reads them identically — growth ring + fauna cast + arrival beats + scan language.
  warm_freighter: Object.freeze({
    siteId: 'warm_freighter',
    sectorId: 'sector_charon_expanse',
    zoneId: 'zone_charon_warm_freighter',
    poiId: 'poi_charon_warm_freighter',
    name: 'The Warm Freighter',
    strainId: 'charon_grave',
    // C02: power still running, crew gone, biology riding waste heat (catalog C02).
    baseContamination: 0.30,
    center: Object.freeze({ x: -2200, z: 900 }),
    arrivalBands: Object.freeze({ long: 2200, mid: 1300, close: 460 }),
    arrivalLines: Object.freeze({
      long: 'Long-range return: a freighter still holding reactor standby — crew manifest empty.',
      mid: 'Heat plume against the cold field. Surface contacts shift toward your drive signature.',
      close: 'The hull breathes warm air through open seams. The things feeding on it notice you.',
    }),
    faunaCast: Object.freeze({
      hull_leech: 3,
      wake_eel: 2,
      lantern_cyst: 2,
    }),
    growthRing: Object.freeze({ inner: 20, outer: 70, count: 12 }),
    // AE-068: a biological-survey offer hooks off this site's discovery.
    surveyOfferId: 'em_bio_survey_warm_freighter',
  }),
  quiet_ice: Object.freeze({
    siteId: 'quiet_ice',
    sectorId: 'sector_veil_nebula',
    zoneId: 'zone_veil_quiet_ice',
    poiId: 'poi_veil_quiet_ice',
    name: 'Quiet Ice',
    strainId: 'veil_glass',
    // C05: frozen asteroid, dormant cysts that wake under mining heat. The Veil's low-C
    // teaching site — trace contamination, dormant carriers, veil rays overhead (AE-066).
    baseContamination: 0.16,
    center: Object.freeze({ x: 900, z: 1500 }),
    arrivalBands: Object.freeze({ long: 2000, mid: 1200, close: 420 }),
    arrivalLines: Object.freeze({
      long: 'A cold asteroid body ahead — spectral return is clean ice and rock.',
      mid: 'Faint subsurface pockets register organic mass. Everything reads dormant.',
      close: 'Your drive plume warms the scarred face — subsurface cysts answer the heat.',
    }),
    faunaCast: Object.freeze({
      lantern_cyst: 4,
      veil_ray: 3,
      mourning_kite: 1,
    }),
    // AE-055: the mourning kite loops a remembered approach through this site.
    migrationRoute: Object.freeze({
      waypoints: Object.freeze([
        Object.freeze({ x: -300, z: 200 }),
        Object.freeze({ x: 400, z: -100 }),
        Object.freeze({ x: 100, z: -600 }),
        Object.freeze({ x: -500, z: -200 }),
      ]),
    }),
    growthRing: Object.freeze({ inner: 26, outer: 90, count: 14 }),
    surveyOfferId: 'em_quarantine_cargo_veil',
  }),

  // ── Phase 8 wave B sites (AE-085, AE-086) ────────────────────────────────────────────
  three_hull_garden: Object.freeze({
    siteId: 'three_hull_garden',
    sectorId: 'sector_charon_expanse',
    zoneId: 'zone_charon_hull_garden',
    poiId: 'poi_charon_hull_garden',
    name: 'Three Hull Garden',
    strainId: 'charon_grave',
    // C03: three unrelated wrecks physically bridged into one ecosystem — the integrated
    // wreck colony (AE-085). Anchor Beast lives here.
    baseContamination: 0.62,
    center: Object.freeze({ x: 800, z: 2400 }),
    arrivalBands: Object.freeze({ long: 2400, mid: 1400, close: 500 }),
    arrivalLines: Object.freeze({
      long: 'Three wreck returns on one bearing — too close to be a coincidence of salvage.',
      mid: 'Filament bridges span the gaps between hulls. One organism tends all three.',
      close: 'Something immense is anchored to the middle hull. The swarm defends its perimeter.',
    }),
    faunaCast: Object.freeze({
      anchor_beast: 1,
      needle_swarm: 4,
      lantern_cyst: 3,
      archive_crab: 2,
      blind_shepherd: 1,
    }),
    growthRing: Object.freeze({ inner: 40, outer: 150, count: 26 }),
    surveyOfferId: 'em_contaminated_claim_garden',
  }),
  breathing_dock: Object.freeze({
    siteId: 'breathing_dock',
    sectorId: 'sector_ashfall_reach',
    zoneId: 'zone_ashfall_breathing_dock',
    poiId: 'poi_ashfall_breathing_dock',
    name: 'The Breathing Dock',
    strainId: 'ashfall_choir',
    // C06 + C12: an abandoned docking collar cycling pressure — an organism uses the
    // station valves as lungs; the inhabited half is quarantined (AE-086 colonized section).
    baseContamination: 0.58,
    center: Object.freeze({ x: -1200, z: 1800 }),
    arrivalBands: Object.freeze({ long: 2600, mid: 1500, close: 520 }),
    arrivalLines: Object.freeze({
      long: 'A station fragment with a slow mechanical rhythm — pressure cycling with no crew logged.',
      mid: 'The docking collar opens and closes on a breathing period. Predators hold the far edge.',
      close: 'Filament columns pulse with the collar cycle. The furnace glow is not the reactor.',
    }),
    faunaCast: Object.freeze({
      furnace_maw: 1,
      glassback: 2,
      spindle_mother: 1,
      wake_eel: 2,
      casket_worm: 2,
    }),
    migrationRoute: Object.freeze({
      waypoints: Object.freeze([
        Object.freeze({ x: 600, z: -400 }),
        Object.freeze({ x: 900, z: 300 }),
        Object.freeze({ x: -200, z: 700 }),
        Object.freeze({ x: -800, z: -100 }),
      ]),
    }),
    growthRing: Object.freeze({ inner: 36, outer: 130, count: 24 }),
    surveyOfferId: 'em_carrier_diversion_breathing',
  }),

  // ── Phase 11 deep-region sites (AE-110/111/113) ──────────────────────────────────────
  // The C4+ networked pocket lives in the two deepest flyable sectors (Sker tier-3,
  // Ashfall tier-4). Deep space reads categorically different: multi-relay coherence,
  // a hull-scale carrier, and architecture evidence older than the gate network.
  harvest_deep: Object.freeze({
    siteId: 'harvest_deep',
    sectorId: 'sector_sker_haven',
    zoneId: 'zone_sker_harvest_deep',
    poiId: 'poi_sker_harvest_deep',
    name: 'The Harvest Deep',
    strainId: 'ashfall_choir',
    // AE-110: C4 networked region — two relay organisms keep separate casts in lockstep.
    baseContamination: 0.66,
    center: Object.freeze({ x: -1500, z: -1600 }),
    arrivalBands: Object.freeze({ long: 2800, mid: 1700, close: 560 }),
    arrivalLines: Object.freeze({
      long: 'The density column ahead is wrong — returns stack like a convoy, but none of it has a transponder.',
      mid: 'Two coherent emitters, out of phase with each other. The fields interleave — the whole pocket moves together.',
      close: 'Vessel-scale contacts graze the swarm edge. The rings on the substrate are not craters — they are architecture, and they are older than the gate charts.',
    }),
    faunaCast: Object.freeze({
      void_carrier: 1,
      blind_shepherd: 2,
      mourning_kite: 2,
      glassback: 2,
      needle_swarm: 5,
      furnace_maw: 1,
    }),
    migrationRoute: Object.freeze({
      waypoints: Object.freeze([
        Object.freeze({ x: -700, z: -300 }),
        Object.freeze({ x: 300, z: -800 }),
        Object.freeze({ x: 900, z: 200 }),
        Object.freeze({ x: -200, z: 700 }),
      ]),
    }),
    growthRing: Object.freeze({ inner: 60, outer: 220, count: 30 }),
    // AE-116/118: closing on the deep writes the deep-trace evidence + architecture read.
    deepTraceEvidence: 'deep_trace_harvest_deep',
    surveyOfferId: 'em_scn_quarantine_audit_deep',
  }),
  converted_yards: Object.freeze({
    siteId: 'converted_yards',
    sectorId: 'sector_ashfall_reach',
    zoneId: 'zone_ashfall_converted_yards',
    poiId: 'poi_ashfall_converted_yards',
    name: 'The Converted Yards',
    strainId: 'ashfall_choir',
    // AE-113: a drydock complex where growth fully integrated the superstructure — the
    // yard cranes read as anatomy now. Threat read is the furnace maw on the slip.
    baseContamination: 0.72,
    center: Object.freeze({ x: 800, z: 800 }),
    arrivalBands: Object.freeze({ long: 2600, mid: 1500, close: 540 }),
    arrivalLines: Object.freeze({
      long: 'Drydock complex on scope — yard transponders dead, but the structure is emitting.',
      mid: 'The crane arms flex on a cycle. That is not hydraulics.',
      close: 'The superstructure IS the organism. The scavs working the hulls are inside a lung.',
    }),
    faunaCast: Object.freeze({
      archive_crab: 3,
      casket_worm: 3,
      spindle_mother: 1,
      bristle_ram: 2,
      needle_swarm: 4,
    }),
    growthRing: Object.freeze({ inner: 48, outer: 170, count: 28 }),
    surveyOfferId: 'em_dmc_worksite_recovery',
  }),
});

export function alienSitesForSector(sectorId) {
  return Object.values(ALIEN_SITES).filter((site) => site.sectorId === sectorId);
}

// ── Public read helpers (doc 08 §8 API surface) ──────────────────────────────────────────────

function siteOverride(state, sectorId) {
  const ae = state && state.world && state.world.alienEcology;
  const sites = ae && ae.sites;
  if (!sites) return 0;
  let bonus = 0;
  for (const site of alienSitesForSector(sectorId)) {
    const rec = sites[site.siteId];
    if (!rec) continue;
    if (rec.state === 'bloom') bonus += 0.12;
    else if (rec.state === 'awake') bonus += 0.06;
    else if (rec.state === 'severed') bonus += 0.02;
  }
  return bonus;
}

/** contaminationAt: derived C for a sector/zone — baseline + site-state overrides. */
export function contaminationAt(state, sectorId, zoneId = null) {
  let zoneBase = 0;
  if (zoneId) {
    const zone = zoneById(sectorId, zoneId);
    if (zone) zoneBase = ZONE_CONTAMINATION_BASELINE[zone.type] || 0;
  }
  const lean = SECTOR_CONTAMINATION_LEAN[sectorId] || 0;
  return Math.min(1, Math.max(0, zoneBase + lean + siteOverride(state, sectorId)));
}

// Zone lookup goes through the sectorZones table — contamination priors read zone.type.
function zoneById(sectorId, zoneId) {
  if (!zoneId) return null;
  const zones = zonesForSector(sectorId) || [];
  return zones.find((zone) => zone && zone.id === zoneId) || null;
}

export function alienStrainAt(state, sectorId, zoneId = null) {
  for (const site of alienSitesForSector(sectorId)) {
    if (zoneId && site.zoneId === zoneId) return site.strainId;
  }
  const ae = state && state.world && state.world.alienEcology;
  const sites = ae && ae.sites;
  if (sites) {
    for (const site of alienSitesForSector(sectorId)) {
      if (sites[site.siteId]) return site.strainId;
    }
  }
  // Sector-level heritage: Charon graveyard reads Charon Grave even outside the site.
  if (sectorId === 'sector_charon_expanse') return 'charon_grave';
  if (sectorId === 'sector_veil_nebula') return 'veil_glass';
  if (sectorId === 'sector_ashfall_reach') return 'ashfall_choir';
  return null;
}

/** encounterDirector-facing weight hook (doc 08): higher C zones bias anomaly/mystery pulls. */
export function ecologyEncounterWeights(state, sectorId, zoneId) {
  const c = contaminationAt(state, sectorId, zoneId);
  return {
    contamination: c,
    band: contaminationBand(c),
    // Feeds encounter weighting: derelict/anomaly content climbs with C; combat flattens.
    anomalyBias: 1 + c * 1.5,
    combatBias: 1 - Math.min(0.35, c * 0.4),
  };
}

// ── Deterministic placement planners (doc 03 §placement; doc 08 §determinism) ───────────────
// Pure functions of the supplied rng stream — the caller seeds
// mulberry32(hash32(meta.seed, sectorId, epoch, 'alien-ecology')). No ambient randomness.

/** Plan infestation-module dressing around a site anchor. Returns sector-local offsets. */
export function planInfestationModules(site, rng) {
  const ring = site.growthRing;
  const out = [];
  const ids = Object.keys(INFESTATION_MODULES);
  // Anchor ribs: a few fixed module identities so the silhouette reads authored, then seeded fill.
  const ribs = ['filament_sheet', 'nerve_bundle', 'node_bulb_large', 'cyst_cluster', 'vent_lung',
    'calcified_collar', 'tendril_cluster', 'sensory_fan'];
  const count = Math.max(6, Math.trunc(ring.count));
  for (let i = 0; i < count; i += 1) {
    const moduleId = i < ribs.length ? ribs[i] : ids[Math.floor(rng() * ids.length)];
    const ang = (i / count) * Math.PI * 2 + rng() * 0.5;
    const r = ring.inner + (ring.outer - ring.inner) * (0.35 + rng() * 0.65);
    out.push({
      moduleId,
      dx: Math.cos(ang) * r,
      dz: Math.sin(ang) * r,
      rot: rng() * Math.PI * 2,
      scale: 0.7 + rng() * 0.9,
    });
  }
  return out;
}

/** Plan the site's fauna cast. Returns { faunaKey, speciesId, dx, dz, phase } rows. */
export function planFaunaCast(site, rng) {
  const out = [];
  for (const [speciesId, count] of Object.entries(site.faunaCast || {})) {
    for (let i = 0; i < count; i += 1) {
      const ang = rng() * Math.PI * 2;
      const r = 40 + rng() * 160;
      out.push({
        faunaKey: `${site.siteId}:${speciesId}:${i}`,
        speciesId,
        dx: Math.cos(ang) * r,
        dz: Math.sin(ang) * r,
        phase: rng() * Math.PI * 2,
      });
    }
  }
  return out;
}

// ── Phase 7 — contamination progression (AE-070..079) ────────────────────────────────────

// AE-070 regional contamination map: the authored C baseline per named zone-type already
// lives in ZONE_CONTAMINATION_BASELINE; this table adds named *place* overrides — sites and
// corridors whose C is authored, not derived from the zone prior (doc 01 §spatial structure).
// `siteOverride` (above) already adds live site state on top. This is the static half: a
// per-point contribution map keyed by sector so dressing, scanner noise, and encounter
// weighting all read the same authored field.
export const CONTAMINATION_SITE_BASE = Object.freeze(
  Object.fromEntries(Object.values(ALIEN_SITES).map((site) => [
    site.siteId,
    Object.freeze({
      siteId: site.siteId,
      sectorId: site.sectorId,
      baseContamination: site.baseContamination,
      center: site.center,
      radius: (site.growthRing && site.growthRing.outer * 6) || 600,
    }),
  ])),
);

/**
 * Point contamination: the authored local field a position sits in, BEFORE live site state.
 * Returns the strongest site contribution at (x, z) in sector-local coordinates.
 */
export function pointContaminationAt(state, sectorId, x, z) {
  let c = SECTOR_CONTAMINATION_LEAN[sectorId] || 0;
  for (const site of alienSitesForSector(sectorId)) {
    const base = CONTAMINATION_SITE_BASE[site.siteId];
    if (!base) continue;
    const dx = x - base.center.x;
    const dz = z - base.center.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > base.radius) continue;
    // Smooth falloff: full C at the site center, feathered to sector lean at the edge.
    const t = Math.max(0, 1 - d / base.radius);
    const local = base.baseContamination * (0.35 + 0.65 * t);
    if (local > c) c = local;
  }
  // Live site state (bloom/severe/awake) stacks on top — existing override.
  return Math.min(1, c + siteOverride(state, sectorId));
}

// AE-071 dressing-by-C: for each live site, bloom/awake state spills ambient growth rows
// beyond the authored ring (the colony reads bigger than its prop ring). materializeAlienEcology
// consumes this plan for the same deterministic rng.
export function planAmbientGrowth(state, site, rng) {
  const ae = state && state.world && state.world.alienEcology;
  const rec = ae && ae.sites && ae.sites[site.siteId];
  const boost = rec && rec.state === 'bloom' ? 1.0
    : rec && rec.state === 'awake' ? 0.5
    : 0.15;
  const count = Math.floor(site.growthRing.count * boost * 0.5);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const ang = rng() * Math.PI * 2;
    const r = site.growthRing.outer * (1.1 + rng() * 1.4);
    out.push({ dx: Math.cos(ang) * r, dz: Math.sin(ang) * r, rot: rng() * Math.PI * 2, scale: 0.5 + rng() * 0.6 });
  }
  return out;
}

// AE-072 encounter weighting (doc 01 §system outputs — encounter director consumes C):
// extends ecologyEncounterWeights with an ecology-deck shape pick for high-C zones. The
// director calls this when an anomaly/mystery pull fires inside a contaminated zone.
export const ECOLOGY_DECK = Object.freeze([
  Object.freeze({ shape: 'ecology_observation',    minC: 0.15, weight: 3, label: 'Unaligned contacts ahead', kind: 'info' }),
  Object.freeze({ shape: 'ecology_crossing',       minC: 0.25, weight: 2, label: 'Migration crosses your lane', kind: 'info' }),
  Object.freeze({ shape: 'ecology_carrier_drift',  minC: 0.35, weight: 2, label: 'Buoyant sac adrift — rupture risk', kind: 'warn' }),
  Object.freeze({ shape: 'ecology_relay_pulse',    minC: 0.45, weight: 2, label: 'Field coherence spike nearby', kind: 'warn' }),
  Object.freeze({ shape: 'ecology_predator_wake',  minC: 0.55, weight: 1, label: 'Predator wake ahead', kind: 'warn' }),
]);

/** Weighted ecology encounter pick for a zone (deterministic via the caller's rng). */
export function pickEcologyEncounter(state, sectorId, zoneId, rng) {
  const c = contaminationAt(state, sectorId, zoneId);
  const eligible = ECOLOGY_DECK.filter((row) => c >= row.minC);
  if (!eligible.length) return null;
  let total = 0;
  for (const row of eligible) total += row.weight * (1 + c);
  let roll = (typeof rng === 'function' ? rng() : 0.5) * total;
  for (const row of eligible) {
    roll -= row.weight * (1 + c);
    if (roll <= 0) return row;
  }
  return eligible[eligible.length - 1];
}

// AE-073 scanner noise & field-coherence presentation: at high C the scanner surface
// reports phantom contacts — deterministic seeded anomaly pings that resolve to nothing
// when approached. (The player learns to distrust the instrument before they learn why.)
export const SCANNER_PHANTOMS = Object.freeze({
  minC: 0.40,          // phantoms begin in ACTIVE ECOLOGY bands
  maxPerSector: 3,
  resolveRadius: 180,  // flying this close collapses the phantom
});

/** Seeded phantom anomaly contacts for a sector — pure function of rng. */
export function planPhantomContacts(state, sectorId, rng) {
  const c = contaminationAt(state, sectorId, null);
  if (c < SCANNER_PHANTOMS.minC) return [];
  const n = Math.min(SCANNER_PHANTOMS.maxPerSector, 1 + Math.floor(c * 3));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const ang = rng() * Math.PI * 2;
    const r = 600 + rng() * 2400;
    out.push({
      id: `phantom_${sectorId}_${i}`,
      dx: Math.cos(ang) * r,
      dz: Math.sin(ang) * r,
      phantom: true,
    });
  }
  return out;
}

// AE-074 — map contamination knowledge: what the player has *learned* about a sector's
// background field. Written into the discovery record when a site completes a scan or a
// phantom is resolved; read back by map/intel surfaces via contaminationAt.
export function recordContaminationKnowledge(state, sectorId, summary) {
  const ae = ensureAlienEcologyState(state);
  if (!ae.mapKnowledge || typeof ae.mapKnowledge !== 'object') ae.mapKnowledge = {};
  const rec = ae.mapKnowledge[sectorId] || (ae.mapKnowledge[sectorId] = { seenAt: 0, notes: [] });
  rec.seenAt = Number(state && state.simTime) || 0;
  if (summary && !rec.notes.includes(summary)) {
    rec.notes.push(summary);
    if (rec.notes.length > 6) rec.notes.shift();
  }
  return rec;
}

// AE-075/077/078 — station quarantine + contaminated-salvage market + faction reactions.
// One policy table drives all three: sector C band + station type + faction posture.
export const CONTAMINATION_FACTION_POLICY = Object.freeze({
  // priceMult applies to biohazard-flagged commodities at that faction's stations;
  // refuses = listing hidden entirely; note = customs text.
  faction_scn:     Object.freeze({ priceMult: 0.55, refuses: true,  note: 'Custody refusal — biological lot must be surrendered to quarantine.' }),
  faction_dmc:     Object.freeze({ priceMult: 0.80, refuses: false, note: 'Industrial intake at quarantine discount.' }),
  faction_mts:     Object.freeze({ priceMult: 1.60, refuses: false, note: 'Meridian pays exclusivity premium on live samples.' }),
  faction_quiet:   Object.freeze({ priceMult: 1.90, refuses: false, note: 'No questions. Premium for what cannot move legally.' }),
  faction_reach:   Object.freeze({ priceMult: 1.30, refuses: false, note: 'If it bites a Concord cutter, it is worth double.' }),
  faction_free:    Object.freeze({ priceMult: 1.25, refuses: false, note: 'Open-research bounty on uncontained samples.' }),
  faction_choir:   Object.freeze({ priceMult: 1.10, refuses: false, note: 'Relic significance assessed, not content.' }),
  faction_vael:    Object.freeze({ priceMult: 1.15, refuses: false, note: 'Containment information paid for in margin.' }),
  faction_understory: Object.freeze({ priceMult: 2.10, refuses: false, note: 'The Understory recognizes what it is.' }),
});

/** Sector-band posture multiplier on top of faction policy: clean sectors fear it more. */
export function contaminationSaleMult(state, sectorId, factionId) {
  const pol = CONTAMINATION_FACTION_POLICY[factionId];
  if (!pol) return { priceMult: 1, refuses: false, note: null };
  if (pol.refuses) {
    const c = contaminationAt(state, sectorId, null);
    // In deep contaminated space even Concord-adjacent buyers bend — nobody asks there.
    if (c >= 0.5) return { priceMult: 0.9, refuses: false, note: 'Quarantine waived — nobody is watching out here.' };
    return pol;
  }
  const c = contaminationAt(state, sectorId, null);
  // In high-C sectors the premium softens — samples are less rare there.
  const localDiscount = c >= 0.4 ? 0.8 : 1.0;
  return { priceMult: pol.priceMult * localDiscount, refuses: false, note: pol.note };
}

// AE-076 — ship exposure model: living tissue accrues on the hull in high-C space.
// Filters (module mods.bioFilterMult) throttle accumulation; exposure decays in clean space.
// It is logistics pressure, not a health bar (doc 01 §9).
export const EXPOSURE_MODEL = Object.freeze({
  gainPerSecPerC: 0.0016,   // C1 sector ≈ full exposure in ~10 min idle
  decayPerSec: 0.002,
  warnAt: 0.5,
  severeAt: 0.85,
  // Consequence surface at high exposure — scanner reliability, not hull damage.
  scannerNoiseAtSevere: true,
});

// AE-079 — revelation sources: what raises R beyond the scripted nursery beats.
// Each row: one-time bump evaluated by the systems layer.
export const REVELATION_SOURCES = Object.freeze([
  Object.freeze({ id: 'site_close_scan',   tier: 1, label: 'close-range site scan' }),
  Object.freeze({ id: 'fauna_scanned',     tier: 1, label: 'organism scanned' }),
  Object.freeze({ id: 'sample_collected',  tier: 2, label: 'filament sample recovered' }),
  Object.freeze({ id: 'relay_observed',    tier: 2, label: 'relay coherence witnessed' }),
  Object.freeze({ id: 'machine_encounter', tier: 3, label: 'precursor machine contact' }),
  // AE-116/118: the deep trace + Vethari-scale architecture read live at C4 sites.
  Object.freeze({ id: 'deep_trace',        tier: 3, label: 'deep-trace memory event' }),
  Object.freeze({ id: 'architecture_evidence', tier: 3, label: 'vethari-scale architecture evidence' }),
]);

// AE-114 — deep filter route gate: entering a contaminated deep sector (tier >= 3 with a
// positive lean) without a fitted biofilm filter earns one route advisory per visit.
export const DEEP_FILTER_GATE = Object.freeze({
  minTier: 3,
  minLean: 0.03,
  advisory: 'ROUTE ADVISORY: unfiltered hull in a contaminated sector. Biofilm accrual starts now — fit a filter stack or plan a purge dock.',
});

// AE-119 — domain-threshold profile: at C>=0.8 the field itself reads different (audio
// identity + mapKnowledge note). Fires once per sector visit.
export const DOMAIN_THRESHOLD = Object.freeze({
  minC: 0.8,
  toast: 'The scanner flattens — returns resolve late, pale, in ranks. DOMAIN THRESHOLD field.',
  knowledge: 'domain-threshold field: instrument discipline degrades at this density',
});

// AE-117 — Wren field-recognition beat: the pilot's first C4+ read, one line, once per save.
export const WREN_RECOGNITION = Object.freeze({
  minC: 0.6,
  text: "Field notes — I've seen this shape before. In the Charon graveyard, smaller. Out here it covers the sky. Wren, Tessera, personal log.",
});

// AE-167 — live specimen commodity: a captured organism survives the cradle into the hold.
export const LIVE_SPECIMEN_CMDTY = 'cmdty_live_specimen';

// AE-124 (G10) — charge-thrown heat lures: a 60 s burn-flag that heat-sensitive drives
// prefer over the player plume.
export const LURE_BURN_S = 60;

// AE-123 (G11) — Quiet Mask: emission damping cuts the stimulus the hull feeds fauna.
export const STEALTH_BIO_DEFAULT_MULT = 0.45;

// ── Phase 6/8 ecology mission offers (AE-067/068/069, AE-087/088/089) ────────────────────
// These hang off site discovery like wreckMissions hang off salvage points: the site emits
// `mission:offered` when its close band fires, carrying one of these templates. `type`
// reuses an existing MISSION_TYPES row so the accept path needs no new machinery.
export const ECOLOGY_MISSIONS = Object.freeze([
  // AE-067 — quarantine cargo encounter (Veil teaching beat)
  Object.freeze({
    id: 'em_quarantine_cargo_veil',
    siteId: 'quiet_ice',
    title: 'Quarantined Sample Lot',
    type: 'salvage_retrieval',
    giver: 'Veil quarantine beacon',
    params: { cmdtyId: 'cmdty_filament_sample', qty: 2 },
    log: 'AUTOMATED NOTICE: salvage lot flagged biological-active. Removal authorized under containment protocol — unsealed transport prohibited.',
    summary: 'A flagged sample lot sits inside the ice scar. Recover it and decide who gets to hold it.',
    reward_cr: 1150,
    tag: 'ecology',
  }),
  // AE-068 — biological survey (Charon second site)
  Object.freeze({
    id: 'em_bio_survey_warm_freighter',
    siteId: 'warm_freighter',
    title: 'Unregistered Biological Signature',
    type: 'recon_scan',
    giver: 'Free Frontier field desk',
    params: { scanTargets: 2 },
    log: 'The freighter runs warm with no crew aboard and its scans keep coming back "organic." Meridian wants the organism cataloged before Concord seals the site.',
    summary: 'Close-scan the resident organisms without destroying them. The field desk pays for readings, not corpses.',
    reward_cr: 1350,
    tag: 'ecology',
  }),
  // AE-069 — contaminated claim (Charon integrated colony)
  Object.freeze({
    id: 'em_contaminated_claim_garden',
    siteId: 'three_hull_garden',
    title: 'Claim Dispute — Living Site',
    type: 'salvage_retrieval',
    giver: 'Drift Claims arbitration',
    params: { cmdtyId: 'cmdty_filament_sample', qty: 1 },
    log: 'Two crews filed on the same hull cluster. Nobody disputes the coordinates — they dispute whether the thing growing on it counts as the claim.',
    summary: 'Pull one clean tissue sample so the arbitrators can classify what the claim is actually sitting on.',
    reward_cr: 1500,
    tag: 'ecology',
  }),
  // AE-087 — carrier diversion (Ashfall breathing dock)
  Object.freeze({
    id: 'em_carrier_diversion_breathing',
    siteId: 'breathing_dock',
    title: 'Divert the Carrier',
    type: 'recon_scan',
    giver: 'Ashfall perimeter watch',
    params: { scanTargets: 1 },
    log: 'A reproductive carrier is drifting toward the cordon. Killing it blooms the whole seam — mark its thermal track so the tow crew can steer it out.',
    summary: 'Close-scan the carrier to expose its heat profile. The diversion crew handles the rest.',
    reward_cr: 1700,
    tag: 'ecology',
  }),
  // AE-088 — relay mapping (Charon garden)
  Object.freeze({
    id: 'em_relay_mapping_garden',
    siteId: 'three_hull_garden',
    title: 'The Organizing Pulse',
    type: 'recon_scan',
    giver: 'Unmarked research buoy',
    params: { scanTargets: 2 },
    log: 'Every animal in the cluster turns when the pale shepherd emits. Triangulate the relay tissue by watching where the swarm answers.',
    summary: 'Scan the relay-linked organisms until the network pulse triangulates itself.',
    reward_cr: 1600,
    tag: 'ecology',
  }),
  // AE-089 — missing crew (Veil quiet ice — the answer is not guaranteed to be alien)
  Object.freeze({
    id: 'em_missing_crew_quiet_ice',
    siteId: 'quiet_ice',
    title: 'Crew Absent, Transponder Live',
    type: 'salvage_retrieval',
    giver: 'Drifting crew log',
    params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
    log: 'Ship intact, transponder live, airlocks cycled. The crew compartment is empty and the last entry ends mid-word. Bring back the recorder — carefully.',
    summary: 'Recover the crew log. Do not power anything that does not need to be on.',
    reward_cr: 1400,
    tag: 'ecology',
  }),

  // ── Phase 11/13 offers — deep trace + the eight faction contract sets (AE-116, 130..137) ──
  // One row per faction desk. `factionId` stamps whose policy table the payout reads through.
  Object.freeze({
    id: 'em_scn_quarantine_audit_deep',
    siteId: 'harvest_deep',
    title: 'Quarantine Audit — Deep Pocket',
    type: 'recon_scan',
    giver: 'Concord registry office',
    factionId: 'faction_scn',
    params: { scanTargets: 3 },
    log: 'A networked pocket off the Haven charts matches nothing in the registry. Audit it: three coherent reads, no sampling — the site stays sealed.',
    summary: 'Take three close readings inside the deep pocket without disturbing it.',
    reward_cr: 2400,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_mts_xenotech_extraction',
    siteId: 'three_hull_garden',
    title: 'Xenotech Extraction Window',
    type: 'salvage_retrieval',
    giver: 'Meridian procurement desk',
    factionId: 'faction_mts',
    params: { cmdtyId: 'cmdty_filament_sample', qty: 3 },
    log: 'Regulators file in nine days. Until then the garden cluster is unlogged — bring back three intact tissue lots and Meridian forgets the paperwork.',
    summary: 'Pull three tissue samples before the registry window closes.',
    reward_cr: 2100,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_dmc_worksite_recovery',
    siteId: 'converted_yards',
    title: 'Contaminated Worksite — Recovery Writ',
    type: 'salvage_retrieval',
    giver: 'DMC salvage authority',
    factionId: 'faction_dmc',
    params: { cmdtyId: 'cmdty_classified_salvage', qty: 2 },
    log: 'The yards are written off, but the tooling manifests are not. Recover two manifest crates. Hazard premium posted; union crews declined.',
    summary: 'Recover manifest crates from a converted drydock the union will not touch.',
    reward_cr: 2600,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_quiet_sample_run',
    siteId: 'breathing_dock',
    title: 'Unmanifested Lot',
    type: 'salvage_retrieval',
    giver: 'Unmarked quiet broker',
    factionId: 'faction_quiet',
    params: { cmdtyId: 'cmdty_filament_sample', qty: 2 },
    log: 'Two living lots, no manifest, no scans filed. The dock breathes on a period — work the exhale, not the inhale.',
    summary: 'Lift two living samples off the breathing dock without filing a scan.',
    reward_cr: 2300,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_reach_weaponization_survey',
    siteId: 'harvest_deep',
    title: 'What Hunts the Hot Lanes',
    type: 'recon_scan',
    giver: 'Reach interest contact',
    factionId: 'faction_reach',
    params: { scanTargets: 2 },
    log: 'The deep pocket keeps something that follows heat. If it can be aimed, the Bazaar wants the steering manual — read the predator, stay out of its charge.',
    summary: 'Scan the deep predator twice. Survive the reading.',
    reward_cr: 2500,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_free_research_grant',
    siteId: 'quiet_ice',
    title: 'Open Research Grant — Dormant Cycle',
    type: 'recon_scan',
    giver: 'Free Frontier research board',
    factionId: 'faction_free',
    params: { scanTargets: 2 },
    log: 'The ice organisms sleep until heated. We are paying for observations of the dormant state specifically — do not wake the site.',
    summary: 'Read the dormant cysts without triggering them. The data is the restraint.',
    reward_cr: 1250,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_choir_relic_reading',
    siteId: 'converted_yards',
    title: 'Relic Interpretation — the Yards',
    type: 'recon_scan',
    giver: 'Choir field cloister',
    factionId: 'faction_choir',
    params: { scanTargets: 2 },
    log: 'The converted structure resonates on a period the Choir counts as liturgical. Two recordings of the flex cycle will settle a question of worship.',
    summary: 'Record the structure’s breathing cycle at two positions.',
    reward_cr: 1800,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_vael_containment_clause',
    siteId: 'warm_freighter',
    title: 'Clause Nine — Field Verification',
    type: 'recon_scan',
    giver: 'Vael contract bureau',
    factionId: 'faction_vael',
    params: { scanTargets: 1 },
    log: 'Page nine of every Vael cargo contract contains a contamination clause that predates the discovery of contamination. Verify one colonized hull against the clause text.',
    summary: 'Close-scan the freighter so the bureau can certify the clause is still load-bearing.',
    reward_cr: 1600,
    tag: 'ecology',
  }),
]);

export function ecologyMissionForSite(siteId) {
  return ECOLOGY_MISSIONS.find((m) => m.siteId === siteId) || null;
}

// AE-130..137 — a site can sit under several faction desks at once; the offer ledger emits
// each authored row once.
export function ecologyMissionsForSite(siteId) {
  return ECOLOGY_MISSIONS.filter((m) => m.siteId === siteId);
}
