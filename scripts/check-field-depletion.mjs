#!/usr/bin/env node
// BP-02 mining fold: FIELD-MEMORY backend contract.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import {
  FIELD_DEPLETION_PER_YIELD_U,
  FIELD_DEPLETION_RECOVERY_STEP_S,
  depletionDeltaForYield,
  fieldDepletion,
  fieldMemoryBand,
  fieldMemoryReadout,
  recoverFieldDepletion,
  recordFieldExtraction,
  richnessMultiplierForDepletion,
} from '../src/systems/fieldDepletion.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/fieldDepletion.js', import.meta.url)),
  'src/systems/fieldDepletion.js exists');

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in field-depletion path'); };
  Date.now = () => { throw new Error('Date.now in field-depletion path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPureMathContract);
guarded(testAsteroidDestroyedUpdatesWorldDiscovery);
guarded(testRecoveryIsMonotoneAndEmitsForCurrentSector);
guarded(testSerializeDeserializeKeepsFieldMemory);
testPackageRegistrySaveAndScope();

console.log(`[check-field-depletion] PASS - ${sections} sections green`);

function boot(seed = 8412) {
  const sim = createSimulation({ seed, systems: [world, fieldDepletion] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  const log = { depletion: [], world: [] };
  sim.bus.on('fieldDepletion:changed', (payload) => log.depletion.push(payload));
  sim.bus.on('field:depletedChanged', (payload) => log.world.push(payload));
  return { sim, state: sim.state, bus: sim.bus, log };
}

function spawnAsteroid(t, overrides = {}) {
  return t.sim.spawn({
    type: 'asteroid',
    pos: overrides.pos || { x: 140, z: -40 },
    radius: overrides.radius || 12,
    hull: 1,
    hullMax: 1,
    alive: true,
    data: {
      typeId: 'ast_metallic',
      fieldId: 'f_ceres_1',
      yieldU: 20,
      oreHP: 0,
      oreHPMax: 100,
      ...overrides.data,
    },
  });
}

function destroy(t, asteroid, payload = {}) {
  t.bus.emit('asteroid:destroyed', {
    id: asteroid.id,
    typeId: asteroid.data.typeId,
    pos: { x: asteroid.pos.x, z: asteroid.pos.z },
    ...payload,
  });
}

function testPureMathContract() {
  assert.equal(FIELD_DEPLETION_PER_YIELD_U, 0.0025, 'yield-unit depletion constant is pinned');
  assert.equal(depletionDeltaForYield(20), 0.05, '20u asteroid raises depletion by 5%');
  assert.equal(depletionDeltaForYield(999), 0.08, 'single asteroid delta is capped');
  assert.equal(richnessMultiplierForDepletion(0), 1, 'fresh field has full richness');
  assert.equal(richnessMultiplierForDepletion(1), 0.45, 'fully depleted field keeps a floor');
  assert.equal(fieldMemoryBand(0.02), 'rich');
  assert.equal(fieldMemoryBand(0.2), 'worked');
  assert.equal(fieldMemoryBand(0.5), 'thin');
  assert.equal(fieldMemoryBand(0.8), 'depleted');
  ok('pure depletion math is pinned');
}

function testAsteroidDestroyedUpdatesWorldDiscovery() {
  const t = boot();
  const first = spawnAsteroid(t, { data: { yieldU: 20, fieldId: 'f_ceres_1' } });
  destroy(t, first, { fieldId: undefined });

  const readout1 = fieldMemoryReadout(t.state, 'f_ceres_1');
  assert.equal(readout1.depletion, 0.05, 'destroyed asteroid raises field depletion from entity.data.fieldId');
  assert.equal(readout1.extractedU, 20, 'field ledger counts extracted ore units');
  assert.equal(readout1.destroyedCount, 1, 'field ledger counts destroyed asteroids');
  assert.equal(readout1.richnessMult, 0.9725, 'richness readout derives from depletion');
  assert.equal(t.log.depletion.length, 1, 'backend emits one fieldDepletion receipt');
  assert.equal(t.log.world.length, 1, 'backend emits one world-facing field:depletedChanged event');
  assert.equal(t.state.world.discovery.sector_ceres_belt.fieldsDepleted.f_ceres_1, 0.05,
    'world discovery consumes the existing field:depletedChanged seam');

  const second = spawnAsteroid(t, { data: { yieldU: 30, fieldId: 'f_ceres_1' } });
  destroy(t, second);
  const readout2 = fieldMemoryReadout(t.state, 'f_ceres_1');
  assert.ok(readout2.depletion > readout1.depletion, 'repeated mining is monotone increasing');
  assert.equal(readout2.extractedU, 50, 'extracted units accumulate per field');
  assert.equal(readout2.destroyedCount, 2, 'destroyed count accumulates per field');

  const silent = spawnAsteroid(t, { data: { fieldId: null, yieldU: 50 } });
  destroy(t, silent);
  assert.equal(t.log.depletion.length, 2, 'asteroids without a field id are ignored');
  ok('asteroid destruction updates durable field memory and world discovery');
}

function testRecoveryIsMonotoneAndEmitsForCurrentSector() {
  const t = boot(8413);
  recordFieldExtraction(t.state, { fieldId: 'f_ceres_1', sectorId: 'sector_ceres_belt', extractedU: 80, simTime: 1 });
  const before = fieldMemoryReadout(t.state, 'f_ceres_1').depletion;
  const changed = recoverFieldDepletion(t.state, 60);
  const after = fieldMemoryReadout(t.state, 'f_ceres_1').depletion;
  assert.equal(changed.length, 1, 'pure recovery reports the changed field');
  assert.ok(after < before, 'recovery decreases depletion');
  assert.ok(after >= 0, 'recovery never goes negative');

  const t2 = boot(8414);
  recordFieldExtraction(t2.state, { fieldId: 'f_ceres_1', sectorId: 'sector_ceres_belt', extractedU: 80, simTime: 1 });
  t2.sim.runTicks(Math.ceil(FIELD_DEPLETION_RECOVERY_STEP_S * 60) + 1);
  assert.ok(t2.log.depletion.some((payload) => payload.reason === 'recovery'),
    'runtime recovery emits a backend receipt for current-sector fields');
  assert.ok(t2.state.world.discovery.sector_ceres_belt.fieldsDepleted.f_ceres_1 <
    depletionDeltaForYield(80),
    'world discovery receives the recovered depletion scalar');
  ok('field depletion recovers monotonically and updates current-sector discovery');
}

function testSerializeDeserializeKeepsFieldMemory() {
  const t = boot(8415);
  const first = spawnAsteroid(t, { data: { yieldU: 22, fieldId: 'f_ceres_2' } });
  destroy(t, first);
  const saved = t.sim.registry.get('fieldDepletion').serialize();
  assert.equal(saved.fields.f_ceres_2.extractedU, 22, 'serialize keeps extracted units');
  assert.equal(saved.receipts.length, 1, 'serialize keeps bounded receipts');

  const t2 = boot(8416);
  t2.sim.registry.get('fieldDepletion').deserialize(saved);
  const restored = fieldMemoryReadout(t2.state, 'f_ceres_2');
  assert.equal(restored.depletion, saved.fields.f_ceres_2.depletion, 'deserialize restores depletion');
  assert.equal(restored.extractedU, 22, 'deserialize restores extracted units');
  assert.equal(restored.destroyedCount, 1, 'deserialize restores destroyed count');
  ok('field memory serializes and deserializes through the system seam');
}

function testPackageRegistrySaveAndScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:field-depletion'], 'node scripts/check-field-depletion.mjs',
    'package exposes check:field-depletion');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ fieldDepletion \} from '\.\.\/systems\/fieldDepletion\.js';/,
    'registry imports fieldDepletion');
  assert.match(registry, /mining, fieldDepletion, cargo/,
    'fieldDepletion registers immediately after mining and before later economy/cargo readers');

  const save = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(save, /data\.fieldDepletion = this\._callSerialize\('fieldDepletion'\)/,
    'save payload serializes fieldDepletion');
  assert.match(save, /this\._callDeserialize\('fieldDepletion', data\.fieldDepletion\)/,
    'load path deserializes fieldDepletion');

  const source = readFileSync(new URL('../src/systems/fieldDepletion.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'fieldDepletion uses no RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /grantCredits|chargeCredits|addCargo|removeCargo|applyRep/,
    'fieldDepletion does not directly write economy, cargo, or reputation');

  const miningSource = readFileSync(new URL('../src/systems/mining.js', import.meta.url), 'utf8');
  const worldSource = readFileSync(new URL('../src/systems/world.js', import.meta.url), 'utf8');
  assert.match(miningSource, /this\.bus\.emit\('asteroid:destroyed'/,
    'field memory reuses the shipped asteroid destruction event');
  assert.match(worldSource, /bus\.on\('field:depletedChanged'/,
    'field memory reuses the shipped world depletion event');
  ok('package, registry, save, determinism, and scope guards are pinned');
}
