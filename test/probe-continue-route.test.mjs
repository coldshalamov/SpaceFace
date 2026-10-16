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
  assert.match(source, /report\.acceptance\.continue = 'passed'/);
  assert.match(source, /report\.passed = true/);
  assert.ok(source.indexOf("report.acceptance.continue = 'passed'") < source.indexOf('report.passed = true'),
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
  const end = source.indexOf('\nfunction installStartupObserver', start);
  assert.ok(start >= 0 && end > start, 'found Continue page-error guard in candidate');
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

test('save receipt matches the selected slot and ignores historical or autosave receipts', async () => {
  const { context, page } = makeSaveHarness({ events: [
    { type: 'save:completed', slot: 'slot-2', at: 20 },
    { type: 'save:completed', slot: 'slot-1', at: 120 },
  ] });
  const receipt = await context.waitForPublicSave(page, { slot: 'slot-1', afterAt: 100, timeoutMs: 20 });
  assert.equal(receipt.source, 'save:completed');
  assert.equal(receipt.slot, 'slot-1');
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

test('bus-free storage envelope is a read-only save receipt and a new selected-slot error fails', async () => {
  const historical = makeSaveHarness({
    events: [{ type: 'save:error', slot: 'slot-3', at: 20, reason: 'historical_failure' }],
    envelope: { fmt: 'spaceface-save-gz', savedAt: 'receipt' },
  });
  const historicalReceipt = await historical.context.waitForPublicSave(historical.page,
    { slot: 'slot-3', afterAt: 100, timeoutMs: 20 });
  assert.equal(historicalReceipt.source, 'storage-envelope');

  const fallback = makeSaveHarness({ envelope: { fmt: 'spaceface-save-gz', savedAt: 'receipt' } });
  const receipt = await fallback.context.waitForPublicSave(fallback.page, { slot: 'slot-3', afterAt: 100, timeoutMs: 20 });
  assert.equal(receipt.source, 'storage-envelope');
  assert.equal(receipt.slot, 'slot-3');

  const failed = makeSaveHarness({ events: [{ type: 'save:error', slot: 'slot-3', at: 120, reason: 'write_failed' }] });
  await assert.rejects(
    failed.context.waitForPublicSave(failed.page, { slot: 'slot-3', afterAt: 100, timeoutMs: 20 }),
    /Public Save failed: write_failed/,
  );
});
