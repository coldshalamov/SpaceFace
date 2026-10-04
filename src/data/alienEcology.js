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
  // ── Phase 17 / AE-170..AE-174 — B-table morphology rows ──
  nerve_lace:      { radius: 12, mass: 0, glow: 0.5,  spread: 'surface' },   // B01 fine filament webbing
  red_core:        { radius: 7,  mass: 0, glow: 1.2,  spread: 'node', pulseOn: 'heat' }, // B02 pulsing nucleus
  lung_bladder:    { radius: 10, mass: 0, glow: 0.4,  spread: 'vent', periodS: 24 },      // B04 breathing sac
  memory_knot:     { radius: 6,  mass: 0, glow: 0.8,  spread: 'node', revelation: 'memory_knot' }, // B06 archive node
  silt_root:       { radius: 16, mass: 0, glow: 0.1,  spread: 'ridge' },      // B07 buried migration trace
  mirror_membrane: { radius: 13, mass: 0, glow: 0.05, spread: 'surface', phantomEcho: true }, // B08 ping reflector
  dead_crown:      { radius: 11, mass: 0, glow: 0.0,  spread: 'cluster' },    // B09 burned-out marker
  false_cable:     { radius: 9,  mass: 0, glow: 0.2,  spread: 'ridge', scanGate: 2 },       // B10 reads as infrastructure
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
    morphologyMix: Object.freeze(['filament_sheet', 'nerve_bundle', 'node_bulb_large', 'cyst_cluster', 'vent_lung', 'sensory_fan']),
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
    morphologyMix: Object.freeze(['membrane_patch', 'filament_sheet', 'lung_bladder', 'node_bulb_small']),
    // AE-181 (D04): the swarm inherits the dead host's docking approach — a recorded lane.
    routeEcho: Object.freeze({ waypoints: Object.freeze([
      Object.freeze({ x: -1200, z: 400 }),
      Object.freeze({ x: -1600, z: 700 }),
      Object.freeze({ x: -1900, z: 850 }),
    ]) }),
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
    morphologyMix: Object.freeze(['cyst_cluster', 'mineral_root', 'membrane_patch', 'dead_crown']),
    // AE-182 (D05): powering the drill scar wakes the dormant understory.
    heatWakes: true,
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
    morphologyMix: Object.freeze(['nerve_lace', 'nerve_bundle', 'tendril_cluster', 'node_bulb_large', 'red_core']),
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
    morphologyMix: Object.freeze(['vent_lung', 'lung_bladder', 'spore_chimney', 'cyst_cluster', 'false_cable']),
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
    morphologyMix: Object.freeze(['nerve_lace', 'red_core', 'spore_chimney', 'memory_knot', 'mirror_membrane', 'cyst_cluster']),
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
    morphologyMix: Object.freeze(['calcified_collar', 'false_cable', 'lung_bladder', 'red_core', 'nerve_lace', 'tendril_cluster']),
    surveyOfferId: 'em_dmc_worksite_recovery',
  }),

  // ── Phase 19 site wave C (AE-165, AE-186..AE-194) ────────────────────────────────────
  // The catalog's remaining locations, distributed over the flyable gradient so the C
  // field reaches every tier. Deep sectors Triton/Phoebe/Nyx are not flyable — their
  // catalog sites live on the deep end of the flyable range instead.
  empty_skin: Object.freeze({
    siteId: 'empty_skin',
    sectorId: 'sector_charon_expanse',
    zoneId: 'zone_charon_empty_skin',
    poiId: 'poi_charon_empty_skin',
    name: 'The Empty Skin',
    strainId: 'charon_grave',
    // AE-165 (A20): a molted giant shell — shelter and salvage, not an enemy. Scanners
    // flag it 'fauna' until the close band resolves the shed membrane.
    falseFauna: true,
    baseContamination: 0.22,
    center: Object.freeze({ x: -900, z: -2200 }),
    arrivalBands: Object.freeze({ long: 2000, mid: 1200, close: 420 }),
    arrivalLines: Object.freeze({
      long: 'A hull-sized return, warm-colored, drifting. Classification keeps landing on "fauna".',
      mid: 'It does not maneuver. Whatever it was, it is hollow — a shell the size of a cutter.',
      close: 'Shed membrane, not a shipwreck and not a carcass. The inside is clean enough to shelter in.',
    }),
    faunaCast: Object.freeze({ black_sail: 2 }),
    growthRing: Object.freeze({ inner: 18, outer: 60, count: 8 }),
    morphologyMix: Object.freeze(['membrane_patch', 'filament_sheet', 'silt_root', 'dead_crown']),
    surveyOfferId: 'em_missing_crew_empty_skin',
  }),
  closed_refinery: Object.freeze({
    siteId: 'closed_refinery',
    sectorId: 'sector_ceres_belt',
    zoneId: 'zone_ceres_closed_refinery',
    poiId: 'poi_ceres_closed_refinery',
    name: 'The Closed Refinery',
    strainId: 'charon_grave',
    // AE-186 (C04): a DMC refinery sealed mid-conversion — the fossil record of what
    // colonization looks like in progress. Calcite collars encase the loop machinery.
    baseContamination: 0.48,
    center: Object.freeze({ x: 1600, z: 1800 }),
    arrivalBands: Object.freeze({ long: 2400, mid: 1400, close: 500 }),
    arrivalLines: Object.freeze({
      long: 'Refinery complex on scope — DMC registry, sealed mid-shift forty years ago.',
      mid: 'Mineral growth reads through the hull seams. The ore loop never finished its last run.',
      close: 'Collars of calcite ring every joint. Something decided where this station was allowed to bend.',
    }),
    faunaCast: Object.freeze({
      suture_mite: 6,
      archive_crab: 2,
      casket_worm: 3,
      stone_lung: 1,
    }),
    growthRing: Object.freeze({ inner: 44, outer: 150, count: 24 }),
    morphologyMix: Object.freeze(['calcified_collar', 'silt_root', 'mineral_root', 'dead_crown', 'nerve_lace']),
    surveyOfferId: 'em_dmc_closed_refinery_survey',
  }),
  red_cable_yard: Object.freeze({
    siteId: 'red_cable_yard',
    sectorId: 'sector_vesta_forge',
    zoneId: 'zone_vesta_red_cable_yard',
    poiId: 'poi_vesta_red_cable_yard',
    name: 'Red Cable Yard',
    strainId: 'charon_grave',
    // AE-187 (C07): false-cable growth merged into the yard power bus — the floodlights
    // are alive. Powering the yard wakes the understory; cutting power starves it.
    heatWakes: true,
    baseContamination: 0.44,
    center: Object.freeze({ x: -1400, z: -900 }),
    arrivalBands: Object.freeze({ long: 2200, mid: 1300, close: 460 }),
    arrivalLines: Object.freeze({
      long: 'Salvage yard on scope — floodlights on, holding pattern. Nobody answers hails.',
      mid: 'The yard lights track your approach. Umbilical runs carry signal both directions.',
      close: 'The power bus is a circulatory system. Every light on this yard is a cell.',
    }),
    faunaCast: Object.freeze({
      suture_mite: 5,
      hull_leech: 3,
      needle_swarm: 4,
      casket_worm: 2,
    }),
    growthRing: Object.freeze({ inner: 40, outer: 140, count: 22 }),
    morphologyMix: Object.freeze(['false_cable', 'nerve_lace', 'red_core', 'node_bulb_small', 'tendril_cluster']),
    surveyOfferId: 'em_dmc_yard_power_audit',
  }),
  empty_habitat: Object.freeze({
    siteId: 'empty_habitat',
    sectorId: 'sector_pallas_drift',
    zoneId: 'zone_pallas_empty_habitat',
    poiId: 'poi_pallas_empty_habitat',
    name: 'The Empty Habitat',
    strainId: 'veil_glass',
    // AE-188 (C08): a station that evacuated in hours — intact rooms, growth in the air
    // system, no fauna. The colonists left; what they ran from stayed.
    baseContamination: 0.38,
    center: Object.freeze({ x: 500, z: -1900 }),
    arrivalBands: Object.freeze({ long: 2200, mid: 1300, close: 460 }),
    arrivalLines: Object.freeze({
      long: 'Habitat ring on scope — transponder live, crew manifest closed. Docking clamps open.',
      mid: 'Interior reads pressurized. Air ducts carry an organic lining — nothing moves.',
      close: 'Rooms intact, cups still racked. The vents breathe a red film. Whatever happened here was fast.',
    }),
    faunaCast: Object.freeze({}),
    growthRing: Object.freeze({ inner: 30, outer: 110, count: 20 }),
    morphologyMix: Object.freeze(['filament_sheet', 'nerve_lace', 'lung_bladder', 'membrane_patch', 'sensory_fan']),
    surveyOfferId: 'em_missing_crew_empty_habitat',
  }),
  shepherds_ring: Object.freeze({
    siteId: 'shepherds_ring',
    sectorId: 'sector_io_reach',
    zoneId: 'zone_io_shepherds_ring',
    poiId: 'poi_io_shepherds_ring',
    name: "Shepherd's Ring",
    strainId: 'veil_glass',
    // AE-189 (C09): anchor beasts arranged around a dead relay node — investigate reveals
    // the ring IS the containment measure. Killing the anchors releases the bloom.
    baseContamination: 0.52,
    center: Object.freeze({ x: -1100, z: 700 }),
    arrivalBands: Object.freeze({ long: 2400, mid: 1400, close: 500 }),
    arrivalLines: Object.freeze({
      long: 'Six large contacts in a ring formation around a silent relay — geometry too clean for a flock.',
      mid: 'Anchor organisms holding station on a dead broadcast node. The spacing is deliberate.',
      close: 'The ring is not feeding on the relay — it is holding the center shut.',
    }),
    faunaCast: Object.freeze({
      anchor_beast: 6,
      needle_swarm: 3,
      veil_ray: 2,
      pilgrim_spine: 4,
    }),
    // AE-164: a pilgrim line crosses the ring on a machine-memory route — segments chain
    // through the site rather than orbiting it.
    migrationRoute: Object.freeze({
      waypoints: Object.freeze([
        Object.freeze({ x: -700, z: 300 }),
        Object.freeze({ x: -200, z: 80 }),
        Object.freeze({ x: 300, z: -220 }),
        Object.freeze({ x: 800, z: -500 }),
      ]),
    }),
    growthRing: Object.freeze({ inner: 60, outer: 190, count: 22 }),
    morphologyMix: Object.freeze(['dead_crown', 'silt_root', 'calcified_collar', 'nerve_bundle']),
    surveyOfferId: 'em_shepherds_ring_investigate',
  }),
  black_orchard: Object.freeze({
    siteId: 'black_orchard',
    sectorId: 'sector_veil_nebula',
    zoneId: 'zone_veil_black_orchard',
    poiId: 'poi_veil_black_orchard',
    name: 'The Black Orchard',
    strainId: 'veil_glass',
    // AE-190 (C10): a glassback forest in shadowed space — sessile organisms, not fauna
    // drives, that passivate beam scanners until resolved at close band.
    orchardScannerFog: true,
    baseContamination: 0.42,
    center: Object.freeze({ x: -1700, z: -800 }),
    arrivalBands: Object.freeze({ long: 2400, mid: 1400, close: 520 }),
    arrivalLines: Object.freeze({
      long: 'Radar washes out ahead — a field of glass returns, no motion, arranged in rows.',
      mid: 'The rows are cultivated. Whatever planted them is not on scope.',
      close: 'Sessile organisms, rooted through rock. The beam scatters off their backs — the fog is alive.',
    }),
    faunaCast: Object.freeze({
      glassback: 5,
      stone_lung: 2,
      veil_ray: 2,
    }),
    growthRing: Object.freeze({ inner: 50, outer: 200, count: 30 }),
    morphologyMix: Object.freeze(['mineral_root', 'dead_crown', 'silt_root', 'membrane_patch']),
    surveyOfferId: 'em_free_orchard_survey',
  }),
  preserved_cockpit: Object.freeze({
    siteId: 'preserved_cockpit',
    sectorId: 'sector_charon_expanse',
    zoneId: 'zone_charon_preserved_cockpit',
    poiId: 'poi_charon_preserved_cockpit',
    name: 'The Preserved Cockpit',
    strainId: 'charon_grave',
    // AE-191 (C11 / L07): a single cockpit held intact inside growth — crew vitals still
    // running. The recovery beat is evidence, not salvage.
    baseContamination: 0.36,
    center: Object.freeze({ x: 2300, z: 400 }),
    arrivalBands: Object.freeze({ long: 2000, mid: 1200, close: 420 }),
    arrivalLines: Object.freeze({
      long: 'A single cockpit shell adrift inside a growth web — power faint, transponder dead.',
      mid: 'The web parts around the canopy. Vital-signs telemetry: one occupant, still cycling.',
      close: 'The growth is holding the pressure hull together. The occupant is not alone in there.',
    }),
    faunaCast: Object.freeze({
      archive_crab: 1,
      needle_swarm: 2,
      cold_bell: 2,
    }),
    growthRing: Object.freeze({ inner: 14, outer: 50, count: 10 }),
    morphologyMix: Object.freeze(['memory_knot', 'nerve_lace', 'filament_sheet', 'lung_bladder']),
    surveyOfferId: 'em_missing_crew_preserved_cockpit',
  }),
  split_station: Object.freeze({
    siteId: 'split_station',
    sectorId: 'sector_tethys_junction',
    zoneId: 'zone_tethys_split_station',
    poiId: 'poi_tethys_split_station',
    name: 'The Split Station',
    strainId: 'charon_grave',
    // AE-192 (C12): half-converted — one side still crewed, one side sealed. The policy
    // vignette lives here: quarantine is a border drawn through a kitchen.
    baseContamination: 0.34,
    center: Object.freeze({ x: -800, z: 1600 }),
    arrivalBands: Object.freeze({ long: 2200, mid: 1300, close: 460 }),
    arrivalLines: Object.freeze({
      long: 'Station on scope — half the ring lit, half dark. Docking control answers on the lit side only.',
      mid: 'Quarantine welds down the middle deck. The sealed half is still emitting.',
      close: 'Two crews share one hull and no airlock. The weld line drips filament.',
    }),
    faunaCast: Object.freeze({
      hull_leech: 2,
      suture_mite: 3,
    }),
    growthRing: Object.freeze({ inner: 30, outer: 100, count: 16 }),
    morphologyMix: Object.freeze(['false_cable', 'filament_sheet', 'lung_bladder', 'red_core']),
    surveyOfferId: 'em_scn_split_station_clause',
  }),
  red_snow: Object.freeze({
    siteId: 'red_snow',
    sectorId: 'sector_sker_haven',
    zoneId: 'zone_sker_red_snow',
    poiId: 'poi_sker_red_snow',
    name: 'Red Snow',
    strainId: 'ashfall_choir',
    // AE-193 (C13): buried spore layers tint the whole frost field — ambient-only, no cast.
    // Pure map-C lift and phantom weather; pretty and wrong.
    baseContamination: 0.50,
    center: Object.freeze({ x: 400, z: -1800 }),
    arrivalBands: Object.freeze({ long: 2400, mid: 1500, close: 500 }),
    arrivalLines: Object.freeze({
      long: 'Ice field ahead — albedo reads wrong in the reds, drifts tinting rose at the edges.',
      mid: 'Subsurface layers are organic to three meters down. The snow is a skin.',
      close: 'Your wake lifts red dust off the drifts. The field resettles behind you like nothing passed.',
    }),
    faunaCast: Object.freeze({}),
    growthRing: Object.freeze({ inner: 80, outer: 260, count: 26 }),
    morphologyMix: Object.freeze(['membrane_patch', 'silt_root', 'dead_crown', 'mineral_root']),
  }),
  towed_moonlet: Object.freeze({
    siteId: 'towed_moonlet',
    sectorId: 'sector_ashfall_reach',
    zoneId: 'zone_ashfall_towed_moonlet',
    poiId: 'poi_ashfall_towed_moonlet',
    name: 'The Towed Moonlet',
    strainId: 'ashfall_choir',
    // AE-194 (C14): a contaminated body under tow toward populated space — the mission
    // hook is intercepting the tow before the corridor clears it.
    baseContamination: 0.56,
    center: Object.freeze({ x: -200, z: -1500 }),
    arrivalBands: Object.freeze({ long: 2600, mid: 1500, close: 520 }),
    arrivalLines: Object.freeze({
      long: 'Massive body on scope under tow harness — three tugs pulling a moonlet on a populated-sector vector.',
      mid: 'The towed surface reads organic to bedrock. The tugs are clean. Nobody scanned their cargo.',
      close: 'Spore drifts peel off the body in the tow\'s shadow. Every kilometer moves the line inward.',
    }),
    faunaCast: Object.freeze({
      casket_worm: 3,
      bristle_ram: 2,
      needle_swarm: 4,
      cold_bell: 3,
      black_sail: 2,
    }),
    growthRing: Object.freeze({ inner: 70, outer: 240, count: 28 }),
    morphologyMix: Object.freeze(['spore_chimney', 'cyst_cluster', 'nerve_lace', 'mineral_root', 'dead_crown']),
    surveyOfferId: 'em_tow_moonlet_intercept',
  }),
  sterile_zone: Object.freeze({
    siteId: 'sterile_zone',
    sectorId: 'sector_ashfall_reach',
    zoneId: 'zone_ashfall_sterile_zone',
    poiId: 'poi_ashfall_sterile_zone',
    name: 'Old Sterile Zone',
    strainId: null,
    // AE-194 (C15): a machine-burned exclusion crater — zero C inside a C4 sector.
    // The absence is the tell: suppression, not cleanliness.
    sterile: true,
    baseContamination: 0.0,
    center: Object.freeze({ x: 1400, z: -600 }),
    arrivalBands: Object.freeze({ long: 1800, mid: 1100, close: 380 }),
    arrivalLines: Object.freeze({
      long: 'A glass crater ahead — thermal history reads like a cutting beam, not an impact.',
      mid: 'Nothing grows here. Not rock, not ice, not contamination. The machine line held.',
      close: 'The crater edge is a perfect circle. Whatever sterilized this field knew exactly what it was cutting.',
    }),
    faunaCast: Object.freeze({}),
    growthRing: Object.freeze({ inner: 40, outer: 120, count: 8 }),
    morphologyMix: Object.freeze(['dead_crown', 'silt_root', 'mineral_root']),
    surveyOfferId: 'em_sterile_zone_survey',
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

// AE-176 — severed sites decay: the planner swaps to the dead palette (dead crowns, roots,
// collars — no glowing tissue) when the live state reads 'severed'.
const SEVERED_MORPHOLOGY = Object.freeze(['dead_crown', 'silt_root', 'mineral_root', 'calcified_collar']);

/** Plan infestation-module dressing around a site anchor. Returns sector-local offsets.
 * siteState (optional) is the live record state ('severed' swaps to the dead palette — AE-176). */
export function planInfestationModules(site, rng, siteState = null) {
  const ring = site.growthRing;
  const out = [];
  // AE-175 morphology fingerprint: each site draws from its authored mix, so the nursery
  // ≠ the garden ≠ the dock. Sites without a mix fall back to the full kit.
  const severed = siteState === 'severed';
  const ids = severed ? SEVERED_MORPHOLOGY
    : (Array.isArray(site.morphologyMix) && site.morphologyMix.length ? site.morphologyMix
      : Object.keys(INFESTATION_MODULES));
  // Anchor ribs: a few fixed module identities so the silhouette reads authored, then seeded fill.
  const ribs = severed ? SEVERED_MORPHOLOGY : ['filament_sheet', 'nerve_bundle', 'node_bulb_large', 'cyst_cluster', 'vent_lung',
    'calcified_collar', 'tendril_cluster', 'sensory_fan'].filter((id) => ids.includes(id));
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
    // AE-167/194 sterile exclusion: machine-burned ground reads clean — the crater
    // suppresses both the sector lean and any site falloff inside its radius.
    if (site.sterile) return 0.02;
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
  // AE-176: a severed site stops ambient spill entirely — the field reads dead.
  if (rec && rec.state === 'severed') return [];
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
  // ── Phase 21 / AE-204..AE-213 — human vignettes: people reacting to the ecology on the
  // same mystery pull. Each row is a bark beat with an optional systemic edge flag. ──
  Object.freeze({ shape: 'enc_miners_vs_flock',   minC: 0.30, weight: 2, kind: 'info',
    label: 'DMC miners on open channel: "Clear the migration lane or we burn it."',
    bark: 'Mining crew (local): "That flock crosses our claim every orbit. Clear it, or the torches do."',
    edge: 'scatter_flock' }),
  Object.freeze({ shape: 'enc_corporate_grab',    minC: 0.40, weight: 1, kind: 'warn',
    label: 'Meridian skiff shadowing your track',
    bark: 'MTS charter (tight beam): "Regulators file next week. Bring us a live lot first — price is whatever you name."',
    edge: 'sample_grab' }),
  Object.freeze({ shape: 'enc_quarantine_delay',  minC: 0.35, weight: 2, kind: 'warn',
    label: 'Concord checkpoint holding traffic on an ambiguous scan',
    bark: 'Checkpoint patrol: "Biological flag on your last transit — power down and hold for the sweep."',
    edge: 'quarantine_hold' }),
  Object.freeze({ shape: 'enc_quiet_passage',     minC: 0.45, weight: 1, kind: 'info',
    label: 'Unmarked broker offering a signal profile',
    bark: 'Quiet broker: "One transit of silence. The organisms will not hear you. The price is not credits — it is the route you flew in."',
    edge: 'stealth_window' }),
  Object.freeze({ shape: 'enc_reach_bait',        minC: 0.50, weight: 1, kind: 'warn',
    label: 'Beacon on the lane emitting drive-plume heat',
    bark: 'Your scanner flags the beacon as artificial — a lure. Something is already answering it.',
    edge: 'bait_trap' }),
  Object.freeze({ shape: 'enc_relic_dispute',     minC: 0.40, weight: 1, kind: 'info',
    label: 'Choir shrine beacon — the holy thread is moving',
    bark: 'Choir cloister: "The filament is sacred. Prove it lives, and the Concord cannot burn it."',
    edge: 'relic_proof' }),
  Object.freeze({ shape: 'enc_insurance_war',     minC: 0.25, weight: 1, kind: 'warn',
    label: 'Insurance adjustor flagging your hull biofilm history',
    bark: 'Underwriters (automated): "Exposure record exceeds covenant. Premium repriced at next dock."',
    edge: 'insurance' }),
  // ── Phase 30 / AE-270..AE-284 — O-table barks: the sector talks about the growth in
  // C bands. Low C reads as rumor; high C reads as the new normal; machine rows fire
  // only under observed+ protocol (the lattice is already watching you). ──
  Object.freeze({ shape: 'bark_c_low_1',  minC: 0.10, maxC: 0.35, weight: 2, kind: 'info',
    label: 'Hauler anecdote on the band',
    bark: 'Hauler (open): "Pulled a filament out of my intake mesh twice this quarter. Twice."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_low_2',  minC: 0.10, maxC: 0.35, weight: 2, kind: 'info',
    label: 'Dockhand rumor — quiet berth',
    bark: 'Dockhand: "They sealed berth nine last month. No citation filed. Nobody asks about berth nine."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_low_3',  minC: 0.10, maxC: 0.35, weight: 1, kind: 'info',
    label: 'Prospector survey complaint',
    bark: 'Prospector: "Assay came back organic. Not ore-organic. Moving-organic. I dropped the claim."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_mid_1',  minC: 0.35, maxC: 0.65, weight: 2, kind: 'warn',
    label: 'Traffic control routing around a bloom',
    bark: 'Traffic control: "Lane four is closed for the season. Season undefined. File a detour."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_mid_2',  minC: 0.35, maxC: 0.65, weight: 2, kind: 'warn',
    label: 'Salvager refusal on a clean wreck',
    bark: 'Salvager: "Hull looked untouched — that is exactly why I left it. Intact means occupied."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_mid_3',  minC: 0.35, maxC: 0.65, weight: 1, kind: 'info',
    label: 'Choir blessing for a filament hauler',
    bark: 'Choir relay: "Blessed is the hull that carries the thread without burning it."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_mid_4',  minC: 0.35, maxC: 0.65, weight: 1, kind: 'warn',
    label: 'Filter vendor pitch, unsolicited',
    bark: 'Vendor: "Third fouled intake this month? Friend. I sell the gasket for that."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_high_1', minC: 0.65, weight: 2, kind: 'warn',
    label: 'Local pilot treating blooms as weather',
    bark: 'Pilot (local): "Spore front swings through at oh-four-hundred. Plan your burn around it, not through it."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_high_2', minC: 0.65, weight: 2, kind: 'warn',
    label: 'Old-timer misreading a shepherd corridor',
    bark: 'Old-timer: "The quiet lane stays quiet because the growth respects the lane. Do not ask how it knows."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_high_3', minC: 0.65, weight: 1, kind: 'warn',
    label: 'Concord officer reciting a dead protocol',
    bark: 'Concord dispatch: "Protocol VETH-9 on request. The request office closed before I was born."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_c_high_4', minC: 0.65, weight: 1, kind: 'info',
    label: 'Childhood memory of clean sky',
    bark: 'Resident: "My grandmother says the belts used to be empty. Just rocks. Nobody under forty believes her."',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_mach_1',   minC: 0.20, weight: 1, kind: 'info', machine: true,
    label: 'Scanner anomaly repeating your callsign in pulse code',
    bark: 'Band anomaly: [your transponder ident, repeated in machine pulse grammar — one beat early].',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_mach_2',   minC: 0.40, weight: 1, kind: 'warn', machine: true,
    label: 'Lattice directive echo with no transmitter in range',
    bark: 'Band anomaly: DIRECTIVE LOGGED. COMPLIANCE REVIEW PENDING. (No emitter resolved.)',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_mach_3',   minC: 0.55, weight: 1, kind: 'warn', machine: true,
    label: 'Listening field replaying an old distress call',
    bark: 'Band anomaly: [a distress call you do not recognize, timestamped nine hundred years before the sector was charted].',
    barkKind: 'bark' }),
  Object.freeze({ shape: 'bark_mach_4',   minC: 0.70, weight: 1, kind: 'info', machine: true,
    label: 'The machines decline to be interviewed',
    bark: 'Band anomaly: STATUS QUERY RECEIVED. RESPONSE WINDOW: NEVER. THIS IS A COURTESY REPLY.',
    barkKind: 'bark' }),
]);

// ── Phase 27 / AE-250..AE-259 — L-table evidence ledger: what the player has proven. ──
// `tier` gates the revelation ladder (T2 needs 3 rows, T3 needs any deep row).
// `source` names where the row can be earned — a site id, a machine site id, or 'field'.
export const EVIDENCE_TABLE = Object.freeze({
  L01: Object.freeze({ tier: 1, source: 'io_listening_field',
    text: 'The listening array points at a fixed dark — a reference older than every human chart in the sector.' }),
  L02: Object.freeze({ tier: 1, source: 'charon_star_marker',
    text: 'A navigation datum your instruments cannot name but every map silently uses.' }),
  L03: Object.freeze({ tier: 1, source: 'pallas_empty_foundry',
    text: 'Construction orders cancelled mid-assembly — the foundry still welds to the dead schedule.' }),
  L04: Object.freeze({ tier: 2, source: 'cinder_nursery',
    text: 'The nursery was not invaded. It was planted — the barge is a pot, not a victim.' }),
  L05: Object.freeze({ tier: 2, source: 'veil_containment_ring',
    text: 'The containment seal failed outward — whatever it held left by appointment, not by force.' }),
  L06: Object.freeze({ tier: 2, source: 'courier',
    text: 'A protocol token read mid-transit: the machines file route authority to each other, not to anyone.' }),
  L07: Object.freeze({ tier: 1, source: 'sker_quiet_dock',
    text: 'A berth built for a hull four times human scale, never used, never dismantled.' }),
  L08: Object.freeze({ tier: 2, source: 'ashfall_the_line',
    text: 'A quarantine line maintained by patrol — the boundary is surveyed, not drawn.' }),
  L09: Object.freeze({ tier: 3, source: 'charon_broken_shepherd',
    text: 'The shepherd\'s corridor failed and the growth did not flood in — it waited at the gap. It chose.' }),
  L10: Object.freeze({ tier: 3, source: 'veil_exception_chamber',
    text: 'The verdict record is physical: a chamber that adjudicates by proximity. Appeals are locations.' }),
  // SFQ-B078 — the human × living-site collision beat: salvage law met the older claim.
  L11: Object.freeze({ tier: 1, source: 'cinder_nursery',
    text: 'Human claim stakes ring a living site — the filaments grew around the markers, not through them. Two registries hold one barge.' }),
  // Phase 31 P-table — program mysteries; earned from setpieces and deep play.
  P01: Object.freeze({ tier: 3, source: 'harvest_deep',
    text: 'The harvest-deep strata are machined to fold — the deep architecture predates the sectors it lives under.' }),
  P02: Object.freeze({ tier: 2, source: 'red_snow',
    text: 'The red snow falls on a schedule. The organisms feed on the fall — a calendar, not a weather report.' }),
  P03: Object.freeze({ tier: 3, source: 'black_orchard',
    text: 'The orchard rows are grafted stock, not wild growth — someone cultivates this.' }),
  P04: Object.freeze({ tier: 2, source: 'sterile_zone',
    text: 'The sterile kill-zone stays sterile by decision, not by absence. The boundary is a held breath.' }),
  P05: Object.freeze({ tier: 3, source: 'shepherds_ring',
    text: 'The ring\'s shepherd orbits were plotted around a mass that is no longer there — the plan survived its object.' }),
  P06: Object.freeze({ tier: 2, source: 'warm_freighter',
    text: 'The freighter still runs climate for its cargo — the crew left; the care did not.' }),
  P07: Object.freeze({ tier: 2, source: 'preserved_cockpit',
    text: 'The cockpit is preserved, not sealed — maintained for an occupant who has not returned.' }),
  P08: Object.freeze({ tier: 3, source: 'towed_moonlet',
    text: 'The moonlet is being towed by the organisms themselves — a world in freight.' }),
  P09: Object.freeze({ tier: 2, source: 'three_hull_garden',
    text: 'Three hulls planted in a row. The garden grows between them like they were trellises.' }),
  P10: Object.freeze({ tier: 3, source: 'veil_exception_chamber',
    text: 'The chamber issues one verdict per epoch. The last verdict was "hold". The jury is still asleep — waiting.' }),
});

/** Look up an evidence row id. */
export function evidenceById(id) {
  return EVIDENCE_TABLE[id] || null;
}

// ── Phase 26/31 — unique module grants ───────────────────────────────────────────────────
// Where each salvageOnly alien-ecology module is actually earned. The depth-program loot
// audit unions these ids into its unique-reservation set: unique:true equipment with no
// declared acquisition route fails the audit. `via` keys map to real beats in
// src/systems/{alienEcology,precursorMachines}.js. grantAlienUnique (below) is the
// runtime seam that turns a beat into a once-per-save grant through ships.grantModule.
export const ALIEN_UNIQUE_GRANTS = Object.freeze([
  Object.freeze({ id: 'mod_lattice_coupler_s', kind: 'module',
    via: 'machine_site_seen', siteId: 'charon_broken_shepherd',
    text: 'Pried loose from the dead shepherd\'s sensor spine — a tap into site memory.' }),
  Object.freeze({ id: 'mod_precursor_handshake_s', kind: 'module',
    via: 'protocol_satisfied',
    text: 'First directive resolved — the layer issues you a responder of your own.' }),
  Object.freeze({ id: 'mod_quiet_equation_s', kind: 'module',
    via: 'protocol_witnessed',
    text: 'Held through a full witness procedure — the decode lattice was the lesson.' }),
  Object.freeze({ id: 'mod_resonant_massline_m', kind: 'module',
    via: 'relay_severed',
    text: 'The severed relay\'s field coil — dead-matter signature, still tuned.' }),
]);

/** Grant declaration by module id. */
export function alienUniqueGrantById(id) {
  return ALIEN_UNIQUE_GRANTS.find((g) => g.id === id) || null;
}

/**
 * Issue a declared unique module to the player through the real ships seam — once per
 * save (ae.uniqueGrants is the once-flag ledger). Returns true when the grant landed.
 */
export function grantAlienUnique(world, defId, viaKey) {
  const state = world && world.state;
  if (!state) return false;
  const ae = ensureAlienEcologyState(state);
  if (!ae.uniqueGrants) ae.uniqueGrants = {};
  // The ledger stores simTime; a grant at t=0 is still a grant — check presence, not truth.
  if (ae.uniqueGrants[defId] != null) return false;
  const ships = world.registry && typeof world.registry.get === 'function'
    ? world.registry.get('ships') : null;
  if (!(ships && typeof ships.grantModule === 'function')) return false;
  if (!ships.grantModule({ defId, reason: `alien-ecology:${viaKey}` })) return false;
  ae.uniqueGrants[defId] = Number(state.simTime) || 0;
  return true;
}

// ── Phase 29 / AE-282..AE-290 — N-table setpieces: one-shot authored beats that fire on
// condition, record evidence, and never refire. `rec.setpieces[id]` is the once-flag. ──
// trigger: 'approach' (radius), 'close' (radius), 'hold' (seconds inside radius),
//          'cross' (cross the line), 'exposed' (exposure threshold), 'interact',
//          'foreignWork' (non-player beam work lands on a living site component — fired by
//          the claim-crew cycle, not the motion scanner).
export const SETPIECE_DEFS = Object.freeze([
  Object.freeze({ id: 'N01_broken_corridor', siteId: 'charon_broken_shepherd', trigger: 'approach', radius: 700,
    evidence: 'L09',
    text: 'The shepherd sweep ends where the filaments begin. The corridor is a scar that never closed.' }),
  Object.freeze({ id: 'N02_vault_seam', siteId: 'ashfall_black_vault', trigger: 'close', radius: 160, needsProtocol: 'compliant',
    evidence: null,
    text: 'The vault seam lights once — acknowledging a compliant signature — then seals again. It is not locked. It is disinterested.' }),
  Object.freeze({ id: 'N03_pylon_pulse', siteId: 'charon_pylon_field', trigger: 'pulseInside', radius: 360,
    evidence: null,
    text: 'A pulse crosses the dead triangle — every organism in the sector flinches at once.' }),
  Object.freeze({ id: 'N04_containment_breach', siteId: 'veil_containment_ring', trigger: 'close', radius: 180,
    evidence: 'L05',
    text: 'Inside the ring the seal is decorative. A tendril bloom greets you from the unsuppressed inner pocket.' }),
  Object.freeze({ id: 'N05_witness_stands_down', siteId: 'io_listening_field', trigger: 'hold', radius: 300, holdS: 8,
    evidence: 'L01',
    text: 'The witness powers down mid-observation — your holding pattern was the answer it was waiting for.' }),
  Object.freeze({ id: 'N06_foundry_notices', siteId: 'pallas_empty_foundry', trigger: 'hold', radius: 340, holdS: 10,
    evidence: 'L03',
    text: 'The mason pauses its weld cycle and turns its arc on your hull. Inspection, not attack. It resumes on schedule.' }),
  Object.freeze({ id: 'N08_courier_intercept', siteId: 'io_listening_field', trigger: 'interact', machineKind: 'courier', radius: 160,
    evidence: 'L06',
    text: 'The courier decelerates and dumps its token before you close — dead letter, protocol-read.' }),
  Object.freeze({ id: 'N09_line_audit', siteId: 'ashfall_the_line', trigger: 'cross',
    evidence: 'L08',
    text: 'The walkers log the crossing in unison. Somewhere a ledger gained a line with your transponder on it.' }),
  Object.freeze({ id: 'N10_nursery_grief', siteId: 'cinder_nursery', trigger: 'approach', radius: 500, needsSevered: true,
    evidence: 'L04',
    text: 'The nursery reads empty the way a room reads after furniture is removed. The severed filaments are still warm.' }),
  Object.freeze({ id: 'N12_red_snow_kin', siteId: 'red_snow', trigger: 'exposed', radius: 600, exposure: 0.5,
    evidence: 'P02',
    text: 'The snowfall fauna read your biofilm signature and go dormant around you. Kin protocol. You are, briefly, one of them.' }),
  Object.freeze({ id: 'N13_yards_checklist', siteId: 'converted_yards', trigger: 'approach', radius: 500,
    evidence: null,
    text: 'The yards broadcast a conversion checklist in machine grammar: HULL STOCK. STRIP. RESHELL. GROW. The fourth step is biological.' }),
  Object.freeze({ id: 'N14_sterile_horizon', siteId: 'sterile_zone', trigger: 'approach', radius: 500,
    evidence: 'P04',
    text: 'Instruments flatten. The dead field is absolute — no returns, no drift, no noise floor. Sterility this clean is a maintained position.' }),
  Object.freeze({ id: 'N15_deep_chorus', siteId: 'harvest_deep', trigger: 'close', radius: 300, needsRevelation: 3,
    evidence: 'P01',
    text: 'At deep-trace sensitivity the strata harmonize — the architecture is not under the sector. The sector is in the architecture.' }),
  // SFQ-B078 — fired by the claim-crew work cycle (src/systems/alienEcology.js), not by the
  // motion triggers below: the beat is FOREIGN industrial work on a living component.
  Object.freeze({ id: 'N16_claim_torches', siteId: 'cinder_nursery', trigger: 'foreignWork',
    evidence: 'L11',
    text: 'Industrial torchlight on a living hull — the claim crew cuts, and the whole cast turns toward the sound.' }),
]);

/** Setpiece def by id. */
export function setpieceById(id) {
  return SETPIECE_DEFS.find((s) => s.id === id) || null;
}

// ── SFQ-B078 — the nursery claim crew (M31 × M34 collision beat) ────────────────────────────
// An authored human salvage detail that works a LIVING ecology site on the ordinary routes:
// their cutters feed the world-site's declared industrial-work intake (the same beam-op
// record, cursor, and once-rules the player's mining beam uses), and the site answers through
// its own consequence chain (extract_cyst_cluster → nursery_bloom intent → bloom handler +
// released payload). No bespoke physics anywhere: the crew is ordinary spawned ship traffic,
// their work is the site's single writer, the choice (protect / let them work / race) is the
// player's. All numbers authored here; the runtime never invents a phase or a rate.
export const NURSERY_CLAIM_CREW = Object.freeze({
  setpieceId: 'N16_claim_torches',
  siteId: 'cinder_nursery',
  worldSiteId: 'world_site_charon_cinder_nursery',
  componentId: 'cyst_cluster',
  operationId: 'extract_cyst_cluster',
  verb: 'extract',
  // The nursery manifest declares this stream for its operations; kernel rule: a request
  // stream must BE the operation's declared stream, so every industrial worker on this site
  // — player or crew — feeds the same intake and the same once-rules. Sequence = state.tick.
  requestStreamId: 'player-industrial-beam',
  crewSize: 2,
  factionId: 'faction_free',
  archetypePassive: 'fleeing_trader',
  archetypeHostile: 'pirate',
  radius: 10,
  mass: 12,
  hull: 70,
  approachSpeed: 26,
  spawnRadius: 620,    // inside the close arrival band (520) reading distance, off the barge
  workRange: 90,
  workPerSec: 0.5,     // threshold 20 → ~40 s of readable torch work
  workBatchS: 1.5,
  armedS: 2.5,         // burn-in delay after the player closes — the crew arrives, not pre-set
  leaveGraceS: 6,
  arriveComms: 'Claim crew (tight beam): "That barge is posted for salvage — the cyst lot is ours by claim. We file interference on anyone who closes."',
  hostileComms: 'Claim crew (open channel): "Cutters down! The claim stands and you are the interference now."',
  lapsedComms: 'Claim crew (tight beam): "Someone beat the torches. Claim\'s dead — we burn for the next posted lot."',
  paidComms: 'Claim crew (tight beam): "Rupture confirmed, contract paid. The spill is forfeit — take it or leave it."',
});

/** Weighted ecology encounter pick for a zone (deterministic via the caller's rng). */
export function pickEcologyEncounter(state, sectorId, zoneId, rng) {
  const c = contaminationAt(state, sectorId, zoneId);
  const ae = (state && state.world && state.world.alienEcology) || {};
  const machineKnown = ae.machineProtocol && ae.machineProtocol !== 'unknown';
  const eligible = ECOLOGY_DECK.filter((row) => c >= row.minC
    && (row.maxC == null || c < row.maxC)
    && (!row.machine || machineKnown));
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

  // ── Phase 20 mission wave B (AE-195..AE-203) — all reuse existing MISSION_TYPES. ──
  Object.freeze({
    id: 'em_bloom_burn_moonlet',
    siteId: 'towed_moonlet',
    title: 'Burn Before the Lane',
    type: 'salvage_retrieval',
    factionId: 'faction_scn',
    giver: 'Concord corridor command',
    params: { cmdtyId: 'cmdty_spore_chimney_core', qty: 2, deadlineS: 900 },
    log: 'The tow clears the corridor in fifteen minutes. If the moonlet is still emitting at the checkpoint, the escorts burn it — and the tugs with it.',
    summary: 'Pull two chimney cores off the towed body before it reaches the lane checkpoint.',
    reward_cr: 3400,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_cyst_convoy',
    siteId: 'towed_moonlet',
    title: 'Cyst Convoy Escort',
    type: 'recon_scan',
    factionId: 'faction_dmc',
    giver: 'DMC tow captain',
    params: { scanTargets: 2 },
    log: 'We tow the cyst, you fly the picket. If anything with a heat signature moves on the body, we want the read, not the wreck.',
    summary: 'Shadow the tow and mark every organism that stirs on the hull.',
    reward_cr: 2800,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_false_contamination_pallas',
    siteId: 'empty_habitat',
    title: 'Flag on the Habitat',
    type: 'recon_scan',
    factionId: 'faction_scn',
    giver: 'Drift Claims desk',
    params: { scanTargets: 2 },
    log: 'A claim buyer paid quarantine rates on a habitat that may be clean. Verify the field — if it is a scam, the scanner tells it.',
    summary: 'Read the habitat for contamination. Finding nothing is the finding.',
    reward_cr: 1400,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_lost_route_spine',
    siteId: 'shepherds_ring',
    title: 'The Spine’s Bearing',
    type: 'recon_scan',
    factionId: 'faction_free',
    giver: 'Free Frontier cartography',
    params: { scanTargets: 3 },
    log: 'A pilgrim line crosses Io Reach on a machine-memory route nobody owns. Triangulate the segments; the route is worth more than the animals.',
    summary: 'Close-scan three pilgrim segments to reconstruct the route they are walking.',
    reward_cr: 2200,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_filter_run_harvest',
    siteId: 'harvest_deep',
    title: 'Filter Run — Deep Pocket',
    type: 'salvage_retrieval',
    factionId: 'faction_free',
    giver: 'Haven relief post',
    params: { cmdtyId: 'cmdty_sterile_shell', qty: 1, exposureClock: true },
    log: 'A survey crew is fouled up past their filters in the deep pocket. Deliver one sterile shell cartridge before their exposure redlines.',
    summary: 'Carry a sterile shell into the pocket while your own exposure accrues.',
    reward_cr: 3000,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_quarantine_tow_yards',
    siteId: 'converted_yards',
    title: 'Quarantine Tow Clearance',
    type: 'recon_scan',
    factionId: 'faction_dmc',
    giver: 'DMC salvage authority',
    params: { scanTargets: 1 },
    log: 'We are cutting a section loose from the yards and towing it under custody. Certify the section reads dead before it crosses a checkpoint.',
    summary: 'Scan the tow section for live tissue so custody clears the checkpoint.',
    reward_cr: 1900,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_dead_relay_shepherds',
    siteId: 'shepherds_ring',
    title: 'Dead Relay Decision',
    type: 'recon_scan',
    factionId: 'faction_choir',
    giver: 'Choir field cloister',
    params: { scanTargets: 1 },
    log: 'The ring holds a dead relay. The Choir wants it woken; Concord wants it confirmed dead. Your reading decides which writ lands.',
    summary: 'Read the dead relay inside the anchor ring — the choice follows the evidence.',
    reward_cr: 2600,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_contaminated_claim_orchard',
    siteId: 'black_orchard',
    title: 'Claim Dispute — the Orchard',
    type: 'salvage_retrieval',
    factionId: 'faction_free',
    giver: 'Drift Claims arbitration',
    params: { cmdtyId: 'cmdty_glass_back_scale', qty: 2 },
    log: 'Two prospectors filed on the orchard rows. The claim pays out at the contamination measured on delivery — deeper carries a premium.',
    summary: 'Pull two glassback scale plates; the award scales with where you lifted them.',
    reward_cr: 2400,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_missing_crew_empty_skin',
    siteId: 'empty_skin',
    title: 'Castaway Rumor — the Skin',
    type: 'salvage_retrieval',
    factionId: 'faction_free',
    giver: 'Charon dockmaster',
    params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
    log: 'A castaway reported sheltering inside a hollow shell off the graveyard lanes. Nobody went back for the log. Bring whatever is in it.',
    summary: 'Search the shed shell for what the castaway left behind.',
    reward_cr: 1500,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_dmc_closed_refinery_survey',
    siteId: 'closed_refinery',
    title: 'Mid-Conversion Record',
    type: 'recon_scan',
    factionId: 'faction_dmc',
    giver: 'DMC heritage office',
    params: { scanTargets: 3 },
    log: 'The refinery was sealed before anyone logged what the growth was doing. Three reads of the collar rings, for the record — not the salvage.',
    summary: 'Document the refinery’s conversion state without disturbing the collars.',
    reward_cr: 1800,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_dmc_yard_power_audit',
    siteId: 'red_cable_yard',
    title: 'Who Owns the Lights',
    type: 'recon_scan',
    factionId: 'faction_dmc',
    giver: 'Yard receivers office',
    params: { scanTargets: 2 },
    log: 'The yard draws power with no crew. Receivers need to know if cutting the bus starves the thing or angers it.',
    summary: 'Read the yard power bus at two points — the answer decides the writ.',
    reward_cr: 1700,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_missing_crew_empty_habitat',
    siteId: 'empty_habitat',
    title: 'Crew Absent, Air Intact',
    type: 'salvage_retrieval',
    factionId: 'faction_scn',
    giver: 'Habitat estate office',
    params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
    log: 'The habitat holds pressure, the galley is set, and the crew is gone. The estate wants the security core — the colonists never filed a cause.',
    summary: 'Pull the security core from an abandoned, still-pressurized habitat.',
    reward_cr: 1600,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_shepherds_ring_investigate',
    siteId: 'shepherds_ring',
    title: 'What the Ring Holds',
    type: 'recon_scan',
    factionId: 'faction_choir',
    giver: 'Io Reach watch station',
    params: { scanTargets: 2 },
    log: 'Six anchor organisms stand in a perfect ring around a dead relay. Before anyone breaks the formation, find out what it is keeping shut.',
    summary: 'Close-scan the ring anchors without breaking the formation.',
    reward_cr: 2100,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_free_orchard_survey',
    siteId: 'black_orchard',
    title: 'Row Audit — the Orchard',
    type: 'recon_scan',
    factionId: 'faction_free',
    giver: 'Free Frontier research board',
    params: { scanTargets: 3 },
    log: 'The orchard rows are planted, not grown wild. Read three rows — the spacing is the data.',
    summary: 'Survey the orchard rows; your beam will fog, so work close.',
    reward_cr: 1900,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_missing_crew_preserved_cockpit',
    siteId: 'preserved_cockpit',
    title: 'One Occupant, Still Cycling',
    type: 'salvage_retrieval',
    factionId: 'faction_quiet',
    giver: 'Unmarked quiet broker',
    params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
    log: 'The cockpit telemetry runs on nobody\'s clock. Recover the occupant recorder — do not open the canopy on site.',
    summary: 'Lift the recorder from a cockpit the growth is still keeping alive.',
    reward_cr: 2700,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_scn_split_station_clause',
    siteId: 'split_station',
    title: 'Two Halves, One Hull',
    type: 'recon_scan',
    factionId: 'faction_scn',
    giver: 'Concord quarantine office',
    params: { scanTargets: 2 },
    log: 'The crewed half petitions to cut the sealed half loose. Two verified readings of the weld line decide whether the station is one claim or two.',
    summary: 'Read the weld line on both halves of a station split down the middle.',
    reward_cr: 2000,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_tow_moonlet_intercept',
    siteId: 'towed_moonlet',
    title: 'Intercept Manifest',
    type: 'recon_scan',
    factionId: 'faction_scn',
    giver: 'Concord corridor command',
    params: { scanTargets: 1 },
    log: 'The tow crew filed clean on a body that reads organic to bedrock. Certify the manifest against the field before the checkpoint does it for them.',
    summary: 'Read the towed body once, close — the checkpoint writes what you file.',
    reward_cr: 2300,
    tag: 'ecology',
  }),
  Object.freeze({
    id: 'em_sterile_zone_survey',
    siteId: 'sterile_zone',
    title: 'The Absence Report',
    type: 'recon_scan',
    factionId: 'faction_vael',
    giver: 'Vael survey desk',
    params: { scanTargets: 1 },
    log: 'A sterilized crater in the most contaminated sector on the chart. Measure the edge — the width of the cut is the only data that matters.',
    summary: 'Read the exclusion crater rim. What is absent is the evidence.',
    reward_cr: 2500,
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

// ── Phase 18 field language (AE-178..AE-185) ─────────────────────────────────────────
// Systemic ecological behaviors crossing site boundaries. All implemented as signal /
// drive clauses in systems/alienEcology.js — these are the timing/cadence knobs.
export const FIELD_LANGUAGE = Object.freeze({
  // D02: sites sharing a strainId pulse in phase — one broadcast per period, simultaneous.
  relayPulsePeriodS: 90,
  // D03/D10: a kill pushes a 'panic' signal same-site instantly; the flee wave reaches
  // unrelated species after this delay (the field propagates, it does not teleport).
  fleeWaveDelayS: 2.0,
  fleeWaveTtlS: 12,
  // D06: fauna inside a suppression field are inert — stim cleared, drive held.
  // (AE-096 already scatters; inertness applies to sessile/anchored species that cannot leave.)
  // D07: a live heatHunter in the cast silences other drives at this stimulus floor.
  predatorSilenceStim: 0.25,
  // D08: a radiation/storm front on the sector slows migration and swells phantoms.
  weatherMigrateMult: 0.6,
  // AE-160: cold bell toll leads a front by this many seconds.
  weatherFrontPeriodS: 240,
});

// ── Phase 23 harvest loop (AE-226..AE-230) ───────────────────────────────────────────
// What a dead organism is worth: killed fauna drop bio-resource pickups, gated where
// noted. `suppressionOnly` drops exist only inside machine dead pockets (AE-227).
export const FAUNA_DROPS = Object.freeze({
  default:        { commodityId: 'cmdty_calcified_filament', qty: 1, chance: 0.6 },
  needle_swarm:   { commodityId: 'cmdty_conductive_fiber',   qty: 2, chance: 0.7 },
  blind_shepherd: { commodityId: 'cmdty_relay_nodule',       qty: 1, chance: 0.85 },
  lantern_cyst:   { commodityId: 'cmdty_cyst_resin',         qty: 1, chance: 0.8 },
  spindle_mother: { commodityId: 'cmdty_cyst_resin',         qty: 2, chance: 0.8 },
  void_carrier:   { commodityId: 'cmdty_cyst_resin',         qty: 3, chance: 0.9 },
  archive_crab:   { commodityId: 'cmdty_host_archive_sample',qty: 1, chance: 0.5 },
  anchor_beast:   { commodityId: 'cmdty_calcified_filament', qty: 3, chance: 0.9 },
  glassback:      { commodityId: 'cmdty_glass_back_scale',   qty: 1, chance: 0.75 },
  stone_lung:     { commodityId: 'cmdty_spore_chimney_core', qty: 1, chance: 0.9 },
  black_sail:     { commodityId: 'cmdty_membrane_laminate',  qty: 1, chance: 0.7 },
  pilgrim_spine:  { commodityId: 'cmdty_interface_tissue',   qty: 1, chance: 0.6 },
  furnace_maw:    { commodityId: 'cmdty_calcified_filament', qty: 2, chance: 0.9 },
});

// Suppression-field bonus drop: kills inside a machine dead pocket may yield sterile shell
// or nerve glass (AE-227) — the only source, which is why they are rare.
export const SUPPRESSION_DROPS = Object.freeze([
  Object.freeze({ commodityId: 'cmdty_sterile_shell', qty: 1, chance: 0.25 }),
  Object.freeze({ commodityId: 'cmdty_nerve_glass', qty: 1, chance: 0.15 }),
]);

// AE-230 ripening: biohazard cargo held through high-C sectors matures. Per-unit timer.
export const RIPENING = Object.freeze({
  minC: 0.5,
  periodS: 300,
  // commodityId -> riper form (rarer, higher value, still biohazard)
  chain: Object.freeze({
    cmdty_filament_sample: 'cmdty_cyst_resin',
    cmdty_cyst_resin: 'cmdty_host_archive_sample',
    cmdty_live_specimen: 'cmdty_interface_tissue',
  }),
});
