import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('cold browser import waits for the sidecar before synchronous language and text consumers exist', async () => {
  const payload = JSON.parse(readFileSync(
    new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url), 'utf8'));
  const barkPayload = JSON.parse(readFileSync(
    new URL('../src/localization/barks.generated.json', import.meta.url), 'utf8'));
  const previousProcess = globalThis.process;
  const previousFetch = globalThis.fetch;
  let calls = 0;
  const pendingFetches = new Map();
  const fetched = [];

  globalThis.__SPACEFACE_PRODUCTION__ = false;
  globalThis.process = undefined;
  globalThis.window = { location: { search: '?locale=es-ES' } };
  globalThis.self = {
    ...globalThis.window,
    location: { href: 'https://game.example/src/core/wholeSimBrowserWorker.js' },
  };
  globalThis.fetch = (url) => {
    calls += 1;
    const requestUrl = String(url);
    fetched.push(requestUrl);
    return new Promise((resolve) => { pendingFetches.set(requestUrl, resolve); });
  };

  let importSettled = false;
  const modulePromise = import(new URL('../src/localization/gameLocalization.js?cold-sidecar', import.meta.url))
    .then((module) => {
      importSettled = true;
      return module;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2, 'English and bark data requests begin while the localization dependency graph evaluates');
  assert.equal(importSettled, false, 'synchronous catalog consumers are not exposed before the fetch completes');
  assert.match(fetched[0], /src\/localization\/catalogs\/en-US\.generated\.json$/);
  assert.match(fetched[1], /src\/localization\/barks\.generated\.json$/);

  pendingFetches.get(fetched[0])({ ok: true, json: async () => payload });
  pendingFetches.get(fetched[1])({ ok: true, json: async () => barkPayload });
  const localization = await modulePromise;
  assert.equal(await localization.ensureLocalizationReady(), true);
  assert.equal(localization.LANGUAGE_OPTIONS[0].id, 'en-US');
  assert.equal(localization.currentGameLocale(), 'es-ES');
  assert.equal(localization.localizeText('Continue'), 'Continuar');
  assert.match(localization.localizeText(
    'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.'), /Patrulla Concord/);
  localization.setGameLocale('en-US');
  assert.equal(localization.localizeText('Continue'), 'Continue');
  globalThis.process = previousProcess;
  globalThis.fetch = previousFetch;
});
