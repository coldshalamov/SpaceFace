import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { resolveSimLaneFlags, createSimLaneRuntime } from '../src/core/simLaneMain.js';

test('ordinary game startup uses the worker simulation authority', () => {
  assert.equal(resolveSimLaneFlags('').lane, 'worker');
});
test('the in-process lane requires explicit escape-hatch selection', () => {
  assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
  assert.equal(resolveSimLaneFlags('?simLane=main').lane, 'main');
  const invalid = resolveSimLaneFlags('?simLane=invalid');
  assert.equal(invalid.lane, 'worker');
  assert.equal(invalid.warnings.length, 1);
});
test('query selection overrides a stored diagnostic preference', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, value: { getItem: key => key === 'sf.simLane' ? 'main' : null },
    });
    assert.equal(resolveSimLaneFlags('').lane, 'main');
    assert.equal(resolveSimLaneFlags('?simLane=main').lane, 'main');
    assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
  } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else delete globalThis.localStorage;
  }
});
test('an explicit main selection spawns no worker channel', () => {
  let channels = 0;
  assert.equal(createSimLaneRuntime({
    flags: resolveSimLaneFlags('?simLane=main'),
    channelFactory() { channels++; throw new Error('main-lane startup must not create a worker'); },
  }), null);
  assert.equal(channels, 0);
});

function createDefaultBrowserWorkerFixture(t) {
  const priorWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const workers = [];
  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listenerReady = false;
      this.delivered = [];
      this.dropped = [];
      this.replies = [];
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) {
      (this.listenerReady ? this.delivered : this.dropped).push(message);
    }
    emit(data) {
      this.replies.push(data);
      if (data?.kind === 'boot') this.listenerReady = true;
      this.onmessage?.({ data });
    }
    fail(message) { this.onerror?.({ message }); }
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true, writable: true, value: FakeWorker,
  });
  let lane = null;
  t.after(() => {
    lane?.close();
    if (priorWorker) Object.defineProperty(globalThis, 'Worker', priorWorker);
    else delete globalThis.Worker;
  });
  lane = createSimLaneRuntime({
    state: { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
      tick: 0, simTime: 0, accumulator: 0, timeScale: 1, ui: { screenStack: [] } },
    registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
  });
  assert.ok(lane, 'the default browser channel should create a worker lane');
  assert.equal(workers.length, 1);
  return { lane, worker: workers[0] };
}

test('default browser channel delivers init once, only after worker boot, with its original seq', async (t) => {
  const { lane, worker } = createDefaultBrowserWorkerFixture(t);
  const ready = lane.readyPromise;
  assert.deepEqual(worker.delivered, [], 'init waits for the worker listener handshake');
  assert.deepEqual(worker.dropped, [], 'init is never posted into the pre-listener window');

  worker.emit({ kind: 'boot' });
  worker.emit({ kind: 'boot' });
  assert.equal(worker.dropped.length, 0);
  assert.equal(worker.delivered.length, 1, 'the queued init is delivered exactly once');
  const init = worker.delivered[0];
  assert.equal(init.kind, 'init');
  assert.equal(worker.options.type, 'module');

  worker.emit({ kind: 'ready', seq: init.seq, stateTick: 0, spawnInfos: [], domainUpdates: [] });
  await ready;
  assert.equal(worker.delivered.filter((message) => message.kind === 'init').length, 1);
  const readyReplies = worker.replies.filter((message) => message.kind === 'ready');
  assert.equal(readyReplies.length, 1);
  assert.equal(readyReplies[0].seq, init.seq, 'ready is correlated to the queued init sequence');
});

test('closing before browser worker boot clears queued init and shutdown, then terminates', async (t) => {
  const { lane, worker } = createDefaultBrowserWorkerFixture(t);
  const readyRejected = assert.rejects(lane.readyPromise, /sim lane closed/);
  lane.close();
  await readyRejected;
  assert.deepEqual(worker.delivered, []);
  assert.deepEqual(worker.dropped, []);
  assert.equal(worker.terminated, true);
  worker.emit({ kind: 'boot' });
  assert.deepEqual(worker.delivered, [], 'a terminated channel must not flush its pre-boot queue');
});

test('browser worker error before boot rejects the existing init readiness promise', async (t) => {
  const { lane, worker } = createDefaultBrowserWorkerFixture(t);
  const readyRejected = assert.rejects(lane.readyPromise, /sim worker error: worker module failed/);
  worker.fail('worker module failed');
  await readyRejected;
  assert.deepEqual(worker.delivered, []);
  assert.deepEqual(worker.dropped, []);
  assert.equal(worker.terminated, true);
});

test('an injected simulation channel still receives init immediately without a browser boot event', async (t) => {
  const posts = [];
  let receive;
  const lane = createSimLaneRuntime({
    state: { entities: new Map(), entityList: [], settings: {}, meta: { seed: 1 },
      tick: 0, simTime: 0, accumulator: 0, timeScale: 1, ui: { screenStack: [] } },
    registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({
      post(message) { posts.push(message); },
      onMessage(handler) { receive = handler; },
      terminate() {},
    }),
  });
  t.after(() => lane.close());
  const init = posts[0];
  assert.equal(init.kind, 'init', 'injected/native adapters keep their immediate init contract');
  receive({ kind: 'ready', seq: init.seq, stateTick: 0, spawnInfos: [], domainUpdates: [] });
  await lane.readyPromise;
});
