#!/usr/bin/env node
// BP-02.1/C4 Silhouette Threat Language contract.
//
// This is intentionally a data-only gate: it names the tactical silhouette
// families for future radar/HUD/assets work without touching those lanes.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/silhouetteRoles.js', import.meta.url)),
  'src/data/silhouetteRoles.js exists');

const mod = await import('../src/data/silhouetteRoles.js');
const {
  SILHOUETTE_FAMILY_IDS,
  SILHOUETTE_FAMILIES,
  SILHOUETTE_ROLE_IDS,
  ROLE_SILHOUETTES,
  silhouetteFamilyById,
  silhouetteForRole,
  silhouetteReadoutForRole,
  silhouetteForShipDef,
} = mod;

const REQUIRED_FAMILIES = Object.freeze({
  swarmer: 'darting-dot',
  sniper: 'long-triangle',
  brawler: 'fat-wedge',
  hauler: 'wide-slab',
  carrier: 'spoked',
});

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in silhouette-role path'); };
  Date.now = () => { throw new Error('Date.now in silhouette-role path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testFamilyRoster);
guarded(testCanonicalRoleCoverage);
guarded(testShipVisualContract);
guarded(testStableReadoutShape);
testPackageAndDataOnlyScope();

console.log(`[check-silhouette-roles] PASS - ${sections} sections green`);

function testFamilyRoster() {
  assert.deepEqual(SILHOUETTE_FAMILY_IDS, Object.keys(REQUIRED_FAMILIES),
    'C4 family ids stay in spec order');
  for (const [id, shape] of Object.entries(REQUIRED_FAMILIES)) {
    const family = silhouetteFamilyById(id);
    assert.equal(family, SILHOUETTE_FAMILIES[id], `${id}: lookup returns exported family`);
    assert.equal(family.shape, shape, `${id}: required silhouette shape`);
    assert.match(family.tell, /^[A-Z0-9-]+$/, `${id}: family tell is one word`);
    assert.ok(family.tacticalTell.length >= 20, `${id}: tactical tell is meaningful`);
    assert.ok(family.counterplay.length >= 20, `${id}: counterplay line is meaningful`);
    assert.ok(family.radarGlyph.length > 0, `${id}: radar glyph token exists`);
  }
  assert.equal(silhouetteFamilyById('procedural'), null, 'unknown family returns null');
  ok('the five BP-02.1/C4 silhouette families are pinned');
}

function testCanonicalRoleCoverage() {
  const canonicalRoles = [...new Set(SHIPS.map((ship) => ship.role))].sort();
  const mappedRoles = [...SILHOUETTE_ROLE_IDS].sort();
  assert.deepEqual(mappedRoles, canonicalRoles,
    'every canonical ship role has a silhouette-language row and no extras');

  const representedFamilies = new Set();
  for (const role of canonicalRoles) {
    const row = silhouetteForRole(role);
    assert.equal(row, ROLE_SILHOUETTES[role], `${role}: role lookup returns exported row`);
    assert.ok(SILHOUETTE_FAMILIES[row.familyId], `${role}: maps to a shipped family`);
    assert.match(row.tell, /^[A-Z0-9-]+$/, `${role}: role tell is one word`);
    assert.ok(row.tacticalTell.length >= 20, `${role}: role tactical tell exists`);
    assert.ok(row.counterplay.length >= 20, `${role}: role counterplay exists`);
    representedFamilies.add(row.familyId);
  }
  assert.equal(representedFamilies.size, Object.keys(REQUIRED_FAMILIES).length,
    'canonical hull roster exercises all five silhouette families');
  assert.equal(silhouetteForRole('unknown'), null, 'unknown role returns null');
  ok('all canonical ship roles map to tactical silhouette families');
}

function testShipVisualContract() {
  for (const ship of SHIPS) {
    const readout = silhouetteForShipDef(ship);
    assert.equal(readout.shipId, ship.id, `${ship.id}: readout keeps ship id`);
    assert.equal(readout.visualFamily, ship.visuals.family, `${ship.id}: visual family is surfaced`);
    assert.equal(readout.visualFamilyMatchesContract, true,
      `${ship.id}: current visuals.family ${ship.visuals.family} is allowed by role contract`);
    assert.ok(readout.visualFamilies.includes(ship.visuals.family),
      `${ship.id}: role row explicitly allows current visuals family`);
  }
  assert.equal(silhouetteForShipDef({ id: 'custom', name: 'Custom', role: 'fighter' }).visualFamilyMatchesContract, true,
    'missing visual family is allowed for future tests/tools');
  assert.equal(silhouetteForShipDef({ id: 'bad', name: 'Bad', role: 'fighter', visuals: { family: 'freighter' } }).visualFamilyMatchesContract, false,
    'mismatched visual family is detectable');
  ok('canonical ship visuals honor the silhouette contract');
}

function testStableReadoutShape() {
  const gunship = silhouetteReadoutForRole('gunship');
  assert.deepEqual(
    Object.keys(gunship).sort(),
    [
      'counterplay', 'familyId', 'familyLabel', 'familyTell', 'label',
      'radarGlyph', 'role', 'shape', 'tacticalTell', 'tell', 'visualFamilies',
    ].sort(),
    'role readout shape is stable for future UI/codex consumers',
  );
  assert.equal(gunship.familyId, 'sniper', 'gunship reads as sniper family');
  assert.equal(gunship.shape, 'long-triangle', 'gunship uses the long-triangle shape');
  assert.match(gunship.counterplay, /close|line/i, 'gunship readout carries tactical counterplay');

  const flagship = silhouetteForShipDef(SHIPS.find((ship) => ship.role === 'flagship'));
  assert.equal(flagship.familyId, 'carrier', 'flagship is the carrier/spoked command read');
  assert.equal(flagship.shape, 'spoked', 'flagship carries the spoked silhouette');
  ok('readout helpers expose compact tactical data');
}

function testPackageAndDataOnlyScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:silhouette-roles'], 'node scripts/check-silhouette-roles.mjs',
    'package exposes check:silhouette-roles');

  const dataSource = readFileSync(new URL('../src/data/silhouetteRoles.js', import.meta.url), 'utf8');
  assert.doesNotMatch(dataSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'silhouette role data does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(dataSource, /credits|cargo\s*=|faction:repDelta|economy:|combat:onHit|new\s+THREE/,
    'silhouette role data does not write economy, cargo, reputation, combat, or render state');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  const targetPanel = readFileSync(new URL('../src/ui/targetPanel.js', import.meta.url), 'utf8');
  const scanner = readFileSync(new URL('../src/systems/scanner.js', import.meta.url), 'utf8');
  assert.doesNotMatch(registry, /silhouetteRoles/, 'data-only packet registers no runtime system');
  assert.doesNotMatch(targetPanel, /silhouetteRoles/, 'data-only packet does not edit HUD/target panel wiring');
  assert.doesNotMatch(scanner, /silhouetteRoles/, 'data-only packet does not alter scanner behavior');
  ok('package script and data-only scope are pinned');
}
