import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the exact probe functions and assertion seam without starting its browser.
const source = readFileSync(new URL('../scripts/probe-sector-arrival-admission.mjs', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('async function captureArrivalDiagnostics('),
  source.indexOf('/**\n * Menu readiness gate:'));
const assertion = source.slice(source.indexOf('  const stranded = budget.census.pending;'),
  source.indexOf('  const published = samples.find'));
function harness(evaluate, options = {}) {
  const logs = [];
  const context = vm.createContext({
    assert, page: { evaluate }, diagnoseScript: () => ({}),
    console: { log: (...args) => { if (options.brokenLog) throw new Error('sink'); logs.push(args); } },
    setTimeout: (callback) => setTimeout(callback, 5), clearTimeout,
    originDiagnostics: { openingGraphPublicationFrozen: true },
    arriveBudgetS: 60, TARGET_SECTOR: 'sector_ceres_belt',
    budget: { census: { pending: options.ready ? [] : [{ id: 218, adm: 'pending' }] } },
  });
  vm.runInContext(helpers, context);
  return { context, logs, run: () => vm.runInContext(`(async () => {${assertion}})()`, context) };
}

test('stranded arrival emits origin and current diagnostics then retains the original assertion', async () => {
  const h = harness(async () => ({ upgradeQueue: { activeJobs: 1 }, boundaryFailures: [{ id: 218 }] }));
  await assert.rejects(h.run(), /authored bodies must publish within 60s.*218/);
  assert.equal(h.logs.length, 2);
  assert.equal(JSON.parse(h.logs[0][1]).openingGraphPublicationFrozen, true);
  assert.equal(JSON.parse(h.logs[1][1]).boundaryFailures[0].id, 218);
});

test('a rejected inspector cannot replace the arrival assertion', async () => {
  const h = harness(async () => { throw new Error('inspector unavailable'); });
  await assert.rejects(h.run(), /authored bodies must publish within 60s/);
  assert.equal(JSON.parse(h.logs[1][1]).diagnosticError, 'inspector unavailable');
});

test('a stalled inspector is bounded and cannot hide the failure', async () => {
  const h = harness(() => new Promise(() => {}));
  await assert.rejects(h.run(), /authored bodies must publish within 60s/);
  assert.match(JSON.parse(h.logs[1][1]).diagnosticError, /timed out/);
  assert.match(helpers, /1000\);/);
});

test('successful arrival does not collect or emit failure snapshots', async () => {
  let calls = 0;
  const h = harness(() => { calls++; }, { ready: true });
  await h.run();
  assert.equal(calls, 0);
  assert.equal(h.logs.length, 0);
});

test('large diagnostics disclose bounded truncation', async () => {
  const h = harness(async () => ({ jobs: 'x'.repeat(100000) }));
  await assert.rejects(h.run(), /authored bodies must publish/);
  const record = JSON.parse(h.logs[1][1]);
  assert.equal(record.diagnosticTruncated, true);
  assert.equal(record.prefix.length, 32768);
  assert.equal(record.omittedCharacters, JSON.stringify({ jobs: 'x'.repeat(100000) }).length - 32768);
});

test('broken logging still leaves the original failure authoritative', async () => {
  const h = harness(async () => ({}), { brokenLog: true });
  await assert.rejects(h.run(), /authored bodies must publish within 60s/);
});
