import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('browser readiness retries a failed catalog fetch through its public helper', async () => {
  const payload = JSON.parse(readFileSync(
    new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url), 'utf8'));
  const previousProcess = globalThis.process;
  const previousFetch = globalThis.fetch;
  let calls = 0;
  let rejectInitial;
  let rejectRetry;
  globalThis.__SPACEFACE_PRODUCTION__ = false;
  globalThis.process = undefined;
  globalThis.window = { location: { search: '?locale=es-ES' } };
  globalThis.self = { location: { href: 'https://game.example/workers/wholeSimBrowserWorker.js' } };
  globalThis.fetch = () => {
    calls += 1;
    if (calls === 1) return new Promise((resolve) => { rejectInitial = resolve; });
    if (calls === 2) return new Promise((resolve) => { rejectRetry = resolve; });
    return Promise.resolve({ ok: true, json: async () => payload });
  };

  const modulePromise = import(new URL('../src/localization/gameLocalization.js?retry-sidecar', import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1, 'module evaluation waits for the first catalog request');
  rejectInitial({ ok: false, status: 503 });

  const localization = await modulePromise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2, 'the module keeps its public readiness helper usable after the first failure');
  assert.equal(localization.localizeText('Continue'), 'Continue',
    'early text remains the complete English source fallback without probing the unloaded catalog');
  const failedReadiness = localization.ensureLocalizationReady();
  rejectRetry({ ok: false, status: 503 });
  await assert.rejects(failedReadiness, /request failed \(503\)/);

  assert.equal(await localization.ensureLocalizationReady(), true);
  assert.equal(calls, 3, 'a later helper call retries the failed fetch');
  assert.equal(localization.LANGUAGE_OPTIONS[0].id, 'en-US');
  assert.equal(localization.currentGameLocale(), 'es-ES');
  assert.equal(localization.localizeText('Continue'), 'Continuar');
  globalThis.process = previousProcess;
  globalThis.fetch = previousFetch;
});
