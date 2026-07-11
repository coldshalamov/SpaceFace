#!/usr/bin/env node
// ECON-P1 regional supply acceptance gate.
//
// Validates authored 24-region production/consumption identities and the pure
// pressure-recipe materializer (src/economy/regionalSupply.js).
//
// Exit codes:
//   0 — all checks passed
//   1 — a check failed or the gate hit an internal error

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  REGIONAL_ECONOMY_PROFILES,
  REGIONAL_ECONOMY_SECTOR_IDS,
  REGIONAL_PRESSURE_BOUNDS,
} from '../src/data/regionalEconomyProfiles.js';
import {
  pressureRecipesForRegion,
  allRegionalPressureRecipes,
  regionalIdentityFingerprint,
  validateRegionalSupplyCatalog,
  REGIONAL_SUPPLY_RECIPE_KIND,
  MAX_RECIPES_PER_REGION,
} from '../src/economy/regionalSupply.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Owned sources for this gate (ECON-P1 touch list, data + library only). */
export const OWNED_SOURCE_PATHS = Object.freeze([
  'src/data/regionalEconomyProfiles.js',
  'src/economy/regionalSupply.js',
]);

export function exitCodeForResult(result) {
  return result && result.ok ? 0 : 1;
}

function readOwnedSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * Full gate. Pure where possible; only reads owned source files for the
 * Math.random / Date ban.
 * @returns {{ ok: boolean, errors: string[], stats?: object }}
 */
export function checkEconomyRegionalSupply() {
  const errors = [];

  // ── Catalog integrity ──────────────────────────────────────────────────────
  const catalog = validateRegionalSupplyCatalog({
    sectors: SECTORS,
    commodities: COMMODITIES,
    profiles: REGIONAL_ECONOMY_PROFILES,
  });
  for (const e of catalog.errors) errors.push(e);

  if (SECTORS.length !== 24) errors.push(`SECTORS length ${SECTORS.length} !== 24`);
  if (REGIONAL_ECONOMY_PROFILES.length !== 24) {
    errors.push(`profiles length ${REGIONAL_ECONOMY_PROFILES.length} !== 24`);
  }

  // ── Coverage ───────────────────────────────────────────────────────────────
  const profileIds = new Set(REGIONAL_ECONOMY_SECTOR_IDS);
  for (const s of SECTORS) {
    if (!profileIds.has(s.id)) errors.push(`missing profile for live sector ${s.id}`);
  }
  for (const id of REGIONAL_ECONOMY_SECTOR_IDS) {
    if (!SECTORS.some((s) => s.id === id)) errors.push(`profile for unknown sector ${id}`);
  }

  // ── Distinct roles / fingerprints ──────────────────────────────────────────
  const identityKeys = new Set();
  const fingerprints = new Set();
  for (const p of REGIONAL_ECONOMY_PROFILES) {
    if (identityKeys.has(p.identityKey)) errors.push(`duplicate identityKey ${p.identityKey}`);
    identityKeys.add(p.identityKey);
    const fp = regionalIdentityFingerprint(p.sectorId);
    if (!fp) errors.push(`null fingerprint for ${p.sectorId}`);
    else if (fingerprints.has(fp)) errors.push(`duplicate fingerprint ${fp}`);
    else fingerprints.add(fp);
  }

  // ── Recipe bounds + cause tags ─────────────────────────────────────────────
  let recipeCount = 0;
  const all = allRegionalPressureRecipes();
  for (const sectorId of Object.keys(all).sort()) {
    const recipes = all[sectorId];
    recipeCount += recipes.length;
    if (recipes.length === 0) errors.push(`${sectorId}: empty recipes`);
    if (recipes.length > MAX_RECIPES_PER_REGION) {
      errors.push(`${sectorId}: ${recipes.length} recipes exceeds cap`);
    }
    for (const r of recipes) {
      if (r.kind !== REGIONAL_SUPPLY_RECIPE_KIND) {
        errors.push(`${sectorId}: bad kind ${r.kind}`);
      }
      if (!(r.pressure >= REGIONAL_PRESSURE_BOUNDS.min && r.pressure <= REGIONAL_PRESSURE_BOUNDS.max)) {
        errors.push(`${sectorId}: pressure ${r.pressure} out of bounds`);
      }
      if (!(r.units >= REGIONAL_PRESSURE_BOUNDS.unitsMin && r.units <= REGIONAL_PRESSURE_BOUNDS.unitsMax)) {
        errors.push(`${sectorId}: units ${r.units} out of bounds`);
      }
      if (!r.causeTag || !r.identityTag || r.causeAxis !== 'pricePressure') {
        errors.push(`${sectorId}: incomplete cause tagging on ${r.commodityId}`);
      }
    }
  }

  // ── Determinism ────────────────────────────────────────────────────────────
  for (const id of REGIONAL_ECONOMY_SECTOR_IDS) {
    const a = pressureRecipesForRegion(id);
    const b = pressureRecipesForRegion(id);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      errors.push(`${id}: non-deterministic recipes`);
    }
  }

  // ── No Math.random / wall-clock APIs in owned library+data ─────────────────
  for (const rel of OWNED_SOURCE_PATHS) {
    let src;
    try {
      src = readOwnedSource(rel);
    } catch (err) {
      errors.push(`cannot read ${rel}: ${err && err.message}`);
      continue;
    }
    if (/Math\.random\s*\(/.test(src)) errors.push(`${rel}: Math.random forbidden`);
    // Ban wall-clock construction / now reads (not the English word in comments).
    if (/\bnew\s+Date\b|\bDate\.now\s*\(/.test(src)) {
      errors.push(`${rel}: wall-clock Date API forbidden`);
    }
  }

  // ── No mutation surface (static scan of library public surface) ────────────
  // regionalSupply must not import economy system writer or cargo.
  const libSrc = readOwnedSource('src/economy/regionalSupply.js');
  if (/systems\/economy/.test(libSrc) || /systems\/cargo/.test(libSrc)) {
    errors.push('regionalSupply must not import economy/cargo systems');
  }
  if (/bus\.emit|grantCredits|chargeCredits|addCargo|removeCargo/.test(libSrc)) {
    errors.push('regionalSupply must not write credits/cargo or emit bus events');
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      sectors: SECTORS.length,
      profiles: REGIONAL_ECONOMY_PROFILES.length,
      identityKeys: identityKeys.size,
      fingerprints: fingerprints.size,
      recipes: recipeCount,
      pressureBounds: REGIONAL_PRESSURE_BOUNDS,
    },
  };
}

// CLI entry
const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let result;
  try {
    result = checkEconomyRegionalSupply();
  } catch (err) {
    console.error('check-economy-regional-supply: internal error');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
  if (!result.ok) {
    console.error('check-economy-regional-supply: FAIL');
    for (const e of result.errors) console.error('  -', e);
    process.exit(1);
  }
  console.log('check-economy-regional-supply: ok');
  console.log(JSON.stringify(result.stats, null, 2));
  process.exit(0);
}
