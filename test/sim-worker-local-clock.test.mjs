import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects, readLocalTimeEffectsSnapshot } from '../src/core/timeEffects.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import { createSnapshotFence, packPresentationWorldToFence, snapshotIndexOf } from '../src/render/snapshotFence.js';
import {
  laneDomEvent,
  laneRpc,
  laneSetMode,
  laneWriteSetting,
} from '../src/core/simLaneCommands.js';
import { crucibleSetupFor } from '../src/ui/crucibleLaunch.js';
import { createSabJournalArena, SAB_JOURNAL_MAGIC } from '../scripts/lib/simWorkerHost.mjs';
import { bindSabEnvelopeChannel, sabEnvelopeDrain, sabEnvelopePost,
  SAB_ENV_KIND, SAB_REPLY_SEQ_INDEX, SAB_REPLY_FREE_INDEX } from '../scripts/lib/simSabEnvelope.mjs';
import { getPromptDevice, setPromptDevice, getGamepadCaptureHandler, setGamepadCaptureHandler } from '../src/ui/bindings.js';
import { queryAsteroidField } from '../src/world/asteroidField.js';
import { resolveWorldPresentationEntity } from '../src/world/presentationSources.js';

function waitFor(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) { resolve(); return; }
      if (Date.now() >= deadline) {
        reject(new Error('timed out waiting for worker-local clock condition'));
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

function emptyPack(start = 0, end = 0) {
  return {
    count: 0,
    scalars: new Float64Array(0),
    kinds: new Uint8Array(0),
    typeIndex: new Uint16Array(0),
    typeTable: [],
    spawnEntityIds: [],
    start,
    end,
    sab: false,
    sabSlot: null,
  };
}

function journalPack(start, rows) {
  const count = rows.length;
  const scalars = new Float64Array(count * 18);
  const kinds = new Uint8Array(count);
  const typeIndex = new Uint16Array(count);
  const typeTable = [];
  const typeIds = new Map();
  const spawnEntityIds = [];
  rows.forEach((row, i) => {
    const o = i * 18;
    scalars[o] = row.tick;
    scalars[o + 1] = start + i + 1;
    scalars[o + 2] = row.entityId;
    scalars[o + 3] = row.generation || 1;
    scalars[o + 4] = row.revision || i + 1;
    scalars[o + 5] = row.x || 0;
    scalars[o + 7] = row.z || 0;
    const type = row.type || '';
    let typeId = typeIds.get(type);
    if (typeId === undefined) {
      typeId = typeTable.length;
      typeTable.push(type);
      typeIds.set(type, typeId);
    }
    typeIndex[i] = typeId;
    kinds[i] = row.kind;
    if (row.kind === 1) spawnEntityIds.push(row.entityId);
  });
  return {
    count,
    scalars,
    kinds,
    typeIndex,
    typeTable,
    spawnEntityIds,
    start,
    end: start + count,
    sab: false,
    sabSlot: null,
  };
}

// A journal-only arena is deliberately smaller than the v2 envelope layout.
// The worker still binds its SAB journal slots (the seam under test), while
// bindSabEnvelopeChannel returns null and cannot start a parked command loop.
function journalOnlySabArena({ slotCount = 12, recordCap = 8 } = {}) {
  const slotBytes = recordCap * (18 * 8 + 1 + 2);
  const sab = new SharedArrayBuffer(64 + slotCount * slotBytes);
  const header = new Int32Array(sab, 0, 16);
  header[0] = SAB_JOURNAL_MAGIC;
  header[1] = 2;
  header[2] = slotCount;
  header[3] = recordCap;
  return { sab, header, slotCount, recordCap, slotBytes };
}

function sabJournalPack(arena, slot, start, rows) {
  assert.ok(rows.length <= arena.recordCap);
  const source = journalPack(start, rows);
  const base = 64 + slot * arena.slotBytes;
  const scalars = new Float64Array(arena.sab, base, arena.recordCap * 18);
  const kinds = new Uint8Array(arena.sab, base + arena.recordCap * 18 * 8, arena.recordCap);
  const typeIndex = new Uint16Array(
    arena.sab,
    base + arena.recordCap * (18 * 8 + 1),
    arena.recordCap,
  );
  scalars.fill(0);
  kinds.fill(0);
  typeIndex.fill(0);
  scalars.set(source.scalars);
  kinds.set(source.kinds);
  typeIndex.set(source.typeIndex);
  Atomics.store(arena.header, 4 + slot, 1);
  return {
    ...source,
    scalars: scalars.subarray(0, source.scalars.length),
    kinds: kinds.subarray(0, source.kinds.length),
    typeIndex: typeIndex.subarray(0, source.typeIndex.length),
    sab: true,
    sabSlot: slot,
  };
}

function makeFixture(t, { helpers, sab = false, onInputCommandSnapshot } = {}) {
  const posts = [];
  let receive = null;
  const bus = createBus();
  const state = {
    entities: new Map(), entityList: [],
    settings: { controls: { mouse: {} } },
    meta: { seed: 1 }, input: {}, ui: { screenStack: [] },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 1,
  };
  const lane = createSimLaneRuntime({
    state, registry: {}, bus,
    flags: { lane: 'worker', warnings: [], sab, sabEnvelope: sab },
    // Explicit local mode exercises the browser protocol with a deterministic
    // channel while the default injected/manual path remains directive-driven.
    clockMode: 'worker-local',
    onInputCommandSnapshot,
    channelFactory: () => ({
      post(msg) { posts.push(msg); },
      onMessage(handler) { receive = handler; },
      terminate() {},
    }),
    helpers,
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq });
  return { lane, posts, state, receive, bus };
}

test('the worker facade requests full input rows only for an observer', t => {
  const stock = makeFixture(t);
  assert.equal(stock.posts[0].shipInputSnapshots, false);
  stock.receive({ kind: 'clockTick', clockSequence: 1, inputPublishCount: 3 });
  assert.equal(stock.lane.getDiagnostics().boundaryCaptureCount, 3);
  stock.lane.close();

  let observed = 0;
  const traced = makeFixture(t, { onInputCommandSnapshot: () => { observed++; } });
  assert.equal(traced.posts[0].shipInputSnapshots, true);
  traced.receive({ kind: 'clockTick', clockSequence: 1, inputPublishCount: 1,
    inputPublishes: [{ actualTick: 1, input: {} }] });
  assert.equal(traced.lane.getDiagnostics().boundaryCaptureCount, 1);
  assert.equal(observed, 1);
});

test('the main lane frees SAB reply cells before sending one cumulative ACK', t => {
  const f = makeFixture(t, { sab: true });
  const arena = f.posts[0].sabArena;
  const worker = bindSabEnvelopeChannel(arena);
  sabEnvelopeDrain(worker, 'cmd', () => {});
  for (let sequence = 1; sequence <= 4; sequence++) {
    sabEnvelopePost(worker, 'reply', {
      kind: 'clockTick', clockSequence: sequence, stateTick: sequence,
      simTime: sequence / 60, journalEnd: 0,
    }, SAB_ENV_KIND.TICK_DONE);
  }
  f.lane.runner.consumeLatestCompletedTick({});
  assert.equal(Atomics.load(arena.header, SAB_REPLY_FREE_INDEX), 4);
  const acks = f.posts.filter(message => message.kind === 'clockAck');
  assert.deepEqual(acks.map(message => [message.kind, message.clockSequence]), [['clockAck', 4]]);
  assert.equal(f.state.tick, 4);
});

test('autonomous SAB replies coexist with ordered input bursts larger than the command ring', t => {
  const f = makeFixture(t, { sab: true });
  f.state.mode = 'flight';
  f.lane.runner.setClockActive(true);
  for (const code of ['KeyW', 'KeyD', 'KeyJ', 'KeyJ', 'KeyD', 'KeyW']) {
    laneDomEvent({ type: 'keydown', code });
  }
  assert.equal(f.lane.runner.isClosed(), false);
  assert.deepEqual(f.posts.filter(message => message.kind === 'clockCommand')
    .flatMap(message => message.commands.filter(command => command.p?.d?.type === 'keydown')
      .map(command => command.p.d.code)),
  ['KeyW', 'KeyD', 'KeyJ', 'KeyJ', 'KeyD', 'KeyW']);
});

test('worker asteroid deltas reach the renderer field before the rock becomes a live body', t => {
  const f = makeFixture(t);
  const id = 17;
  const rock = {
    id, kind: 'rock', x: 16, z: 12, radius: 10, lastExactT: 1,
    rockAppearance: { typeId: 'ast_metallic', tint: '#aabbcc', opticMaterial: 'metal' },
  };
  const update = (clockSequence, fields) => f.receive({
    kind: 'clockTick', clockSequence, stateTick: clockSequence,
    simTime: clockSequence / 60, journalEnd: 0, ...fields,
  });
  update(1, { auxUpserts: [rock] });
  const row = resolveWorldPresentationEntity(f.state, id);
  assert.equal(row?.fieldResident, true);
  assert.equal(row.data.typeId, 'ast_metallic');
  assert.equal(row.data.tint, '#aabbcc');
  assert.equal(f.state.entities.has(id), false, 'the visual row owns no live physics body');
  assert.deepEqual(queryAsteroidField(f.state, rock, 30), [row]);

  update(2, { auxUpserts: [{ ...rock, x: 900 }] });
  assert.equal(resolveWorldPresentationEntity(f.state, id), row, 'pose updates retain the drawn row');
  assert.deepEqual(queryAsteroidField(f.state, rock, 30), []);
  assert.deepEqual(queryAsteroidField(f.state, { x: 900, z: 12 }, 30), [row]);

  update(3, { auxUpserts: [{ ...rock, liveEntityId: id }] });
  assert.equal(resolveWorldPresentationEntity(f.state, id), null, 'promotion retires the dormant projection');
  assert.equal(row.alive, false);
  update(4, { auxUpserts: [rock] });
  update(5, { auxRemovals: [id] });
  assert.equal(resolveWorldPresentationEntity(f.state, id), null);
  update(6, { auxUpserts: [rock] });
  update(7, { auxUpserts: [{ id, kind: 'far' }] });
  assert.equal(resolveWorldPresentationEntity(f.state, id), null, 'another table can reuse a retired rock ID');
});

function makeWatchdogFixture(t) {
  let clock = 0;
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => clock },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Register restoration before makeFixture registers lane teardown so the
  // lane can still use the mocked clock while its close path runs.
  t.after(() => {
    if (performanceDescriptor) Object.defineProperty(globalThis, 'performance', performanceDescriptor);
    else delete globalThis.performance;
  });
  const fixture = makeFixture(t);
  return {
    ...fixture,
    advanceWall(ms) { clock += ms; },
    dispatch(ms = 100) {
      clock += ms;
      t.mock.timers.tick(ms);
    },
  };
}

function sendClockTick(fixture, clockSequence, commandSequence = 0, tick = clockSequence) {
  fixture.receive({
    kind: 'clockTick',
    seq: `clock-${clockSequence}`,
    clockSequence,
    commandSequence,
    stateTick: tick,
    simTime: tick / 60,
    clockAccumulator: 0.004,
    journalStart: 0,
    journalEnd: 0,
    pack: emptyPack(),
  });
}

test('worker full rebuild retires facade rows omitted by the replacement SPAWN pack', async (t) => {
  const f = makeFixture(t);
  const initial = journalPack(0, [
    { kind: 1, entityId: 1, generation: 1, type: 'player_ship', tick: 1 },
    { kind: 1, entityId: 42, generation: 1, type: 'ship', tick: 1 },
  ]);
  f.receive({
    kind: 'clockTick',
    seq: 'full-rebuild-initial',
    clockSequence: 1,
    stateTick: 1,
    simTime: 1 / 60,
    journalStart: 0,
    journalEnd: initial.end,
    pack: initial,
    spawnInfos: [
      { entityId: 1, type: 'player_ship', occupantGeneration: 1 },
      { entityId: 42, type: 'ship', occupantGeneration: 1 },
    ],
  });

  const survivor = f.state.entities.get(1);
  const stale = f.state.entities.get(42);
  assert.ok(survivor);
  assert.ok(stale);
  const world = createPresentationWorld();
  world.rebuildFromEntities([survivor, stale]);
  const admission = { status: 'ready', stamp: 7 };
  const mesh = { id: 'player-mesh' };
  const view = { id: 'player-view' };
  survivor.presentationAdmission = admission;
  survivor.mesh = mesh;
  survivor.view = view;

  // The replacement deliberately omits both a DESTROY record for 42 and the
  // spawnInfos side-channel. The pack's SPAWN records alone define membership.
  const replacement = journalPack(2, [
    { kind: 1, entityId: 1, generation: 1, type: 'player_ship', tick: 2 },
    { kind: 3, entityId: 1, generation: 1, type: 'player_ship', tick: 2, x: 12, z: -4 },
  ]);
  f.receive({
    kind: 'clockTick',
    seq: 'full-rebuild-replacement',
    clockSequence: 2,
    stateTick: 2,
    simTime: 2 / 60,
    journalStart: replacement.start,
    journalEnd: replacement.end,
    journalFullRebuild: true,
    journalRebuildGeneration: 1,
    pack: replacement,
  });

  assert.strictEqual(f.state.entities.get(1), survivor, 'surviving entity facade identity is stable');
  assert.strictEqual(survivor.presentationAdmission, admission, 'admission identity survives the rebuild');
  assert.strictEqual(survivor.mesh, mesh, 'presentation mesh reference survives the rebuild');
  assert.strictEqual(survivor.view, view, 'presentation view reference survives the rebuild');
  assert.equal(survivor.pos.x, 12);
  assert.equal(survivor.pos.z, -4);
  assert.equal(stale.alive, false, 'retired facade row is marked dead before presentation fallback');
  assert.equal(f.state.entities.has(42), false, 'omitted facade row is retired without a DESTROY record');
  assert.deepEqual(f.state.entityList.map((row) => row.id), [1], 'reconcile publishes only replacement entities');

  // A later invalid-journal recovery must repack from the repaired facade, not
  // resurrect the dead row that the first publisher build had retained.
  const publisher = createPresentationPublisher(world, f.state, { journal: f.lane.journal });
  f.lane.journal.requestRebuild();
  const publication = publisher.consume({
    journal: f.lane.journal,
    journalStart: replacement.start,
    journalEnd: replacement.end,
    journalValid: false,
    completedTickCount: 1,
    lifecycleGeneration: 0,
  }, { atomic: true });
  assert.equal(publication.fallback, true);
  const fence = createSnapshotFence();
  packPresentationWorldToFence(world, fence, f.state.simTime, 0);
  const snapshot = fence.latestSnapshot();
  assert.ok(snapshotIndexOf(snapshot, 1) >= 0, 'fallback publisher keeps the surviving entity');
  assert.equal(snapshotIndexOf(snapshot, 42), -1, 'fallback publisher pack omits the retired entity');
});

test('worker-local coalesced replies retain contiguous journal records and ACK range', async () => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage() {} };
  try {
    const worker = await import(`../src/core/wholeSimBrowserWorker.js?merge-pack-${Date.now()}`);
    const first = {
      kind: 'clockTick',
      clockSequence: 1,
      journalStart: 10,
      journalEnd: 12,
      pack: journalPack(10, [
        { kind: 1, entityId: 1, type: 'ship', tick: 1 },
        { kind: 3, entityId: 1, type: 'ship', tick: 1, x: 4 },
      ]),
      completedTick: { sequence: 1, tick: 1, journalStart: 10, journalEnd: 12 },
      events: [{ id: 'first' }],
      entityVitals: [{ id: 1, hull: 10 }],
      spawnInfos: [{ id: 1, type: 'ship' }],
      auxUpserts: [{ id: 31, kind: 'rock', x: 10 }, { id: 33, kind: 'rock' }],
      auxRemovals: [32],
    };
    const second = {
      kind: 'clockTick',
      clockSequence: 2,
      journalStart: 12,
      journalEnd: 15,
      pack: journalPack(12, [
        { kind: 2, entityId: 1, type: 'ship', tick: 2 },
        { kind: 1, entityId: 2, type: 'asteroid', tick: 2 },
        { kind: 4, entityId: 2, type: 'asteroid', tick: 2, z: -3 },
      ]),
      completedTick: { sequence: 2, tick: 2, journalStart: 12, journalEnd: 15 },
      events: [{ id: 'second' }],
      entityVitals: [{ id: 2, hull: 20 }],
      spawnInfos: [{ id: 2, type: 'asteroid' }],
      auxUpserts: [{ id: 31, kind: 'rock', x: 20 }, { id: 32, kind: 'rock' }],
      auxRemovals: [33],
    };

    const merged = worker.localMergeReply(first, second);
    assert.equal(merged.journalFullRebuild, false);
    assert.equal(merged.journalStart, 10);
    assert.equal(merged.journalEnd, 15);
    assert.deepEqual(merged.completedTick, {
      sequence: 2, tick: 2, journalStart: 10, journalEnd: 15,
    });
    assert.deepEqual(merged.events, [{ id: 'first' }, { id: 'second' }]);
    assert.deepEqual(merged.entityVitals, [{ id: 1, hull: 10 }, { id: 2, hull: 20 }]);
    assert.deepEqual(merged.spawnInfos, [
      { id: 1, type: 'ship' }, { id: 2, type: 'asteroid' },
    ]);
    assert.deepEqual(merged.auxUpserts, second.auxUpserts);
    assert.deepEqual(merged.auxRemovals, [33]);

    const pack = worker.localMaterializePack(merged);
    assert.equal(pack.count, 5);
    assert.equal(pack.start, 10);
    assert.equal(pack.end, 15);
    assert.deepEqual(Array.from(pack.scalars).filter((_, i) => i % 18 === 1), [
      11, 12, 13, 14, 15,
    ]);
    assert.deepEqual(Array.from(pack.kinds), [1, 3, 2, 1, 4]);
    assert.deepEqual(pack.spawnEntityIds, [1, 2]);
    assert.deepEqual(
      Array.from(pack.typeIndex).map((index) => pack.typeTable[index]),
      ['ship', 'ship', 'ship', 'asteroid', 'asteroid'],
    );
  } finally {
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('retained replies shed stale presentation events instead of marching to the durable limit', async () => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage() {} };
  try {
    const worker = await import(`../src/core/wholeSimBrowserWorker.js?event-shed-${Date.now()}`);
    const events = (from, to) => Array.from(
      { length: to - from }, (_, i) => ({ t: 'physics:impact', p: { seq: from + i } }),
    );
    const reply = (clockSequence, from, to) => ({
      kind: 'clockTick',
      clockSequence,
      journalStart: clockSequence * 10,
      journalEnd: clockSequence * 10 + 2,
      completedTick: {
        sequence: clockSequence, tick: clockSequence,
        journalStart: clockSequence * 10, journalEnd: clockSequence * 10 + 2,
      },
      events: events(from, to),
    });
    const first = reply(1, 0, 400);
    const saveReceipt = { t: 'save:durabilitySettled', p: { token: 'save-a', ok: true, localSaved: true } };
    const playerImpact = { t: 'physics:impact', p: { playerInvolved: true } };
    first.events.unshift(saveReceipt, playerImpact);
    first.commandAcks = [{ seq: 'a' }];
    first.storageOps = [{ op: 'put', key: 'sf.slot.1' }];
    first.inputPublishes = Array.from({ length: 100 }, (_, i) => ({ seq: i }));
    first.inputPublishCount = 100;
    const second = reply(2, 400, 700);
    second.commandAcks = [{ seq: 'b' }];

    const merged = worker.localMergeReply(first, second);
    assert.equal(merged.events.length, 512, 'the retained event tail is capped at the shed limit');
    assert.deepEqual(merged.events.slice(0, 2), [saveReceipt, playerImpact],
      'the save waiter and player feedback retain their original order');
    assert.equal(merged.events[2].p.seq, 190, 'the oldest ambient impact triggers are shed first');
    assert.equal(merged.events.at(-1).p.seq, 699, 'the newest triggers are kept for the next publish');
    assert.equal(merged.inputPublishes.length, 64, 'input snapshots are bounded to the newest tail');
    assert.equal(merged.inputPublishCount, 100, 'shedding observer rows leaves the underlying count intact');
    assert.equal(merged.inputPublishes[0].seq, 36, 'stale input clones shed before live ones');
    assert.equal(merged.commandAcks.length, 2, 'command receipts are correctness data and never shed');
    assert.equal(merged.storageOps.length, 1, 'storage receipts are correctness data and never shed');

    // Sustained retention under a stalled consumer stays bounded instead of
    // accumulating event volume until the durable tripwire stops the clock.
    const mergedAgain = worker.localMergeReply(merged, reply(3, 700, 1200));
    assert.equal(mergedAgain.events.length, 512);
    assert.deepEqual(mergedAgain.events.slice(0, 2), [saveReceipt, playerImpact]);
    assert.equal(mergedAgain.events[2].p.seq, 690);
    assert.equal(mergedAgain.events.at(-1).p.seq, 1199);

    // Merges below the cap lose nothing — ordinary congestion keeps every trigger.
    const small = worker.localMergeReply(reply(4, 0, 10), reply(5, 10, 25));
    assert.equal(small.events.length, 25);
    assert.equal(small.events[0].p.seq, 0);
  } finally {
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('public Bullet Time composes across the real worker clock, loading veil, hit-stop and pause', { timeout: 60000 }, async () => {
  const replies = [];
  const posts = [];
  let receive;
  let workerError;
  const worker = new Worker(new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url), { type: 'module' });
  const state = createGameState(4242);
  const effects = createTimeEffects(state);
  effects.set('runtime:loading', { scale: 0 });
  let lane;
  let heartbeat;
  try {
    worker.on('message', (message) => {
      replies.push(message);
      if (message.kind === 'error') workerError = message;
      receive?.(message);
    });
    worker.on('error', (error) => { workerError = error; });
    lane = createSimLaneRuntime({
      state, bus: createBus(), registry: {},
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: {
        scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
        scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'time-effects-wire',
      },
      channelFactory: () => ({
        post(message) { posts.push(message); worker.postMessage(message); },
        onMessage(handler) { receive = handler; },
        onError(handler) { worker.on('error', handler); }, terminate() {},
      }),
    });
    await lane.readyPromise;
    lane.runner.setClockActive(true);
    heartbeat = setInterval(() => lane.runner.heartbeat(), 16);
    // b931aac851fb2 moved Bullet Time from CapsLock to the context wheel's latch.
    const toggleBulletTime = () => laneDomEvent({ type: 'wheelVerb', action: 'bulletTime', phase: 'toggle' });
    const latestScale = () => replies.filter((r) => r.kind === 'clockTick').at(-1)?.clockDiagnostics?.scale;
    const probe = async () => {
      const result = await laneRpc('probeState');
      assert.equal(result.ok, true, workerError?.message);
      return result.result;
    };
    async function launch() {
      const result = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
      assert.equal(result.ok, true);
      assert.equal(result.result.ok, true);
      laneSetMode(state, null, 'flight');
      const held = await probe();
      assert.equal(held.mode, 'flight');
      assert.equal(held.timeEffects['runtime:loading']?.scale, 0, 'presentation still holds the first-picture veil');
      assert.equal(held.timeEffects['presentation:runtime:loading'], undefined, 'sim boot has retired its own overlapping lease');
      assert.equal(latestScale(), 0);
      assert.equal(held.bulletTime?.active, false, 'the old run request is cleared before the veil releases');
      effects.clear('runtime:loading');
      const released = await probe();
      assert.equal(Object.keys(released.timeEffects).some((key) => key.endsWith('runtime:loading')), false);
      assert.equal(released.timeScale, 1);
    }
    await launch();
    toggleBulletTime();
    await waitFor(() => latestScale() === 0.35 && state.timeScale === 0.35);
    const held = await probe();
    assert.equal(held.bulletTime.active, true);
    assert.ok(held.bulletTime.energy > 0 && held.bulletTime.energy <= 1);
    assert.equal(held.timeEffects['player:bullet-time'].scale, 0.35);
    assert.equal(readLocalTimeEffectsSnapshot(state).requests['player:bullet-time'], undefined, 'worker requests never echo as presentation ownership');

    effects.set('ui:pausing-screen', { scale: 0 });
    await waitFor(() => latestScale() === 0);
    const pausedTick = (await probe()).tick;
    effects.set('feel:hit-stop', { scale: 0.12 });
    const paused = await probe();
    assert.equal(paused.timeScale, 0);
    assert.equal(paused.timeEffects['feel:hit-stop'].scale, 0.12, 'a hidden source change crosses while the effective scale stays zero');
    assert.equal(paused.tick, pausedTick);
    const settledCommands = posts.filter((p) => p.kind === 'clockCommand').length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(posts.filter((p) => p.kind === 'clockCommand').length, settledCommands, 'mirrored requests and ACKs settle without a command echo loop');
    effects.clear('ui:pausing-screen');
    await waitFor(() => latestScale() === 0.12);
    effects.clear('feel:hit-stop');
    await waitFor(() => latestScale() === 0.35);
    toggleBulletTime();
    await waitFor(() => latestScale() === 1 && state.timeScale === 1);
    const released = await probe();
    assert.equal(released.bulletTime.active, false);
    assert.equal(released.timeEffects['player:bullet-time'], undefined);

    toggleBulletTime();
    await waitFor(() => latestScale() === 0.35);
    effects.set('runtime:loading', { scale: 0 });
    await launch();
    const fresh = await probe();
    assert.equal(fresh.bulletTime.active, false, 'new game clears the previous run effect');
    assert.equal(fresh.timeEffects['player:bullet-time'], undefined);
    lane.runner.setLifecycleGeneration(1);
    const current = await probe();
    assert.equal(current.timeScale, 1);
    assert.equal(workerError, undefined);
  } finally {
    clearInterval(heartbeat);
    lane?.close();
    await worker.terminate();
  }
});

test('worker-local deadline scheduling keeps cadence across async tick work', async () => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage() {} };
  try {
    const worker = await import(`../src/core/wholeSimBrowserWorker.js?clock-deadline-${Date.now()}`);
    const interval = 1000 / 60;
    let now = 0;
    let deadline = worker.nextLocalClockDeadline(0, now, interval);
    const timers = [];
    const arm = () => {
      deadline = worker.nextLocalClockDeadline(deadline, now, interval);
      timers.push({ at: now + Math.max(0, deadline - now) });
    };

    // The first deadline is one fixed step from activation. Firing it advances
    // the next deadline before the authoritative async work begins.
    assert.ok(Math.abs(deadline - interval) < 1e-9);
    now = deadline;
    deadline = worker.nextLocalClockDeadline(deadline, now, interval);
    assert.ok(Math.abs(deadline - interval * 2) < 1e-9);

    // Model the measured ~9.5 ms host tick. The next wake is the remaining
    // portion of the fixed interval, rather than another full 16.67 ms after
    // the tick completes.
    now += 9.5;
    arm();
    assert.ok(timers.at(-1).at - now < interval / 2,
      'work duration must shorten the next timer delay');
    assert.ok(Math.abs(timers.at(-1).at - interval * 2) < 1e-9);

    // A delayed callback skips missed deadlines once, preserving the bounded
    // hitch/shedding policy instead of creating a zero-delay timer spin.
    now = 100;
    deadline = worker.nextLocalClockDeadline(deadline, now, interval);
    assert.ok(deadline > now);
    assert.ok(deadline - now <= interval + 1e-9);
  } finally {
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('active ACK publishes only a contiguous retained reply and fails closed on a journal gap', async () => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage() {} };
  try {
    const worker = await import(`../src/core/wholeSimBrowserWorker.js?ack-retained-${Date.now()}`);
    const retained = { journalStart: 42, journalEnd: 48 };
    assert.equal(
      worker.localAckReplyAction(retained, { ackJournalEnd: 42, active: true, scale: 1 }),
      'publish',
      'an active ACK can publish the already-merged contiguous reply immediately',
    );
    assert.equal(
      worker.localAckReplyAction(retained, { ackJournalEnd: 41, active: true, scale: 1 }),
      'schedule',
      'a retained range that starts after the applied-watermark ACK is mid-apply backpressure, '
        + 'not a dropped hole — keep retaining instead of scheduling another rebuild',
    );
    assert.equal(worker.localAckReplyAction(retained, {
      ackJournalEnd: 40, orderedPostedEnd: 42, active: true, scale: 1,
    }), 'publish');
    assert.equal(worker.localAckReplyAction(retained, {
      ackJournalEnd: 40, orderedPostedEnd: 41, active: true, scale: 1,
    }), 'schedule');
    assert.equal(
      worker.localAckReplyAction(retained, {
        ackJournalEnd: 42, active: true, scale: 1, needsRebuild: true,
      }),
      'schedule-rebuild',
      'an explicit rebuild marker cannot take the direct publish path',
    );
    assert.equal(
      worker.localAckReplyAction(retained, { ackJournalEnd: 42, active: false, scale: 1 }),
      'schedule',
      'inactive clocks preserve their immediate maintenance path',
    );
  } finally {
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('the first freed reply credit sends the contiguous retained tail before the next physics wake', async () => {
  const previousSelf = globalThis.self;
  const replies = [];
  globalThis.self = { postMessage: reply => replies.push(reply) };
  const send = data => globalThis.self.onmessage({ data });
  const ticks = () => replies.filter(reply => reply.kind === 'clockTick');
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?retained-fifo-${Date.now()}`);
    send({ kind: 'init', seq: 'fifo-init', profile: 'production', clockMode: 'worker-local',
      timeScale: 1, seed: 4242, settings: {},
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    await waitFor(() => replies.some(reply => reply.kind === 'ready'));
    send({ kind: 'clockControl', active: true, generation: 1, lifecycleGeneration: 0, timeScale: 1 });
    for (let i = 1; i <= 5; i++) {
      send({ kind: 'clockCommand', commandSequence: i, lifecycleGeneration: 0, timeScale: 1, steps: 1,
        commands: [{ t: 'spawn', seq: i, p: { token: `fifo-spawn-${i}`, spec: {
          type: 'asteroid', pos: { x: i * 200, z: 1000 }, vel: { x: 0, z: 0 }, radius: 12,
          collides: false, data: { typeId: 'ast_common_rock' },
        } } }] });
    }
    send({ kind: 'finalize', seq: 'fifo-barrier' });
    await waitFor(() => replies.some(reply => reply.seq === 'fifo-barrier'));
    const before = ticks();
    // NO-FREEZE: two credits (one applying, one queued); the other three ticks merge into one retained reply.
    assert.equal(before.length, 2, 'the rest is retained while both credits are used');
    send({ kind: 'clockAck', lifecycleGeneration: 0, clockSequence: before[0].clockSequence,
      ackJournalEnd: before[0].journalEnd });
    const after = ticks();
    assert.equal(after.length, 3, 'the freed credit sends the retained reply during ACK ingress');
    assert.equal(after[2].clockSequence, after[1].clockSequence + 1);
    assert.equal(after[2].journalStart, after[1].journalEnd);
    assert.equal(after[2].journalFullRebuild, false);
    assert.equal(after[2].spawnInfos.length, 3, 'the merged reply carries every retained spawn in order');
    assert.equal(after[2].commandSequence, 5);
  } finally {
    send({ kind: 'shutdown', seq: 'fifo-shutdown' });
    await waitFor(() => replies.some(reply => reply.seq === 'fifo-shutdown'));
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('paused reply credits at the same journal end cannot keep ACK maintenance alive', async () => {
  const previousSelf = globalThis.self;
  const replies = [];
  globalThis.self = { postMessage: reply => replies.push(reply) };
  const send = data => globalThis.self.onmessage({ data });
  const ticks = () => replies.filter(reply => reply.kind === 'clockTick');
  const barrier = async (seq) => {
    send({ kind: 'finalize', seq });
    await waitFor(() => replies.some(reply => reply.seq === seq));
  };
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?paused-journal-ack-${Date.now()}`);
    send({ kind: 'init', seq: 'paused-ack-init', profile: 'production', clockMode: 'worker-local',
      timeScale: 0, seed: 4242, settings: {},
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    await waitFor(() => replies.some(reply => reply.kind === 'ready'));
    send({ kind: 'clockCommand', commandSequence: 1, lifecycleGeneration: 0, timeScale: 0,
      commands: [{ t: 'spawn', seq: 1, p: { token: 'paused-ack-rock', spec: {
        type: 'asteroid', pos: { x: 200, z: 1000 }, vel: { x: 0, z: 0 }, radius: 12,
        collides: false, data: { typeId: 'ast_common_rock' },
      } } }] });
    send({ kind: 'clockCommand', commandSequence: 2, lifecycleGeneration: 0, timeScale: 0, commands: [] });
    await barrier('paused-ack-start');
    const [first, second] = ticks();
    assert.ok(first.journalEnd > 0);
    assert.equal(second.journalEnd, first.journalEnd);
    const ack = reply => send({ kind: 'clockAck', lifecycleGeneration: 0,
      clockSequence: reply.clockSequence, ackJournalEnd: reply.journalEnd });
    ack(first);
    await barrier('paused-ack-first');
    const afterFirst = ticks().length;
    ack(second);
    await barrier('paused-ack-repeat');
    assert.equal(ticks().length, afterFirst, 'a later credit at an already trimmed journal end emits no reply');
    ack(ticks().at(-1));
    await barrier('paused-ack-settled');
    assert.equal(ticks().length, afterFirst);
  } finally {
    send({ kind: 'shutdown', seq: 'paused-ack-shutdown' });
    await waitFor(() => replies.some(reply => reply.seq === 'paused-ack-shutdown'));
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('coalesced journal keeps generation reuse ordering, type remaps, and SAB bounds', { timeout: 60000 }, async (t) => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  const posts = [];
  globalThis.self = { postMessage(message) { posts.push(message); } };
  const arena = journalOnlySabArena();
  let worker = null;
  try {
    worker = await import(`../src/core/wholeSimBrowserWorker.js?merge-pack-sab-${Date.now()}`);
    const scenarioContract = JSON.parse(readFileSync(
      new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
    ));
    // Bind the journal slots without arming the envelope rings. The custom
    // journal-only descriptor is intentionally too small for the v2 rings.
    globalThis.self.onmessage({ data: {
      kind: 'init',
      seq: 'sab-merge-init',
      profile: 'production',
      clockMode: 'manual',
      timeScale: 0,
      seed: 4242,
      settings: {},
      domainMirroring: {},
      bridgeAll: false,
      tacticalAI: false,
      viewport: { w: 800, h: 600 },
      scenarioContract,
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
      scenarioContractHash: 'sab-merge-fixture',
      sabArena: { sab: arena.sab, slotCount: arena.slotCount, recordCap: arena.recordCap },
    } });
    await waitFor(() => posts.some((message) => message.kind === 'ready'), 30000);

    // The second segment deliberately interns asteroid before ship. The
    // merged pack must remap those local indexes while preserving the exact
    // birth → transform → despawn → same-id/new-generation birth → transform
    // ordering that the presentation journal relies on.
    const first = {
      kind: 'clockTick',
      clockSequence: 1,
      journalStart: 100,
      journalEnd: 102,
      pack: sabJournalPack(arena, 0, 100, [
        { kind: 1, entityId: 42, generation: 1, type: 'ship', tick: 10 },
        { kind: 3, entityId: 42, generation: 1, type: 'ship', tick: 10, x: 4 },
      ]),
      completedTick: { sequence: 1, tick: 10, journalStart: 100, journalEnd: 102 },
    };
    const second = {
      kind: 'clockTick',
      clockSequence: 2,
      journalStart: 102,
      journalEnd: 106,
      pack: sabJournalPack(arena, 1, 102, [
        { kind: 2, entityId: 42, generation: 1, type: 'ship', tick: 11 },
        { kind: 1, entityId: 42, generation: 2, type: 'asteroid', tick: 11 },
        { kind: 3, entityId: 42, generation: 2, type: 'asteroid', tick: 11, z: -3 },
        { kind: 4, entityId: 7, generation: 1, type: 'ship', tick: 11 },
      ]),
      completedTick: { sequence: 2, tick: 11, journalStart: 102, journalEnd: 106 },
    };
    const merged = worker.localMergeReply(first, second);
    const materialized = worker.localMaterializePack(merged);
    assert.equal(merged.journalStart, 100);
    assert.equal(merged.journalEnd, 106);
    assert.equal(materialized.count, 6);
    assert.deepEqual(Array.from(materialized.kinds), [1, 3, 2, 1, 3, 4]);
    assert.deepEqual(
      Array.from(materialized.scalars).filter((_, index) => index % 18 === 2),
      [42, 42, 42, 42, 42, 7],
    );
    assert.deepEqual(
      Array.from(materialized.scalars).filter((_, index) => index % 18 === 3),
      [1, 1, 1, 2, 2, 1],
    );
    assert.deepEqual(materialized.spawnEntityIds, [42, 42]);
    assert.deepEqual(
      Array.from(materialized.typeIndex).map((index) => materialized.typeTable[index]),
      ['ship', 'ship', 'ship', 'asteroid', 'asteroid', 'ship'],
    );
    assert.equal(Atomics.load(arena.header, 4), 0, 'merged SAB slot released after materialization');
    assert.equal(Atomics.load(arena.header, 5), 0, 'second merged SAB slot released after materialization');

    // Exceed the bounded segment count without materializing intermediate
    // replies. The fallback must release every abandoned SAB slot, retain only
    // the current pack for the authoritative rebuild, and leave that current
    // slot busy for the main lane to ACK later.
    let fallback = {
      kind: 'clockTick',
      journalStart: 0,
      journalEnd: 1,
      pack: sabJournalPack(arena, 0, 0, [
        { kind: 4, entityId: 1000, generation: 1, type: 'type-0', tick: 1 },
      ]),
    };
    for (let slot = 1; slot <= 64; slot++) {
      fallback = worker.localMergeReply(fallback, {
        kind: 'clockTick',
        journalStart: slot,
        journalEnd: slot + 1,
        pack: slot < arena.slotCount - 1 || slot === 64
          ? sabJournalPack(arena, slot === 64 ? arena.slotCount - 1 : slot, slot, [
            { kind: 4, entityId: 1000 + slot, generation: 1, type: `type-${slot}`, tick: slot + 1 },
          ])
          : journalPack(slot, [
            { kind: 4, entityId: 1000 + slot, generation: 1, type: `type-${slot}`, tick: slot + 1 },
          ]),
      });
    }
    assert.equal(fallback.journalStart, 64);
    assert.equal(fallback.journalEnd, 65);
    assert.equal(fallback.pack.sab, true);
    assert.equal(fallback.pack.sabSlot, arena.slotCount - 1);
    for (let slot = 0; slot < arena.slotCount - 1; slot++) {
      assert.equal(Atomics.load(arena.header, 4 + slot), 0, `fallback released abandoned SAB slot ${slot}`);
    }
    assert.equal(Atomics.load(arena.header, 4 + arena.slotCount - 1), 1);
  } finally {
    try {
      globalThis.self.onmessage({ data: { kind: 'shutdown', seq: 'sab-merge-shutdown' } });
    } catch (_) { /* test teardown */ }
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('a two-second presentation stall resumes without teleporting the world ahead', { timeout: 120000 }, async () => {
  const replies = [];
  let receive;
  let workerError;
  let heartbeat;
  const worker = new Worker(new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url), { type: 'module' });
  const state = createGameState(4242);
  const effects = createTimeEffects(state);
  effects.set('runtime:loading', { scale: 0 });
  let lane;
  try {
    worker.on('message', (message) => {
      replies.push(message);
      if (message.kind === 'error') workerError = message;
      receive?.(message);
    });
    worker.on('error', (error) => { workerError = error; });
    lane = createSimLaneRuntime({
      state, bus: createBus(), registry: {},
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: {
        scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
        scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'heartbeat-stall-2s-wire',
      },
      channelFactory: () => ({
        post(message) { worker.postMessage(message); },
        onMessage(handler) { receive = handler; },
        onError(handler) { worker.on('error', handler); }, terminate() {},
      }),
    });
    await lane.readyPromise;
    const boot = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
    assert.equal(boot.ok, true, workerError?.message);
    assert.equal(boot.result.ok, true);
    laneSetMode(state, null, 'flight');
    laneDomEvent({ type: 'keyup', code: 'CapsLock', pressed: false, repeat: false });
    effects.clear('runtime:loading');
    lane.runner.setClockActive(true);
    const latest = () => replies.filter((reply) => reply.kind === 'clockTick').at(-1);
    await waitFor(() => latest()?.clockDiagnostics?.scale === 1 && (latest()?.stateTick || 0) >= 4, 60000);
    // Simulate a 2 s main-thread stall: no presentation beats at all. The world
    // may only step inside the initial hold window, never through the stall.
    lane.runner.heartbeat();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const heldTick = latest()?.stateTick || 0;
    const heldSimTime = latest()?.simTime || 0;
    // Foreground presentation resumes its recurring beats; the world must resume from the held pose — a
    // teleport would replay ~120 owed ticks and land simTime ~2 s ahead.
    lane.runner.heartbeat();
    heartbeat = setInterval(() => lane.runner.heartbeat(), 16);
    await waitFor(() => (latest()?.stateTick || 0) > heldTick + 2, 30000);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const resumed = latest() || {};
    const resumedAdvance = (resumed.stateTick || 0) - heldTick;
    // NO-FREEZE rule: nothing but the 1 s dead-page hold stops the clock (no ACK/backpressure
    // throttling before it), so up to ~60 ticks run inside the hold window plus the warm-up.
    assert.ok(heldTick <= 80,
      `during a 2 s stall the clock held after the 1 s dead-page window (tick reached ${heldTick}, a runaway would be ~120+)`);
    assert.ok(resumedAdvance <= 60,
      `after the stall the world resumed at run rate (+${resumedAdvance} ticks in ~0.6 s, a teleport would burst ~105)`);
    assert.ok((resumed.simTime || 0) - heldSimTime <= 1.2,
      `simTime did not jump seconds ahead on resume (+${((resumed.simTime || 0) - heldSimTime).toFixed(2)} s)`);
    assert.ok((resumed.clockDiagnostics?.heartbeatHolds || 0) > 0,
      'the worker recorded the presentation-stall hold');
    assert.equal(workerError, undefined);
  } finally {
    clearInterval(heartbeat);
    lane?.close();
    await worker.terminate();
  }
});

test('a foreground heartbeat arriving before a throttled timer discards the hidden wall interval', async (t) => {
  const previousSelf = globalThis.self;
  const replies = [];
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  const send = (data) => globalThis.self.onmessage({ data });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?heartbeat-before-timer-${Date.now()}`);
    send({
      kind: 'init', seq: 'heartbeat-before-timer', profile: 'production', clockMode: 'worker-local',
      timeScale: 1, seed: 4242, settings: {},
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'heartbeat-before-timer',
    });
    await waitFor(() => replies.some((reply) => reply.kind === 'ready'));

    // Keep the real browser adapter and host. Control only dispatch order and wall time so
    // the returning message always arrives ahead of the timer that was delayed with it.
    let now = performance.now();
    let timerId = 0;
    const timers = new Map();
    t.mock.method(performance, 'now', () => now);
    t.mock.method(globalThis, 'setTimeout', (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    });
    t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
    const fireClock = async () => {
      const scheduled = timers.entries().next().value;
      assert.ok(scheduled, 'the authoritative clock is armed');
      const [id, fire] = scheduled;
      timers.delete(id);
      fire();
      await settle();
    };

    send({ kind: 'clockControl', active: true, generation: 1, timeScale: 1 });
    await settle();
    send({ kind: 'laneHeartbeat' });
    // ENGINE slice 5: the hold is a dead-main-thread guard (LOCAL_HEARTBEAT_HOLD_MS = 1000), so the
    // gap must exceed it to be a hidden interval.
    now += 1500;
    send({ kind: 'laneHeartbeat' });
    await fireClock();
    assert.equal(replies.filter((reply) => reply.kind === 'clockTick').length, 0,
      'a timer overdue across the gap may not publish a catch-up step');

    now += 1000 / 60 + 1;
    await fireClock();
    const first = replies.find((reply) => reply.kind === 'clockTick');
    assert.ok(first, 'one fresh interval resumes simulation');
    assert.equal(first.clockDiagnostics.steps, 1);
    assert.equal(first.clockDiagnostics.shedSteps, 0);
    assert.equal(first.clockDiagnostics.heartbeatHolds, 1);

    send({ kind: 'clockAck', clockSequence: first.clockSequence, ackJournalEnd: first.journalEnd });
    await settle();
    const delayedTimer = [...timers.values()][0];
    now += 40;
    send({ kind: 'laneHeartbeat' });
    await settle();
    assert.equal(replies.filter(reply => reply.kind === 'clockTick').length, 2,
      'foreground messages can recover a worker wake that the timer queue did not deliver');
    delayedTimer();
    await settle();
    assert.equal(replies.filter(reply => reply.kind === 'clockTick').length, 2,
      'late delivery of that same timer cannot step a second time');
  } finally {
    if (typeof globalThis.self.onmessage === 'function') {
      send({ kind: 'shutdown', seq: 'heartbeat-before-timer-shutdown' });
      await settle();
    }
    t.mock.restoreAll();
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('overdue worker wakes yield a timer and discard obsolete posted tasks', async (t) => {
  const previousSelf = globalThis.self;
  const previousChannel = Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel');
  const replies = [];
  const tasks = [];
  const closedPorts = [];
  let now = 10;
  const send = (data) => globalThis.self.onmessage({ data });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const ticks = () => replies.filter((reply) => reply.kind === 'clockTick').length;
  globalThis.self = { postMessage(reply) {
    replies.push(reply);
    if (reply.kind !== 'clockTick') return;
    // Charge more than one tick of work after the host records the turn's start.
    now += 18;
    send({ kind: 'clockAck', clockSequence: reply.clockSequence });
  } };
  const setChannel = (value) => Object.defineProperty(globalThis, 'MessageChannel', {
    configurable: true, writable: true, value,
  });
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?overdue-wake-${Date.now()}`);
    send({
      kind: 'init', seq: 'overdue-wake', profile: 'production', clockMode: 'worker-local',
      timeScale: 1, seed: 4242, settings: {},
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'overdue-wake',
    });
    await waitFor(() => replies.some((reply) => reply.kind === 'ready'));

    const timers = new Map();
    let timerId = 0;
    t.mock.method(performance, 'now', () => now);
    t.mock.method(globalThis, 'setTimeout', (fire, delay) => {
      timers.set(++timerId, { fire, delay });
      return timerId;
    });
    t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
    const clockTimer = () => Array.from(timers.entries()).find(([, timer]) => timer.delay < 30);
    const fireTimer = async () => {
      const pending = clockTimer();
      assert.ok(pending, 'a clock timer is armed');
      const [id, { fire, delay }] = pending;
      timers.delete(id);
      if (delay > 0) now += delay + 0.01;
      fire();
      await settle();
    };
    const control = (generation, active) => send({ kind: 'clockControl', active, generation, timeScale: 1 });
    const heartbeat = () => send({ kind: 'laneHeartbeat' });

    setChannel(undefined);
    control(1, true);
    await settle();
    heartbeat();
    assert.ok(clockTimer()[1].delay > 0, 'a future deadline uses a delayed timer');
    await fireTimer();
    assert.equal(clockTimer()[1].delay, 0, 'a worker without MessageChannel uses a timer for debt');

    setChannel(class {
      constructor() {
        const receive = this.port1 = { onmessage: null, close: () => closedPorts.push(1) };
        this.port2 = {
          postMessage: (data) => tasks.push(() => receive.onmessage({ data })),
          close: () => closedPorts.push(2),
        };
      }
    });
    await fireTimer();
    for (let i = 0; i < 4; i++) {
      assert.equal(tasks.length, 1, 'one task is pending for the whole-tick debt');
      assert.equal(clockTimer(), undefined);
      tasks.shift()();
      await settle();
    }
    assert.equal(tasks.length, 0);
    assert.equal(clockTimer()[1].delay, 0, 'four task wakes give the timer queue a turn');
    await fireTimer();
    assert.equal(tasks.length, 1, 'task wakes resume after the fairness timer');

    const delayed = tasks.shift();
    const recovery = Array.from(timers.values()).find(timer => timer.delay > 30 && timer.delay < 40);
    assert.ok(recovery, 'an accepted but undelivered task has a bounded timer');
    const beforeRecovery = ticks();
    now += recovery.delay;
    recovery.fire();
    await settle();
    assert.equal(ticks(), beforeRecovery + 1, 'the fallback advances the active clock');
    delayed();
    await settle();
    assert.equal(ticks(), beforeRecovery + 1, 'late delivery cannot run the same wake again');

    const obsolete = tasks.shift();
    control(2, false);
    await settle();
    control(3, true);
    await settle();
    assert.ok(clockTimer()[1].delay > 0);
    await fireTimer();
    assert.equal(tasks.length, 1);
    const beforeObsolete = ticks();
    obsolete();
    await settle();
    assert.equal(ticks(), beforeObsolete, 'an obsolete task cannot trigger a new generation');

    const missed = tasks.shift();
    now += 1000;
    heartbeat();
    missed();
    await settle();
    assert.equal(ticks(), beforeObsolete, 'a pending task cannot charge a missed heartbeat');
    assert.ok(clockTimer()[1].delay > 0, 'foreground return starts a fresh deadline');

    now += 1000 / 60 + 1;
    await fireTimer();
    assert.equal(tasks.length, 1);
    const beforeShutdown = ticks();
    send({ kind: 'shutdown', seq: 'overdue-wake-shutdown' });
    await settle();
    assert.deepEqual(closedPorts, [1, 2]);
    assert.equal(clockTimer(), undefined);
    tasks.shift()();
    await settle();
    assert.equal(ticks(), beforeShutdown, 'a posted task cannot run after shutdown');
  } finally {
    if (!replies.some((reply) => reply.kind === 'bye') && typeof globalThis.self.onmessage === 'function') {
      send({ kind: 'shutdown', seq: 'overdue-wake-cleanup' });
      await settle();
    }
    t.mock.restoreAll();
    if (previousChannel) Object.defineProperty(globalThis, 'MessageChannel', previousChannel);
    else delete globalThis.MessageChannel;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('a budget-limited batch retains unexecuted ticks for later clock turns', { timeout: 60000 }, async () => {
  let receive;
  let limited;
  let lane;
  let heartbeat;
  const worker = new Worker(new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url), {
    type: 'module', workerData: { slowPhysicsStep: true },
  });
  try {
    worker.on('message', (reply) => {
      if (reply.clockDiagnostics?.budgetShedSteps > 0 || reply.clockDiagnostics?.budgetDeferredSteps > 0) {
        limited ??= reply;
      }
      receive?.(reply);
    });
    const state = createGameState(4242);
    lane = createSimLaneRuntime({
      state, bus: createBus(), registry: {},
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: {
        scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
        scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'clock-budget-wire',
      },
      channelFactory: () => ({
        post(message) { worker.postMessage(message); },
        onMessage(handler) { receive = handler; },
        onError(handler) { worker.on('error', handler); }, terminate() {},
      }),
    });
    await lane.readyPromise;
    const boot = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
    assert.equal(boot.result.ok, true);
    laneSetMode(state, null, 'flight');
    lane.runner.setClockActive(true);
    heartbeat = setInterval(() => lane.runner.heartbeat(), 16);
    await waitFor(() => limited, 10000);
    assert.equal(limited.stepsExecuted, 1, 'the host yields after its expensive step');
    assert.equal(limited.inputPublishCount, 1, 'the normal worker counted input attribution');
    assert.equal(limited.inputPublishes, undefined, 'the normal worker shipped no full input graph');
    assert.ok(limited.clockAccumulator >= 1 / 60, 'at least one unexecuted tick is still owed');
    assert.ok(lane.getDiagnostics().workerClockLastDiagnostics.budgetDeferredSteps > 0, 'main can attribute the work limit');
  } finally {
    clearInterval(heartbeat);
    lane?.close();
    await worker.terminate();
  }
});

test('worker-local clock is unsolicited and command FIFO remains serialized', async (t) => {
  const f = makeFixture(t);
  assert.equal(f.lane.getDiagnostics().clockOwner, 'worker-local');

  f.lane.runner.setClockActive(true);
  const control = f.posts.find((msg) => msg.kind === 'clockControl');
  assert.ok(control);
  assert.equal(control.active, true);
  assert.equal(control.timeScale, 1);

  // A worker reply does not need a pending directive entry. The main lane
  // accepts it, updates the mirror, and queues an acknowledgement.
  sendClockTick(f, 1);
  assert.equal(f.state.tick, 1);
  assert.equal(f.state.accumulator, 0.004);
  assert.ok(f.posts.some((msg) => msg.kind === 'clockAck'));

  laneDomEvent({ type: 'resize' });
  const command = f.posts.at(-1);
  assert.equal(command.kind, 'clockCommand');
  assert.equal(command.commandSequence, 1);
  assert.equal(command.commands[0].t, 'dom');

  sendClockTick(f, 2, 1, 2);
  assert.equal(f.lane.getDiagnostics().workerClockLastReceivedSequence, 2);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, false);
  f.lane.runner.setClockActive(false);
  assert.equal(f.posts.at(-1).kind, 'clockControl');
  assert.equal(f.posts.at(-1).active, false);
});

test('unchanged paused presentation samples settle while real physical/camera/lifecycle changes still wake', async (t) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prompt = getPromptDevice(), capture = getGamepadCaptureHandler();
  let pads = [], x = 42, z = -7;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
    setPromptDevice(prompt); setGamepadCaptureHandler(capture);
  });
  const f = makeFixture(t, { helpers: { raycastToPlane(_ndc, hit) { hit.x = x; hit.z = z; return hit; } } });
  f.state.timeScale = 0; f.state.ui.screenStack = ['station']; f.state.ui.docked = true;
  f.state.camera = { zoom: 1, displayedZoom: 1, focus: { x: 0, z: 0 } };
  let sequence = 0;
  const commands = () => f.posts.filter(message => message.kind === 'clockCommand');
  const settle = () => {
    for (let n = 0; f.lane.getDiagnostics().workerClockCommandInFlight && n < 4; n++) {
      const command = commands().at(-1);
      f.receive({ kind: 'clockTick', seq: `idle-${++sequence}`, clockSequence: sequence,
        commandSequence: command.commandSequence, stateTick: 0, simTime: 0,
        journalStart: 0, journalEnd: 0, pack: emptyPack() });
    }
    assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, false);
  };
  const frame = () => { f.lane.runner.prepareWithoutAdvance(); settle(); };
  frame();
  const firstSamples = commands().flatMap(message => message.commands);
  assert.ok(firstSamples.some(command => command.p?.d?.type === 'gamepadFrame'));
  assert.ok(firstSamples.some(command => command.p?.d?.type === 'cursorProjection'));
  assert.ok(firstSamples.some(command => command.t === 'camera'));
  let count = commands().length;
  for (let n = 0; n < 8; n++) frame();
  assert.equal(commands().length, count, 'unchanged rAF cannot force another zero-step pack');
  const changedFrame = () => { frame(); assert.equal(commands().length, ++count); };
  x++; changedFrame();
  f.state.camera.displayFov = 55; changedFrame();
  f.state.camera.frameOriginX = 1000; changedFrame();
  pads = [{ id: 'physical-pad', connected: true, index: 0, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: [{ pressed: false, value: 0 }] }]; changedFrame();
  pads[0].axes[0] = 0.5; pads[0].buttons[0] = { pressed: true, value: 1 }; changedFrame();
  for (let n = 0; n < 4; n++) frame();
  assert.equal(commands().length, count, 'held physical values persist without a transport heartbeat');
  pads[0].buttons[0] = { pressed: false, value: 0 }; changedFrame();
  pads = []; changedFrame();
  setPromptDevice('touch'); changedFrame();
  setGamepadCaptureHandler(() => {}); changedFrame();
  f.lane.runner.setLifecycleGeneration(1); changedFrame();
  assert.ok(commands().at(-1).commands.some(command => command.p?.d?.type === 'gamepadFrame'));
  assert.ok(commands().at(-1).commands.some(command => command.p?.d?.type === 'cursorProjection'));
  const effects = createTimeEffects(f.state);
  effects.set('ui:pausing-screen', { scale: 0 }); settle();
  const beforeEffect = commands().length;
  effects.set('feel:hit-stop', { scale: 0.12 }); settle();
  assert.equal(commands().length, beforeEffect + 1, 'a hidden time-effect revision remains immediate at scale zero');
  assert.equal(commands().at(-1).timeEffectsSnapshot.revision, readLocalTimeEffectsSnapshot(f.state).revision);
  const beforeIdle = commands().length;
  frame(); frame();
  assert.equal(commands().length, beforeIdle);
  const last = commands().length;
  laneDomEvent({ type: 'keyup', code: 'KeyW' }); settle();
  assert.ok(commands().length > last, 'explicit release stays immediate even if sampled payloads match');
  const beforeRpc = commands().length;
  const rpc = laneRpc('probeState');
  assert.equal(commands().length, beforeRpc + 1, 'paused RPC wakes independently of sample changes');
  const command = commands().at(-1), request = command.commands.find(row => row.t === 'rpc');
  f.receive({ kind: 'clockTick', seq: `rpc-${++sequence}`, clockSequence: sequence,
    commandSequence: command.commandSequence, stateTick: 0, simTime: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(), rpcAcks: [{ id: request.p.id, ok: true, result: {} }] });
  await rpc;
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('a silent worker-local command closes after five seconds of responsive dispatch', async (t) => {
  const f = makeWatchdogFixture(t);
  f.lane.runner.setClockActive(true);
  laneDomEvent({ type: 'resize' });
  const command = f.posts.at(-1);
  assert.equal(command.kind, 'clockCommand');
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);

  for (let i = 0; i < 49; i++) f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch();
  t.mock.timers.tick(0);

  assert.equal(f.lane.runner.isClosed(), true);
  assert.match(f.lane.getDiagnostics().error, new RegExp(
    `clock command stalled >5000ms.*commandSequence ${command.commandSequence}`,
  ));
  assert.equal(f.lane.getDiagnostics().closeCauseMessage, f.lane.getDiagnostics().error);
  assert.equal(f.lane.getDiagnostics().closeCauseSite, f.lane.getDiagnostics().errorSite);
  assert.throws(() => f.lane.runner.stepOnce(), /clock command stalled >5000ms/);
});

test('local command watchdog excludes a blocked main-thread interval', async (t) => {
  const f = makeWatchdogFixture(t);
  f.lane.runner.setClockActive(true);
  laneDomEvent({ type: 'resize' });
  f.advanceWall(15000);
  t.mock.timers.tick(100);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);

  // Dispatch was unavailable for 14.9 s; only the 100 ms timer turn counts
  // toward the worker's responsive silence budget.
  const diagnostics = f.lane.getDiagnostics();
  assert.equal(diagnostics.workerClockCommandMainThreadDelayedMs, 14900);
  assert.equal(diagnostics.workerClockCommandResponsiveMs, 100);
  assert.equal(f.lane.runner.isClosed(), false);
  f.dispatch();
  f.dispatch();
  assert.equal(f.lane.runner.isClosed(), false);
});

test('the applied command watermark cancels a local command watchdog', async (t) => {
  const f = makeWatchdogFixture(t);
  f.lane.runner.setClockActive(true);
  laneDomEvent({ type: 'resize' });
  const command = f.posts.at(-1);

  // A top-level command sequence alone must not overrule an explicit worker
  // diagnostic watermark that says the batch is still pending.
  f.receive({
    kind: 'clockTick', clockSequence: 1, commandSequence: command.commandSequence,
    clockDiagnostics: { appliedCommandSequence: command.commandSequence - 1 },
    stateTick: 1, simTime: 1 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);

  f.receive({
    kind: 'clockTick', clockSequence: 2, commandSequence: command.commandSequence,
    clockDiagnostics: { appliedCommandSequence: command.commandSequence },
    stateTick: 2, simTime: 2 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, false);
  f.advanceWall(15000);
  t.mock.timers.tick(15000);
  assert.equal(f.lane.runner.isClosed(), false);
});

test('a stale local completion cannot close a replacement command', async (t) => {
  const f = makeWatchdogFixture(t);
  f.lane.runner.setClockActive(true);
  laneDomEvent({ type: 'resize' });
  const first = f.posts.at(-1);
  f.receive({
    kind: 'clockTick', clockSequence: 1, commandSequence: first.commandSequence,
    clockDiagnostics: { appliedCommandSequence: first.commandSequence },
    stateTick: 1, simTime: 1 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  // DOM-event posts coalesce onto a short window; spacing the wall clock past
  // it models two distinct user inputs.
  f.advanceWall(9);
  laneDomEvent({ type: 'resize' });
  const replacement = f.posts.at(-1);
  assert.equal(replacement.kind, 'clockCommand');
  assert.notEqual(replacement.commandSequence, first.commandSequence);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);

  // This is a delayed reply for the first command. Its lower applied
  // watermark must not release the replacement or affect its watchdog.
  f.receive({
    kind: 'clockTick', clockSequence: 2, commandSequence: first.commandSequence,
    clockDiagnostics: { appliedCommandSequence: first.commandSequence },
    stateTick: 2, simTime: 2 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);
  assert.equal(f.lane.runner.isClosed(), false);

  f.receive({
    kind: 'clockTick', clockSequence: 3, commandSequence: replacement.commandSequence,
    clockDiagnostics: { appliedCommandSequence: replacement.commandSequence },
    stateTick: 3, simTime: 3 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, false);
  assert.equal(f.lane.runner.isClosed(), false);
});

test('pointer motion is latest-wins state: it rides the next frame batch, edges stay ordered and immediate', async (t) => {
  const f = makeWatchdogFixture(t);
  f.lane.runner.setClockActive(true);
  laneDomEvent({ type: 'keydown', code: 'KeyQ', pressed: true });
  const first = f.posts.at(-1);
  assert.equal(first.kind, 'clockCommand', 'the leading event posts immediately');
  f.receive({
    kind: 'clockTick', clockSequence: 1, commandSequence: first.commandSequence,
    clockDiagnostics: { appliedCommandSequence: first.commandSequence },
    stateTick: 1, simTime: 1 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  const postsAfterFirst = f.posts.length;

  // A pointer-stream burst inside the window mints no new posts — each raw
  // event used to pay a gamepad sample, raycast, camera payload, and post.
  laneDomEvent({ type: 'mousemove', clientX: 100, clientY: 100 });
  laneDomEvent({ type: 'pointermove', clientX: 100, clientY: 100 });
  laneDomEvent({ type: 'mousemove', clientX: 101, clientY: 100 });
  assert.equal(f.posts.length, postsAfterFirst, 'stream burst inside the window coalesces');

  // Discrete user actions bypass the window entirely: a held turn key posts on
  // its leading edge and drags the queued stream rows into the same command.
  laneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true });
  const dragged = f.posts.at(-1);
  assert.equal(dragged.kind, 'clockCommand', 'discrete input still posts immediately');
  assert.notEqual(dragged.commandSequence, first.commandSequence);
  // NO-FREEZE step 4: pointer motion is latest-wins state — one row per pointer event type
  // (movement summed), landing ahead of the key edge that drags it.
  const domRows = dragged.commands.filter((env) => env.t === 'dom');
  assert.equal(domRows.length, 3, 'mousemove + pointermove (one latest row each) ahead of the key');
  assert.equal(domRows[2].p.d.type, 'keydown', 'the key edge stays last, in order');
  f.receive({
    kind: 'clockTick', clockSequence: 2, commandSequence: dragged.commandSequence,
    clockDiagnostics: { appliedCommandSequence: dragged.commandSequence },
    stateTick: 2, simTime: 2 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  const postsAfterKey = f.posts.length;

  laneDomEvent({ type: 'pointermove', clientX: 102, clientY: 100 });
  assert.equal(f.posts.length, postsAfterKey, 'a fresh stream event re-enters the window');

  // Without a presented frame, the fallback state flush ships the latest pointer row.
  t.mock.timers.tick(51);
  const batched = f.posts.at(-1);
  assert.equal(batched.kind, 'clockCommand');
  assert.equal(batched.commands.filter((env) => env.t === 'dom').length, 1);

  // An event outside the window posts on the leading edge again.
  f.receive({
    kind: 'clockTick', clockSequence: 3, commandSequence: batched.commandSequence,
    clockDiagnostics: { appliedCommandSequence: batched.commandSequence },
    stateTick: 2, simTime: 2 / 60, clockAccumulator: 0,
    journalStart: 0, journalEnd: 0, pack: emptyPack(),
  });
  f.advanceWall(9);
  laneDomEvent({ type: 'keyup', code: 'KeyW', pressed: false });
  const second = f.posts.at(-1);
  assert.equal(second.kind, 'clockCommand');
  assert.notEqual(second.commandSequence, batched.commandSequence);
  assert.equal(second.commands.filter((env) => env.t === 'dom').length, 1);
});

test('worker-local completed metadata coalesces a blocked presentation without losing rebuild boundaries', async (t) => {
  const f = makeFixture(t);
  const durableEvents = [];
  f.bus.on('test:durable', (payload) => durableEvents.push(payload?.tick));
  f.lane.runner.setClockActive(true);

  // Eight records fill the bounded physical ring. Four more represent the
  // native rAF-blocked interval and must collapse into one metadata tail.
  for (let i = 1; i <= 12; i++) {
    const fullRebuild = i === 3 || i === 10;
    f.receive({
      kind: 'clockTick',
      seq: `clock-overflow-${i}`,
      clockSequence: i,
      commandSequence: 0,
      stateTick: i,
      simTime: i / 60,
      clockAccumulator: 0,
      journalStart: i - 1,
      journalEnd: i,
      journalFullRebuild: fullRebuild,
      journalRebuildGeneration: fullRebuild ? i : 0,
      events: [{ t: 'test:durable', p: { tick: i } }],
      completedTick: {
        sequence: i,
        tick: i,
        simTime: i / 60,
        stateDigestMarker: i,
        inputSequence: i,
        inputCommandSeq: i,
        inputWallMs: i,
        journalStart: i - 1,
        journalEnd: i,
      },
    });
  }

  assert.equal(f.lane.runner.isClosed(), false, 'a blocked presentation must not close the sim lane');
  const before = f.lane.getDiagnostics();
  assert.equal(before.completedTicksPending, 12);
  assert.equal(before.completedTickSlotsPending, 8);
  assert.equal(before.completedTickCoalescedCount, 4);
  assert.equal(before.completedFullRebuildsCoalesced, 1);
  assert.deepEqual(durableEvents, Array.from({ length: 12 }, (_, i) => i + 1),
    'durable events remain applied per reply instead of entering the coalesced metadata path');

  const latest = {};
  assert.equal(f.lane.runner.consumeLatestCompletedTick(latest), 12);
  assert.equal(latest.tick, 12);
  assert.equal(latest.journalStart, 9, 'the newest rebuild supersedes pre-rebuild ranges');
  assert.equal(latest.journalEnd, 12);
  assert.equal(latest.fullRebuild, true);
  assert.equal(latest.rebuildGeneration, 10);
  assert.equal(latest.fullRebuildCount, 2);
  assert.equal(latest.coalescedCount, 12);
  assert.equal(f.lane.runner.getPendingCompletedTickCount(), 0);
  assert.equal(f.lane.runner.isClosed(), false);
});

test('worker-local ACK flushes an unsolicited timer reply while a command is in flight', async (t) => {
  const f = makeFixture(t);
  f.lane.runner.setClockActive(true);
  laneWriteSetting(f.state, 'timeScale', 1);
  const command = f.posts.at(-1);
  assert.equal(command.kind, 'clockCommand');
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);

  // This reply represents a timer-owned step that reached the worker chain
  // before the command's own forced reply. The main side must acknowledge it
  // immediately, otherwise the worker coalesces the command reply forever.
  sendClockTick(f, 1, 0, 1);
  assert.ok(f.posts.some((message) => message.kind === 'clockAck'
    && message.clockSequence === 1));
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);

  laneDomEvent({ type: 'resize' });
  assert.equal(f.posts.at(-1).kind, 'clockAck', 'queued input waits behind the command');
  sendClockTick(f, 2, command.commandSequence, 2);
  // Applying the command reply releases the old flight and immediately ships
  // the queued input as the next FIFO command, so the new command is now in
  // flight. The important boundary is that it was not lost behind the timer
  // reply or appended to the old command.
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, true);
  const followUp = f.posts.at(-1);
  assert.equal(followUp.kind, 'clockCommand');
  assert.ok(followUp.commands.some((envelope) => envelope.t === 'dom'));
  assert.equal(followUp.ackClockSequence, 2);
  assert.equal(f.lane.getDiagnostics().workerClockLastAckedSequence, 2);
});

test('worker-local cumulative ACK preserves the newer journal end without a command reply', async (t) => {
  const f = makeFixture(t);
  f.lane.runner.setClockActive(true);

  // Presentation can acknowledge an older range in the same turn that a newer
  // worker reply arrives. Exercise the production journal ACK hook rather than
  // fabricating a private pendingAckEnd value.
  const applyPack = f.lane.journal.applyPack.bind(f.lane.journal);
  f.lane.journal.applyPack = (pack) => {
    const result = applyPack(pack);
    f.lane.journal.discardThrough(pack.end - 1);
    return result;
  };
  const pack = journalPack(0, [
    { kind: 1, entityId: 7, generation: 1, type: 'ship' },
    { kind: 3, entityId: 7, generation: 1, type: 'ship', x: 2, z: -3 },
  ]);
  f.receive({
    kind: 'clockTick',
    seq: 'clock-journal-ack-max',
    clockSequence: 1,
    commandSequence: 0,
    stateTick: 1,
    simTime: 1 / 60,
    journalStart: 0,
    journalEnd: pack.end,
    pack,
    completedTick: { sequence: 1, tick: 1, journalStart: 0, journalEnd: pack.end },
  });

  const combined = f.posts.at(-1);
  assert.equal(combined.kind, 'clockAck');
  assert.equal(combined.clockSequence, 1);
  assert.equal(
    combined.ackJournalEnd,
    pack.end,
    'a combined command must carry the worker reply end, not only the older presentation ACK',
  );
  const postsAfterCombinedAck = f.posts.filter(message => message.kind === 'clockAck').length;
  f.lane.runner.prepareWithoutAdvance();
  assert.equal(
    f.posts.filter(message => message.kind === 'clockAck').length,
    postsAfterCombinedAck,
    'the combined ACK is consumed once after posting and cannot replay on the next frame',
  );

  // The presentation cursor can also be ahead of a late/empty worker pack.
  // The command must retain that larger value rather than regressing the
  // worker-side discard watermark.
  const g = makeFixture(t);
  g.lane.runner.setClockActive(true);
  const applyPackAhead = g.lane.journal.applyPack.bind(g.lane.journal);
  g.lane.journal.applyPack = (nextPack) => {
    const result = applyPackAhead(nextPack);
    g.lane.journal.discardThrough(nextPack.end + 3);
    return result;
  };
  const latePack = journalPack(0, [
    { kind: 1, entityId: 9, generation: 1, type: 'asteroid' },
    { kind: 3, entityId: 9, generation: 1, type: 'asteroid', x: -4, z: 8 },
  ]);
  g.receive({
    kind: 'clockTick',
    seq: 'clock-journal-ack-ahead',
    clockSequence: 1,
    commandSequence: 0,
    stateTick: 1,
    simTime: 1 / 60,
    journalStart: 0,
    journalEnd: latePack.end,
    pack: latePack,
    completedTick: { sequence: 1, tick: 1, journalStart: 0, journalEnd: latePack.end },
  });
  const aheadCombined = g.posts.at(-1);
  assert.equal(aheadCombined.kind, 'clockAck');
  assert.equal(aheadCombined.clockSequence, 1);
  assert.equal(aheadCombined.ackJournalEnd, latePack.end + 3);
});

test('paused Crucible launch drains setting, mode, and boot RPC after the first command ack', async (t) => {
  const f = makeFixture(t);
  // This is the public menu state: the presentation loop is alive, but the
  // authoritative clock is intentionally frozen at timeScale 0.
  f.state.timeScale = 0;
  f.lane.runner.setClockActive(true);

  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: 4242 });
  assert.equal(setup.ok, true);
  const launchOpts = {
    crucibleLaunch: true,
    crucibleSetup: {
      survivalSetup: setup.value,
      survivalRuleset: setup.ruleset,
    },
  };

  // enterLoadingMode() first writes the frozen scale. Its immediate local
  // flush is the first command, so later mode/bus/RPC descriptors must wait
  // for this reply rather than disappearing behind a paused clock.
  laneWriteSetting(f.state, 'timeScale', 0);
  const first = f.posts.at(-1);
  assert.equal(first.kind, 'clockCommand');
  assert.deepEqual(first.commands.map((env) => env.t), ['settings']);
  assert.equal(first.commands[0].p.path, 'timeScale');

  laneSetMode(f.state, f.bus, 'loading');
  f.bus.emit('mode:changed', { mode: 'loading', previousMode: 'menu' });
  const boot = laneRpc('newGameBoot', { opts: launchOpts, newGamePlus: null });

  // The first command is still in flight; all launch descriptors remain in
  // the FIFO and are sent as one follow-up when its zero-step reply arrives.
  assert.equal(f.posts.at(-1), first);
  sendClockTick(f, 1, first.commandSequence, 0);
  const second = f.posts.at(-1);
  assert.equal(second.kind, 'clockCommand');
  assert.deepEqual(second.commands.map((env) => env.t), ['mode', 'bus', 'rpc']);
  assert.equal(second.commands[0].p.mode, 'loading');
  assert.equal(second.commands[1].p.emit, 'mode:changed');
  assert.equal(second.commands[2].p.op, 'newGameBoot');
  const rpc = second.commands[2].p;
  assert.ok(rpc, 'the paused launch batch carries a correlated boot RPC');
  assert.equal(second.commands[2].p.payload.opts.crucibleLaunch, true);
  assert.equal(second.commands[2].p.payload.opts.crucibleSetup.survivalSetup.seed, 4242);

  f.receive({
    kind: 'clockTick',
    seq: 'clock-2',
    clockSequence: 2,
    commandSequence: second.commandSequence,
    stateTick: 0,
    simTime: 0,
    clockAccumulator: 0,
    journalStart: 0,
    journalEnd: 0,
    pack: emptyPack(),
    rpcAcks: [{ id: rpc.id, op: 'newGameBoot', ok: true, result: { ok: true } }],
  });
  const ack = await boot;
  assert.equal(ack.ok, true);
  assert.equal(f.lane.getDiagnostics().workerClockCommandInFlight, false);
});

test('browser worker clock reply wire settles paused ACKs and Crucible RPCs', { timeout: 60000 }, async (t) => {
  // Exercise the actual browser-worker module through a real Node worker-thread
  // postMessage boundary. The main lane must consume the worker's
  // `clockSequence` field; fabricating a reply would let the old clockSeq typo
  // survive and would also share the main realm's command sink with the worker.
  const workerReplies = [];
  const mainPosts = [];
  let lastWorkerError = null;
  let receive = null;
  let holdReplies = false;
  const heldReplies = [];
  let lane = null;
  t.after(() => {
    const error = lane?.getDiagnostics().error;
    if (!error?.includes('clock command stalled')) return;
    console.error('[local-clock-wire watchdog]', JSON.stringify({
      error,
      diagnostics: lane.getDiagnostics(),
      recentCommands: mainPosts.filter((entry) => entry?.kind === 'clockCommand').slice(-8).map((entry) => ({
        commandSequence: entry.commandSequence,
        seq: entry.seq,
        steps: entry.steps,
        timeScale: entry.timeScale,
        commands: entry.commands?.map((command) => ({
          type: command?.t,
          path: command?.p?.path,
          operation: command?.p?.op,
          dataType: command?.p?.d?.type,
        })),
      })),
      recentReplies: workerReplies.filter((reply) => reply?.kind === 'clockTick').slice(-8).map((reply) => ({
        seq: reply.seq,
        clockSequence: reply.clockSequence,
        commandSequence: reply.commandSequence,
        stateTick: reply.stateTick,
        diagnostics: reply.clockDiagnostics,
      })),
    }));
  });
  const worker = new Worker(
    new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url),
    { type: 'module' },
  );
  const workerSelf = {
    postMessage(message) {
      workerReplies.push(message);
      if (message?.kind === 'error') {
        lastWorkerError = message;
        console.error('[local-clock-wire worker error]', JSON.stringify(message));
        const lastTick = workerReplies.filter((reply) => reply?.kind === 'clockTick').at(-1);
        const recentCommands = mainPosts.slice(-8).map((entry) => ({
          kind: entry?.kind,
          seq: entry?.seq,
          steps: entry?.steps,
          scale: entry?.timeScale,
          commands: entry?.commands?.map((command) => ({
            t: command?.t,
            path: command?.p?.path,
            op: command?.p?.op,
            dataType: command?.p?.d?.type,
          })),
        }));
        console.error('[local-clock-wire context]', JSON.stringify({
          replies: workerReplies.length,
          lastTick: lastTick && {
            seq: lastTick.seq,
            clockSequence: lastTick.clockSequence,
            stateTick: lastTick.stateTick,
            commandSequence: lastTick.commandSequence,
            diagnostics: lastTick.clockDiagnostics,
          },
          recentCommands,
          allCommands: mainPosts.filter((entry) => entry?.kind === 'clockCommand').map((entry) => ({
            commandSequence: entry.commandSequence,
            scale: entry.timeScale,
            commands: entry.commands,
          })),
        }));
      }
      if (holdReplies) {
        heldReplies.push(message);
        return;
      }
      queueMicrotask(() => { if (receive) receive(message); });
    },
  };
  try {
    worker.on('message', workerSelf.postMessage);
    worker.on('error', (error) => {
      lastWorkerError = { kind: 'error', message: error?.message || String(error), stack: error?.stack || null };
    });
    const scenarioContract = JSON.parse(readFileSync(
      new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
    ));
    const state = createGameState(4242);
    state.timeScale = 0;
    const bus = createBus();
    lane = createSimLaneRuntime({
      state,
      registry: {},
      bus,
      flags: { lane: 'worker', warnings: [], sab: false },
      clockMode: 'worker-local',
      helpers: {
        scenarioContract,
        scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
        scenarioContractHash: 'wire-fixture',
        raycastToPlane(_ndc, hit) {
          hit.x = 42;
          hit.z = -7;
          return hit;
        },
      },
      channelFactory: () => ({
        post(message) {
          mainPosts.push(message);
          worker.postMessage(message);
        },
        onMessage(handler) { receive = handler; },
        terminate() { void worker.terminate(); },
      }),
    });
    await lane.readyPromise;
    lane.runner.setClockActive(true);

    laneWriteSetting(state, 'timeScale', 0);
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'));
    const firstReply = workerReplies.find((reply) => reply.kind === 'clockTick');
    assert.ok(Number.isSafeInteger(firstReply.clockSequence));
    assert.equal(firstReply.clockSeq, undefined, 'worker emits one canonical sequence field');
    assert.equal(firstReply.clockDiagnostics.active, true);
    assert.equal(firstReply.clockDiagnostics.scale, 0);
    await waitFor(() => lane.getDiagnostics().workerClockLastAckedSequence >= firstReply.clockSequence);
    assert.ok(mainPosts.some((message) => message.kind === 'clockAck'
      && message.clockSequence === firstReply.clockSequence));

    // The real raycast helper must not turn a pure ACK into a cursor command.
    const clockTicksBeforeIdle = workerReplies.filter((reply) => reply.kind === 'clockTick').length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      workerReplies.filter((reply) => reply.kind === 'clockTick').length,
      clockTicksBeforeIdle,
      'paused ACK settles without an ACK→clockTick feedback loop',
    );
    assert.equal(
      mainPosts.filter((message) => message.kind === 'clockCommand').some((message) =>
        message.commands.some((command) => command?.p?.d?.type === 'cursorProjection')),
      false,
      'pure setting/ACK work does not synthesize cursor projection',
    );

    // A worker-local rAF calls prepareWithoutAdvance while the clock owns
    // simulation. The frame still has to fold the main UI shell into the
    // worker before its loading snapshot is allowed to resume.
    state.mode = 'loading';
    state.timeScale = 0;
    state.ui.screenStack = ['loading-shell'];
    state.ui.docked = true;
    state.render.sectorShellAdmission = true;
    lane.runner.prepareWithoutAdvance();
    await waitFor(() => lane.getDiagnostics().workerClockCommandInFlight === false);
    const loadingProbe = await laneRpc('probeState');
    assert.equal(loadingProbe.ok, true);
    assert.equal(loadingProbe.result.ui.screenStackLen, 1);
    assert.equal(loadingProbe.result.skipFullTick, true);

    // Run the same Crucible bootstrap that the public route uses before asking
    // the adapter to advance a synthetic flight state.  A synthetic pre-boot
    // mirror is not a valid active-flight route and can enter SG-02 with an
    // unreachable Rapier body, hiding the clock protocol under test.  Keep the
    // paused RPC/ACK boundary real so this also proves bootstrap settles while
    // timeScale is zero.
    const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: 4242 });
    assert.equal(setup.ok, true);
    const launchOpts = {
      seed: setup.value.seed,
      crucibleLaunch: true,
      crucibleSetup: {
        survivalSetup: setup.value,
        survivalRuleset: setup.ruleset,
      },
    };
    laneSetMode(state, bus, 'loading');
    const boot = laneRpc('newGameBoot', { opts: launchOpts, newGamePlus: null });
    const ack = await boot;
    assert.equal(ack.ok, true);
    await waitFor(() => lane.getDiagnostics().workerClockCommandInFlight === false);
    const bootProbe = await laneRpc('probeState');
    assert.equal(bootProbe.ok, true);
    assert.equal(bootProbe.result.lastRpcAck.op, 'newGameBoot');
    assert.equal(bootProbe.result.physics.diag.sg02Ready, true);
    // `sg02Ready` alone only proves that the async Rapier module settled.  Keep the
    // bootstrap seam honest by requiring the same real body materialization that the
    // production worker/native adapter reports before the transport fixture enters its
    // intentional UI-freeze phase.  This catches a ready-but-empty authority without
    // turning the clock protocol fixture into a long active-flight stress route.
    assert.ok(bootProbe.result.physics.diag.sg02Bodies > 0);
    assert.ok(bootProbe.result.physics.diag.sg02DynamicBodies > 0);
    assert.ok(
      bootProbe.result.physics.diag.sg02Bodies >= bootProbe.result.physics.diag.sg02DynamicBodies,
      'Rapier dynamic body count cannot exceed total SG-02 bodies',
    );
    console.error('[local-clock-wire boot]', JSON.stringify({
      tick: bootProbe.result.tick,
      mode: bootProbe.result.mode,
      timeScale: bootProbe.result.timeScale,
      physics: bootProbe.result.physics,
    }));
    const clockTicksAfterBoot = workerReplies.filter((reply) => reply.kind === 'clockTick').length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      workerReplies.filter((reply) => reply.kind === 'clockTick').length,
      clockTicksAfterBoot,
      'paused Crucible RPC ACK does not restart an idle clock loop',
    );

    // Clear the loading shell and release the clock without input or gameplay
    // RPC work. The next presentation frame must ship the new fold, so the
    // worker stops treating the route as frozen.
    state.mode = 'flight';
    state.timeScale = 0;
    state.ui.screenStack = [];
    state.ui.docked = false;
    state.render.sectorShellAdmission = false;
    // Mirror the public loading -> flight transition into the authoritative
    // worker. Directly changing the fixture's main mirror alone leaves the
    // worker in loading/menu mode and makes any later physics result invalid.
    laneSetMode(state, bus, 'flight');
    // laneSetMode's worker-side applier emits the authoritative mode event;
    // forwarding a second main-side mode event here would replay the same
    // transition twice and does not belong to the worker-only wire seam.
    lane.runner.prepareWithoutAdvance();
    const flightPausedProbe = await laneRpc('probeState');
    assert.equal(flightPausedProbe.ok, true);
    assert.equal(flightPausedProbe.result.ui.screenStackLen, 0);
    assert.equal(flightPausedProbe.result.skipFullTick, false);
    console.error('[local-clock-wire flight-paused]', JSON.stringify(flightPausedProbe.result));

    // Exercise the actual active-clock wire after the real loading→flight fold.
    // This is deliberately a short, bounded route: it proves timer steps,
    // serialized settings/RPC/cursor commands and ACKs reach the already
    // materialized Rapier world, without turning this transport fixture into a
    // long gameplay soak.
    const activeStartTick = workerReplies.reduce(
      (max, reply) => Math.max(max, Number.isSafeInteger(reply.stateTick) ? reply.stateTick : 0),
      0,
    );
    const activeStartPost = mainPosts.length;
    state.timeScale = 1;
    laneWriteSetting(state, 'timeScale', 1);
    laneDomEvent({ type: 'mousemove', clientX: 320, clientY: 180 });
    const activeProbePromise = laneRpc('probeState');
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'
      && reply.clockDiagnostics?.scale === 1
      && Number.isSafeInteger(reply.stateTick)
      && reply.stateTick >= activeStartTick + 17
      && reply.clockDiagnostics.steps > 0), 10000);
    const activeProbe = await activeProbePromise;
    assert.equal(activeProbe.ok, true);
    assert.equal(activeProbe.result.mode, 'flight');
    assert.equal(activeProbe.result.skipFullTick, false);
    assert.equal(activeProbe.result.physics.diag.sg02Ready, true);
    assert.ok(activeProbe.result.physics.diag.sg02Bodies > 0);
    // The probe RPC is serialized with the same command batch as the release
    // and may be ACKed on its first active tick.  The wait above is the
    // authoritative progress assertion; requiring this earlier snapshot to
    // contain the later tick makes the test depend on command/timer interleave.
    const activeCommands = mainPosts.slice(activeStartPost)
      .filter((message) => message.kind === 'clockCommand');
    const activeCommand = activeCommands.find((message) =>
      message.commands.some((command) => command?.t === 'settings'
        && command?.p?.path === 'timeScale' && command?.p?.value === 1));
    assert.ok(activeCommand, 'active scale command crosses the serialized clock boundary');
    assert.ok(activeCommands.some((message) => message.commands.some((command) =>
      command?.p?.d?.type === 'cursorProjection')),
    'active cursor projection crosses the serialized clock boundary');
    const activeRpc = activeCommands.flatMap((message) => message.commands)
      .find((command) => command?.t === 'rpc' && command?.p?.op === 'probeState');
    assert.ok(activeRpc, 'active probe RPC crosses the serialized clock boundary');
    assert.ok(workerReplies.some((reply) => Array.isArray(reply.rpcAcks)
      && reply.rpcAcks.some((ack) => ack && ack.id === activeRpc.p.id && ack.ok === true)),
    'active probe RPC receives a worker ACK');
    assert.equal(lane.getDiagnostics().error, null);
    assert.equal(lane.getDiagnostics().boundaryErrorCount, 0);

    // Stop the active simulation before the following queue/ACK assertions;
    // those assertions intentionally run in the frozen UI state.
    state.timeScale = 0;
    laneWriteSetting(state, 'timeScale', 0);
    lane.runner.prepareWithoutAdvance();
    await waitFor(() => lane.getDiagnostics().workerClockLastDiagnostics.scale === 0
      && lane.getDiagnostics().workerClockCommandInFlight === false);

    // The remaining transport assertions intentionally run inside a real UI
    // freeze after the active Rapier path has been exercised above.
    state.ui.screenStack = ['clock-test-freeze'];
    state.ui.docked = true;
    state.render.sectorShellAdmission = true;
    lane.runner.prepareWithoutAdvance();
    await waitFor(() => lane.getDiagnostics().workerClockCommandInFlight === false);
    state.timeScale = 1;
    laneWriteSetting(state, 'timeScale', 1);
    await waitFor(() => lane.getDiagnostics().workerClockLastDiagnostics.scale === 1);
    const flightProbe = await laneRpc('probeState');
    assert.equal(flightProbe.ok, true);
    // The local clock scale is transport-owned; the sim state's transient
    // timeScale remains the authoritative writer's value until a settings
    // envelope arrives. The frame must still wake the worker clock at 1.
    assert.equal(lane.getDiagnostics().workerClockLastDiagnostics.scale, 1);
    assert.equal(flightProbe.result.ui.screenStackLen, 1);
    assert.equal(flightProbe.result.skipFullTick, true);
    state.timeScale = 0;
    laneWriteSetting(state, 'timeScale', 0);
    await waitFor(() => lane.getDiagnostics().workerClockLastDiagnostics.scale === 0);

    // Hold a real worker reply at the adapter boundary, then enqueue a main
    // command behind it. The timer reply has no new command sequence, but it
    // retains the last applied watermark and still needs an immediate ACK while
    // the command remains in flight; otherwise the worker coalesces the command
    // reply and the loading RPC queue stalls.
    const sequenceBeforeHeldTimer = workerReplies.reduce(
      (max, reply) => Math.max(max, Number.isSafeInteger(reply.clockSequence) ? reply.clockSequence : 0),
      0,
    );
    const appliedBeforeHeldTimer = workerReplies.reduce(
      (max, reply) => Math.max(
        max,
        Number.isSafeInteger(reply.commandSequence) ? reply.commandSequence : 0,
      ),
      0,
    );
    assert.ok(appliedBeforeHeldTimer > 0, 'the adapter has applied a command batch before the timer probe');
    holdReplies = true;
    state.timeScale = 1;
    lane.runner.setClockActive(false);
    lane.runner.setClockActive(true);
    await waitFor(() => heldReplies.some((reply) => reply.kind === 'clockTick'
      && reply.clockSequence > sequenceBeforeHeldTimer));
    const heldTimer = heldReplies.find((reply) => reply.kind === 'clockTick'
      && reply.clockSequence > sequenceBeforeHeldTimer);
    assert.ok(heldTimer);
    assert.ok(
      heldTimer.commandSequence >= appliedBeforeHeldTimer,
      'timer replies retain the cumulative applied command watermark',
    );
    laneWriteSetting(state, 'timeScale', 1);
    const heldCommand = mainPosts.at(-1);
    assert.equal(heldCommand.kind, 'clockCommand');
    const heldCommandSequence = heldCommand.commandSequence;
    assert.ok(heldCommandSequence > appliedBeforeHeldTimer);
    assert.equal(lane.getDiagnostics().workerClockCommandInFlight, true);
    holdReplies = false;
    const heldForDelivery = heldReplies.splice(0);
    for (const reply of heldForDelivery) receive(reply);
    await waitFor(() => mainPosts.some((message) => message.kind === 'clockAck'
      && message.clockSequence === heldTimer.clockSequence));
    await waitFor(() => lane.getDiagnostics().workerClockCommandInFlight === false);
    const appliedReply = workerReplies.find((reply) => reply.kind === 'clockTick'
      && reply.commandSequence >= heldCommandSequence);
    assert.ok(appliedReply);
    assert.ok(appliedReply.clockDiagnostics.appliedCommandSequence >= heldCommandSequence);
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'
      && reply.clockSequence > appliedReply.clockSequence
      && reply.clockDiagnostics.steps > 0));
    const timerAfterCommand = workerReplies.find((reply) => reply.kind === 'clockTick'
      && reply.clockSequence > appliedReply.clockSequence
      && reply.clockDiagnostics.steps > 0);
    assert.ok(timerAfterCommand.commandSequence >= heldCommandSequence);
    assert.ok(timerAfterCommand.clockDiagnostics.appliedCommandSequence >= heldCommandSequence);

    laneDomEvent({ type: 'mousemove', clientX: 320, clientY: 180 });
    await waitFor(() => mainPosts.some((message) => message.kind === 'clockCommand'
      && message.commands.some((command) => command?.p?.d?.type === 'cursorProjection')));
    const projectedCommand = mainPosts.find((message) => message.kind === 'clockCommand'
      && message.commands.some((command) => command?.p?.d?.type === 'cursorProjection'));
    assert.ok(projectedCommand, 'cursor projection is still sent at the input boundary');

    // The loading failure under investigation had a main-side scale of 1 while
    // the worker could still be at scale 0. Prove the actual adapter reports the
    // transition and that its autonomous timer eventually contributes steps.
    state.timeScale = 1;
    laneWriteSetting(state, 'timeScale', 1);
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'
      && reply.clockDiagnostics?.scale === 1));
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'
      && reply.clockDiagnostics?.scale === 1
      && reply.clockDiagnostics.steps > 0), 10000);
    assert.equal(lane.getDiagnostics().workerClockLastDiagnostics.scale, 1);
    assert.ok(lane.getDiagnostics().workerClockLastDiagnostics.timerFires > 0);
    state.timeScale = 0;
    laneWriteSetting(state, 'timeScale', 0);
    await waitFor(() => lane.getDiagnostics().workerClockLastDiagnostics.scale === 0);
    lane.runner.setClockActive(false);
    await waitFor(() => lane.getDiagnostics().workerClockRequested === false);

  } finally {
    try { lane?.close(); } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 10));
    try { await worker.terminate(); } catch (_) {}
  }
});

test('SAB presentation ACKs free reply capacity before an earlier directive completes', { timeout: 30000 }, async (t) => {
  const previousSelf = globalThis.self;
  const arena = createSabJournalArena();
  const channel = bindSabEnvelopeChannel(arena);
  const replies = [];
  const ackTimers = new Set();
  let ackTimersAtFinalize;
  globalThis.self = { postMessage(reply) {
    replies.push(reply);
    if (reply.kind === 'done') ackTimersAtFinalize = ackTimers.size;
  } };
  const send = (data) => globalThis.self.onmessage({ data });
  const post = (data, kind = SAB_ENV_KIND.OTHER) => sabEnvelopePost(channel, 'cmd', data, kind);
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?sab-early-ack-${Date.now()}`);
    send({
      kind: 'init', seq: 'sab-early-ack-init', profile: 'production', clockMode: 'worker-local',
      timeScale: 0, seed: 4242, settings: {}, sabArena: arena,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: 'sab-early-ack',
    });
    await waitFor(() => replies.some((reply) => reply.kind === 'ready'));

    // Observe the actual watchdog handles without waiting for their deadline.
    const schedule = globalThis.setTimeout;
    const cancel = globalThis.clearTimeout;
    t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
      const handle = schedule(callback, delay, ...args);
      if (delay === 2000) ackTimers.add(handle);
      return handle;
    });
    t.mock.method(globalThis, 'clearTimeout', (handle) => {
      ackTimers.delete(handle);
      return cancel(handle);
    });

    post({ kind: 'clockCommand', seq: 'first-command', commandSequence: 1, lifecycleGeneration: 0 });
    await waitFor(() => Atomics.load(arena.header, SAB_REPLY_SEQ_INDEX) > 0);
    let firstReply;
    sabEnvelopeDrain(channel, 'reply', (reply) => { firstReply = reply; });
    assert.equal(firstReply.kind, 'clockTick');
    assert.equal(ackTimers.size, 1);

    // The two commands land in one drain. The ACK must release transport
    // capacity immediately even though finalize dispatches first in FIFO order.
    post({ kind: 'finalize', seq: 'prior-directive' }, SAB_ENV_KIND.FINALIZE);
    post({ kind: 'clockAck', clockSequence: firstReply.clockSequence, ackJournalEnd: firstReply.journalEnd });
    await waitFor(() => replies.some((reply) => reply.kind === 'done'));
    assert.equal(ackTimersAtFinalize, 0);

    post({ kind: 'clockCommand', seq: 'second-command', commandSequence: 2, lifecycleGeneration: 0 });
    await waitFor(() => Atomics.load(arena.header, SAB_REPLY_SEQ_INDEX) > 1);
    let secondReply;
    sabEnvelopeDrain(channel, 'reply', (reply) => { secondReply = reply; });
    post({ kind: 'clockControl', generation: 1, active: false, lifecycleGeneration: 1 });
    post({ kind: 'finalize', seq: 'after-transition' }, SAB_ENV_KIND.FINALIZE);
    post({ kind: 'clockCommand', commandSequence: 3, lifecycleGeneration: 0,
      ackClockSequence: secondReply.clockSequence, ackJournalEnd: secondReply.journalEnd });
    await waitFor(() => replies.some((reply) => reply.seq === 'after-transition'));
    assert.equal(ackTimersAtFinalize, 1, 'an obsolete command cannot release an ACK past a queued lifecycle transition');
    assert.equal(ackTimers.size, 1);

    send({ kind: 'laneHeartbeat' });
    assert.equal(replies.some((reply) => reply.kind === 'laneHeartbeatSample'), false);
    send({ kind: 'laneHeartbeat', motionSampleId: 7 });
    const sample = replies.at(-1);
    assert.equal(sample.kind, 'laneHeartbeatSample');
    assert.equal(sample.motionSampleId, 7);
    assert.equal(sample.lifecycleGeneration, 1);
    assert.equal(sample.steps, 0);
    assert.equal(sample.wakePending, false);
    assert.equal(sample.appliedCommandSequence, 2);
    assert.equal(sample.unacked, 1);
    assert.equal(sample.oldestUnackedSequence, secondReply.clockSequence);
    assert.equal(sample.replySequence, secondReply.clockSequence);
    assert.equal(sample.sabReplyFreeCount, sample.sabReplySequence);

    send({ kind: 'laneHeartbeat', lifecycleGeneration: 0,
      clockSequence: secondReply.clockSequence, ackJournalEnd: secondReply.journalEnd });
    assert.equal(ackTimers.size, 1, 'an obsolete heartbeat cannot release reply capacity');
    send({ kind: 'laneHeartbeat', lifecycleGeneration: 1,
      clockSequence: secondReply.clockSequence + 1, ackJournalEnd: secondReply.journalEnd });
    assert.equal(ackTimers.size, 1, 'a heartbeat cannot ACK a sequence the worker has not sent');
    send({ kind: 'laneHeartbeat', lifecycleGeneration: 1,
      clockSequence: secondReply.clockSequence, ackJournalEnd: secondReply.journalEnd });
    assert.equal(ackTimers.size, 0, 'a retry without a diagnostic request still frees credit');
  } finally {
    if (replies.some((reply) => reply.kind === 'ready')) {
      post({ kind: 'shutdown', seq: 'sab-early-ack-shutdown' }, SAB_ENV_KIND.SHUTDOWN);
      await waitFor(() => replies.some((reply) => reply.kind === 'bye'), 1000);
    }
    t.mock.restoreAll();
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('a lost presentation ACK frees its reply credit after two silent seconds and keeps publishing incrementally (no rebuild, no stop)', { timeout: 30000 }, async () => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  const workerReplies = [];
  const workerSelf = {
    postMessage(message) { workerReplies.push(message); },
  };
  globalThis.self = workerSelf;
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?stale-ack-${Date.now()}`);
    const workerOnMessage = workerSelf.onmessage;
    assert.equal(typeof workerOnMessage, 'function');
    const scenarioContract = JSON.parse(readFileSync(
      new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
    ));
    workerOnMessage({ data: {
      kind: 'init',
      seq: 'stale-ack-init',
      profile: 'production',
      clockMode: 'worker-local',
      timeScale: 0,
      seed: 4242,
      settings: {},
      domainMirroring: {},
      bridgeAll: false,
      tacticalAI: false,
      viewport: { w: 800, h: 600 },
      scenarioContract,
      scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
      scenarioContractHash: 'stale-ack-fixture',
    } });
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'ready'), 30000);
    workerOnMessage({ data: {
      kind: 'clockControl',
      seq: 'stale-ack-control',
      active: true,
      generation: 1,
      lifecycleGeneration: 0,
      timeScale: 1,
    } });
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'
      && reply.clockDiagnostics?.scale === 1), 10000);

    // The first live publish now awaits an ACK that never comes — the wedged
    // sentAwaitingAck state that previously froze presentation forever while
    // the sim ran blind (or hard-stopped once the durable limit tripped).
    const wedgedPublish = workerReplies.filter((reply) => reply.kind === 'clockTick').at(-1);
    const wedgedSteps = wedgedPublish.clockDiagnostics?.steps || 0;
    const repliesBeforeWedge = workerReplies.filter((reply) => reply.kind === 'clockTick').length;

    // No ACK is ever sent. NO-FREEZE rule (2026-11-21): the reply channel is FIFO, so a late
    // ACK is never a lost range. After two silent seconds the worker frees the credit and keeps
    // publishing ordered incremental replies — never a full rebuild (the old 3 s 'blip').
    await waitFor(() => workerReplies.some((reply) => reply.kind === 'clockTick'
      && (reply.clockDiagnostics?.staleAckRecoveries || 0) >= 1), 6000);

    const recovered = workerReplies.filter((reply) => reply.kind === 'clockTick'
      && (reply.clockDiagnostics?.staleAckRecoveries || 0) >= 1).at(-1);
    assert.equal(workerReplies.some((reply) => reply.kind === 'clockTick' && reply.journalFullRebuild === true
      && reply.clockSequence > wedgedPublish.clockSequence), false,
    'a late ACK must never trigger a full journal rebuild');
    assert.ok(
      recovered.clockDiagnostics.steps > wedgedSteps,
      'the authoritative clock kept stepping through the wedged publish instead of stopping',
    );
    assert.ok(
      recovered.clockSequence > wedgedPublish.clockSequence,
      'the recovery publishes on a fresh sequence so the late duplicate ACK is rejected',
    );
    // While the publish was wedged, ordinary ticks coalesced into the retained
    // reply rather than posting — the single rebuild replaces that whole window.
    assert.ok(
      workerReplies.filter((reply) => reply.kind === 'clockTick').length
        >= repliesBeforeWedge,
      'recovery adds publishes on top of the wedged window rather than replaying it',
    );
  } finally {
    try {
      workerSelf.onmessage?.({ data: { kind: 'shutdown', seq: 'stale-ack-shutdown' } });
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('foreground heartbeats recover an expired reply even when the watchdog timer never runs', async (t) => {
  const previousSelf = globalThis.self;
  const replies = [];
  const worker = { postMessage: reply => replies.push(reply) };
  globalThis.self = worker;
  const send = data => worker.onmessage({ data });
  const lastTick = () => replies.findLast(reply => reply.kind === 'clockTick');
  const now = performance.now.bind(performance);
  const setTimer = globalThis.setTimeout;
  const clearTimer = globalThis.clearTimeout;
  let wallOffset = 0;
  let watchdogTimer;
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?stale-ack-beat-${Date.now()}`);
    send({ kind: 'init', seq: 'stale-beat-init', profile: 'production', clockMode: 'worker-local',
      timeScale: 1, seed: 4242, settings: {},
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    await waitFor(() => replies.some(reply => reply.kind === 'ready'));
    t.mock.method(performance, 'now', () => now() + wallOffset);
    t.mock.method(globalThis, 'setTimeout', (fire, delay, ...args) => {
      if (delay !== 2000) return setTimer(fire, delay, ...args);
      watchdogTimer = fire;
      return fire;
    });
    t.mock.method(globalThis, 'clearTimeout', timer => {
      if (typeof timer !== 'function') clearTimer(timer);
    });
    send({ kind: 'clockControl', active: true, generation: 1, lifecycleGeneration: 0, timeScale: 1 });
    const advance = commandSequence => send({ kind: 'clockCommand', commandSequence,
      lifecycleGeneration: 0, timeScale: 1, steps: 1, commands: [] });
    advance(1);
    await waitFor(() => lastTick() && watchdogTimer);
    wallOffset += 3100;
    // A real applied watermark on this beat wins over the timeout.
    send({ kind: 'laneHeartbeat', motionSampleId: 1, lifecycleGeneration: 0,
      clockSequence: lastTick().clockSequence, ackJournalEnd: lastTick().journalEnd });
    assert.equal(replies.at(-1).staleAckRecoveries, 0);
    advance(2);
    await waitFor(() => lastTick()?.commandSequence === 2);
    const delayed = watchdogTimer;
    const wedged = lastTick();

    send({ kind: 'laneHeartbeat', motionSampleId: 2 });
    assert.equal(replies.at(-1).staleAckRecoveries, 0, 'an unexpired clock keeps its credits');
    wallOffset += 3100;
    send({ kind: 'laneHeartbeat', motionSampleId: 3 });
    assert.equal(replies.at(-1).unacked, 0, 'a foreground beat clears expired credits without the timer');
    assert.equal(replies.at(-1).staleAckRecoveries, 1);
    advance(3);
    // NO-FREEZE: the freed credit publishes the next ordered reply; no full rebuild.
    await waitFor(() => replies.some(reply => reply.kind === 'clockTick'
      && reply.clockSequence > wedged.clockSequence));
    assert.equal(replies.some(reply => reply.kind === 'clockTick' && reply.journalFullRebuild === true
      && reply.clockSequence > wedged.clockSequence), false, 'a late ACK never rebuilds the journal');
    assert.ok(lastTick().clockDiagnostics.steps > wedged.clockDiagnostics.steps);

    delayed();
    send({ kind: 'laneHeartbeat', motionSampleId: 4 });
    assert.equal(replies.at(-1).staleAckRecoveries, 1, 'the old timer cannot expire a replacement reply');
    assert.ok(replies.at(-1).unacked > 0);
  } finally {
    send({ kind: 'shutdown', seq: 'stale-beat-shutdown' });
    await waitFor(() => replies.some(reply => reply.kind === 'bye'));
    t.mock.restoreAll();
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});

test('active worker-local commands wait for the next timer tick', { timeout: 60000 }, async () => {
  // This is the bounded queue contract for the next worker-clock repair. An
  // active presentation command must join the next real fixed-step tick; it
  // must not force a second zero-step whole-host pack on the worker chain.
  // The assertion is intentionally red until that source change lands.
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  const workerReplies = [];
  const mainPosts = [];
  let receive = null;
  const workerSelf = {
    postMessage(message) {
      workerReplies.push(message);
      queueMicrotask(() => { if (receive) receive(message); });
    },
  };
  globalThis.self = workerSelf;
  let lane = null;
  try {
    await import(`../src/core/wholeSimBrowserWorker.js?active-command-queue-${Date.now()}`);
    const workerOnMessage = workerSelf.onmessage;
    assert.equal(typeof workerOnMessage, 'function');
    const scenarioContract = JSON.parse(readFileSync(
      new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
    ));
    const state = createGameState(4242);
    state.timeScale = 0;
    lane = createSimLaneRuntime({
      state,
      registry: {},
      bus: createBus(),
      flags: { lane: 'worker', warnings: [], sab: false },
      clockMode: 'worker-local',
      helpers: {
        scenarioContract,
        scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
        scenarioContractHash: 'active-command-queue-fixture',
        raycastToPlane(_ndc, hit) {
          hit.x = 42;
          hit.z = -7;
          return hit;
        },
      },
      channelFactory: () => ({
        post(message) {
          mainPosts.push(message);
          workerOnMessage({ data: message });
        },
        onMessage(handler) { receive = handler; },
        terminate() {},
      }),
    });
    await lane.readyPromise;
    const initialClockReplies = workerReplies.filter((reply) => reply.kind === 'clockTick').length;
    const generation = 1;
    workerOnMessage({ data: {
      kind: 'clockControl',
      seq: 'active-queue-control',
      active: true,
      generation,
      lifecycleGeneration: 0,
      timeScale: 1,
    } });
    workerOnMessage({ data: {
      kind: 'clockCommand',
      seq: 'active-queue-command',
      commandSequence: 1,
      commands: [{
        t: 'dom',
        seq: 1,
        p: { d: { type: 'cursorProjection', x: 42, z: -7 } },
      }],
      steps: 0,
      ackJournalEnd: 0,
      ackClockSequence: 0,
      generation,
      lifecycleGeneration: 0,
      timeScale: 1,
    } });
    // A microtask turn is enough for the forced command path to publish. The
    // worker timer is ~16.67 ms, so it cannot explain a reply in this window.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      workerReplies.filter((reply) => reply.kind === 'clockTick').length,
      initialClockReplies,
      'active commands are queued for the next timer tick instead of forcing a zero-step host tick',
    );
    workerOnMessage({ data: {
      kind: 'clockControl',
      seq: 'active-queue-stop',
      active: false,
      generation: generation + 1,
      lifecycleGeneration: 0,
      timeScale: 1,
    } });
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    try { lane?.close(); } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (hadSelf) globalThis.self = previousSelf;
    else delete globalThis.self;
  }
});

test('freeze recorder opens an episode when applied replies starve during advancing flight', async (t) => {
  const f = makeWatchdogFixture(t);
  f.state.mode = 'flight';
  f.state.timeScale = 1;
  f.lane.runner.setClockActive(true);

  f.receive({
    kind: 'clockTick',
    seq: 'freeze-baseline',
    clockSequence: 1,
    commandSequence: 0,
    stateTick: 1,
    simTime: 1 / 60,
    clockAccumulator: 0,
    journalStart: 0,
    journalEnd: 0,
    pack: emptyPack(),
    clockDiagnostics: {
      active: true,
      awaitingAck: true,
      steps: 9,
      retainedRows: 3,
      shedEvents: 2,
      timerPending: true,
    },
  });
  assert.equal(f.lane.getDiagnostics().freezeEpisodes.length, 0);

  // Replies stop arriving while the clock should advance. The sampler crosses
  // the 350 ms gap on its second tick and must name the last-seen worker state.
  f.dispatch(700);
  const diag = f.lane.getDiagnostics();
  assert.equal(diag.freezeActive, true, 'starved applied watermark reads as an open freeze');
  assert.equal(diag.freezeEpisodes.length, 1);
  const episode = diag.freezeEpisodes[0];
  assert.ok(episode.gapAtOpenMs >= 350);
  assert.equal(episode.snapshot.awaitingAck, true, 'snapshot preserves the last-seen ack state');
  assert.equal(episode.snapshot.workerSteps, 9);
  assert.equal(episode.snapshot.shedEvents, 2);
  assert.equal(episode.snapshot.retainedRows, 3);
  assert.ok(diag.msSinceLastAppliedReply >= 350);
  assert.equal(f.posts.some(msg => msg.motionSampleId != null), false,
    'the freeze sampler never generates an extra presentation heartbeat');
  f.lane.runner.heartbeat();
  f.lane.runner.heartbeat();
  const requests = f.posts.filter(msg => msg.kind === 'laneHeartbeat' && msg.motionSampleId != null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].clockSequence, 1, 'the heartbeat can repeat the last applied reply watermark');
  assert.equal(requests[0].lifecycleGeneration, 0);
  assert.equal(f.posts.at(-1).clockSequence, 1, 'the next beat retries a missed recovery');
  assert.equal(f.posts.at(-1).lifecycleGeneration, 0);
  f.receive({ kind: 'laneHeartbeatSample', motionSampleId: requests[0].motionSampleId + 1, steps: 10 });
  assert.equal(f.lane.getDiagnostics().workerClockLive, null, 'a stray sample cannot classify this freeze');
  f.receive({ kind: 'laneHeartbeatSample', motionSampleId: requests[0].motionSampleId, steps: 11 });
  assert.equal(f.lane.getDiagnostics().workerClockLive.steps, 11);

  f.lane.runner.setLifecycleGeneration(1);
  f.lane.runner.heartbeat();
  assert.equal(f.posts.at(-1).clockSequence, undefined, 'the old ACK cannot cross a lifecycle transition');

  // A fresh applied reply closes the episode with a duration and the state at
  // the moment it recovered.
  sendClockTick(f, 2);
  f.dispatch(300);
  const after = f.lane.getDiagnostics();
  assert.equal(after.freezeActive, false);
  assert.equal(after.freezeEpisodes.length, 1, 'a closed freeze stays recorded once');
  assert.ok(after.freezeEpisodes[0].durationMs > 0);
  assert.ok(after.freezeEpisodes[0].closingSnapshot);
  assert.equal(after.freezeEpisodes[0].workerLive.steps, 11);
});

test('freeze recorder stays quiet while paused or outside flight', async (t) => {
  const f = makeWatchdogFixture(t);
  f.state.mode = 'flight';
  f.state.timeScale = 0;
  f.lane.runner.setClockActive(true);
  sendClockTick(f, 1);
  f.dispatch(2000);
  assert.equal(f.lane.getDiagnostics().freezeEpisodes.length, 0,
    'a paused timescale never counts as a freeze');

  f.state.timeScale = 1;
  f.state.mode = 'dock';
  f.dispatch(2000);
  assert.equal(f.lane.getDiagnostics().freezeEpisodes.length, 0,
    'outside flight mode the recorder stays disarmed');

  f.state.mode = 'flight';
  sendClockTick(f, 2);
  f.dispatch(700);
  assert.equal(f.lane.getDiagnostics().freezeEpisodes.length, 1,
    're-entering advancing flight re-arms the recorder');
  assert.equal(f.lane.getDiagnostics().freezeActive, true);
});

test('an id recycled three times inside one merged reply ends with its newest life on main (facade and drawn world)', async (t) => {
  const hadSelf = Object.prototype.hasOwnProperty.call(globalThis, 'self');
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage() {} };
  let worker;
  try {
    worker = await import(`../src/core/wholeSimBrowserWorker.js?recycle3-${Date.now()}`);
  } finally {
    if (hadSelf) globalThis.self = previousSelf; else delete globalThis.self;
  }
  const f = makeFixture(t);
  // Three ticks, each recycling id 9 into a new life, merged into ONE retained reply on the worker.
  const tickReply = (n, start, rows, infos) => ({
    kind: 'clockTick', clockSequence: n, lifecycleGeneration: 0, journalValid: true,
    journalStart: start, journalEnd: start + rows.length, pack: journalPack(start, rows),
    completedTick: { sequence: n, tick: n, journalStart: start, journalEnd: start + rows.length },
    spawnInfos: infos, stateTick: n, simTime: n / 60,
  });
  const first = tickReply(1, 0, [
    { kind: 1, entityId: 9, generation: 1, type: 'ship', tick: 1, x: 1 },
  ], [{ entityId: 9, type: 'ship', occupantGeneration: 101 }]);
  const second = tickReply(2, 1, [
    { kind: 2, entityId: 9, generation: 1, type: 'ship', tick: 2 },
    { kind: 1, entityId: 9, generation: 2, type: 'ship', tick: 2, x: 2 },
  ], [{ entityId: 9, type: 'ship', occupantGeneration: 102 }]);
  const third = tickReply(3, 3, [
    { kind: 2, entityId: 9, generation: 2, type: 'ship', tick: 3 },
    { kind: 1, entityId: 9, generation: 3, type: 'ship', tick: 3, x: 3 },
  ], [{ entityId: 9, type: 'ship', occupantGeneration: 103 }]);
  const merged = worker.localMergeReply(worker.localMergeReply(first, second), third);
  worker.localMaterializePack(merged);
  assert.equal(merged.pack.count, 5, 'the middle life keeps both its spawn and its destroy');
  f.receive(merged);
  assert.equal(f.state.entities.get(9)?.occupantGeneration, 103, 'the facade holds the newest occupant');
  const world = createPresentationWorld();
  const publisher = createPresentationPublisher(world, f.state, { journal: f.lane.journal });
  publisher.consume({ journal: f.lane.journal, journalStart: 0, journalEnd: merged.pack.end,
    journalValid: true, completedTickCount: 3, lifecycleGeneration: 0 }, { atomic: true });
  const slot = world.getSlotForEntityId(9);
  assert.ok(slot >= 0);
  assert.equal(world.sourceGenerations[slot], 3, 'the drawn world holds the newest journal life');
  assert.equal(world.x[slot], 3);
});
