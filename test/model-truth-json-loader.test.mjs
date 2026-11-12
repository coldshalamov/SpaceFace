import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadModelTruthCensus,
  modelTruthCensus,
  modelTruthRows,
  modelTruthRow,
} from '../src/data/modelTruth.js';

test('Node import initializes the complete canonical census before synchronous consumers run', async () => {
  const expected = JSON.parse(await readFile(new URL('../src/data/modelTruthCensus.json', import.meta.url), 'utf8'));
  assert.deepEqual(modelTruthCensus(), expected);
  assert.equal(modelTruthRows().length, expected.rows.length);
  assert.equal(modelTruthRow('place_station_trade_hub')?.id, 'place_station_trade_hub');
});

test('model truth census loading is memoized and keeps the synchronous getter object stable', async () => {
  const first = loadModelTruthCensus();
  const second = loadModelTruthCensus(new URL('../src/data/modelTruthCensus.json', import.meta.url));
  assert.equal(first, second);
  const loaded = await first;
  assert.equal(loaded, modelTruthCensus());
});

test('browser census loading times out stalled headers and body, then retries', async (t) => {
  const nodeProcess = globalThis.process;
  let browserCensus;
  try {
    globalThis.process = undefined;
    browserCensus = await import('../src/data/modelTruth.js?browser-deadline');
  } finally {
    globalThis.process = nodeProcess;
  }

  const deadlines = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    assert.equal(ms, 15_000);
    const controller = new AbortController();
    deadlines.push(controller);
    return controller.signal;
  });
  const assetUrl = 'https://game.example/modelTruthCensus.json';
  let requests = 0;
  let readingBody = false;
  t.mock.method(globalThis, 'fetch', (url, { signal } = {}) => {
    assert.equal(url, assetUrl);
    assert.equal(signal, deadlines.at(-1)?.signal);
    requests += 1;
    const stall = () => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    if (requests === 1) return stall();
    if (requests === 2) return Promise.resolve({
      ok: true,
      text() {
        readingBody = true;
        return stall();
      },
    });
    return Promise.resolve({ ok: true, text: async () => '{"rows":[{"id":"test_body"}]}' });
  });
  const expire = (controller) => controller.abort(new DOMException('Deadline elapsed', 'TimeoutError'));

  const headers = browserCensus.loadModelTruthCensus(assetUrl);
  assert.equal(browserCensus.loadModelTruthCensus(assetUrl), headers);
  assert.equal(requests, 1);
  assert.equal(deadlines.length, 1);
  expire(deadlines[0]);
  await assert.rejects(headers, /Model truth census download timed out/);
  assert.equal(browserCensus.isModelTruthCensusLoaded(), false);

  const body = browserCensus.loadModelTruthCensus(assetUrl);
  await Promise.resolve();
  assert.equal(readingBody, true);
  expire(deadlines[1]);
  await assert.rejects(body, /Model truth census download timed out/);
  assert.equal(browserCensus.isModelTruthCensusLoaded(), false);

  const retry = browserCensus.loadModelTruthCensus(assetUrl);
  assert.equal(await retry, browserCensus.modelTruthCensus());
  assert.equal(browserCensus.modelTruthRow('test_body')?.id, 'test_body');
  assert.equal(browserCensus.loadModelTruthCensus(assetUrl), retry);
  assert.equal(requests, 3);
});
