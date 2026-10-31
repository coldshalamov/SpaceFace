import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { hashEncodedTape } from '../src/sim/titleAttractTape.js';
import {
  createTitleAttractTapeRequest,
  resolveTitleAttractTapeUrl,
} from '../src/render/titleAttractStage.js';

const tape = JSON.parse(readFileSync(new URL('../src/sim/titleAttractTapeData.json', import.meta.url), 'utf8'));

test('title tape URL resolves to the source sidecar and release-pinned retail path', () => {
  assert.equal(resolveTitleAttractTapeUrl({
    production: false,
    moduleUrl: 'http://localhost:4173/src/render/titleAttractStage.js',
  }), 'http://localhost:4173/src/sim/titleAttractTapeData.json');
  assert.equal(resolveTitleAttractTapeUrl({
    production: true,
    moduleUrl: 'https://game.example/assets/titleAttractStage-abc.js',
    documentBase: 'https://game.example/',
    releaseBase: '/releases/build-123/',
  }), 'https://game.example/releases/build-123/src/sim/titleAttractTapeData.json');
});

test('title tape request is shared, keeps identical encoded data, and retries after fetch failure', async () => {
  let calls = 0;
  let fail = true;
  const request = createTitleAttractTapeRequest({
    url: 'https://game.example/releases/build-123/src/sim/titleAttractTapeData.json',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://game.example/releases/build-123/src/sim/titleAttractTapeData.json');
      assert.equal(options.credentials, 'same-origin');
      assert.ok(options.signal instanceof AbortSignal, 'request has a bounded abort signal');
      if (fail) return { ok: false, status: 503 };
      return { ok: true, async json() { return tape; } };
    },
  });

  await assert.rejects(request(), /Title attract tape request failed \(503\)/);
  fail = false;
  const first = request();
  const second = request();
  assert.strictEqual(first, second, 'concurrent title stage requests share one load');
  const loaded = await first;
  assert.equal(calls, 2, 'the failed request was retried once, then cached');
  assert.equal(hashEncodedTape(loaded), hashEncodedTape(tape), 'the fetched payload retains the exact baked tape');
  assert.strictEqual(await request(), loaded, 'successful data stays cached for later title-stage builds');
  assert.equal(calls, 2);
});

test('timeout abort clears the request so a later title-stage attempt can retry', async (t) => {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    t.skip('AbortSignal.timeout is unavailable in this runtime');
    return;
  }
  let calls = 0;
  const request = createTitleAttractTapeRequest({
    url: 'https://game.example/titleAttractTapeData.json',
    timeoutMs: 1,
    fetchImpl: async (_url, { signal }) => {
      calls++;
      if (calls === 1) {
        await new Promise((resolve, reject) => {
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return { ok: true, async json() { return tape; } };
    },
  });
  await assert.rejects(request());
  assert.strictEqual(await request(), tape);
  assert.equal(calls, 2, 'the aborted attempt is discarded and a fresh request succeeds');
});
