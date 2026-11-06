import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('browser readiness retries failed bark translations before enabling non-English lookup', async () => {
  const payload = JSON.parse(readFileSync(
    new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url), 'utf8'));
  const barkPayload = JSON.parse(readFileSync(
    new URL('../src/localization/barks.generated.json', import.meta.url), 'utf8'));
  const previousProcess = globalThis.process;
  const previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  let englishCalls = 0;
  let barkCalls = 0;
  let rejectInitialBarks;
  let rejectRetryBarks;
  globalThis.__SPACEFACE_PRODUCTION__ = false;
  globalThis.process = undefined;
  globalThis.window = { location: { search: '?locale=es-ES' } };
  globalThis.document = { baseURI: 'https://game.example/' };
  globalThis.self = { location: { href: 'https://game.example/workers/wholeSimBrowserWorker.js' } };
  globalThis.fetch = (url) => {
    if (String(url).endsWith('/src/localization/barks.generated.json')) {
      barkCalls += 1;
      if (barkCalls === 1) return new Promise((resolve) => { rejectInitialBarks = resolve; });
      if (barkCalls === 2) return new Promise((resolve) => { rejectRetryBarks = resolve; });
      return Promise.resolve({ ok: true, json: async () => barkPayload });
    }
    englishCalls += 1;
    return Promise.resolve({ ok: true, json: async () => payload });
  };

  const modulePromise = import(new URL('../src/localization/gameLocalization.js?retry-sidecar', import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(englishCalls, 1, 'English inventory fetch starts during module evaluation');
  assert.equal(barkCalls, 1, 'localized bark table fetch starts during module evaluation');
  rejectInitialBarks({ ok: false, status: 503 });

  const localization = await modulePromise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(barkCalls, 2, 'the public readiness helper retries the failed bark fetch');
  assert.equal(localization.localizeText('Continue'), 'Continue',
    'ordinary loading/error copy keeps the source fallback while bark translations retry');
  const pipeline = await import('../src/localization/pipeline.js');
  assert.throws(() => pipeline.buildTranslatedCatalog('es-ES'), /Bark translations are not ready/,
    'direct translated-catalog access cannot report a partial catalog as ready');
  const failedReadiness = localization.ensureLocalizationReady();
  rejectRetryBarks({ ok: false, status: 503 });
  await assert.rejects(failedReadiness, /request failed \(503\)/);

  assert.equal(await localization.ensureLocalizationReady(), true);
  assert.equal(barkCalls, 3, 'a later helper call retries the failed bark fetch');
  assert.equal(englishCalls, 1, 'the already-ready English catalog is not fetched again');
  assert.equal(localization.LANGUAGE_OPTIONS[0].id, 'en-US');
  assert.equal(localization.currentGameLocale(), 'es-ES');
  assert.equal(localization.localizeText('Continue'), 'Continuar');
  assert.match(localization.localizeText(
    'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.'), /Patrulla Concord/);
  localization.setGameLocale('en-US');
  assert.equal(localization.localizeText(
    'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.'),
  'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.');
  localization.setGameLocale('es-ES');
  assert.match(localization.localizeText(
    'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.'), /Patrulla Concord/);
  globalThis.process = previousProcess;
  globalThis.fetch = previousFetch;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
});
