import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlbPrepasser } from '../src/render/glbPrepass.js';
import { createDecodeTaskBudget } from '../src/render/decodeTaskBudget.js';
import { runtimeWorkerUrl, RUNTIME_WORKERS } from '../src/render/runtimeWorkers.js';
import { createRenderPackageDigester } from '../src/render/renderPackageDigest.js';
import { enhanceMobileTouch } from '../src/systems/mobile/bridge.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function clock() {
  let id = 0; const timers = new Map();
  return { timers, setTimer(fn, ms) { timers.set(++id, { fn, ms }); return id; },
    clearTimer(key) { timers.delete(key); },
    fire(ms) { for (const [key, timer] of [...timers]) if (timer.ms === ms && timers.delete(key)) timer.fn(); } };
}
function workers() {
  const all = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.handlers = {}; all.push(this); }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    postMessage(data, transfer) { this.sent = structuredClone(data, { transfer }); }
    emit(type, data) { this.handlers[type]?.({ data, preventDefault() {} }); }
    answer() {
      const data = structuredClone({ ...this.sent, ok: true, decoded: [], images: [] }, { transfer: [this.sent.glb] });
      this.emit('message', data);
    }
    terminate() { this.terminated = true; }
  }
  return { all, Worker };
}
const bytes = () => Uint8Array.from([2, 4, 6, 8]).buffer;
function pool(options = {}) {
  const w = workers(), c = clock();
  const p = createGlbPrepasser({ WorkerImpl: w.Worker, workerUrl: 'prepass.js', cores: 4,
    timeoutMs: 20, queueTimeoutMs: 120, setTimer: c.setTimer, clearTimer: c.clearTimer,
    budget: createDecodeTaskBudget(2), ...options });
  return { p, ...w, ...c };
}

test('workers resolve correctly in raw, split retail, path-prefix and Electron routes', () => {
  for (const spec of RUNTIME_WORKERS) {
    const raw = runtimeWorkerUrl(spec.id, 'https://game.test/src/render/host.js', { production: false });
    assert.equal(raw, `https://game.test/${spec.source}`);
    assert.equal(runtimeWorkerUrl(spec.id, 'https://game.test/chunks/a.js', {
      production: true, documentBase: 'https://game.test/demo/index.html',
    }), `https://game.test/demo/${spec.output}`);
    assert.equal(runtimeWorkerUrl(spec.id, 'file:///app/chunks/a.js', {
      production: true, documentBase: 'file:///app/index.html',
    }), `file:///app/${spec.output}`);
  }
  assert.throws(() => runtimeWorkerUrl('unknown', 'https://game.test/'), RangeError);
});

test('one requested GLB creates one worker, even on a high-core host', async () => {
  const f = pool({ cores: 32 }), input = bytes(), result = f.p.prepass(input);
  await flush(); assert.equal(f.all.length, 1); assert.equal(input.byteLength, 0);
  f.all[0].answer(); assert.deepEqual(new Uint8Array((await result).glb), new Uint8Array([2, 4, 6, 8]));
  assert.equal(f.timers.size, 0); f.p.dispose();
});

test('waiting for a decoder token does not start the worker execution timeout', async () => {
  const budget = createDecodeTaskBudget(1), release = await budget.acquire();
  const f = pool({ budget }), input = bytes(), pending = f.p.prepass(input);
  await flush(); assert.equal(f.all[0].sent, undefined);
  assert.deepEqual([...f.timers.values()].map(t => t.ms), [120]);
  f.fire(20); assert.equal(input.byteLength, 4); assert.equal(f.all[0].terminated, undefined);
  release(); await flush(); assert.deepEqual([...f.timers.values()].map(t => t.ms), [20]);
  f.all[0].answer(); await pending; assert.equal(budget.inFlight, 0); f.p.dispose();
});

test('queue expiry returns intact bytes without retiring unrelated in-flight work', async () => {
  const budget = createDecodeTaskBudget(1), f = pool({ budget });
  const first = f.p.prepass(bytes()); await flush();
  const waitingBytes = bytes(), second = f.p.prepass(waitingBytes); await flush();
  f.fire(120); assert.equal((await second).glb, waitingBytes);
  assert.equal(waitingBytes.byteLength, 4); assert.equal(f.all[0].terminated, undefined);
  f.all[0].answer(); await first; await flush();
  assert.equal(budget.inFlight, 0); assert.equal(budget.queued, 0); f.p.dispose();
});

test('silent worker retirement releases all callers and transferred ownership once', async () => {
  const budget = createDecodeTaskBudget(1), f = pool({ budget });
  const input = bytes(), first = f.p.prepass(input); await flush();
  const queued = bytes(), second = f.p.prepass(queued); await flush();
  f.fire(20); assert.equal(await first, null); assert.equal((await second).glb, queued);
  await flush(); assert.ok(f.all.every(w => w.terminated));
  assert.equal(budget.inFlight, 0); assert.equal(budget.queued, 0); assert.equal(f.timers.size, 0);
  const last = bytes(); assert.equal((await f.p.prepass(last)).glb, last);
  f.p.dispose(); assert.equal(budget.inFlight, 0);
});

test('dispose during a pending token grant neither posts late work nor leaks the token', async () => {
  const budget = createDecodeTaskBudget(1), release = await budget.acquire(), f = pool({ budget });
  const input = bytes(), result = f.p.prepass(input); await flush();
  release(); f.p.dispose(); await flush(); assert.equal((await result).glb, input);
  assert.equal(f.all[0].sent, undefined); assert.equal(budget.inFlight, 0); assert.equal(budget.queued, 0);
});

test('error reply gives the original GLB back for stock parse; corrupt replies retire safely', async () => {
  const f = pool(), p = f.p.prepass(bytes()); await flush();
  const returned = f.all[0].sent.glb;
  f.all[0].emit('message', { id: f.all[0].sent.id, ok: false, glb: returned });
  assert.equal((await p).glb, returned);
  const lost = f.p.prepass(bytes()); await flush(); f.all[0].emit('messageerror');
  assert.equal(await lost, null); assert.equal(f.timers.size, 0);
});

test('digester messageerror terminates the worker and settles all zero-copy owners', async () => {
  const w = workers(), d = createRenderPackageDigester({ WorkerImpl: w.Worker, workerUrl: 'digest.js' });
  const first = new Uint8Array(bytes()), second = new Uint8Array(bytes());
  const pending = [d.sha256HexKeepingBytes(first), d.sha256HexKeepingBytes(second)];
  assert.equal(first.byteLength, 0); assert.equal(second.byteLength, 0);
  w.all[0].emit('messageerror');
  assert.deepEqual(await Promise.all(pending), [{ hex: null, bytes: null }, { hex: null, bytes: null }]);
  assert.equal(w.all[0].terminated, true); assert.equal(d.usingWorker, false);
  assert.match(await d.sha256Hex(new Uint8Array(bytes())), /^[0-9a-f]{64}$/); d.dispose();
});

function touchHost({ coarse = false, points = 0, legacy = false, enabled = null } = {}) {
  const handlers = new Map();
  const win = { innerWidth: 390, innerHeight: 844, navigator: { maxTouchPoints: points },
    matchMedia: () => ({ matches: coarse }),
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); } };
  if (legacy) win.ontouchstart = null;
  const config = { enabled }, state = { settings: { controls: { touch: config } } };
  const doc = { body: {}, documentElement: { dataset: {} } };
  const touch = { active: false, axes: {}, _btnHeld: {}, tick() {}, _clearTouchState() {} };
  enhanceMobileTouch(touch, { state }, { win, doc, mountView: () => ({ root: {}, destroy() {} }) });
  touch.autoDetect(); return { touch, config, handlers, win, doc };
}

test('coarse WebKit Touch Events hosts do not require a nonzero maxTouchPoints', () => {
  const f = touchHost({ coarse: true, legacy: true });
  assert.equal(f.touch.active, true); assert.equal(f.doc.documentElement.dataset.sfMobile, '1'); f.touch.destroy();
});

test('actual touch discovers controls despite incomplete hints, and survives rotation', () => {
  const f = touchHost(); assert.equal(f.touch.active, false);
  f.handlers.get('pointerdown')({ pointerType: 'mouse' }); assert.equal(f.touch.active, false);
  f.handlers.get('pointerdown')({ pointerType: 'touch' }); assert.equal(f.touch.active, true);
  assert.equal(f.handlers.size, 0); f.win.innerWidth = 844; f.win.innerHeight = 390;
  f.touch.autoDetect(); assert.equal(f.touch.active, true); f.touch.destroy();
});

test('fine-pointer desktops stay desktop; touch discovery respects explicit opt-out and disposal', () => {
  const f = touchHost({ legacy: true, points: 5 }); assert.equal(f.touch.active, false);
  f.touch.persistEnabled(false); assert.equal(f.handlers.size, 0); assert.equal(f.touch.active, false);
  f.touch.persistEnabled(null); assert.equal(f.handlers.size, 2);
  f.touch.setEnabled(false); assert.equal(f.handlers.size, 0);
  const optedOut = touchHost({ coarse: true, points: 5, enabled: false });
  assert.equal(optedOut.touch.active, false); assert.equal(optedOut.handlers.size, 0);
});

test('Touch Events discovery is passive, scoped to an actual contact, and installed only once', () => {
  const f = touchHost(); f.touch.autoDetect(); assert.equal(f.handlers.size, 2);
  f.handlers.get('touchstart')({ type: 'touchstart', touches: [] }); assert.equal(f.touch.active, false);
  f.handlers.get('touchstart')({ type: 'touchstart', touches: [{}] }); assert.equal(f.touch.active, true);
  assert.equal(f.handlers.size, 0); f.touch.destroy();
});
