#!/usr/bin/env node
// BP-09.1 MODULE-DRAWBACK-GLYPHS backend proof.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { MODULES } from '../src/data/modules.js';
import { getDerivedStats, fittingsFromDefaultModules } from '../src/systems/ships.js';
import {
  HEAVY_BUILD_MASS_RATIO,
  HEAVY_MODULE_MASS,
  MODULE_RISK_GLYPHS,
  moduleRiskGlyphs,
  moduleRiskStrip,
} from '../src/ui/panels/moduleRisk.js';
import { statSnippet } from '../src/ui/screens/outfitting.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/ui/panels/moduleRisk.js', import.meta.url)),
  'src/ui/panels/moduleRisk.js exists');

const MODULE_IDS = new Set(MODULES.map((moduleDef) => moduleDef.id));
let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in module-risk path'); };
  Date.now = () => { throw new Error('Date.now in module-risk path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testCatalogAndStaticModuleRisks);
guarded(testAggregateDerivedRisks);
guarded(testNoInventedDrawbacks);
guarded(testMasslineModuleReadouts);
testPackageAndNoTouchGuards();

console.log(`[check-module-risk] PASS - ${sections} sections green`);

function riskIds(risks) {
  return risks.map((risk) => risk.id);
}

function testCatalogAndStaticModuleRisks() {
  assert.deepEqual(Object.keys(MODULE_RISK_GLYPHS), [
    'contraband',
    'mining_noise',
    'heavy_module',
    'power_hungry',
    'heavy_build',
  ], 'risk glyph roster/order stays stable');
  assert.equal(HEAVY_MODULE_MASS, 10, 'heavy module threshold is pinned');
  assert.equal(HEAVY_BUILD_MASS_RATIO, 1.2, 'heavy build threshold is pinned');

  const smuggler = moduleRiskGlyphs('mod_smuggler_hold');
  assert.ok(riskIds(smuggler).includes('contraband'), 'smuggler hold exposes the contraband risk glyph');
  const contraband = smuggler.find((risk) => risk.id === 'contraband');
  assert.equal(contraband.basis.value, 'contraband', 'contraband risk reads module.legality');
  assert.equal(contraband.basis.hiddenCargoPct, 0.2, 'contraband risk carries the shipped hidden hold percentage');

  const industrial = moduleRiskGlyphs('mod_mining_industrial_l');
  assert.ok(riskIds(industrial).includes('mining_noise'), 'mining modules expose the real mining-noise risk');
  assert.ok(riskIds(industrial).includes('heavy_module'), 'heavy modules expose mass as a handling risk');
  const mining = industrial.find((risk) => risk.id === 'mining_noise');
  assert.equal(mining.basis.source, 'mining._updateMiningNoise',
    'mining noise glyph points at the shipped mining-noise accumulator');
  assert.equal(mining.basis.dps, 70, 'mining risk carries the shipped module dps as context');

  assert.deepEqual(moduleRiskGlyphs('mod_ram_plate'), [],
    'ram plate has no invented risk because its current data carries no legality, noise, drain, or heavy mass issue');
  ok('static module risks map only to shipped module flags and values');
}

function testAggregateDerivedRisks() {
  const hotIds = [
    'mod_shield_booster_s',
    'mod_engine_fusion_m',
    'mod_smuggler_hold',
    'mod_mining_laser_s',
    'mod_winch_hd',
  ];
  const hotFittings = fittingsFromDefaultModules('ship_kestrel', hotIds);
  const hotDerived = getDerivedStats('ship_kestrel', hotFittings);
  assert.equal(hotDerived.continuousDrain, 15, 'control build really draws 15 cap/s from live stats');
  assert.equal(hotDerived.capRegen, 12, 'Kestrel cap regen is the live baseline');

  const hotStrip = moduleRiskStrip(hotIds, { shipId: 'ship_kestrel' });
  assert.deepEqual(hotStrip.moduleIds, hotIds, 'strip keeps the fitted module ids in order');
  assert.ok(riskIds(hotStrip.risks).includes('power_hungry'),
    'strip exposes power-hungry when continuousDrain exceeds capRegen');
  const power = hotStrip.risks.find((risk) => risk.id === 'power_hungry');
  assert.equal(power.basis.continuousDrain, 15, 'power glyph basis names continuousDrain');
  assert.equal(power.basis.capRegen, 12, 'power glyph basis names capRegen');
  assert.ok(riskIds(hotStrip.risks).includes('contraband'),
    'aggregate strip includes module-level contraband');
  assert.ok(riskIds(hotStrip.risks).includes('mining_noise'),
    'aggregate strip includes module-level mining noise');

  const heavyIds = [
    'mod_cargo_pod_m',
    'mod_cargo_pod_m',
    'mod_cargo_pod_m',
    'mod_ram_plate',
  ];
  const heavyStrip = moduleRiskStrip(heavyIds, { shipId: 'ship_mule' });
  assert.ok(heavyStrip.derived.massRatio >= HEAVY_BUILD_MASS_RATIO,
    'heavy control build really crosses the mass-ratio threshold');
  assert.ok(riskIds(heavyStrip.risks).includes('heavy_build'),
    'strip exposes heavy-build when fitted mass materially changes handling');

  const calmStrip = moduleRiskStrip(['mod_market_data_s'], { shipId: 'ship_kestrel' });
  assert.equal(riskIds(calmStrip.risks).includes('power_hungry'), false,
    'low-drain fitting does not get a false power warning');

  const impossibleStrip = moduleRiskStrip(['mod_mining_industrial_l'], { shipId: 'ship_kestrel' });
  assert.deepEqual(impossibleStrip.moduleIds, [],
    'strip omits requested modules that do not actually fit the hull');
  assert.deepEqual(impossibleStrip.risks, [],
    'impossible fittings do not create false module risks');
  ok('aggregate risks come from live getDerivedStats values');
}

function testNoInventedDrawbacks() {
  for (const moduleDef of MODULES) {
    const ids = riskIds(moduleRiskGlyphs(moduleDef.id));
    if (ids.includes('contraband')) {
      assert.equal(moduleDef.legality, 'contraband', `${moduleDef.id} contraband requires legality flag`);
    }
    if (ids.includes('mining_noise')) {
      assert.equal(moduleDef.slotType, 'mining', `${moduleDef.id} mining noise requires mining slot`);
      assert.ok(Number.isFinite(Number(moduleDef.dps)), `${moduleDef.id} mining noise requires dps`);
    }
    if (ids.includes('heavy_module')) {
      assert.ok((moduleDef.mass || 0) >= HEAVY_MODULE_MASS, `${moduleDef.id} heavy requires module mass`);
    }
  }

  assert.equal(MODULE_IDS.has('mod_smuggler_hold'), true, 'smuggler hold exists in live module data');
  assert.equal(MODULE_IDS.has('mod_mining_industrial_l'), true, 'industrial mining module exists in live module data');
  ok('risk labels are absent unless the corresponding live flag/aggregate exists');
}

function testMasslineModuleReadouts() {
  const byId = new Map(MODULES.map((def) => [def.id, def]));
  const cloak = statSnippet(byId.get('mod_cloak_mk1'));
  assert.match(cloak, /320 detection ring/, 'cloak readout names its live detection radius');
  assert.match(cloak, /9% cloak drain\/s/, 'cloak readout names its energy cost');
  assert.match(cloak, /6% cloak recharge\/s/, 'cloak readout names its recovery rate');
  const vectorRack = statSnippet(byId.get('mod_charge_vector_rack'));
  assert.match(vectorRack, /8 charges/, 'vector rack names its capacity');
  assert.match(vectorRack, /aft-drop enabled/, 'vector rack exposes its late-game propulsion verb');
  ok('massline modules expose their real behavior in outfitting readouts');
}

function testPackageAndNoTouchGuards() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:module-risk'], 'node scripts/check-module-risk.mjs',
    'package exposes check:module-risk');

  const source = readFileSync(new URL('../src/ui/panels/moduleRisk.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'module risk path does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /document\.|window\.|innerHTML|addEventListener/,
    'module risk helper is pure data, not visual/DOM wiring');
  assert.doesNotMatch(source, /economy:|grantCredits|chargeCredits|state\.player\.credits|state\.player\.cargo/,
    'module risk helper does not touch economy, credits, or cargo writers');
  ok('package and no-touch guards are present');
}
