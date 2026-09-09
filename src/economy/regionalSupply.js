// regionalSupply.js — ECON-P1 pure regional supply pressure recipes.
//
// Deterministic, authored-data-only library. Reads regionalEconomyProfiles + the live
// commodity/sector catalogs and returns *bounded, cause-tagged pressure recipes*.
//
// Hard guarantees:
//   • No credits / cargo / stock / market writes
//   • No live spawn, bus emits, or GameState mutation
//   • No Math.random / wall-clock
//   • Same sectorId → identical recipe array (deep-equal)
//
// Future consumers (economy tick, sectorSim market_pressure, missions) may apply recipes;
// this module only authors the intent.

import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import {
  REGIONAL_ECONOMY_PROFILES,
  REGIONAL_ECONOMY_BY_ID,
  REGIONAL_ECONOMY_SECTOR_IDS,
  REGIONAL_ECONOMY_SCHEMA_ID,
  REGIONAL_PRESSURE_BOUNDS,
  STATION_ROLES,
  MAX_LINES_PER_SIDE,
  getRegionalEconomyProfile,
} from '../data/regionalEconomyProfiles.js';

export {
  REGIONAL_ECONOMY_PROFILES,
  REGIONAL_ECONOMY_BY_ID,
  REGIONAL_ECONOMY_SECTOR_IDS,
  REGIONAL_ECONOMY_SCHEMA_ID,
  REGIONAL_PRESSURE_BOUNDS,
  STATION_ROLES,
  MAX_LINES_PER_SIDE,
  getRegionalEconomyProfile,
};

/** Recipe kind discriminator (not a live entity type). */
export const REGIONAL_SUPPLY_RECIPE_KIND = 'regional_supply_pressure';

/**
 * Cause tags on the pricePressure axis. `route_surplus` / `route_scarcity` reuse the
 * shipped cause-ledger vocabulary (causePhrases.js); regional_* tags name the identity layer.
 */
export const REGIONAL_CAUSE_TAGS = Object.freeze({
  REGIONAL_PRODUCTION: 'regional_production',
  REGIONAL_CONSUMPTION: 'regional_consumption',
  ROUTE_SURPLUS: 'route_surplus',
  ROUTE_SCARCITY: 'route_scarcity',
});

export const REGIONAL_CAUSE_AXIS = 'pricePressure';

/** Max recipes emitted per region (produce + consume lines, each capped). */
export const MAX_RECIPES_PER_REGION = MAX_LINES_PER_SIDE * 2;

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_ROLE_SET = new Set(STATION_ROLES);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/** Roles a sector actually hosts (from live SECTORS station types). */
export function sectorStationRoles(sectorId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  if (!sector) return Object.freeze([]);
  const roles = [];
  const seen = new Set();
  for (const st of sector.stations || []) {
    const t = st && st.type;
    if (!t || seen.has(t) || !STATION_ROLE_SET.has(t)) continue;
    seen.add(t);
    roles.push(t);
  }
  return Object.freeze(roles);
}

/** Primary station id for recipe anchoring (largest size, then stable id order). */
export function primaryStationId(sectorId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  if (!sector || !sector.stations || !sector.stations.length) return null;
  const sizeRank = { L: 3, M: 2, S: 1 };
  let best = null;
  for (const st of sector.stations) {
    if (!st || !st.id) continue;
    if (!best) {
      best = st;
      continue;
    }
    const br = sizeRank[best.size] || 0;
    const sr = sizeRank[st.size] || 0;
    if (sr > br || (sr === br && st.id < best.id)) best = st;
  }
  return best ? best.id : null;
}

/**
 * Whether a commodity line is legal for the profile's roles.
 * Produce lines require role ∈ producedBy; consume lines require role ∈ consumedBy.
 */
export function commodityFitsRoles(commodityId, roles, side) {
  const def = CMDTY_BY_ID.get(commodityId);
  if (!def || !roles || !roles.length) return false;
  const list = side === 'produce' ? (def.producedBy || []) : (def.consumedBy || []);
  for (let i = 0; i < roles.length; i++) {
    if (list.includes(roles[i])) return true;
  }
  return false;
}

function profileRoles(profile) {
  const roles = [profile.primaryRole, ...(profile.secondaryRoles || [])];
  return roles.filter((r) => STATION_ROLE_SET.has(r));
}

/**
 * Build one cause-tagged pressure recipe. Produce → negative pressure (surplus / cheap).
 * Consume → positive pressure (scarcity / dear). Units are a bounded applyTradePressure hint.
 *
 * @returns {Readonly<object>|null}
 */
function makeRecipe(profile, line, side, stationId) {
  const weight = clamp(Number(line.weight) || 0, 0, 1);
  if (weight <= 0) return null;
  const bias = clamp(Number(profile.pressureBias) || 0.5, 0.2, 0.85);
  const magnitude = round6(clamp(weight * bias, 0, REGIONAL_PRESSURE_BOUNDS.max));
  if (magnitude <= 0) return null;

  const pressure = side === 'produce'
    ? round6(-magnitude)
    : round6(magnitude);

  const units = Math.round(
    clamp(
      REGIONAL_PRESSURE_BOUNDS.unitsMin
        + magnitude * (REGIONAL_PRESSURE_BOUNDS.unitsMax - REGIONAL_PRESSURE_BOUNDS.unitsMin),
      REGIONAL_PRESSURE_BOUNDS.unitsMin,
      REGIONAL_PRESSURE_BOUNDS.unitsMax,
    ),
  );

  const causeTag = side === 'produce'
    ? REGIONAL_CAUSE_TAGS.ROUTE_SURPLUS
    : REGIONAL_CAUSE_TAGS.ROUTE_SCARCITY;
  const identityTag = side === 'produce'
    ? REGIONAL_CAUSE_TAGS.REGIONAL_PRODUCTION
    : REGIONAL_CAUSE_TAGS.REGIONAL_CONSUMPTION;

  return Object.freeze({
    kind: REGIONAL_SUPPLY_RECIPE_KIND,
    sectorId: profile.sectorId,
    stationId,
    commodityId: line.commodityId,
    role: side,
    pressure,
    units,
    causeAxis: REGIONAL_CAUSE_AXIS,
    causeTag,
    identityTag,
    identityKey: profile.identityKey,
    weight: round6(weight),
  });
}

/**
 * Pressure recipes for one region. Pure, deterministic, bounded.
 * Returns a frozen array (empty for unknown sectorId).
 *
 * @param {string} sectorId
 * @param {{ stationId?: string|null }} [opts]
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function pressureRecipesForRegion(sectorId, opts = {}) {
  const profile = getRegionalEconomyProfile(sectorId);
  if (!profile) return Object.freeze([]);

  const stationId = opts.stationId !== undefined
    ? opts.stationId
    : primaryStationId(sectorId);

  const recipes = [];
  const produce = profile.produces.slice(0, MAX_LINES_PER_SIDE);
  const consume = profile.consumes.slice(0, MAX_LINES_PER_SIDE);

  for (let i = 0; i < produce.length; i++) {
    const r = makeRecipe(profile, produce[i], 'produce', stationId);
    if (r) recipes.push(r);
  }
  for (let i = 0; i < consume.length; i++) {
    const r = makeRecipe(profile, consume[i], 'consume', stationId);
    if (r) recipes.push(r);
  }

  // Stable order: produce first (as authored), then consume; within side keep authored order.
  return Object.freeze(recipes.slice(0, MAX_RECIPES_PER_REGION));
}

/** All 24 regions → recipes, sector-id sorted for deterministic iteration. */
export function allRegionalPressureRecipes() {
  const out = Object.create(null);
  const ids = [...REGIONAL_ECONOMY_SECTOR_IDS].sort();
  for (const id of ids) {
    out[id] = pressureRecipesForRegion(id);
  }
  return Object.freeze(out);
}

/** Compact identity fingerprint used by distinctness checks. */
export function regionalIdentityFingerprint(sectorId) {
  const profile = getRegionalEconomyProfile(sectorId);
  if (!profile) return null;
  const prod = profile.produces.map((p) => p.commodityId).slice().sort().join(',');
  const cons = profile.consumes.map((c) => c.commodityId).slice().sort().join(',');
  return `${profile.identityKey}|${profile.primaryRole}|P:${prod}|C:${cons}`;
}

/**
 * Validate the authored table against live catalogs.
 * Returns { ok, errors: string[] } — never throws.
 */
export function validateRegionalSupplyCatalog(opts = {}) {
  const sectors = opts.sectors || SECTORS;
  const commodities = opts.commodities || COMMODITIES;
  const profiles = opts.profiles || REGIONAL_ECONOMY_PROFILES;
  const errors = [];

  const sectorIds = new Set((sectors || []).map((s) => s && s.id).filter(Boolean));
  const cmdtyIds = new Set((commodities || []).map((c) => c && c.id).filter(Boolean));
  const cmdtyMap = new Map((commodities || []).map((c) => [c.id, c]));

  if (!profiles || profiles.length !== 24) {
    errors.push(`expected 24 regional profiles, got ${profiles ? profiles.length : 0}`);
  }

  const seenSectors = new Set();
  const seenIdentity = new Set();
  const seenFingerprints = new Set();

  for (const p of profiles || []) {
    if (!p || typeof p.sectorId !== 'string') {
      errors.push('profile missing sectorId');
      continue;
    }
    if (seenSectors.has(p.sectorId)) errors.push(`duplicate profile sectorId: ${p.sectorId}`);
    seenSectors.add(p.sectorId);

    if (!sectorIds.has(p.sectorId)) {
      errors.push(`profile sectorId not in SECTORS: ${p.sectorId}`);
    }
    if (!p.identityKey || typeof p.identityKey !== 'string') {
      errors.push(`${p.sectorId}: missing identityKey`);
    } else if (seenIdentity.has(p.identityKey)) {
      errors.push(`duplicate identityKey: ${p.identityKey}`);
    } else {
      seenIdentity.add(p.identityKey);
    }

    if (!STATION_ROLE_SET.has(p.primaryRole)) {
      errors.push(`${p.sectorId}: invalid primaryRole ${p.primaryRole}`);
    }
    for (const r of p.secondaryRoles || []) {
      if (!STATION_ROLE_SET.has(r)) errors.push(`${p.sectorId}: invalid secondaryRole ${r}`);
    }

    const roles = profileRoles(p);
    const liveRoles = sectorStationRoles(p.sectorId);
    if (liveRoles.length && !liveRoles.includes(p.primaryRole)) {
      errors.push(`${p.sectorId}: primaryRole ${p.primaryRole} not present on live stations (${liveRoles.join(',')})`);
    }
    for (const r of p.secondaryRoles || []) {
      if (liveRoles.length && !liveRoles.includes(r)) {
        errors.push(`${p.sectorId}: secondaryRole ${r} not present on live stations`);
      }
    }

    if (!p.produces || !p.produces.length) errors.push(`${p.sectorId}: produces[] empty`);
    if (!p.consumes || !p.consumes.length) errors.push(`${p.sectorId}: consumes[] empty`);
    if ((p.produces || []).length > MAX_LINES_PER_SIDE) {
      errors.push(`${p.sectorId}: produces exceeds ${MAX_LINES_PER_SIDE}`);
    }
    if ((p.consumes || []).length > MAX_LINES_PER_SIDE) {
      errors.push(`${p.sectorId}: consumes exceeds ${MAX_LINES_PER_SIDE}`);
    }

    const bias = Number(p.pressureBias);
    if (!Number.isFinite(bias) || bias < 0.2 || bias > 0.85) {
      errors.push(`${p.sectorId}: pressureBias out of [0.2, 0.85]`);
    }

    for (const line of p.produces || []) {
      if (!cmdtyIds.has(line.commodityId)) {
        errors.push(`${p.sectorId}: unknown produce commodity ${line.commodityId}`);
        continue;
      }
      if (!commodityFitsRoles(line.commodityId, roles, 'produce')) {
        const def = cmdtyMap.get(line.commodityId);
        errors.push(
          `${p.sectorId}: produce ${line.commodityId} not producedBy roles [${roles.join(',')}] `
          + `(catalog: [${(def && def.producedBy) || []}])`,
        );
      }
      if (!(line.weight > 0 && line.weight <= 1)) {
        errors.push(`${p.sectorId}: produce weight invalid for ${line.commodityId}`);
      }
    }
    for (const line of p.consumes || []) {
      if (!cmdtyIds.has(line.commodityId)) {
        errors.push(`${p.sectorId}: unknown consume commodity ${line.commodityId}`);
        continue;
      }
      if (!commodityFitsRoles(line.commodityId, roles, 'consume')) {
        const def = cmdtyMap.get(line.commodityId);
        errors.push(
          `${p.sectorId}: consume ${line.commodityId} not consumedBy roles [${roles.join(',')}] `
          + `(catalog: [${(def && def.consumedBy) || []}])`,
        );
      }
      if (!(line.weight > 0 && line.weight <= 1)) {
        errors.push(`${p.sectorId}: consume weight invalid for ${line.commodityId}`);
      }
    }

    const fp = regionalIdentityFingerprint(p.sectorId);
    if (fp) {
      if (seenFingerprints.has(fp)) errors.push(`non-distinct identity fingerprint: ${fp}`);
      seenFingerprints.add(fp);
    }

    // Recipe materialization bounds.
    const recipes = pressureRecipesForRegion(p.sectorId);
    if (!recipes.length) errors.push(`${p.sectorId}: zero recipes materialised`);
    if (recipes.length > MAX_RECIPES_PER_REGION) {
      errors.push(`${p.sectorId}: recipe count ${recipes.length} > ${MAX_RECIPES_PER_REGION}`);
    }
    for (const r of recipes) {
      if (r.kind !== REGIONAL_SUPPLY_RECIPE_KIND) {
        errors.push(`${p.sectorId}: bad recipe kind`);
      }
      if (r.pressure < REGIONAL_PRESSURE_BOUNDS.min || r.pressure > REGIONAL_PRESSURE_BOUNDS.max) {
        errors.push(`${p.sectorId}: pressure ${r.pressure} out of bounds`);
      }
      if (r.units < REGIONAL_PRESSURE_BOUNDS.unitsMin || r.units > REGIONAL_PRESSURE_BOUNDS.unitsMax) {
        errors.push(`${p.sectorId}: units ${r.units} out of bounds`);
      }
      if (r.causeAxis !== REGIONAL_CAUSE_AXIS) {
        errors.push(`${p.sectorId}: causeAxis must be ${REGIONAL_CAUSE_AXIS}`);
      }
      if (!cmdtyIds.has(r.commodityId)) {
        errors.push(`${p.sectorId}: recipe commodity missing ${r.commodityId}`);
      }
    }
  }

  // Coverage: every live sector has a profile.
  for (const id of sectorIds) {
    if (!seenSectors.has(id)) errors.push(`live sector missing profile: ${id}`);
  }

  return { ok: errors.length === 0, errors };
}
