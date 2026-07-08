#!/usr/bin/env node
// BP-09.1 SYNERGY-TELLS backend data contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { MODULES } from '../src/data/modules.js';
import { getDerivedStats, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { classifyBuildIdentity } from '../src/systems/buildIdentity.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/synergies.js', import.meta.url)),
  'src/data/synergies.js exists');

const mod = await import('../src/data/synergies.js');
const {
  SYNERGY_TELLS,
  compactSynergy,
  synergiesForFittings,
  synergyById,
} = mod;

const MODULE_IDS = new Set(MODULES.map((m) => m.id));

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in synergy-tells path'); };
  Date.now = () => { throw new Error('Date.now in synergy-tells path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testCatalogShapeAndMatching);
guarded(testDrawbacksMatchDerivedStats);
guarded(testBuildIdentityConsumesSynergies);
testPackageAndSourceGuards();

console.log(`[check-synergy-tells] PASS - ${sections} sections green`);

function testCatalogShapeAndMatching() {
  assert.equal(SYNERGY_TELLS.length, 4, 'four backend synergy tell rows are authored');
  assert.deepEqual(SYNERGY_TELLS.map((row) => row.id), [
    'rammer_truck',
    'control_tug',
    'bulk_miner',
    'survey_control',
  ], 'synergy ids stay stable and ordered');

  for (const row of SYNERGY_TELLS) {
    assert.equal(synergyById(row.id), row, `${row.id} is addressable by id`);
    assert.ok(row.label && row.fantasy && row.benefit, `${row.id} has readable copy`);
    assert.ok(row.drawback && row.drawback.stat && row.drawback.direction && row.drawback.label,
      `${row.id} names a drawback`);
    assert.ok(row.validation && row.validation.shipId, `${row.id} names a validation hull`);
    for (const moduleId of row.moduleIds) {
      assert.ok(MODULE_IDS.has(moduleId), `${row.id} module ${moduleId} exists`);
    }
    const matched = synergiesForFittings(row.moduleIds);
    assert.equal(matched.some((s) => s.id === row.id), true, `${row.id} matches its exact module set`);
    assert.equal(synergiesForFittings(row.moduleIds.slice(0, -1)).some((s) => s.id === row.id), false,
      `${row.id} does not match a partial fitting`);
  }
  ok('synergy catalog rows are concrete module pairs with exact matching');
}

function deltaFor(row) {
  const shipId = row.validation.shipId;
  const before = getDerivedStats(shipId, [], null);
  const fittings = fittingsFromDefaultModules(shipId, row.moduleIds);
  const after = getDerivedStats(shipId, fittings, null);
  const stat = row.drawback.stat;
  assert.ok(Number.isFinite(before[stat]), `${row.id} before ${stat} is finite`);
  assert.ok(Number.isFinite(after[stat]), `${row.id} after ${stat} is finite`);
  return after[stat] - before[stat];
}

function testDrawbacksMatchDerivedStats() {
  for (const row of SYNERGY_TELLS) {
    const delta = deltaFor(row);
    if (row.drawback.direction === 'down') {
      assert.ok(delta < 0, `${row.id} drawback ${row.drawback.stat} should go down, got ${delta}`);
    } else if (row.drawback.direction === 'up') {
      assert.ok(delta > 0, `${row.id} drawback ${row.drawback.stat} should go up, got ${delta}`);
    } else {
      assert.fail(`${row.id} uses unknown drawback direction ${row.drawback.direction}`);
    }
  }
  ok('every synergy drawback matches a live getDerivedStats delta');
}

function testBuildIdentityConsumesSynergies() {
  for (const row of SYNERGY_TELLS) {
    const identity = classifyBuildIdentity(row.moduleIds, { shipId: row.validation.shipId });
    assert.ok(Array.isArray(identity.synergies), `${row.id} identity includes synergy metadata`);
    const compact = identity.synergies.find((s) => s.id === row.id);
    assert.ok(compact, `${row.id} is exposed through BUILD-ID`);
    assert.equal(compact.label, row.label, `${row.id} compact label matches data`);
    assert.equal(compact.drawbackStat, row.drawback.stat, `${row.id} compact drawback names the stat`);
    assert.deepEqual(compact, compactSynergy(row), `${row.id} compact form is the shared helper output`);
    assert.equal(identity.basis.matched.includes(row.buildIdentityId) || identity.id === row.buildIdentityId,
      true, `${row.id} aligns with a BUILD-ID archetype`);
  }
  ok('BUILD-ID exposes matching synergy metadata for UI consumers');
}

function testPackageAndSourceGuards() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:synergy-tells'], 'node scripts/check-synergy-tells.mjs',
    'package exposes check:synergy-tells');

  const source = readFileSync(new URL('../src/data/synergies.js', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/systems/buildIdentity.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'synergy tell path does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /ramDamageDealtMult\s*=|tetherReelRateMult\s*=|richCoreRingPctBonus\s*=|cargoFlat\s*=/,
    'synergy tell path does not add or mutate stat couplings');
  ok('package and source guards are present');
}
