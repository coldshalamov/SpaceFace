// spaceface.simScenario.v1 validation + compilation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SIM_SCENARIO_SCHEMA,
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCENARIO = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

test('accepts valid v1 scenario and compiles canonical artifact', () => {
  const v = validateSimScenario(SCENARIO);
  assert.equal(v.ok, true, JSON.stringify(v.issues, null, 2));
  const c = compileSimScenario(SCENARIO);
  assert.equal(c.ok, true);
  assert.equal(c.canonical.schema, 'spaceface.simScenarioCanonical.v1');
  assert.equal(c.canonical.id, SCENARIO.id);
  assert.equal(c.canonical.seed, 47);
  assert.equal(c.canonical.ticks, 90);
  assert.equal(c.canonical.rendering.detached, true);
  assert.ok(Array.isArray(c.canonical.inputTape.frames));
  assert.ok(c.canonical.entities.some((e) => e.alias === 'player'));
});

test('rejects unknown top-level fields', () => {
  const bad = { ...SCENARIO, evilField: true };
  const v = validateSimScenario(bad);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.rule === 'unknown-field' && i.path.includes('evilField')));
});

test('rejects arbitrary JavaScript expressions in strings', () => {
  const bad = {
    ...SCENARIO,
    description: 'boom => runtime.evil()',
  };
  const v = validateSimScenario(bad);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.rule === 'no-js'));
});

test('rejects expr/javascript fields', () => {
  const bad = {
    ...SCENARIO,
    metrics: [{ name: 'invariant.finiteState', version: 1, expr: 'trace.length > 0' }],
  };
  // unknown field on metric + no-js
  const v = validateSimScenario(bad);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.rule === 'unknown-field' || i.rule === 'no-js'));
});

test('rejects executable policy payloads', () => {
  const bad = {
    ...SCENARIO,
    policies: [{ id: '() => injectNaN()', version: 1 }],
  };
  const v = validateSimScenario(bad);
  assert.equal(v.ok, false);
});

test('schema constant is spaceface.simScenario.v1 (not narrative contract)', () => {
  assert.equal(SIM_SCENARIO_SCHEMA, 'spaceface.simScenario.v1');
  assert.notEqual(SIM_SCENARIO_SCHEMA, 'spaceface.scenarioContract.v1');
});
