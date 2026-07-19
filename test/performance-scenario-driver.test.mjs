import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  performanceScenarioExecutionOrder,
  validateScenarioRestoration,
} from '../scripts/lib/performanceScenarioDriver.mjs';

test('scenario execution order keeps comparable route states together and context recovery last', () => {
  const order = performanceScenarioExecutionOrder([
    'context_recover_steady',
    'fleet_full_render_50',
    'docked_market_ui',
    'flight_steady',
    'autosave_under_load',
  ]);
  assert.deepEqual(order, [
    'docked_market_ui',
    'flight_steady',
    'fleet_full_render_50',
    'autosave_under_load',
    'context_recover_steady',
  ]);
});

test('restoration receipt fails closed on any leaked state or injected entity', () => {
  assert.deepEqual(validateScenarioRestoration({
    restored: true,
    checks: { timeScale: true, injectedEntitiesRemoved: true },
    remainingInjectedIds: [],
  }), { pass: true, failures: [] });
  const failed = validateScenarioRestoration({
    restored: false,
    checks: { timeScale: false, injectedEntitiesRemoved: true },
    remainingInjectedIds: [42],
  });
  assert.equal(failed.pass, false);
  assert.match(failed.failures.join(' | '), /timeScale/);
  assert.match(failed.failures.join(' | '), /injected entities remain/);
});

test('browser restoration resolves the live SF authority in every evaluation scope', async () => {
  const source = await readFile(new URL('../scripts/lib/performanceScenarioDriver.mjs', import.meta.url), 'utf8');
  const restoreSource = source.slice(source.indexOf('export async function restorePerformanceScenario'));
  assert.match(restoreSource, /const receipt = await page\.evaluate\([\s\S]*const sf = window\.SF;[\s\S]*sf\.registry/);
});
