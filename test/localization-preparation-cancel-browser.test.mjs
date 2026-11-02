import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';

test('cancelled cold Settings preparation never reapplies a non-English URL over accepted English', async () => {
  const english = JSON.parse(readFileSync(new URL('../src/localization/catalogs/en-US.generated.json', import.meta.url)));
  const barks = JSON.parse(readFileSync(new URL('../src/localization/barks.generated.json', import.meta.url)));
  const saved = Object.fromEntries(['process', 'fetch', 'window', 'document', 'self', '__SPACEFACE_PRODUCTION__']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const pendingFetches = new Map(), mutations = [];
  let lang = '';
  const html = { dataset: {}, get lang() { return lang; }, set lang(value) { lang = value; mutations.push(value); } };
  Object.assign(globalThis, {
    process: undefined, __SPACEFACE_PRODUCTION__: false,
    window: { location: { search: '?locale=es-ES' } },
    document: { baseURI: 'https://game.example/', documentElement: html,
      createTreeWalker() { assert.fail('preparation installed the localized DOM bridge'); } },
    self: { location: { href: 'https://game.example/' } },
    fetch(url) { return new Promise(resolve => pendingFetches.set(String(url), resolve)); },
  });
  try {
    const source = await import('../src/localization/sourceText.js');
    source.setGameLocale('en-US'); // accepted profile overrides the URL before preparation
    assert.equal(html.lang, 'en-US');
    assert.equal(pendingFetches.size, 0);
    const originalMutations = mutations.length;
    const file = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
    let action, hide;
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' && node.callee.name === 'rowSelect' && node.arguments[0]?.value === 'Language') {
        action = file.slice(node.arguments[3].start, node.arguments[3].end);
      }
      if (node.type === 'ObjectMethod' && node.key.name === 'onHide') hide = file.slice(node.start, node.end);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    }
    visit(parse(file, { sourceType: 'module' }));
    assert.ok(action && hide);
    const owner = { _set() { assert.fail('cancelled setting persisted'); }, _render() {} };
    const context = { refs: {}, ctx: { bus: { emit() {} } }, cue() {},
      ensureLocaleReady: source.ensureLocaleReady, setGameLocale: source.setGameLocale };
    const handler = runInNewContext(`(function(){return (${action});})`, context).call(owner);
    const preparation = handler('fr-FR');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingFetches.size, 2);
    runInNewContext(`({${hide}})`, context).onHide.call(owner);
    for (const [url, resolve] of pendingFetches) resolve({ ok: true,
      json: async () => url.endsWith('barks.generated.json') ? barks : english });
    await preparation;
    assert.equal(source.currentGameLocale(), 'en-US');
    assert.equal(html.lang, 'en-US');
    assert.equal(html.dataset.locale, 'en-US');
    assert.equal(mutations.length, originalMutations, 'async inventory preparation has no locale/document side effects');
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
