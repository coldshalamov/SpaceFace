import test from 'node:test';
import assert from 'node:assert/strict';

// Regression for cee64972e1: a top-level await in the worker realm delays
// wholeSimBrowserWorker's self.onmessage past the init directive, so the sim lane never
// replies and boot falls back to the in-process sim after the 45 s init timeout.
test('worker realm import of the localization graph does not wait on sidecar fetches', async () => {
  const previousProcess = globalThis.process;
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.__SPACEFACE_PRODUCTION__ = false;
  globalThis.process = undefined;
  delete globalThis.document;
  delete globalThis.window;
  globalThis.self = { location: { href: 'https://game.example/src/core/wholeSimBrowserWorker.js' } };
  globalThis.fetch = () => { calls += 1; return new Promise(() => {}); };
  try {
    let settled = false;
    const p = import(new URL('../src/localization/pipeline.js?worker-realm', import.meta.url))
      .then((m) => { settled = true; return m; });
    for (let i = 0; i < 5 && !settled; i++) await new Promise((r) => setImmediate(r));
    assert.equal(settled, true, 'pipeline.js finishes evaluating in a worker while its fetches are pending');
    const pipeline = await p;
    assert.equal(pipeline.isEnglishCatalogReady(), false);
    assert.equal(typeof pipeline.ensureEnglishCatalogLoaded, 'function');
    assert.equal(typeof pipeline.ensureBarkTranslationsLoaded, 'function');
  } finally {
    globalThis.process = previousProcess;
    globalThis.fetch = previousFetch;
  }
});

test('the sim worker awaits the catalogs inside its init directive', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url), 'utf8');
  const init = src.slice(src.indexOf("if (msg.kind === 'init')"), src.indexOf('const result = await init(msg);'));
  assert.match(init, /ensureEnglishCatalogLoaded\(\)/);
  assert.match(init, /ensureBarkTranslationsLoaded\(\)/);
  assert.match(init, /loadModelTruthCensus\(msg\.modelTruthCensusUrl\)/);
});
