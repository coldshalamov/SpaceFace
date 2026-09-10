import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  PRODUCTION_COMBAT_UPDATE_ORDER,
  getAuthoritativeInitOrder,
  getAuthoritativeUpdateOrder,
} from '../src/runtime/authoritativeSystemManifest.js';

function assertBefore(order, before, after) {
  assert.ok(order.includes(before), `${before} is present`);
  assert.ok(order.includes(after), `${after} is present`);
  assert.ok(order.indexOf(before) < order.indexOf(after), `${before} precedes ${after}`);
}

test('survivalArena initializes and updates exactly once on production and Node routes', () => {
  for (const nodeSafeOnly of [false, true]) {
    const init = getAuthoritativeInitOrder('production', { nodeSafeOnly });
    const update = getAuthoritativeUpdateOrder('production', { nodeSafeOnly });
    assert.equal(init.filter((id) => id === 'survivalArena').length, 1);
    assert.equal(update.filter((id) => id === 'survivalArena').length, 1);
  }
});

test('arena toys process shots and field changes before the same tick physics solve', () => {
  for (const order of [PRODUCTION_UPDATE_ORDER, PRODUCTION_COMBAT_UPDATE_ORDER]) {
    assert.equal(order.filter((id) => id === 'survivalArena').length, 1);
    assertBefore(order, 'weapons', 'survivalArena');
    assertBefore(order, 'survivalArena', 'fields');
    assertBefore(order, 'fields', 'physics');
    assertBefore(order, 'survivalArena', 'physics');
    assertBefore(order, 'physics', 'combat');
  }
});

test('survival wave clearing still advances the run immediately after combat and scenario work', () => {
  assertBefore(PRODUCTION_UPDATE_ORDER, 'combat', 'survivalWave');
  assertBefore(PRODUCTION_UPDATE_ORDER, 'scenarioRuntime', 'survivalWave');
  assertBefore(PRODUCTION_UPDATE_ORDER, 'survivalWave', 'survivalRun');
  assert.equal(PRODUCTION_UPDATE_ORDER.indexOf('survivalRun'),
    PRODUCTION_UPDATE_ORDER.indexOf('survivalWave') + 1);
  assertBefore(PRODUCTION_UPDATE_ORDER, 'survivalRun', 'heat');
  assertBefore(PRODUCTION_UPDATE_ORDER, 'survivalRun', 'survivalHud');
});

test('production manifest retains unique IDs, update subset of init, and required ordering', () => {
  const init = new Set(PRODUCTION_INIT_ORDER);
  assert.equal(init.size, PRODUCTION_INIT_ORDER.length);
  assert.equal(new Set(PRODUCTION_UPDATE_ORDER).size, PRODUCTION_UPDATE_ORDER.length);
  assert.deepEqual(PRODUCTION_UPDATE_ORDER.filter((id) => !init.has(id)), []);
  assert.equal(PRODUCTION_INIT_ORDER[0], 'core');
  assert.equal(PRODUCTION_UPDATE_ORDER.at(-1), 'save');
  assert.ok(!PRODUCTION_UPDATE_ORDER.includes('render'));
  for (const [before, after] of [
    ['collisionConsequences', 'stuntGrammar'],
    ['environmentalMachinery', 'fields'],
    ['fields', 'planetRuntime'],
    ['planetRuntime', 'physics'],
    ['world', 'heistFacilities'],
    ['heistFacilities', 'regionalEcology'],
    ['masslineImpacts', 'masslineSnares'],
    ['masslineSnares', 'masslineThrow'],
  ]) assertBefore(PRODUCTION_UPDATE_ORDER, before, after);
});
