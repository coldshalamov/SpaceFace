import test from 'node:test';
import assert from 'node:assert/strict';

test('file-backed Node worker shims use the local sidecar rather than browser fetch', async () => {
  let fetchCalls = 0;
  globalThis.window = {};
  globalThis.self = { location: { href: 'file:///workspace/workers/wholeSimBrowserWorker.js' } };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Node shim must not fetch the catalog over HTTP');
  };

  const localization = await import(new URL('../src/localization/gameLocalization.js?node-worker-shim', import.meta.url));
  assert.equal(await localization.ensureLocalizationReady(), true);
  assert.equal(fetchCalls, 0);
  assert.equal(localization.localizeText('Continue'), 'Continue');
  localization.setGameLocale('es-ES');
  assert.equal(localization.localizeText('Continue'), 'Continuar');
});
