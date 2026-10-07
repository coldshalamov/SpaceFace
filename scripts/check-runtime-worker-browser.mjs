// Isolated real-Worker integration test; not a replacement for the full-game launch probe.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright';
const url = new URL(process.env.MOBILE_PROBE_URL || 'http://127.0.0.1:8765/');
const engine = process.env.MOBILE_PROBE_ENGINE || 'webkit';
const out = `.devshots/mobile-workers/${engine}`;
await mkdir(out, { recursive: true });
const browser = await ({ chromium, webkit }[engine]).launch();
try {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  // Test-only same-origin empty document. Production game acceptance never routes or mocks assets.
  await page.route('**/__worker_contract__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker contract fixture</title>' }));
  await page.goto(new URL('__worker_contract__', url).href);
  const result = await page.evaluate(async base => {
    const roundTrip = (name, type, message, transfer) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(`workers/${name}`, base), { type });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker response timeout')); }, 15000);
      const done = (fn, value) => { clearTimeout(timer); worker.terminate(); fn(value); };
      worker.onmessage = event => done(resolve, event.data);
      worker.onerror = event => { event.preventDefault(); done(reject, new Error(event.message)); };
      worker.onmessageerror = () => done(reject, new Error('Unreadable worker reply'));
      worker.postMessage(message, transfer);
    });
    const input = new TextEncoder().encode('SpaceFace mobile worker contract');
    const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))].map(v => v.toString(16).padStart(2, '0')).join('');
    const digest = await roundTrip('renderPackageDigestWorker.js', 'classic', { id: 7, buffer: input.buffer, keep: true }, [input.buffer]);
    const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}  ');
    const length = Math.ceil(json.byteLength / 4) * 4;
    const glb = new ArrayBuffer(20 + length), view = new DataView(glb);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(glb, 20).fill(32); new Uint8Array(glb, 20, json.byteLength).set(json);
    const expectedGlb = [...new Uint8Array(glb)];
    const prepass = await roundTrip('glbPrepassWorker.js', 'module', { id: 9, glb }, [glb]);
    return { expected, hex: digest.hex, returnedText: new TextDecoder().decode(digest.buffer), detached: input.byteLength === 0 && glb.byteLength === 0,
      prepassOk: prepass.ok, expectedGlb, returnedGlb: [...new Uint8Array(prepass.glb)],
      capabilities: { points: navigator.maxTouchPoints ?? null, coarse: matchMedia('(pointer: coarse)').matches, touchEvents: 'ontouchstart' in window } };
  }, url.href);
  assert.equal(result.hex, result.expected); assert.equal(result.returnedText, 'SpaceFace mobile worker contract');
  assert.equal(result.detached, true); assert.equal(result.prepassOk, true); assert.deepEqual(result.returnedGlb, result.expectedGlb);
  await writeFile(`${out}/report.json`, JSON.stringify({ engine, passed: true, ...result }, null, 2));
  console.log(JSON.stringify({ engine, workerRoundTrips: 'PASS', capabilities: result.capabilities }));
} finally { await browser.close(); }
