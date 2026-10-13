import test from 'node:test';
import assert from 'node:assert/strict';

test('a footage encode the worker never answers is rejected after the timeout and forgotten', async (t) => {
  const posted = []; let worker;
  class FakeWorker { constructor() { worker = this; } postMessage(msg) { posted.push(msg); } terminate() {} }
  const saved = { Worker: globalThis.Worker, OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap };
  Object.assign(globalThis, { Worker: FakeWorker, OffscreenCanvas: class {}, createImageBitmap: async () => ({}) });
  t.after(() => Object.assign(globalThis, saved));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { footageEncoder, FOOTAGE_ENCODE_TIMEOUT_MS } = await import('../src/ui/screens/flightFootage.js?timeout');
  const encoder = footageEncoder(); assert.ok(encoder);
  const job = encoder.encode({}, 640, 360);
  t.mock.timers.tick(FOOTAGE_ENCODE_TIMEOUT_MS - 1);
  let settled = false; job.then(() => {}, () => {}).finally(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false);
  t.mock.timers.tick(1);
  await assert.rejects(job, /timed out/);
  worker.onmessage({ data: { id: posted[0].id, blob: 'late' } }); // late reply is ignored
  const next = encoder.encode({}, 640, 360);
  worker.onmessage({ data: { id: posted[1].id, blob: 'ok' } });
  assert.equal(await next, 'ok');
});
