import test from 'node:test';
import assert from 'node:assert/strict';

test('real worker entry receives init without fetching presentation localization inventories', async () => {
  const previousProcess = globalThis.process;
  const previousFetch = globalThis.fetch;
  const previousSelf = globalThis.self;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousProduction = globalThis.__SPACEFACE_PRODUCTION__;
  const posted = [];
  const requests = [];
  globalThis.__SPACEFACE_PRODUCTION__ = false;
  globalThis.process = undefined;
  delete globalThis.document;
  delete globalThis.window;
  globalThis.self = {
    location: { href: 'https://game.example/src/core/wholeSimBrowserWorker.js' },
    postMessage(message) { posted.push(message); },
  };
  globalThis.fetch = (url) => {
    requests.push(String(url));
    return new Promise(() => {});
  };

  try {
    await import(new URL('../src/core/wholeSimBrowserWorker.js?catalog-init-gate', import.meta.url));
    assert.equal(typeof globalThis.self.onmessage, 'function',
      'the complete worker import graph settles and installs its message handler');
    assert.deepEqual(posted.map((message) => message.kind), ['boot']);
    assert.equal(requests.length, 0, 'source-text dependencies do not fetch optional inventories at module evaluation');

    globalThis.self.onmessage({ data: {
      kind: 'init',
      modelTruthCensusUrl: 'https://game.example/src/data/modelTruthCensus.json',
    } });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(requests.length, 1, 'init waits only for the required census');
    assert.ok(requests.some((url) => url.endsWith('/src/data/modelTruthCensus.json')));
    assert.deepEqual(posted.map((message) => message.kind), ['boot'],
      'the worker does not announce ready until all init prerequisites resolve');
  } finally {
    globalThis.process = previousProcess;
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousProduction === undefined) delete globalThis.__SPACEFACE_PRODUCTION__;
    else globalThis.__SPACEFACE_PRODUCTION__ = previousProduction;
  }
});
