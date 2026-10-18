import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const candidatePath = new URL('../scripts/probe-deployed-mobile.mjs', import.meta.url);
const source = await readFile(candidatePath, 'utf8');

test('the focused fixture reads the Continue candidate and keeps the route actor bounded', () => {
  assert.match(source, /MOBILE_PROBE_CONTINUE === '1'/);
  assert.match(source, /const checkContinue =/);
  assert.match(source, /activeRoute = 'new-game'/);
  assert.match(source, /actorStage = 'boot-menu'/);
  assert.match(source, /function assertContinuePageHealth/);
  assert.ok((source.match(/await waitForMenu\(\);/g) || []).length >= 2, 'initial and reload menu waits share waitForMenu');
  assert.match(source, /await page\.reload\(\{ waitUntil: 'domcontentloaded'/);
  assert.match(source, /assertContinuePageHealth\(report\.pageErrors, continuePageErrorsBefore\)/);
  assert.ok(source.indexOf('const continuePageErrorsBefore = report.pageErrors.length;')
    < source.indexOf("await page.reload({ waitUntil: 'domcontentloaded'"),
  'Continue page-error baseline is captured before Save/reload');
  assert.equal((source.match(/browser\.newContext\(/g) || []).length, 1, 'Continue stays in the original context');
  assert.match(source, /localStorage\.getItem\('sf\.save\.' \+ slot\)/);
  assert.doesNotMatch(source, /localStorage\.setItem|sessionStorage\.setItem|indexedDB\.open/);
  assert.match(source, /\.sf-slot\.empty/);
  assert.match(source, /event\.slot === slot/);
  assert.match(source, /source: 'storage-envelope'/);
  assert.match(source, /waitForContinueEnabled/);
  assert.match(source, /continueClick\?\.action !== 'continue'/);
  assert.match(source, /continueClick\.isTrusted !== true/);
  assert.match(source, /event\.at > click\.at/);
  assert.match(source, /report\.returnedToMenu = \{ route/);
  assert.match(source, /Continue did not observe an advancing simulation tick or simTime/);
  assert.match(source, /frame\?\.tick/);
  assert.match(source, /frame\?\.simTime/);
  assert.match(source, /report\.continueHttp =/);
  assert.match(source, /report\.workerObservedFailures = observedWorkerFailures\(report\.responses, report\.workerUrls/);
  assert.match(source, /rendererHealth: 'pending'/);
  assert.match(source, /function isConcreteRendererConsoleError/);
  assert.match(source, /MAX_RENDERER_ERROR_SAMPLES = 32/);
  assert.match(source, /isConcreteRendererConsoleError\(message\.type\(\), text\)/);
  assert.match(source, /finalizeRendererHealth\(report\)/);
  assert.match(source, /rendererErrors: \[\]/);
  assert.match(source, /report\.acceptance\.continue = 'passed'/);
  assert.match(source, /report\.passed = report\.acceptance\.mobileCapabilities === 'passed'/);
  assert.ok(source.indexOf("report.acceptance.continue = 'passed'")
    < source.indexOf("report.passed = report.acceptance.mobileCapabilities === 'passed'"),
    'the requested Continue route finishes before the overall pass');
});

function extractFunction(functionName, nextFunctionName) {
  const start = source.indexOf(`async function ${functionName}`);
  const end = source.indexOf(`async function ${nextFunctionName}`, start);
  assert.ok(start >= 0 && end > start, `found ${functionName} in candidate`);
  return source.slice(start, end);
}

function extractHealthGuard() {
  const start = source.indexOf('function assertContinuePageHealth');
  const end = source.indexOf('\nconst snapshotBase =', start);
  assert.ok(start >= 0 && end > start, 'found Continue page-error guard in candidate');
  return source.slice(start, end);
}

function extractRendererHealth() {
  const start = source.indexOf('const MAX_RENDERER_ERROR_SAMPLES = 32;');
  const end = source.indexOf('\nlet browser;', start);
  assert.ok(start >= 0 && end > start, 'found renderer-health helpers in candidate');
  return source.slice(start, end);
}

function makeSaveHarness({ events = [], envelope = null } = {}) {
  const context = {
    Promise,
    Date,
    setTimeout,
    clearTimeout,
    boundedBrowserRead: async read => read(),
    window: { __SF_MOBILE_STARTUP_OBSERVER__: { snapshot: () => ({ events }) } },
    localStorage: { getItem: () => envelope && JSON.stringify(envelope) },
  };
  vm.runInNewContext(`${extractFunction('waitForPublicSave', 'waitForContinueEnabled')}\nglobalThis.waitForPublicSave = waitForPublicSave;`, context);
  const page = {
    evaluate: async (fn, args) => fn(args),
    waitForTimeout: async () => {},
  };
  return { context, page };
}

function makeFlightHarness(frames) {
  let now = 0;
  let index = 0;
  const context = {
    Date: { now: () => now },
    page: { waitForTimeout: async ms => { now += ms; } },
    snapshot: async () => ({
      flight: '1', loading: [], simLaneEvents: [],
      runtime: { frame: { mode: 'flight', ...frames[Math.min(index++, frames.length - 1)] },
        post: { firstPlayableFrameAt: 0 } },
    }),
    report: { console: [], observations: [], stages: [],
      continueClick: { action: 'continue', isTrusted: true, simLaneEventsBeforeClick: [] } },
    console: { log() {} },
    engine: 'fixture', out: '', join: () => '', writeFile: async () => {},
    visible: async () => false,
  };
  const start = source.indexOf('  const waitForFlight = async');
  const end = source.indexOf('\n  await waitForMenu();', start);
  assert.ok(start >= 0 && end > start, 'found flight wait in candidate');
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.waitForFlight = waitForFlight;`, context);
  return context;
}

test('Continue flight rejects a frozen simulation even when the flight UI is ready', async () => {
  const context = makeFlightHarness([{ tick: 42, simTime: 1 }]);
  await assert.rejects(context.waitForFlight('continue', 0),
    /Continue did not observe an advancing simulation tick or simTime/);
});

test('Continue flight waits for an advancing tick or simulation time', async () => {
  for (const frames of [[{ tick: 42 }, { tick: 42 }, { tick: 43 }],
    [{ simTime: 0 }, { simTime: 0 }, { simTime: 1 }]]) {
    const context = makeFlightHarness(frames);
    assert.equal(await context.waitForFlight('continue', 0), 6000);
  }
});

test('save receipt matches the selected slot and ignores historical or autosave receipts', async () => {
  const { context, page } = makeSaveHarness({ events: [
    { type: 'save:completed', slot: 'slot-2', at: 20 },
    { type: 'save:completed', slot: 'slot-1', at: 120 },
    { type: 'save:completed', slot: 'autosave', at: 130 },
  ] });
  const receipt = await context.waitForPublicSave(page, { slot: 'slot-1', afterAt: 100, timeoutMs: 20 });
  assert.equal(receipt.source, 'save:completed');
  assert.equal(receipt.slot, 'slot-1');
  assert.equal(receipt.at, 120, 'a later autosave cannot stand in for the selected slot');
});

test('an uncaught Save/reload pageerror rejects an otherwise successful Continue flight', async () => {
  const context = {};
  vm.runInNewContext(`${extractHealthGuard()}\nglobalThis.assertContinuePageHealth = assertContinuePageHealth;`, context);
  const fixture = {
    report: { pageErrors: [] },
    async save() { return { source: 'save:completed' }; },
    async reload() {
      // Model Playwright's pageerror event: reload resolves, but the route records
      // the uncaught renderer exception while the new menu is coming up.
      this.report.pageErrors.push('uncaught reload renderer error');
      return { status: 200 };
    },
    async continueFlight() { return { flight: true, tickAdvanced: true }; },
  };
  const baseline = fixture.report.pageErrors.length;
  await fixture.save();
  await fixture.reload();
  const flight = await fixture.continueFlight();
  assert.deepEqual(flight, { flight: true, tickAdvanced: true });
  assert.throws(
    () => context.assertContinuePageHealth(fixture.report.pageErrors, baseline),
    /Continue produced 1 page error\(s\)/,
  );
});

test('a concrete console WebGL error fails renderer health after Continue succeeds', () => {
  const context = { Date };
  vm.runInNewContext(`${extractRendererHealth()}
globalThis.isConcreteRendererConsoleError = isConcreteRendererConsoleError;
globalThis.noteRendererError = noteRendererError;
globalThis.finalizeRendererHealth = finalizeRendererHealth;`, context);
  const drawError = 'WebGL: INVALID_OPERATION: glDrawElements: Vertex buffer is not big enough for the draw call.';
  const warning = 'WebGL: shader warning: precision qualifier was downgraded';
  assert.equal(context.isConcreteRendererConsoleError('error', drawError), true);
  assert.equal(context.isConcreteRendererConsoleError('warning', drawError), false,
    'warning-level WebGL diagnostics remain non-gating');
  assert.equal(context.isConcreteRendererConsoleError('error', warning), false,
    'generic WebGL warnings remain non-gating');
  const report = {
    passed: true,
    acceptance: { startupAndControls: 'passed', continue: 'passed', rendererHealth: 'pending' },
    rendererErrors: [], rendererErrorCount: 0,
  };
  context.noteRendererError(report, drawError, 'continue', 'continue-flight-controls');
  context.noteRendererError(report, 'WebGL: CONTEXT_LOST_WEBGL: context lost', 'continue', 'rotation');
  assert.equal(context.finalizeRendererHealth(report), false);
  assert.equal(report.rendererErrorCount, 2);
  assert.equal(report.rendererErrors.length, 2);
  assert.equal(report.acceptance.continue, 'passed', 'Continue leg result remains visible');
  assert.equal(report.acceptance.rendererHealth, 'failed');
  assert.equal(report.passed, false, 'overall result fails on concrete renderer errors');
});

test('bus-free storage envelope is a read-only save receipt and a new selected-slot error fails', async () => {
  const historical = makeSaveHarness({
    events: [{ type: 'save:error', slot: 'slot-3', at: 20, reason: 'historical_failure' }],
    envelope: { fmt: 'spaceface-save-gz', savedAt: 'receipt' },
  });
  const historicalReceipt = await historical.context.waitForPublicSave(historical.page,
    { slot: 'slot-3', afterAt: 100, timeoutMs: 20 });
  assert.equal(historicalReceipt.source, 'storage-envelope');

  const fallback = makeSaveHarness({
    events: [{ type: 'save:error', slot: 'autosave', at: 120, reason: 'unrelated_failure' }],
    envelope: { fmt: 'spaceface-save-gz', savedAt: 'receipt' },
  });
  const receipt = await fallback.context.waitForPublicSave(fallback.page, { slot: 'slot-3', afterAt: 100, timeoutMs: 20 });
  assert.equal(receipt.source, 'storage-envelope');
  assert.equal(receipt.slot, 'slot-3');

  const failed = makeSaveHarness({ events: [{ type: 'save:error', slot: 'slot-3', at: 120, reason: 'write_failed' }] });
  await assert.rejects(
    failed.context.waitForPublicSave(failed.page, { slot: 'slot-3', afterAt: 100, timeoutMs: 20 }),
    /Public Save failed: write_failed/,
  );
});
