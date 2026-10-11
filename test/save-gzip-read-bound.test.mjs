import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  decodeSaveEnvelopeText,
  restorePrepareSaveJsonAsync,
  SAVE_GZIP_FORMAT,
  SAVE_WORKER_SOURCE,
  SAVE_WRITE_MAX_BYTES,
} from '../src/save/saveWorker.js';

function compressed(text) {
  return JSON.stringify({ fmt: SAVE_GZIP_FORMAT, gz: 1, version: 1,
    payload: gzipSync(text).toString('base64') });
}

function blobWorkerApi(Decompression = globalThis.DecompressionStream) {
  const self = { addEventListener() {}, postMessage() {} };
  return Function('self', 'DecompressionStream', SAVE_WORKER_SOURCE
    + '\nreturn { decodeSaveEnvelopeText, restorePrepareSaveJsonAsync };')(self, Decompression);
}

for (const [name, api] of [['module', { decodeSaveEnvelopeText, restorePrepareSaveJsonAsync }],
  ['browser Blob worker', blobWorkerApi()]]) {
  test(`${name}: a tiny compressed save cannot expand beyond the import byte ceiling`, async () => {
    const text = JSON.stringify({ fmt: 'spaceface-save', version: 1,
      data: { entities: { player: { type: 'ship' } }, padding: 'x'.repeat(SAVE_WRITE_MAX_BYTES) } });
    const raw = compressed(text);
    assert.ok(raw.length < 20_000, 'the stored wrapper passes the existing raw-string limit');
    const decoded = await api.decodeSaveEnvelopeText(raw);
    assert.equal(decoded.ok, false);
    assert.equal(decoded.reason, 'import_too_large');
    assert.equal((await api.restorePrepareSaveJsonAsync(raw, 1)).reason, 'import_too_large');
  });

  test(`${name}: decoded UTF-8 bytes, rather than string length, enforce the ceiling`, async () => {
    const decoded = await api.decodeSaveEnvelopeText(compressed('界'.repeat(SAVE_WRITE_MAX_BYTES / 3 + 1)));
    assert.equal(decoded.ok, false);
    assert.equal(decoded.reason, 'import_too_large');
  });

  test(`${name}: valid Unicode and boundary-sized saves remain readable`, async () => {
    const text = JSON.stringify({ fmt: 'spaceface-save', version: 1,
      data: { entities: { player: { type: 'ship' } }, name: '界 🚀' } });
    assert.equal((await api.decodeSaveEnvelopeText(compressed(text))).text, text);
    assert.equal((await api.restorePrepareSaveJsonAsync(compressed(text), 1)).ok, true);
    const boundary = 'x'.repeat(SAVE_WRITE_MAX_BYTES);
    assert.equal((await api.decodeSaveEnvelopeText(compressed(boundary))).text.length, boundary.length);
    assert.equal((await api.decodeSaveEnvelopeText('legacy plain save')).text, 'legacy plain save');
    assert.equal((await api.decodeSaveEnvelopeText(compressed(text).replace(/"payload":"[^"]*"/, '"payload":"invalid"'))).reason,
      'gz_decode_failed');
  });
}

test('browser Blob worker cancels decompression at the byte ceiling instead of consuming the tail', async () => {
  let pulls = 0;
  let cancelled = false;
  const chunk = new Uint8Array(4 * 1024 * 1024);
  class ExpandingStream {
    constructor() {
      this.writable = new WritableStream();
      this.readable = new ReadableStream({
        pull(controller) {
          if (pulls >= 6) { controller.close(); return; }
          pulls++;
          controller.enqueue(chunk);
        },
        cancel() { cancelled = true; },
      });
    }
  }
  const decoded = await blobWorkerApi(ExpandingStream).decodeSaveEnvelopeText(compressed('small'));
  assert.equal(decoded.reason, 'import_too_large');
  assert.equal(cancelled, true);
  assert.ok(pulls <= 5, `only the bounded prefix is read, observed ${pulls} chunks`);
});
