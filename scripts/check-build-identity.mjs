#!/usr/bin/env node
// BP-09.1 BUILD-ID backend contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/buildIdentity.js', import.meta.url)),
  'src/systems/buildIdentity.js exists');

const mod = await import('../src/systems/buildIdentity.js');
const buildIdentity = mod.buildIdentity || mod.default;
const { classifyBuildIdentity } = mod;

assert.equal(buildIdentity && buildIdentity.name, 'buildIdentity',
  'buildIdentity exports a registry system');
assert.equal(typeof classifyBuildIdentity, 'function',
  'classifyBuildIdentity helper exported');

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in build-identity path'); };
  Date.now = () => { throw new Error('Date.now in build-identity path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPureClassifierRules);
guarded(testRoleFallbackCoversCanonicalHulls);
guarded(testScannerIntegrationStampsScanPayload);
testPackageAndRegistryWiring();

console.log(`[check-build-identity] PASS - ${sections} sections green`);

function testPureClassifierRules() {
  const truck = classifyBuildIdentity(['mod_ram_plate', 'mod_cargo_pod_m'], { shipId: 'ship_mule' });
  assert.equal(truck.id, 'rammer_truck', 'ram plate + cargo classifies as Rammer-Truck');
  assert.equal(truck.label, 'Rammer-Truck');
  assert.equal(truck.confidence, 'module_pair');
  assert.deepEqual(truck.basis.modules, ['mod_cargo_pod_m', 'mod_ram_plate'],
    'basis lists only sorted fitted module ids');

  const smuggler = classifyBuildIdentity(['mod_smuggler_hold', 'mod_cargo_scanner_s'], { shipId: 'ship_mule' });
  assert.equal(smuggler.id, 'ghost_hauler', 'smuggler hold wins the cargo-risk read');
  assert.ok(smuggler.tags.includes('contraband'), 'smuggler read carries contraband tag');

  const tug = classifyBuildIdentity(['mod_winch_hd', 'mod_charge_rack'], { shipId: 'ship_kestrel' });
  assert.equal(tug.id, 'control_tug', 'winch + charge rack classifies as Control-Tug');
  assert.ok(tug.summary.toLowerCase().includes('reposition'), 'control-tug summary names the tactical read');
  ok('pure classifier maps real module pairs to readable archetypes');
}

function testRoleFallbackCoversCanonicalHulls() {
  const identities = SHIPS.map((ship) => classifyBuildIdentity([], { shipId: ship.id, shipDef: ship }));
  assert.equal(identities.length, 13, 'all canonical hulls were classified');
  assert.equal(identities.every((identity) => identity && identity.id !== 'unknown'), true,
    'no canonical hull falls through to Unknown');
  assert.ok(new Set(identities.map((identity) => identity.id)).size >= 7,
    'role fallback yields distinct build reads across the canonical hulls');
  assert.equal(identities.find((identity) => identity.basis.shipId === 'ship_ironback').id, 'mining_rig',
    'mining barge fallback remains a mining read');
  assert.equal(identities.find((identity) => identity.basis.shipId === 'ship_atlas').id, 'cargo_runner',
    'heavy hauler fallback remains a cargo read');
  ok('role fallback gives every canonical hull a stable non-unknown read');
}

function boot({ fittings, targetDefId = 'ship_mule' } = {}) {
  const sim = createSimulation({ seed: 909, systems: [scanner, scanReveal, buildIdentity] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 220,
    hullMax: 220,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const fit = fittings || fittingsFromDefaultModules(targetDefId, [
    'wpn_pulse_laser_s',
    'mod_engine_ion_m',
    'mod_cargo_pod_m',
    'mod_ram_plate',
  ]);
  const targetSpec = makeShipEntitySpec(targetDefId, {
    team: 2,
    factionId: 'faction_frontier',
    pos: { x: 260, z: 0 },
    fittings: fit,
    ai: { archetype: 'frontier_truck', passive: true },
  });
  targetSpec.data.shipClass = 'freighter';
  const target = sim.spawn(targetSpec);
  const log = { scans: [], identities: [] };
  bus.on('scan:shipRevealed', (payload) => log.scans.push(payload));
  bus.on('buildIdentity:revealed', (payload) => log.identities.push(payload));
  return { sim, state, bus, player, target, log };
}

function runScan(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function runPastCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

function testScannerIntegrationStampsScanPayload() {
  const t = boot();
  runScan(t);
  assert.equal(t.log.scans.length, 1, 'real scanner pulse emits one scan reveal');
  assert.equal(t.log.identities.length, 1, 'build identity emits one reveal receipt');
  assert.equal(t.target.data.buildIdentity.id, 'rammer_truck',
    'entity receives the build identity');
  assert.equal(t.target.data.scanRevealed.buildIdentity.id, 'rammer_truck',
    'scanRevealed payload carries the build identity badge');
  assert.equal(t.log.scans[0].buildIdentity.id, 'rammer_truck',
    'scan event payload is stamped before UI listeners consume it');
  assert.equal(t.target.data.buildIdentity.basis.modules.includes('mod_ram_plate'), true,
    'identity basis includes the ram plate');
  assert.equal(t.target.data.buildIdentity.basis.modules.includes('mod_cargo_pod_m'), true,
    'identity basis includes the cargo pod');

  runPastCooldown(t);
  runScan(t);
  assert.equal(t.log.scans.length, 1, 'duplicate scan reveal remains de-duped');
  assert.equal(t.log.identities.length, 1, 'duplicate restamp does not spam identity events');
  assert.equal(t.target.data.scanRevealed.buildIdentity.id, 'rammer_truck',
    'duplicate scan pulse restamps buildIdentity after scanReveal rewrites the payload');
  ok('buildIdentity rides the real scan reveal seam and survives duplicate scan rewrites');
}

function testPackageAndRegistryWiring() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:build-identity'], 'node scripts/check-build-identity.mjs',
    'package exposes check:build-identity');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ buildIdentity \} from '\.\.\/systems\/buildIdentity\.js';/,
    'registry imports buildIdentity system');
  assert.match(registry, /scanner, scanReveal, buildIdentity, pirateDisguise/,
    'buildIdentity is registered after scanReveal and before disguise/AI readers');

  const source = readFileSync(new URL('../src/systems/buildIdentity.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'buildIdentity path does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /credits|cargo\s*=|faction:repDelta|economy:|combat:onHit/,
    'buildIdentity does not write economy, cargo, reputation, or combat state');
  ok('package and registry wiring are present');
}
