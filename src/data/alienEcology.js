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
  }),
  veil_glass: Object.freeze({
    id: 'veil_glass',
    name: 'Veil Glass strain',
    filamentColor: 0x7fd4c0,
    tissueColor: 0x8faebe,
    glowColor: 0x9fe8ff,
    note: 'Nebula lineage — glassy translucent sheeting, spores drift on charge gradients.',
  }),
  ashfall_choir: Object.freeze({
    id: 'ashfall_choir',
    name: 'Ashfall Choir strain',
    filamentColor: 0xd8b45a,
    tissueColor: 0xa89070,
    glowColor: 0xffd070,
    note: 'Radiation-hardened lineage; resonant chimney stacks vent hot spores on the burn cycle.',
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
