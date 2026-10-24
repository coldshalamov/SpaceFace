// Keep the pure manifest importable before loading any browser or gameplay factory.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER,
  getSystemClock, validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';

test('production manifest imports with unique initialized and clocked update IDs', () => {
  assert.equal(new Set(PRODUCTION_INIT_ORDER).size, PRODUCTION_INIT_ORDER.length);
  assert.equal(new Set(PRODUCTION_UPDATE_ORDER).size, PRODUCTION_UPDATE_ORDER.length);
  for (const id of PRODUCTION_UPDATE_ORDER) {
    assert.ok(PRODUCTION_INIT_ORDER.includes(id), `update owner ${id} must initialize`);
    assert.ok(getSystemClock(id), `update owner ${id} must declare a clock`);
  }
  assert.deepEqual(validateSystemClockDeclarations(), []);
});

test('DOCKET remains registered on the table before physics', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('docket'));
  assert.equal(getSystemClock('docket'), 'table');
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('docket') >= 0);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('docket') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));
});
