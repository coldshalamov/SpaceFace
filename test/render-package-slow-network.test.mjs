import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createAsyncAdmission } from '../src/render/asyncAdmission.js';
import { fetchVerifiedRenderBytes } from '../src/render/renderPackageLoader.js';

// D188: fixed-time walls (per-fetch AbortSignal.timeout and the admission deadline) aborted
// flowing multi-megabyte render.glb downloads on handset-class networks and failed the boot
// closed. These tests pin the liveness contract: bytes on the wire re-arm every bound, silence
// still aborts.

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function streamingBody(chunks, { gapMs = 0, stallAfterChunks = Infinity } = {}, signal = null) {
  let index = 0;
  let source = null;
  const stream = new ReadableStream({
    start(controller) { source = controller; },
    async pull(controller) {
      if (index >= chunks.length) { controller.close(); return; }
      const chunk = chunks[index++];
      await delay(gapMs);
      if (index > stallAfterChunks) {
        // Simulate a wedged pipe: this pull never resolves. The abort signal below is what
        // unblocks it, exactly like a browser erroring the body stream on fetch abort.
        return new Promise(() => {});
      }
      controller.enqueue(new Uint8Array(chunk));
    },
  });
  // Real fetch implementations error the body stream when the request aborts; honor that.
  if (signal) {
    signal.addEventListener('abort', () => {
      try { source.error(signal.reason); } catch { /* already closed */ }
    });
  }
  return stream;
}

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function metadataFor(bytes) {
  return { assetId: 'fixture.ship', render: { uri: 'render.glb', sha256: sha256(bytes), bytes: bytes.byteLength } };
}

test('admission touch() re-arms the deadline while progress continues, silence still aborts', async () => {
  const admission = createAsyncAdmission({ label: 'test', timeoutMs: 60 });
  const started = Date.now();
  for (let beat = 0; beat < 5; beat++) {
    await delay(40);
    admission.touch();
    assert.equal(admission.signal.aborted, false, `admission must survive progress at beat ${beat}`);
  }
  const survivedMs = Date.now() - started;
  assert.ok(survivedMs > 200, 'touched admission outlived several original deadlines');
  admission.finish();
  admission.touch(); // no-op after finish: must not resurrect a timer that aborts later work
  await delay(120);
  assert.equal(admission.signal.aborted, false, 'finished admission stays inert under touch');

  const silent = createAsyncAdmission({ label: 'silent', timeoutMs: 50 });
  await new Promise((resolve, reject) => {
    silent.signal.addEventListener('abort', () => resolve());
    setTimeout(resolve, 500);
    silent.wait(Promise.resolve('never seen')).catch(() => {});
  });
  assert.equal(silent.signal.aborted, true, 'an untouched admission still hits its wall');
});

test('a flowing slow render.glb download completes although it outlives one stall bound', async () => {
  const chunkA = new Uint8Array(64).fill(1);
  const chunkB = new Uint8Array(64).fill(2);
  const chunkC = new Uint8Array(64).fill(3);
  const whole = new Uint8Array([...chunkA, ...chunkB, ...chunkC]);
  const progressCalls = [];
  const fetchImpl = async (url, init = {}) => ({
    ok: true,
    body: streamingBody([chunkA, chunkB, chunkC], { gapMs: 45 }, init.signal),
  });
  const bytes = await fetchVerifiedRenderBytes(
    fetchImpl, 'https://assets.example/pkg/render.glb', metadataFor(whole),
    (byteLength) => progressCalls.push(byteLength),
    { stallMs: 100 },
  );
  // Three 45 ms gaps: the 135 ms total transfer outlives the 100 ms bound; the flow finishes.
  assert.deepEqual([...bytes], [...whole]);
  assert.deepEqual(progressCalls, [64, 64, 64]);
});

test('a render.glb fetch that stops moving bytes aborts on the stall bound', async () => {
  const chunkA = new Uint8Array(32).fill(7);
  const whole = new Uint8Array(96).fill(7); // deliberately longer than what will arrive
  const fetchImpl = async (url, init = {}) => ({
    ok: true,
    body: streamingBody([chunkA, new Uint8Array(32).fill(8), new Uint8Array(32).fill(9)], {
      gapMs: 5,
      stallAfterChunks: 1,
    }, init.signal),
  });
  await assert.rejects(
    fetchVerifiedRenderBytes(fetchImpl, 'https://assets.example/pkg/render.glb', metadataFor(whole), null, { stallMs: 120 }),
    (error) => {
      assert.match(String(error && error.message), /stalled|abort/i);
      return true;
    },
  );
});

test('fetches without a streaming body keep the whole-read path and verify normally', async () => {
  const whole = new Uint8Array(128).fill(4);
  const fetchImpl = async (url) => ({ ok: true, body: null, arrayBuffer: async () => whole.buffer.slice(0) });
  const bytes = await fetchVerifiedRenderBytes(
    fetchImpl, 'https://assets.example/pkg/render.glb', metadataFor(whole), null, { stallMs: 200 },
  );
  assert.equal(bytes.byteLength, 128);
  assert.deepEqual([...bytes], [...whole]);
});
