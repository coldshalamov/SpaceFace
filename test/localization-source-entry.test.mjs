import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate } from '../src/localization/runtime.js';

test('cold English source entry fetches no inventories while full keyed entry preserves every key', async () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url)));
  const barks = JSON.parse(readFileSync(new URL('../src/localization/barks.generated.json', import.meta.url)));
  const saved = Object.fromEntries(['process', 'fetch', 'window', 'document', 'self', '__SPACEFACE_PRODUCTION__']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const requests = [];
  const pending = new Map();
  Object.assign(globalThis, {
    process: undefined, __SPACEFACE_PRODUCTION__: false,
    window: { location: { search: '' } }, document: { baseURI: 'https://game.example/' },
    self: { location: { href: 'https://game.example/' } },
    fetch(url) {
      const key = String(url); requests.push(key);
      return new Promise(resolve => pending.set(key, resolve));
    },
  });
  try {
    const source = await import('../src/localization/sourceText.js');
    assert.equal(await source.ensureLocaleReady('en-US'), true);
    assert.equal(source.localizeText('Hello {name}', { name: 'pilot' }), 'Hello pilot');
    assert.equal(source.LANGUAGE_OPTIONS.filter(row => source.SHIPPED_LOCALES.includes(row.id)).length, 5);
    assert.match(source.LANGUAGE_OPTIONS[1].label, /machine preview/);
    assert.deepEqual(requests, [], 'source text, default readiness and honest picker labels need no inventory');

    const compatibilityPromise = import('../src/localization/gameLocalization.js');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 2, 'only explicit keyed compatibility starts English and bark requests');
    assert.equal(source.localizeText('Save {slot}', { slot: 'quick' }), 'Save quick');
    for (const [url, resolve] of pending) resolve({ ok: true,
      json: async () => url.endsWith('barks.generated.json') ? barks : catalog });
    const compatibility = await compatibilityPromise;
    assert.equal(compatibility.gameLocalization, source.gameLocalization, 'both entries share the same locale runtime');
    for (const [key, message] of Object.entries(catalog.messages)) {
      assert.equal(compatibility.gameLocalization.t(key, { name: 'pilot', count: 3 }),
        interpolate(message, { name: 'pilot', count: 3 }), key);
    }
    await source.ensureLocaleReady('es-ES');
    source.setGameLocale('es-ES');
    assert.equal(compatibility.currentGameLocale(), 'es-ES');
    assert.equal(source.localizeText('Continue'), 'Continuar');
    source.setGameLocale('en-US');
    assert.equal(source.localizeText('Continue'), 'Continue');
    assert.equal(requests.length, 2, 'prepared language changes reuse the existing full catalog');
    const { READINESS } = await import('../src/localization/catalogs/readiness.generated.js');
    assert.equal(READINESS.inventoryDigest, catalog.inventoryDigest);
    for (const [locale, row] of Object.entries(READINESS.locales)) {
      assert.deepEqual(compatibility.localeReadiness(locale), row, 'picker metadata has canonical exact coverage');
    }
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
