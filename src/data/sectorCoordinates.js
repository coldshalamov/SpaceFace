// Explicit galactic-global sector origins for save migration and spatial composition.
//
// Authored sector graph topology comes from SECTORS[].position in map/UI graph units
// (small integers). Those units are NOT meters/world-units. Each map unit maps onto a
// documented lattice of SECTOR_ORIGIN_LATTICE_WU world-units so Helios/Ceres/Tethys (and
// the rest of the authored graph) keep relative placement without treating UI coords as sim.
//
// Mapping: globalX = map.x * LATTICE, globalZ = map.y * LATTICE  (story XZ plane; map.y → Z).
// Table is frozen and explicit so migrations stay deterministic even if map data drifts.
//
// M2a continuous corridor: Helios ↔ Ceres ↔ Tethys share a deterministic membership + residency
// geography. Membership is nearest-origin (Voronoi) among the corridor set; non-corridor sectors
// stay record-only until a later milestone expands the resident graph.

import { sectorLocalToGlobal } from '../core/coordinates.js';
import { FRONTIER_ORIGINS, FRONTIER_SECTOR_IDS } from './frontierRegions/index.js';

/** Finite XZ component (matches core/coordinates finite policy). */
function finiteXZ(value) {
  return typeof value === 'number' && Number.isFinite(value) ? (value === 0 ? 0 : value) : 0;
}

/** Documented lattice spacing (world units) between adjacent map-graph nodes. */
export const SECTOR_ORIGIN_LATTICE_WU = 4096;

/**
 * New-game Helios sanctuary centered on the authored sector origin. World spawning and the final
 * AI firing authority share this value so a clean pilot cannot cross an invisible jurisdiction
 * seam while still inside the protected starter pocket.
 */
export const HELIOS_STARTER_PROTECTION_RADIUS_WU = 1400;

/** Fail-closed default sector for unknown ids (v8 migration compatibility). */
export const DEFAULT_SECTOR_ID = 'sector_helios_prime';

/**
 * Explicit global origins for every currently authored sector id.
 * Derived from SECTORS graph topology at SECTOR_ORIGIN_LATTICE_WU scale — not runtime map reads.
 */
export const SECTOR_GLOBAL_ORIGINS = Object.freeze({
  sector_helios_prime: Object.freeze({ x: 0 * SECTOR_ORIGIN_LATTICE_WU, z: 0 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_ceres_belt: Object.freeze({ x: -3 * SECTOR_ORIGIN_LATTICE_WU, z: 2 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_tethys_junction: Object.freeze({ x: 3 * SECTOR_ORIGIN_LATTICE_WU, z: 2 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_vesta_forge: Object.freeze({ x: 0 * SECTOR_ORIGIN_LATTICE_WU, z: 4 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_pallas_drift: Object.freeze({ x: -5 * SECTOR_ORIGIN_LATTICE_WU, z: 5 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_io_reach: Object.freeze({ x: 5 * SECTOR_ORIGIN_LATTICE_WU, z: 5 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_charon_expanse: Object.freeze({ x: 2 * SECTOR_ORIGIN_LATTICE_WU, z: 7 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_sker_haven: Object.freeze({ x: -7 * SECTOR_ORIGIN_LATTICE_WU, z: 8 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_veil_nebula: Object.freeze({ x: 7 * SECTOR_ORIGIN_LATTICE_WU, z: 9 * SECTOR_ORIGIN_LATTICE_WU }),
  sector_ashfall_reach: Object.freeze({ x: 4 * SECTOR_ORIGIN_LATTICE_WU, z: 11 * SECTOR_ORIGIN_LATTICE_WU }),
  ...FRONTIER_ORIGINS,
});

/** M2a continuous corridor membership set (stable order for deterministic ties). */
export const CORRIDOR_SECTOR_IDS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'sector_io_reach',
  'sector_charon_expanse',
  'sector_sker_haven',
  'sector_veil_nebula',
  'sector_ashfall_reach',
  ...FRONTIER_SECTOR_IDS,
]);

/** Live residency tiers for the M2a streaming foundation. */
export const RESIDENCY_TIER = Object.freeze({
  FULL: 'FULL',
  REDUCED: 'REDUCED',
  RECORD_ONLY: 'RECORD_ONLY',
});

/**
 * Hard cap on simultaneously materialized residents (FULL + REDUCED).
 * Current membership always keeps a FULL slot; remaining slots go to nearest corridor neighbors.
 */
export const RESIDENCY_MATERIALIZED_CAP = 3;

/** Outer-fence margin beyond the corridor disk union (world units). */
export const CORRIDOR_PLAYABLE_MARGIN_WU = 1500;

/**
 * Pure lookup of a sector's galactic-global origin.
 * Unknown / missing ids fail closed to Helios (origin {0,0}) for v8 migration compatibility.
 * @param {string|null|undefined} sectorId
 * @returns {{x:number,z:number}}
 */
export function sectorGlobalOrigin(sectorId) {
  if (sectorId != null && Object.prototype.hasOwnProperty.call(SECTOR_GLOBAL_ORIGINS, sectorId)) {
    return SECTOR_GLOBAL_ORIGINS[sectorId];
  }
  return SECTOR_GLOBAL_ORIGINS[DEFAULT_SECTOR_ID];
}

/**
 * Compose sector-local XZ into galactic-global XZ for a named sector.
 * @param {{x?:number,z?:number}|null|undefined} sectorLocal
 * @param {string|null|undefined} sectorId
 * @param {{x:number,z:number}|null|undefined} [out]
 * @returns {{x:number,z:number}}
 */
export function sectorLocalToGlobalForSector(sectorLocal, sectorId, out) {
  return sectorLocalToGlobal(sectorLocal, sectorGlobalOrigin(sectorId), out);
}

/**
 * Inverse of sectorLocalToGlobalForSector: galactic-global XZ → sector-local XZ.
 * Semantics: global - sectorGlobalOrigin(sectorId). Unknown ids fail closed to Helios origin.
 * Required by zone-local lookups (aftermathWrecks, encounterDirector, pirateRumor) and coord tests.
 * @param {{x?:number,z?:number}|null|undefined} global
 * @param {string|null|undefined} sectorId
 * @param {{x:number,z:number}|null|undefined} [out]
 * @returns {{x:number,z:number}}
 */
export function globalToSectorLocalForSector(global, sectorId, out) {
  const origin = sectorGlobalOrigin(sectorId);
  const target = out || { x: 0, z: 0 };
  target.x = finiteXZ(global && global.x) - finiteXZ(origin && origin.x);
  target.z = finiteXZ(global && global.z) - finiteXZ(origin && origin.z);
  return target;
}

/**
 * Whether a sector id is part of the M2a continuous corridor.
 * @param {string|null|undefined} sectorId
 * @returns {boolean}
 */
export function isCorridorSector(sectorId) {
  return sectorId != null && CORRIDOR_SECTOR_IDS.includes(sectorId);
}

/**
 * Corridor neighbors of a sector (intersection of authored neighbors with the corridor set).
 * Deterministic order follows CORRIDOR_SECTOR_IDS, not the authored neighbor array order.
 * @param {string} sectorId
 * @param {ReadonlyArray<string>|null|undefined} authoredNeighbors
 * @returns {string[]}
 */
export function corridorNeighborsOf(sectorId, authoredNeighbors) {
  const set = new Set(Array.isArray(authoredNeighbors) ? authoredNeighbors : []);
  const out = [];
  for (const id of CORRIDOR_SECTOR_IDS) {
    if (id !== sectorId && set.has(id)) out.push(id);
  }
  return out;
}

/**
 * Deterministic nearest-origin membership among a candidate set (default: M2a corridor).
 * Ties break by lexicographic sector id so jitter on the exact bisector is stable.
 * @param {{x?:number,z?:number}|null|undefined} globalPos
 * @param {ReadonlyArray<string>} [candidates]
 * @returns {string|null}
 */
export function sectorMembershipAtGlobal(globalPos, candidates = CORRIDOR_SECTOR_IDS) {
  const list = Array.isArray(candidates) && candidates.length ? candidates : CORRIDOR_SECTOR_IDS;
  const px = Number.isFinite(globalPos && globalPos.x) ? globalPos.x : 0;
  const pz = Number.isFinite(globalPos && globalPos.z) ? globalPos.z : 0;
  let bestId = null;
  let bestD2 = Infinity;
  // Scan in sorted id order so equal distances pick the lexicographically smaller id.
  const ordered = list.slice().sort();
  for (const id of ordered) {
    const o = sectorGlobalOrigin(id);
    const dx = px - o.x;
    const dz = pz - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Desired residency plan for a membership sector: FULL at membership, REDUCED corridor neighbors.
 * Pure; does not apply the hard cap (see planMaterializedResidents).
 * @param {string} membershipSectorId
 * @param {(id:string)=>string[]|null|undefined} [neighborLookup]
 * @returns {Map<string, string>} sectorId → FULL|REDUCED
 */
export function planDesiredResidency(membershipSectorId, neighborLookup) {
  const desired = new Map();
  if (!membershipSectorId) return desired;
  desired.set(membershipSectorId, RESIDENCY_TIER.FULL);
  const authored = typeof neighborLookup === 'function'
    ? neighborLookup(membershipSectorId)
    : null;
  const neighbors = corridorNeighborsOf(membershipSectorId, authored);
  for (const nb of neighbors) {
    if (!desired.has(nb)) desired.set(nb, RESIDENCY_TIER.REDUCED);
  }
  return desired;
}

/**
 * Apply the hard materialized cap. Membership (FULL) always retained.
 * Among remaining desired residents, keep the nearest to focusGlobal (tie: lex sector id),
 * demote the rest to RECORD_ONLY. Returns the full tier map for the corridor (and any extras
 * present in `previousTiers`).
 *
 * @param {string} membershipSectorId
 * @param {{x?:number,z?:number}|null|undefined} focusGlobal
 * @param {Map<string,string>|Record<string,string>|null|undefined} [previousTiers]
 * @param {number} [cap]
 * @param {(id:string)=>string[]|null|undefined} [neighborLookup]
 * @returns {{ tiers: Map<string,string>, materialize: string[], demote: string[] }}
 */
export function planMaterializedResidents(
  membershipSectorId,
  focusGlobal,
  previousTiers = null,
  cap = RESIDENCY_MATERIALIZED_CAP,
  neighborLookup = null,
) {
  const desired = planDesiredResidency(membershipSectorId, neighborLookup);
  const px = Number.isFinite(focusGlobal && focusGlobal.x) ? focusGlobal.x : 0;
  const pz = Number.isFinite(focusGlobal && focusGlobal.z) ? focusGlobal.z : 0;
  const hardCap = Number.isFinite(cap) && cap >= 1 ? Math.floor(cap) : RESIDENCY_MATERIALIZED_CAP;

  // Rank non-membership desired residents by distance to focus (near first), then lex id.
  const extras = [];
  for (const [id, tier] of desired) {
    if (id === membershipSectorId) continue;
    const o = sectorGlobalOrigin(id);
    const dx = px - o.x;
    const dz = pz - o.z;
    extras.push({ id, tier, d2: dx * dx + dz * dz });
  }
  extras.sort((a, b) => (a.d2 - b.d2) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const keepExtra = Math.max(0, hardCap - 1);
  const materialize = [membershipSectorId];
  const tiers = new Map();
  tiers.set(membershipSectorId, RESIDENCY_TIER.FULL);
  for (let i = 0; i < extras.length; i++) {
    if (i < keepExtra) {
      tiers.set(extras[i].id, RESIDENCY_TIER.REDUCED);
      materialize.push(extras[i].id);
    } else {
      tiers.set(extras[i].id, RESIDENCY_TIER.RECORD_ONLY);
    }
  }

  // Any previously known corridor (or extra) sector not in the desired plan becomes RECORD_ONLY.
  const prev = previousTiers instanceof Map
    ? previousTiers
    : (previousTiers && typeof previousTiers === 'object' ? new Map(Object.entries(previousTiers)) : null);
  if (prev) {
    for (const id of prev.keys()) {
      if (!tiers.has(id)) tiers.set(id, RESIDENCY_TIER.RECORD_ONLY);
    }
  }
  for (const id of CORRIDOR_SECTOR_IDS) {
    if (!tiers.has(id)) tiers.set(id, RESIDENCY_TIER.RECORD_ONLY);
  }

  const demote = [];
  for (const [id, tier] of tiers) {
    if (tier === RESIDENCY_TIER.RECORD_ONLY) demote.push(id);
  }
  demote.sort();
  materialize.sort((a, b) => {
    if (a === membershipSectorId) return -1;
    if (b === membershipSectorId) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return { tiers, materialize, demote };
}

/**
 * Center-aware outer playable fence for the M2a corridor (global, not per-sector disk).
 * Encompasses every corridor origin + that sector's worldRadius (or default) + margin.
 *
 * @param {ReadonlyArray<{id:string, worldRadius?:number}>|null|undefined} [sectorRadiusSource]
 * @param {number} [defaultRadius]
 * @param {number} [margin]
 * @returns {{ center:{x:number,z:number}, radius:number, hardRadius:number }}
 */
export function corridorPlayableBounds(sectorRadiusSource = null, defaultRadius = 4000, margin = CORRIDOR_PLAYABLE_MARGIN_WU) {
  const radiusById = new Map();
  if (Array.isArray(sectorRadiusSource)) {
    for (const s of sectorRadiusSource) {
      if (s && s.id) radiusById.set(s.id, Number.isFinite(s.worldRadius) ? s.worldRadius : defaultRadius);
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const id of CORRIDOR_SECTOR_IDS) {
    const o = sectorGlobalOrigin(id);
    const r = radiusById.has(id) ? radiusById.get(id) : defaultRadius;
    minX = Math.min(minX, o.x - r);
    maxX = Math.max(maxX, o.x + r);
    minZ = Math.min(minZ, o.z - r);
    maxZ = Math.max(maxZ, o.z + r);
  }
  const m = Number.isFinite(margin) ? margin : CORRIDOR_PLAYABLE_MARGIN_WU;
  minX -= m; maxX += m; minZ -= m; maxZ += m;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  // Radius is half-diagonal of the expanded AABB so the soft fence is center-aware/global.
  const radius = Math.hypot(maxX - cx, maxZ - cz);
  return {
    center: { x: cx, z: cz },
    radius,
    hardRadius: radius + 500,
  };
}
