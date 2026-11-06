import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc, laneSetMode, laneWriteSetting } from '../src/core/simLaneCommands.js';
import { decodeSaveEnvelopeText } from '../src/save/saveWorker.js';

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

function createSaveWorker(entry, saveModule, workerData) {
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
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), { workerData });
}

function generationSavedAt(raw) {
  const parsed = JSON.parse(raw);
  return parsed.data?.meta?.lastSavedAt || parsed.savedAt || null;
}

async function economyFromSavedBytes(raw) {
  const decoded = await decodeSaveEnvelopeText(raw);
  assert.equal(decoded.ok, true, 'the selected durable save bytes decode through the canonical codec');
  const envelope = JSON.parse(decoded.text);
  const sourceItems = envelope?.data?.cargo?.items;
  return {
    credits: Number(envelope?.data?.player?.credits),
    cargoItems: Object.fromEntries(Object.entries(sourceItems && typeof sourceItems === 'object' ? sourceItems : {})
      .filter(([id, quantity]) => typeof id === 'string' && Number.isFinite(quantity))
      .sort(([a], [b]) => a.localeCompare(b))),
  };
}

const durableQuotaSnapshots = new Map();

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

for (const [failWrite, delayedAck, raceSecond, quotaScenario] of [
  [false, false, false, null], [true, false, false, null],
  [false, true, false, null], [false, false, true, null],
  [false, false, false, 'raw-retry'], [false, false, false, 'compressed-reject'],
]) {
  test(`paused browser worker publishes real asynchronous save ${quotaScenario ? quotaScenario === 'raw-retry' ? 'after canonical gzip retry' : 'failure without replacing the prior save' : failWrite ? 'failure' : 'bytes and completion'}${delayedAck ? ' behind a delayed commit ACK' : ''}${raceSecond ? ' racing a second completion' : ''} without advancing simulation`, { timeout: 30000 }, async () => {
    const previousStorage = globalThis.localStorage;
    const rows = new Map();
    let activeQuotaScenario = null;
    let previousQuick = null;
    let previousIndex = null;
    let previousSavedAt = null;
    let acceptedSavedAt = null;
    globalThis.localStorage = {
      getItem: key => rows.get(key) ?? null,
      setItem: (key, value) => {
        const stringKey = String(key), stringValue = String(value);
        if (activeQuotaScenario && stringKey === 'sf.save.quick' && stringValue !== previousQuick) {
          let compressed = false;
          try { compressed = JSON.parse(stringValue)?.gz === 1; } catch (_) { /* plain envelope */ }
          if (activeQuotaScenario === 'compressed-reject'
            || (activeQuotaScenario === 'raw-retry' && !compressed)) {
            throw Object.assign(new Error('fixture origin quota exceeded'), { name: 'QuotaExceededError' });
          }
        }
        rows.set(stringKey, stringValue);
      },
      removeItem: key => rows.delete(key), key: index => [...rows.keys()][index] ?? null,
      get length() { return rows.size; },
    };
    const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
    const saveModule = new URL('../src/save/saveSystem.js', import.meta.url).href;
    const worker = createSaveWorker(entry, saveModule, { failWrite, raceSecond });
    const replies = [], posts = [], receipts = [], loaded = [];
    let receive, lane, heldCommit;
    const state = createGameState(4242);
    state.timeScale = 0;
    const bus = createBus();
    for (const type of ['save:started', 'save:completed', 'save:error']) {
      bus.on(type, payload => receipts.push({ type, payload, bytes: rows.get(`sf.save.${payload.slot}`) }));
    }
    bus.on('save:loaded', payload => loaded.push(payload));
    try {
      worker.on('message', message => {
        replies.push(message);
        if (delayedAck && message.storageOps?.some(op => op.op === 'check')) {
          heldCommit = message;
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

      if (quotaScenario === 'compressed-reject') {
        bus.emit('game:save', { slot: 'quick', label: 'Prior durable save' });
        await until(() => receipts.some(row => row.type === 'save:completed'), 'prior save completion');
        previousQuick = rows.get('sf.save.quick');
        assert.ok(previousQuick, 'the test starts with an actually persisted prior primary');
        previousSavedAt = generationSavedAt(previousQuick);
        assert.ok(previousSavedAt, 'the prior envelope has its saved generation timestamp');
        previousIndex = rows.get('sf.save.index');
        assert.ok(previousIndex, 'the prior save has its published slot index');
        durableQuotaSnapshots.set('compressed-reject', {
          primary: previousQuick, index: previousIndex, savedAt: previousSavedAt,
          difficulty: 'standard',
        });
        receipts.length = 0;
        for (let i = replies.length - 1; i >= 0; i--) {
          if (replies[i].kind === 'fixture-save-settled') replies.splice(i, 1);
        }
        activeQuotaScenario = quotaScenario;
      } else if (quotaScenario === 'raw-retry') {
        activeQuotaScenario = quotaScenario;
      }

      if (quotaScenario) {
        laneWriteSetting(state, 'settings.gameplay.difficulty', 'veteran');
        await until(() => !lane.getDiagnostics().workerClockCommandInFlight,
          'saved-generation setting command acknowledgement');
        const changed = await laneRpc('probeState');
        assert.equal(changed.result.gameplay.difficulty, 'veteran');
      }

      bus.emit('game:save', { slot: 'quick', label: 'Paused worker' });
      if (delayedAck) {
        await until(() => !!heldCommit, 'worker durable commit check');
        assert.equal(rows.has('sf.save.quick'), false,
          'the host has not persisted the primary while its commit-check reply is withheld');
        assert.equal(replies.some(row => row.kind === 'fixture-save-settled'), false,
          'the paused save remains unsettled until main acknowledges the durable bytes');
        receive(heldCommit);
      }
      try {
        await until(() => replies.some(row => row.kind === 'fixture-save-settled'),
          'actual worker save chain settlement');
      } catch (error) {
        const compactRows = rows => rows.map(row => ({ kind: row.kind,
          events: row.events?.map(event => event.t),
          storageOps: row.storageOps?.map(op => ({ op: op.op, key: op.key,
            gzip: typeof op.value === 'string' && op.key === 'sf.save.quick'
              ? (() => { try { return JSON.parse(op.value).gz === 1; } catch (_) { return false; } })()
              : undefined })),
          commands: row.commands?.map(command => ({ t: command.t, op: command.op,
            emit: command.p?.emit, rpc: command.op === 'saveStorageAck' })),
        }));
        error.message += `; quotaScenario=${quotaScenario}; `
          + `workerReplies=${JSON.stringify(compactRows(replies.slice(-12)))}; `
          + `mainPosts=${JSON.stringify(compactRows(posts.slice(-12)))}; `
          + `receipts=${JSON.stringify(receipts.slice(-8).map(row => ({ type: row.type,
            slot: row.payload?.slot, reason: row.payload?.reason })))}; `
          + `persistedPrimary=${!!rows.get('sf.save.quick')}; `
          + `checkHeld=${!!heldCommit}`;
        throw error;
      }
      const settled = replies.find(row => row.kind === 'fixture-save-settled');
      assert.equal(settled.ok, !failWrite && quotaScenario !== 'compressed-reject');
      if (!quotaScenario) assert.equal(settled.hasBytes, !failWrite);
      const expectedFailure = failWrite || quotaScenario === 'compressed-reject';
      await until(() => receipts.some(row => row.type === (expectedFailure ? 'save:error' : 'save:completed')),
        'terminal paused save receipt');
      if (raceSecond) await until(() => receipts.some(row => row.type === 'save:completed' && row.payload.slot === 'secondary'), 'racing second save receipt');
      assert.deepEqual(receipts.map(row => row.type), raceSecond
        ? ['save:started', 'save:completed', 'save:started', 'save:completed']
        : quotaScenario === 'compressed-reject'
          ? ['save:started', 'save:error']
          : ['save:started', expectedFailure ? 'save:error' : 'save:completed']);
      assert.ok(posts.some(row => row.kind === 'clockCommand' && row.commands?.some(command =>
        command.t === 'bus' && command.p?.emit === 'game:save')),
      'the public save event reached the worker; commit ACK RPCs may add transport commands');
      if (failWrite) {
        assert.equal(rows.has('sf.save.quick'), false);
      } else if (quotaScenario === 'raw-retry') {
        const persisted = rows.get('sf.save.quick');
        assert.ok(persisted, 'the replacement primary is present in host storage');
        const packed = JSON.parse(persisted);
        assert.notEqual(persisted, previousQuick);
        assert.equal(packed.gz, 1, 'the persisted replacement uses the canonical gzip envelope');
        acceptedSavedAt = packed.savedAt;
        assert.equal(receipts.find(row => row.type === 'save:completed').bytes, persisted,
          'completion is emitted only after the compressed primary is present in main storage');
        assert.equal(JSON.parse(rows.get('sf.save.index')).quick.savedAt,
          JSON.parse(persisted).savedAt, 'the index advertises the persisted compressed generation');
        durableQuotaSnapshots.set('raw-retry', {
          primary: persisted, index: rows.get('sf.save.index'), savedAt: acceptedSavedAt,
          difficulty: 'veteran',
        });
      } else if (quotaScenario === 'compressed-reject') {
        assert.equal(rows.get('sf.save.quick'), previousQuick,
          'a failed compressed replacement leaves the previous primary byte-for-byte intact');
        const attempted = replies.flatMap(row => row.storageOps || [])
          .filter(op => op.key === 'sf.save.quick' && op.value !== previousQuick).at(-1)?.value;
        assert.ok(attempted, 'the worker attempted a distinct replacement primary');
        assert.notEqual(generationSavedAt(attempted), previousSavedAt,
          'the rejected replacement belongs to a distinct saved generation');
        assert.equal(rows.get('sf.save.index'), previousIndex,
          'the failed replacement does not publish a new Continue index');
        assert.equal(receipts.some(row => row.type === 'save:completed'), false,
          'no successful completion is emitted for bytes the host did not persist');
        assert.ok(receipts.find(row => row.type === 'save:error'),
          'the failed durable replacement reports an error');
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

      if (quotaScenario === 'compressed-reject') {
        const loadedBefore = loaded.length;
        const errorsBeforeLoad = receipts.filter(row => row.type === 'save:error').length;
        bus.emit('game:load', { slot: 'latest' });
        try {
          await until(() => loaded.length > loadedBefore
            || receipts.filter(row => row.type === 'save:error').length > errorsBeforeLoad,
          'same-lane reload after rejected replacement', 10000);
        } catch (error) {
          const recentReplies = replies.slice(-8).map(row => ({ kind: row.kind,
            stateTick: row.stateTick, storageOps: row.storageOps?.map(op => ({ op: op.op, key: op.key })),
            events: row.events?.map(event => event.t), message: row.message }));
          const recentPosts = posts.slice(-8).map(row => ({ kind: row.kind,
            commands: row.commands?.map(command => ({ t: command.t, op: command.op, emit: command.p?.emit })) }));
          error.message += `; receipts=${JSON.stringify(receipts.slice(-6).map(row => ({ type: row.type,
            slot: row.payload?.slot, reason: row.payload?.reason, failure: row.payload?.failure })))}; `
            + `recentReplies=${JSON.stringify(recentReplies)}; recentPosts=${JSON.stringify(recentPosts)}`;
          throw error;
        }
        assert.equal(receipts.filter(row => row.type === 'save:error').length, errorsBeforeLoad,
          'the prior accepted generation remains loadable in the saving worker');
        assert.equal(loaded.at(-1).slot, 'quick');
        const restored = await laneRpc('probeState');
        assert.equal(restored.result.gameplay.difficulty, 'standard',
          'same-lane reload restores the prior accepted generation, not failed replacement bytes');
      }

    } finally {
      lane?.close();
      await worker.terminate();
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    }
  });
}

test('a held older durable ACK is serialized before a newer public save', { timeout: 30000 }, async (t) => {
  const previousStorage = globalThis.localStorage;
  const rows = new Map();
  globalThis.localStorage = {
    getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => {
      const stringKey = String(key), stringValue = String(value);
      if (stringKey === 'sf.save.quick') {
        let compressed = false;
        try { compressed = JSON.parse(stringValue)?.gz === 1; } catch (_) { /* plain envelope */ }
        if (!compressed) throw Object.assign(new Error('fixture raw save quota exceeded'), { name: 'QuotaExceededError' });
      }
      rows.set(stringKey, stringValue);
    },
    removeItem: key => rows.delete(key), key: index => [...rows.keys()][index] ?? null,
    get length() { return rows.size; },
  };
  const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
  const saveModule = new URL('../src/save/saveSystem.js', import.meta.url).href;
  const worker = createSaveWorker(entry, saveModule, { failWrite: false, raceSecond: false });
  const state = createGameState(4242);
  state.timeScale = 0;
  const bus = createBus();
  const replies = [], posts = [], receipts = [];
  let receive, lane, heldAckCommand = null, freshWorker = null, freshLane = null;
  let phase = 'worker-init';
  t.after(() => {
    if (!t.signal.aborted) return;
    const summarize = messages => messages.slice(-6).map(message => ({
      kind: message.kind, seq: message.seq, commandSequence: message.commandSequence,
      events: message.events?.map(event => event.t).slice(-6),
      storageOps: message.storageOps?.map(op => ({ op: op.op, key: op.key,
        valueLength: typeof op.value === 'string' ? op.value.length : undefined })),
      commands: message.commands?.map(command => ({ t: command.t, op: command.p?.op,
        emit: command.p?.emit, resultOk: command.p?.payload?.result?.ok })),
    }));
    process.stderr.write(`[held-save-ack-timeout] ${JSON.stringify({ phase,
      heldAck: !!heldAckCommand, inFlight: lane?.getDiagnostics().workerClockCommandInFlight,
      posts: summarize(posts), replies: summarize(replies), receipts: receipts.map(row => row.type),
      primaryLength: rows.get('sf.save.quick')?.length || 0,
      indexLength: rows.get('sf.save.index')?.length || 0,
    })}\n`);
  });
  bus.on('save:started', payload => receipts.push({ type: 'save:started', payload }));
  bus.on('save:completed', payload => receipts.push({ type: 'save:completed', payload }));
  bus.on('save:error', payload => receipts.push({ type: 'save:error', payload }));
  try {
    worker.on('message', message => {
      replies.push(message);
      receive?.(message);
    });
    worker.on('error', error => { throw error; });
    lane = createSimLaneRuntime({ state, registry: {}, bus,
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: { scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) },
      channelFactory: () => ({
        post(message) {
          posts.push(message);
          const quotaCheckAck = message.commands?.find(command => command.t === 'rpc'
            && command.p?.op === 'saveStorageAck' && command.p?.payload?.result?.quota === true);
          if (quotaCheckAck && !heldAckCommand) {
            heldAckCommand = message;
            return;
          }
          worker.postMessage(message);
        },
        onMessage(handler) { receive = handler; },
        terminate() {},
      }),
    });
    await lane.readyPromise;
    phase = 'worker-ready';
    const boot = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
    assert.equal(boot.ok, true);
    laneSetMode(state, bus, 'paused');
    laneWriteSetting(state, 'timeScale', 0);
    await until(() => !lane.getDiagnostics().workerClockCommandInFlight, 'paused command acknowledgement');

    laneWriteSetting(state, 'settings.gameplay.difficulty', 'veteran');
    await until(() => !lane.getDiagnostics().workerClockCommandInFlight, 'older generation setting acknowledgement');
    bus.emit('game:save', { slot: 'quick', label: 'Older held generation' });
    try {
      await until(() => !!heldAckCommand, 'older raw-primary quota-failure ACK');
      phase = 'older-quota-failure-ACK-held';
    } catch (error) {
      error.message += `; posts=${JSON.stringify(posts.slice(-12).map(message => ({
        kind: message.kind,
        commands: message.commands?.map(command => ({ t: command.t, pOp: command.p?.op,
          pEmit: command.p?.emit, result: command.p?.payload?.result && {
            ok: command.p.payload.result.ok, quota: command.p.payload.result.quota,
            quotaKeys: command.p.payload.result.quotaKeys,
            snapshotKeys: Object.keys(command.p.payload.result.snapshot || {}),
            primaryLength: command.p.payload.result.snapshot?.['sf.save.quick']?.length || 0,
          } })),
      })))}; replies=${JSON.stringify(replies.slice(-10).map(message => ({
        kind: message.kind, events: message.events?.map(event => event.t).slice(-8),
        storageOps: message.storageOps?.map(op => ({ op: op.op, key: op.key,
          valueLength: typeof op.value === 'string' ? op.value.length : undefined })),
      })))}; receipts=${JSON.stringify(receipts.map(row => row.type))}; primary=${rows.get('sf.save.quick')?.length || 0}`;
      throw error;
    }
    const heldAck = heldAckCommand.commands.find(command => command.t === 'rpc'
      && command.p?.op === 'saveStorageAck');
    assert.equal(heldAck?.p?.payload?.result?.ok, false);
    assert.equal(heldAck?.p?.payload?.result?.quota, true,
      'the held response is the raw-primary quota failure, before the gzip retry');
    const olderPrimary = replies.flatMap(message => message.storageOps || [])
      .filter(op => op.key === 'sf.save.quick' && op.op === 'set').at(-1)?.value;
    assert.ok(olderPrimary, 'the worker sent the older raw primary to host storage');
    assert.notEqual(JSON.parse(olderPrimary).gz, 1, 'the older generation is still on its raw attempt');
    assert.equal(rows.has('sf.save.quick'), false, 'main has not persisted the quota-rejected raw primary');
    assert.equal(receipts.filter(row => row.type === 'save:completed').length, 0,
      'the older write cannot publish completion before its durable ACK');
    assert.equal(lane.getDiagnostics().workerClockCommandInFlight, true,
      'the worker lane serializes later commands behind the held failure ACK');

    laneWriteSetting(state, 'settings.gameplay.difficulty', 'casual');
    bus.emit('game:save', { slot: 'quick', label: 'Newer queued generation' });
    phase = 'newer-public-save-queued';
    const countPublicSaves = () => posts.reduce((count, message) => count
      + (message.kind === 'clockCommand' ? message.commands?.filter(command => command.t === 'bus'
        && command.p?.emit === 'game:save').length || 0 : 0), 0);
    assert.equal(countPublicSaves(), 1,
      'the newer public save is queued while the older ACK command owns the lane');

    worker.postMessage(heldAckCommand);
    phase = 'older-ACK-released';
    await until(() => countPublicSaves() >= 2, 'newer save dispatched after the held ACK');
    phase = 'newer-save-dispatched';
    await until(() => receipts.filter(row => row.type === 'save:started').length >= 2
      && receipts.filter(row => row.type === 'save:completed').length >= 2,
    'both serialized save generations complete', 12000);
    phase = 'both-save-generations-complete';
    const finalPrimary = rows.get('sf.save.quick');
    assert.ok(finalPrimary && finalPrimary !== olderPrimary,
      'the newer accepted generation remains in host storage after the older ACK is released');
    const finalEnvelope = JSON.parse(finalPrimary);
    assert.equal(finalEnvelope.gz, 1);
    assert.notEqual(finalEnvelope.savedAt, JSON.parse(olderPrimary).savedAt,
      'the final primary belongs to a distinct, newer save generation');
    assert.equal(JSON.parse(rows.get('sf.save.index')).quick.savedAt, finalEnvelope.savedAt,
      'the slot index still names the newer accepted generation');
    assert.equal(receipts.some(row => row.type === 'save:error'), false);

    lane.close();
    lane = null;
    await worker.terminate();
    freshWorker = createSaveWorker(entry, saveModule, { failWrite: false, raceSecond: false });
    const freshState = createGameState(9999);
    freshState.timeScale = 0;
    const freshBus = createBus();
    const freshReceipts = [];
    let freshReceive;
    freshBus.on('save:loaded', payload => freshReceipts.push({ type: 'save:loaded', payload }));
    freshBus.on('save:error', payload => freshReceipts.push({ type: 'save:error', payload }));
    try {
      freshWorker.on('message', message => freshReceive?.(message));
      freshWorker.on('error', error => { throw error; });
      freshLane = createSimLaneRuntime({ state: freshState, registry: {}, bus: freshBus,
        flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
        helpers: { scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) },
        channelFactory: () => ({ post(message) { freshWorker.postMessage(message); },
          onMessage(handler) { freshReceive = handler; }, terminate() {} }),
      });
      await freshLane.readyPromise;
      freshBus.emit('game:load', { slot: 'latest' });
    phase = 'fresh-load-newest-generation';
      await until(() => freshReceipts.some(row => row.type === 'save:loaded' || row.type === 'save:error'),
        'fresh worker load of newest accepted generation', 12000);
      assert.equal(freshReceipts.some(row => row.type === 'save:error'), false);
      const restored = await laneRpc('probeState');
      assert.equal(restored.result.gameplay.difficulty, 'casual',
        'a fresh worker restores the newest public save after the older ACK is released');
    } finally {
      freshLane?.close();
      if (freshWorker && freshWorker.threadId !== -1) await freshWorker.terminate();
    }
  } finally {
    lane?.close();
    // The first worker is already terminated before fresh owner setup on success.
    if (worker.threadId !== -1) await worker.terminate();
    freshLane?.close();
    if (freshWorker && freshWorker.threadId !== -1) await freshWorker.terminate();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

for (const scenario of ['raw-retry', 'compressed-reject']) {
  test(`fresh worker restores the ${scenario === 'raw-retry' ? 'accepted compressed replacement' : 'prior accepted generation after quota failure'}`,
    { timeout: 30000 }, async () => {
      const saved = durableQuotaSnapshots.get(scenario);
      assert.ok(saved, `the ${scenario} writer case captured actually persisted bytes first`);
      const previousStorage = globalThis.localStorage;
      const rows = new Map([
        ['sf.save.quick', saved.primary], ['sf.save.index', saved.index],
      ]);
      globalThis.localStorage = {
        getItem: key => rows.get(key) ?? null,
        setItem: (key, value) => rows.set(String(key), String(value)),
        removeItem: key => rows.delete(key), key: index => [...rows.keys()][index] ?? null,
        get length() { return rows.size; },
      };
      const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
      const saveModule = new URL('../src/save/saveSystem.js', import.meta.url).href;
      const worker = createSaveWorker(entry, saveModule, { failWrite: false, raceSecond: false });
      const state = createGameState(9999);
      state.timeScale = 0;
      const bus = createBus();
      const replies = [], receipts = [];
      let receive, lane;
      bus.on('save:loaded', payload => receipts.push({ type: 'save:loaded', payload }));
      bus.on('save:restoreCommitted', payload => receipts.push({ type: 'save:restoreCommitted', payload }));
      bus.on('save:error', payload => receipts.push({ type: 'save:error', payload }));
      try {
        worker.on('message', message => {
          replies.push(message);
          receive?.(message);
        });
        worker.on('error', error => { throw error; });
        lane = createSimLaneRuntime({ state, registry: {}, bus,
          flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
          helpers: { scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) },
          channelFactory: () => ({ post(message) { worker.postMessage(message); },
            onMessage(handler) { receive = handler; }, terminate() {} }),
        });
        await lane.readyPromise;
        bus.emit('game:load', { slot: 'latest' });
        await until(() => receipts.some(row => row.type === 'save:restoreCommitted' || row.type === 'save:error'),
          'fresh worker load from persisted host storage', 12000);
        assert.equal(receipts.some(row => row.type === 'save:error'), false,
          `the fresh owner restores from bytes that survived in main storage: ${JSON.stringify(receipts)}`);
        const loadedReceipt = receipts.find(row => row.type === 'save:loaded').payload;
        const committedReceipt = receipts.find(row => row.type === 'save:restoreCommitted').payload;
        const decodedMotion = await decodeSaveEnvelopeText(saved.primary);
        assert.equal(decodedMotion.ok, true);
        const savedPlayer = JSON.parse(decodedMotion.text).data.entities.player;
        assert.equal(committedReceipt.slot, 'quick');
        assert.deepEqual(committedReceipt.restoredMotion.pos, { x: savedPlayer.pos.x, z: savedPlayer.pos.z });
        assert.deepEqual(committedReceipt.restoredMotion.vel, { x: savedPlayer.vel.x, z: savedPlayer.vel.z },
          'the actual worker bridge carries native committed motion from the selected durable bytes');
        assert.equal(loadedReceipt.slot, 'quick');
        assert.deepEqual(loadedReceipt.restoredEconomy, await economyFromSavedBytes(saved.primary),
          'the actual worker bridge carries the economy from the exact selected durable bytes');
        const restored = await laneRpc('probeState');
        assert.equal(restored.result.gameplay.difficulty, saved.difficulty,
          'the fresh worker restores the accepted durable generation');
        const immutableLoadedEconomy = structuredClone(loadedReceipt.restoredEconomy);
        const immutableMotion = structuredClone(committedReceipt.restoredMotion);
        const livePlayer = state.entities.get(state.playerId);
        assert(livePlayer?.vel);
        livePlayer.vel.x += 10;
        assert.deepEqual(committedReceipt.restoredMotion, immutableMotion,
          'a later main-side motion mirror cannot rewrite the native restore receipt');
        const liveMirrorItems = state.player?.cargo?.items;
        assert.ok(liveMirrorItems && typeof liveMirrorItems === 'object',
          'the main-side player cargo mirror is available after the worker load');
        const mirrorBeforeMutation = Object.fromEntries(Object.entries(liveMirrorItems)
          .sort(([a], [b]) => a.localeCompare(b)));
        const changedId = Object.keys(liveMirrorItems)[0]
          || Object.keys(immutableLoadedEconomy.cargoItems)[0]
          || 'cmdty_ore_iron';
        liveMirrorItems[changedId] = Number(liveMirrorItems[changedId] || 0) + 1;
        const mirrorAfterMutation = Object.fromEntries(Object.entries(liveMirrorItems)
          .sort(([a], [b]) => a.localeCompare(b)));
        assert.equal(mirrorAfterMutation[changedId], Number(mirrorBeforeMutation[changedId] || 0) + 1,
          'the fixture advances a live main-side cargo quantity after the load receipt');
        assert.notDeepEqual(mirrorAfterMutation, immutableLoadedEconomy.cargoItems,
          'the fixture advances the live main-side cargo mirror after the load receipt');
        assert.deepEqual(loadedReceipt.restoredEconomy, immutableLoadedEconomy,
          'later cargo-mirror mutation cannot rewrite the immutable worker restore receipt');
        assert.equal(replies.some(row => row.kind === 'error'), false);
      } finally {
        lane?.close();
        await worker.terminate();
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
      }
    });
}
