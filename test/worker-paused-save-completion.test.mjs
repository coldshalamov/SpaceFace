import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc, laneSetMode, laneWriteSetting } from '../src/core/simLaneCommands.js';

function until(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`timed out waiting for ${label}`));
      setTimeout(poll, 5);
    };
    poll();
  });
}

test('a failed paused save drain reports once without retrying still-pending durable data', async () => {
  const source = readFileSync(new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url), 'utf8');
  const start = source.indexOf('function requestAsyncSaveReply()');
  const end = source.indexOf('\nfunction scheduleLocalClock()', start);
  const errors = [];
  let attempts = 0, pendingChecks = 0;
  const scope = {
    chain: Promise.resolve(), localClock: { enabled: true, stopped: false, active: false,
      scale: 0, saveReplyQueued: false, lifecycleGeneration: 7 },
    // Bound a broken retry loop in the fixture; production still has pending data after
    // a permanent failure. The assertion rejects any second attempt.
    hasPendingDurable: () => ++pendingChecks < 5,
    runLocalClockTick: async () => { attempts++; throw new Error('fixture durable publication failed'); },
    self: { postMessage: message => errors.push(message) },
  };
  runInNewContext(`${source.slice(start, end)}\nrequestAsyncSaveReply();`, scope);
  for (let i = 0; i < 8; i++) await scope.chain;
  assert.equal(attempts, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /durable publication failed/);
  assert.equal(scope.localClock.saveReplyQueued, false);
  assert.equal(pendingChecks, 1, 'failure does not poll pending data to manufacture another wake');
});

for (const [failWrite, delayedAck, raceSecond] of [[false, false, false], [true, false, false], [false, true, false], [false, false, true]]) {
  test(`paused browser worker publishes real asynchronous save ${failWrite ? 'failure' : 'bytes and completion'}${delayedAck ? ' behind a delayed ACK' : ''}${raceSecond ? ' racing a second completion' : ''} without another command`, { timeout: 30000 }, async () => {
    const previousStorage = globalThis.localStorage;
    const rows = new Map();
    globalThis.localStorage = {
      getItem: key => rows.get(key) ?? null,
      setItem: (key, value) => rows.set(String(key), String(value)),
      removeItem: key => rows.delete(key), key: index => [...rows.keys()][index] ?? null,
      get length() { return rows.size; },
    };
    const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
    const saveModule = new URL('../src/save/saveSystem.js', import.meta.url).href;
    const source = `
      import { parentPort, workerData } from 'node:worker_threads';
      const { save } = await import(${JSON.stringify(saveModule)});
      if (workerData.failWrite) save._writeSlot = () => ({ ok: false, reason: 'quota', bytes: 0 });
      const saveAsync = save.saveAsync;
      let saveOwner, raced = false;
      save.saveAsync = function (...args) {
        saveOwner = this;
        const result = saveAsync.apply(this, args);
        Promise.resolve(result).then(ok => parentPort.postMessage({ kind: 'fixture-save-settled', ok,
          hasBytes: !!globalThis.localStorage?.getItem('sf.save.quick') }));
        return result;
      };
      globalThis.self = globalThis;
      globalThis.postMessage = (message, transfer) => {
        parentPort.postMessage(message, transfer || []);
        if (workerData.raceSecond && !raced && message.events?.some(event => event.t === 'save:completed')) {
          raced = true;
          // Land a second real write in the publication microtask window, before the
          // first async wake's finally can clear its coalescing flag.
          queueMicrotask(() => saveOwner.save('secondary', { reason: 'manual' }));
        }
      };
      const pending = [];
      parentPort.on('message', data => typeof self.onmessage === 'function' ? self.onmessage({data}) : pending.push(data));
      await import(${JSON.stringify(entry)});
      for (const data of pending) self.onmessage({data});
    `;
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), { workerData: { failWrite, raceSecond } });
    const replies = [], posts = [], receipts = [];
    let receive, lane, heldStart;
    const state = createGameState(4242);
    state.timeScale = 0;
    const bus = createBus();
    for (const type of ['save:started', 'save:completed', 'save:error']) {
      bus.on(type, payload => receipts.push({ type, payload, bytes: rows.get(`sf.save.${payload.slot}`) }));
    }
    try {
      worker.on('message', message => {
        replies.push(message);
        if (delayedAck && message.events?.some(event => event.t === 'save:started')) {
          heldStart = message;
          return;
        }
        receive?.(message);
      });
      worker.on('error', error => { throw error; });
      lane = createSimLaneRuntime({ state, registry: {}, bus,
        flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
        helpers: { scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) },
        channelFactory: () => ({ post(message) { posts.push(message); worker.postMessage(message); },
          onMessage(handler) { receive = handler; }, terminate() {} }),
      });
      await lane.readyPromise;
      const boot = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
      assert.equal(boot.ok, true);
      laneSetMode(state, bus, 'paused');
      laneWriteSetting(state, 'timeScale', 0);
      await until(() => !lane.getDiagnostics().workerClockCommandInFlight, 'paused command acknowledgement');
      const before = await laneRpc('probeState');
      assert.equal(before.result.mode, 'paused');
      await until(() => !lane.getDiagnostics().workerClockCommandInFlight, 'probe acknowledgement');
      const commandsBefore = posts.filter(row => row.kind === 'clockCommand').length;
      bus.emit('game:save', { slot: 'quick', label: 'Paused worker' });
      await until(() => replies.some(row => row.kind === 'fixture-save-settled'), 'actual worker save chain settlement');
      const settled = replies.find(row => row.kind === 'fixture-save-settled');
      assert.equal(settled.ok, !failWrite);
      assert.equal(settled.hasBytes, !failWrite);
      if (delayedAck) {
        assert.ok(heldStart);
        assert.equal(rows.has('sf.save.quick'), false, 'durable bytes wait behind the outstanding reply ACK');
        receive(heldStart);
      }
      await until(() => receipts.some(row => row.type === (failWrite ? 'save:error' : 'save:completed')), 'terminal paused save receipt');
      if (raceSecond) await until(() => receipts.some(row => row.type === 'save:completed' && row.payload.slot === 'secondary'), 'racing second save receipt');
      assert.deepEqual(receipts.map(row => row.type), raceSecond
        ? ['save:started', 'save:completed', 'save:started', 'save:completed']
        : ['save:started', failWrite ? 'save:error' : 'save:completed']);
      assert.equal(posts.filter(row => row.kind === 'clockCommand').length, commandsBefore + 1,
        'no extra actor command is needed to pull the async result');
      if (failWrite) {
        assert.equal(rows.has('sf.save.quick'), false);
      } else {
        const envelope = JSON.parse(receipts.find(row => row.type === 'save:completed' && row.payload.slot === 'quick').bytes);
        assert.equal(envelope.slot, 'quick');
        assert.equal(envelope.data.entities.player.type, 'ship');
        assert.equal(envelope.data.entities.player.id, state.playerId);
        assert.ok(replies.some(row => row.storageOps?.some(op => op.key === 'sf.save.quick')));
        if (raceSecond) assert.equal(JSON.parse(receipts.at(-1).bytes).slot, 'secondary');
      }
      const last = replies.filter(row => row.kind === 'clockTick').at(-1);
      assert.equal(last.stateTick, before.result.tick);
      assert.equal(last.simTime, before.result.simTime);
      assert.equal(state.mode, 'paused');
      assert.equal(lane.getDiagnostics().closed, false);
      assert.equal(replies.some(row => row.kind === 'error'), false);
    } finally {
      lane?.close();
      await worker.terminate();
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    }
  });
}
