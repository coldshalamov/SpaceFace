// plants-wiring — the shipped-outcome gate for the PL-101..PL-256 plant bank.
//
// The adversarial review's defining finding: a plant module nothing constructs is a test-only
// path, not a shipped player outcome. This suite pins the wiring itself: every traffic-family
// ops mixin must be present on the real traffic singleton (imports, spread, init hooks, both
// dispatch branches reach `_react*`), and every standalone plant must be on plantsRuntime's
// registration list, which the browser registry, the node factory table and the authoritative
// manifest each consume by the single 'plants' id.
//
// Deterministic: no DOM, no Three.js, no timers — module shapes only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { traffic } from '../src/systems/traffic.js';
import { plantsRuntime, PLANT_COUNT } from '../src/systems/plants/plantsRuntime.js';
import { pl151NoPapers } from '../src/systems/plants/pl151NoPapers.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANTS_DIR = join(HERE, '..', 'src', 'systems', 'plants');

const OPS_MODULES = [
  ['busDoesntMove', 'busDoesntMoveOps', 'BusDoesntMove', true],
  ['doorstop', 'doorstopOps', 'Doorstop', true],
  ['ducklings', 'ducklingsOps', 'Ducklings', true],
  ['farBerth', 'farBerthOps', 'FarBerth', true],
  ['freightManners', 'freightMannersOps', 'FreightManners', true],
  ['knownByName', 'knownByNameOps', 'KnownByName', true],
  ['litter', 'litterOps', 'Litter', false],
  ['mistaken', 'mistakenOps', 'Mistaken', true],
  ['oneYank', 'oneYankOps', 'OneYank', true],
  ['orphanWreck', 'orphanWreckOps', 'OrphanWreck', true],
  ['paperTrail', 'paperTrailOps', 'PaperTrail', false],
  ['perspective', 'perspectiveOps', 'Perspective', true],
  ['redAtHome', 'redAtHomeOps', 'RedAtHome', false],
  ['seen', 'seenOps', 'Seen', false],
  ['sweepingLine', 'sweepingLineOps', 'SweepingLine', true],
  ['theOtherName', 'otherNameOps', 'OtherName', false],
  ['twoNames', 'twoNamesOps', 'TwoNames', false],
  ['witness', 'witnessOps', 'Witness', false],
  ['wrongWay', 'wrongWayOps', 'WrongWay', true],
  ['yourBerth', 'yourBerthOps', 'YourBerth', true],
];

test('traffic-family: every ops mixin is installed on the real traffic singleton', () => {
  for (const [file, opsName, name, hasReact] of OPS_MODULES) {
    const src = readFileSync(join(PLANTS_DIR, `${file}.js`), 'utf8');
    assert.ok(src.includes(`export const ${opsName}`), `${file} still exports ${opsName}`);
    // The singleton carries the mixin's init and (where present) its per-hull reaction,
    // reachable from the dispatch loops by exactly the names the mixin defines.
    assert.equal(typeof traffic[`_init${name}`], 'function', `traffic._init${name} is wired`);
    if (hasReact) {
      assert.equal(typeof traffic[`_react${name}`], 'function', `traffic._react${name} is wired`);
      // Both dispatch branches must reach it: the module's react body appears in traffic.js
      // exactly at the two dispatch sites plus nowhere else (imports are name-level).
      const wired = readFileSync(join(HERE, '..', 'src', 'systems', 'traffic.js'), 'utf8');
      const calls = wired.split(`_react${name}(e, rec, stations, state, player)`).length - 1;
      assert.equal(calls, 2, `${file}: dispatch calls _react${name} in BOTH branches (found ${calls})`);
    }
  }
});

test('traffic.js sources all 20 ops modules and spreads them into the reaction object', () => {
  const wired = readFileSync(join(HERE, '..', 'src', 'systems', 'traffic.js'), 'utf8');
  for (const [, opsName] of OPS_MODULES) {
    assert.ok(wired.includes(`import { ${opsName} } from './plants/`), `${opsName} imported`);
    assert.ok(wired.includes(`...${opsName},`), `${opsName} spread into the reaction object`);
  }
  // The per-tick steppers sit in update().
  assert.ok(wired.includes('this._stepPl103Bus(state, dt)'), 'bus stepper wired');
  assert.ok(wired.includes('this._stepSweepingLine(state)'), 'sweeper stepper wired');
  assert.ok(wired.includes('this._stepFarBerthShadow(state, plantsPlayer)'), 'shadow tug stepper wired');
  assert.ok(wired.includes('this._stepWrongWayTurnaround(state, plantsPlayer)'), 'wrongWay stepper wired');
  assert.ok(wired.includes('this._stepPerspectiveFind(state, plantsPlayer)'), 'perspective stepper wired');
});

test('plantsRuntime registers every standalone plant module (116)', () => {
  const files = readdirSync(PLANTS_DIR).filter((f) => f.endsWith('.js') && f !== 'plantsRuntime.js');
  const expected = files.length - OPS_MODULES.length - 1; // - towWatch.js helper
  assert.equal(PLANT_COUNT, expected, `plantsRuntime lists all ${expected} standalone plants`);
  assert.equal(typeof plantsRuntime.init, 'function');
  assert.equal(typeof plantsRuntime.update, 'function');
  assert.equal(typeof plantsRuntime.destroy, 'function');
});

test('plantsRuntime lifecycle: init/update/destroy run clean across all real plants', () => {
  const bus = createBus();
  const state = createGameState('plants-wiring');
  state.playerId = 'p1';
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(String(args[1] || args[0]));
  try {
    // Boot, tick, and tear down the whole bank on a bare harness: no plant may throw,
    // and a throwing plant is logged and skipped, never fatal to its neighbours.
    plantsRuntime.init({ state, bus, helpers: {} });
    plantsRuntime.update(1 / 60, state);
    plantsRuntime.update(1 / 60, state);
    plantsRuntime.destroy();
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 0, `no plant lifecycle errors: ${errors.slice(0, 3).join(' | ')}`);
});

test('registry and node factory table both carry the plants entry', () => {
  const registrySrc = readFileSync(join(HERE, '..', 'src', 'core', 'registry.js'), 'utf8');
  assert.ok(registrySrc.includes("import { plantsRuntime } from '../systems/plants/plantsRuntime.js';"), 'registry imports plantsRuntime');
  assert.ok(registrySrc.includes("['plants', plantsRuntime]"), 'registry registers plants');
  const nodeSrc = readFileSync(join(HERE, '..', 'src', 'runtime', 'nodeSystemFactoryTable.js'), 'utf8');
  assert.ok(nodeSrc.includes("['plants', plantsRuntime]"), 'node factory table registers plants');
});

test('manifest: plants declared, scoped to both doors, on the table clock', () => {
  const manifestSrc = readFileSync(join(HERE, '..', 'src', 'runtime', 'authoritativeSystemManifest.js'), 'utf8');
  assert.ok(manifestSrc.includes('plants: MODE_SCOPE_COMBAT_FLIGHT'), 'mode declaration present');
  assert.ok(/CALENDAR_CLOCK|TABLE_CLOCK/.test(manifestSrc), 'clock lists exist');
  // The declaration validator is the authority — run it.
  import('../src/runtime/authoritativeSystemManifest.js').then((m) => {
    assert.deepEqual(m.validateSystemModeDeclarations(), []);
    assert.equal(m.systemRunsInMode('plants', 'flight'), true);
    assert.equal(m.systemRunsInMode('plants', 'swarm'), true);
    assert.equal(m.systemRunsInMode('plants', 'shipbreakingYard'), true);
    assert.equal(m.systemRunsInMode('plants', 'docked'), false);
  });
});


test('plantsRuntime keeps singleton children on the first live sim until teardown', () => {
  const first = Object.create(plantsRuntime);
  const second = Object.create(plantsRuntime);
  const state = createGameState('plants-owner');
  const bus = createBus();
  const forkState = createGameState('plants-fork');
  const forkBus = createBus();
  try {
    first.init({ state, bus, helpers: {} });
    second.init({ state: forkState, bus: forkBus, helpers: {} });
    first.init({ state: forkState, bus: forkBus, helpers: {} });
    assert.equal(pl151NoPapers.state, state, 'second init cannot steal the first sim');
    second.destroy();
    bus.emit('claim:moduleBuilt', {});
    assert.equal(pl151NoPapers._modulesBuilt, 1, 'fork teardown leaves first sim subscribed');
    first.destroy();
    second.init({ state: forkState, bus: forkBus, helpers: {} });
    assert.equal(pl151NoPapers.state, forkState, 'ownership can bind after real teardown');
  } finally {
    first.destroy();
    second.destroy();
  }
});
