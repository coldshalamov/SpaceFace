// Real authoritative-runtime integration, deliberately separate from dependency-free harness tests.
// Needs the normal npm dependencies, but no Chromium, game menu, models or renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeLabRequest, selectHeadlessAction, labExitCode } from '../scripts/lib/labExecution.mjs';
import { summarizeTrace } from '../scripts/lib/labTraceReport.mjs';

const load = name => JSON.parse(readFileSync(new URL(`../src/testing/scenarios/${name}.scenario.json`, import.meta.url), 'utf8'));

test('automatic selection respects real equivalence ownership without launching a browser', async () => {
  assert.equal(await selectHeadlessAction(load('flight-fixed-input')), 'repeat');
  assert.equal(await selectHeadlessAction(load('flight-save-load')), 'compare');
  assert.equal(await selectHeadlessAction(load('production-fixture-canary')), 'run');
  const foreign = load('flight-fixed-input');
  foreign.assertions.push({ kind: 'equivalence', equivalence: 'node-eq-chromium' });
  await assert.rejects(selectHeadlessAction(foreign), /No single headless executor/);
});

test('real trace includes every authored sample and input without a certification escape hatch', { timeout: 120_000 }, async () => {
  const scenario = load('flight-fixed-input');
  const result = await executeLabRequest('trace', scenario);
  assert.equal(result.nonPromoting, true, JSON.stringify(result));
  assert.equal(result.certifying, false);
  assert.equal(labExitCode(result), 4, JSON.stringify(result)); // Repeat assertion remains incomplete on a single arm.
  assert.equal(result.trace.length, scenario.ticks);
  assert.equal(result.inputLog.length, scenario.ticks);
  assert.equal(result.trace.at(-1).tick, scenario.ticks - 1);
  assert.equal(summarizeTrace(result).available, true);
});

test('batched real executors retain repeat/save-load proof and do not bleed state across scenarios', { timeout: 180_000 }, async () => {
  const flight = load('flight-fixed-input'), save = load('flight-save-load');
  const before = await executeLabRequest('repeat', flight, { verbosity: 3 });
  assert.equal(before.ok, true, JSON.stringify(before));
  const continuation = await executeLabRequest('compare', save, { verbosity: 3 });
  assert.equal(continuation.ok, true, JSON.stringify(continuation));
  const after = await executeLabRequest('repeat', flight, { verbosity: 3 });
  assert.equal(after.ok, true, JSON.stringify(after));
  assert.equal(after.traceHash, before.traceHash);
  assert.equal(after.deterministicHash, before.deterministicHash);
  assert.equal(after.nonPromoting, false);
  assert.equal(labExitCode(after), 0);
});
