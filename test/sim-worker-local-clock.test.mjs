import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
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
import { SAB_JOURNAL_MAGIC } from '../scripts/lib/simWorkerHost.mjs';

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

function makeFixture(t, { helpers } = {}) {
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
    flags: { lane: 'worker', warnings: [], sab: false },
    // Explicit local mode exercises the browser protocol with a deterministic
    // channel while the default injected/manual path remains directive-driven.
    clockMode: 'worker-local',
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
      'schedule-rebuild',
      'a retained range that starts after the ACK watermark must wait for a rebuild tick',
    );
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
});

test('worker-local combined clock command preserves the newer worker journal end', async (t) => {
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
  assert.equal(combined.kind, 'clockCommand');
  assert.equal(combined.ackClockSequence, 1);
  assert.equal(
    combined.ackJournalEnd,
    pack.end,
    'a combined command must carry the worker reply end, not only the older presentation ACK',
  );
  const postsAfterCombinedAck = f.posts.length;
  f.lane.runner.prepareWithoutAdvance();
  assert.equal(
    f.posts.length,
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
  assert.equal(aheadCombined.kind, 'clockCommand');
  assert.equal(aheadCombined.ackClockSequence, 1);
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

test('browser worker clock reply wire settles paused ACKs and Crucible RPCs', { timeout: 60000 }, async () => {
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
  let lane = null;
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
