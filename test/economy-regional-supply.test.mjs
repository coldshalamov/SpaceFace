// ECON-P1 regional supply — unit acceptance.
// Coverage of all 24 regions, valid ids, determinism, distinct roles, bounded pressure,
// and zero Math.random / Date usage in the owned sources.
//
// Run: node test/economy-regional-supply.test.mjs
//      node scripts/check-economy-regional-supply.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  REGIONAL_ECONOMY_PROFILES,
  REGIONAL_ECONOMY_SECTOR_IDS,
  REGIONAL_PRESSURE_BOUNDS,
  getRegionalEconomyProfile,
} from '../src/data/regionalEconomyProfiles.js';
import {
  pressureRecipesForRegion,
  allRegionalPressureRecipes,
  regionalIdentityFingerprint,
  validateRegionalSupplyCatalog,
  REGIONAL_SUPPLY_RECIPE_KIND,
  REGIONAL_CAUSE_TAGS,
  REGIONAL_CAUSE_AXIS,
  MAX_RECIPES_PER_REGION,
  commodityFitsRoles,
  sectorStationRoles,
} from '../src/economy/regionalSupply.js';
import {
  checkEconomyRegionalSupply,
  exitCodeForResult,
  OWNED_SOURCE_PATHS,
} from '../scripts/check-economy-regional-supply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CMDTY_IDS = new Set(COMMODITIES.map((c) => c.id));
const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));

test('live galaxy is 24 sectors', () => {
  assert.equal(SECTORS.length, 24);
  assert.equal(REGIONAL_ECONOMY_PROFILES.length, 24);
  assert.equal(REGIONAL_ECONOMY_SECTOR_IDS.length, 24);
});

test('catalog validation is clean', () => {
  const result = validateRegionalSupplyCatalog();
  if (!result.ok) {
    console.error(result.errors.join('\n'));
  }
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test('all 24 live sectors covered by profiles + recipes', () => {
  for (const sector of SECTORS) {
    const profile = getRegionalEconomyProfile(sector.id);
    assert.ok(profile, `missing profile for ${sector.id}`);
    assert.equal(profile.sectorId, sector.id);
    const recipes = pressureRecipesForRegion(sector.id);
    assert.ok(recipes.length > 0, `no recipes for ${sector.id}`);
    assert.ok(recipes.length <= MAX_RECIPES_PER_REGION, `too many recipes for ${sector.id}`);
  }
  const all = allRegionalPressureRecipes();
  assert.equal(Object.keys(all).length, 24);
});

test('commodity and sector ids are valid', () => {
  for (const p of REGIONAL_ECONOMY_PROFILES) {
    assert.ok(SECTOR_IDS.has(p.sectorId), p.sectorId);
    for (const line of p.produces) {
      assert.ok(CMDTY_IDS.has(line.commodityId), line.commodityId);
    }
    for (const line of p.consumes) {
      assert.ok(CMDTY_IDS.has(line.commodityId), line.commodityId);
    }
    const recipes = pressureRecipesForRegion(p.sectorId);
    for (const r of recipes) {
      assert.ok(CMDTY_IDS.has(r.commodityId));
      assert.equal(r.sectorId, p.sectorId);
      assert.equal(r.kind, REGIONAL_SUPPLY_RECIPE_KIND);
      assert.equal(r.causeAxis, REGIONAL_CAUSE_AXIS);
    }
  }
});

test('produce/consume lines fit station roles', () => {
  for (const p of REGIONAL_ECONOMY_PROFILES) {
    const roles = [p.primaryRole, ...p.secondaryRoles];
    const live = sectorStationRoles(p.sectorId);
    assert.ok(live.includes(p.primaryRole), `${p.sectorId} primaryRole`);
    for (const line of p.produces) {
      assert.equal(
        commodityFitsRoles(line.commodityId, roles, 'produce'),
        true,
        `${p.sectorId} produce ${line.commodityId}`,
      );
    }
    for (const line of p.consumes) {
      assert.equal(
        commodityFitsRoles(line.commodityId, roles, 'consume'),
        true,
        `${p.sectorId} consume ${line.commodityId}`,
      );
    }
  }
});

test('identity keys and fingerprints are distinct', () => {
  const keys = new Set();
  const fps = new Set();
  for (const p of REGIONAL_ECONOMY_PROFILES) {
    assert.ok(!keys.has(p.identityKey), `dup identityKey ${p.identityKey}`);
    keys.add(p.identityKey);
    const fp = regionalIdentityFingerprint(p.sectorId);
    assert.ok(fp);
    assert.ok(!fps.has(fp), `dup fingerprint ${fp}`);
    fps.add(fp);
  }
  assert.equal(keys.size, 24);
  assert.equal(fps.size, 24);
});

test('pressure and units are bounded; signs match role', () => {
  for (const p of REGIONAL_ECONOMY_PROFILES) {
    for (const r of pressureRecipesForRegion(p.sectorId)) {
      assert.ok(r.pressure >= REGIONAL_PRESSURE_BOUNDS.min);
      assert.ok(r.pressure <= REGIONAL_PRESSURE_BOUNDS.max);
      assert.ok(r.units >= REGIONAL_PRESSURE_BOUNDS.unitsMin);
      assert.ok(r.units <= REGIONAL_PRESSURE_BOUNDS.unitsMax);
      if (r.role === 'produce') {
        assert.ok(r.pressure < 0, 'produce = surplus = negative pressure');
        assert.equal(r.causeTag, REGIONAL_CAUSE_TAGS.ROUTE_SURPLUS);
        assert.equal(r.identityTag, REGIONAL_CAUSE_TAGS.REGIONAL_PRODUCTION);
      } else {
        assert.ok(r.pressure > 0, 'consume = scarcity = positive pressure');
        assert.equal(r.causeTag, REGIONAL_CAUSE_TAGS.ROUTE_SCARCITY);
        assert.equal(r.identityTag, REGIONAL_CAUSE_TAGS.REGIONAL_CONSUMPTION);
      }
    }
  }
});

test('determinism: repeated materialization is deep-equal', () => {
  for (const id of REGIONAL_ECONOMY_SECTOR_IDS) {
    const a = pressureRecipesForRegion(id);
    const b = pressureRecipesForRegion(id);
    assert.deepEqual(a, b);
    assert.notEqual(a, b); // fresh arrays, same content
  }
  assert.deepEqual(allRegionalPressureRecipes(), allRegionalPressureRecipes());
});

test('unknown sector yields empty recipes', () => {
  assert.deepEqual(pressureRecipesForRegion('sector_does_not_exist'), []);
  assert.equal(getRegionalEconomyProfile('sector_does_not_exist'), null);
});

test('owned sources forbid Math.random and wall-clock Date APIs', () => {
  for (const rel of OWNED_SOURCE_PATHS) {
    const abs = path.join(ROOT, rel);
    const src = fs.readFileSync(abs, 'utf8');
    assert.equal(/Math\.random\s*\(/.test(src), false, `${rel} uses Math.random`);
    assert.equal(/\bnew\s+Date\b|\bDate\.now\s*\(/.test(src), false, `${rel} uses Date API`);
  }
});

test('check gate passes', () => {
  const result = checkEconomyRegionalSupply();
  assert.equal(result.ok, true, (result.errors || []).join('; '));
  assert.equal(exitCodeForResult(result), 0);
});
