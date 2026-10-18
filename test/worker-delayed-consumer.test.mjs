import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { laneDomEvent } from '../src/core/simLaneCommands.js';

// Execute the production browser adapter and main transport with a deterministic scheduler.
// Only the authoritative host is replaced: these checks isolate transport pressure from physics
// cost, browser scheduling and hardware. No alternate clock/coalescer implementation is used.
const adapterSource = readFileSync(new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url), 'utf8')
  .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '')
  .replace(/export\s*\{[^}]+\};/g, '')
  .replace(/export\s+(?=function)/g, '')
  + '\nglobalThis.fixture = { clock: localClock, settled: () => chain };';

function packAt(start, tick, records) {
  const scalars = new Float64Array(records.length * 18);
  const kinds = new Uint8Array(records.length);
  records.forEach((record, i) => {
    const offset = i * 18;
    scalars[offset] = tick;
    scalars[offset + 1] = start + i + 1;
    scalars[offset + 2] = record.id;
    scalars[offset + 3] = record.generation || 1;
    scalars[offset + 4] = tick;
    scalars[offset + 5] = record.x || 0;
    kinds[i] = record.kind;
  });
  return { count: records.length, start, end: start + records.length, scalars, kinds,
    typeIndex: new Uint16Array(records.length), typeTable: ['ship'],
    spawnEntityIds: records.filter(r => r.kind === 1).map(r => r.id), sab: false };
}

function info(id, generation = 1, hull = 100) {
  return { entityId: id, occupantGeneration: generation, type: 'ship',
    x: 0, y: 0, z: 0, radius: 1, vitals: { hull }, data: { name: `body-${generation}` } };
}

async function fixture(t, { bodies = 142, eventsPerTick = 1, payload,
  stepCostMs = 0, wakeDelays = [], onWake } = {}) {
  let now = 1000;
  let nextTimer = 0;
  let tick = 0;
  let calls = 0;
  let cursor = 0;
  let eventId = 0;
  let holdAcks = true;
  let receive;
  let deliveredAcks = 0;
  let ownerScale = 1;
  let wakes = 0;
  let maxPendingTimers = 0;
  const timers = new Map();
  const batches = [];
  const appliedCommands = [];
  const timerDelays = [];
  const posts = [];
  const heldAcks = [];
  const seenEvents = [];
  const state = createGameState(4242);
  const bus = createBus();
  bus.on('fixture:one-shot', event => seenEvents.push(event.id));
  const context = vm.createContext({
    performance: { now: () => now },
    setTimeout(fn, delay) {
      const key = ++nextTimer;
      timers.set(key, { fn, at: now + delay });
      timerDelays.push(delay);
      maxPendingTimers = Math.max(maxPendingTimers, timers.size);
      return key;
    },
    clearTimeout(key) { timers.delete(key); },
    self: { postMessage(reply) { posts.push(structuredClone(reply)); receive?.(structuredClone(reply)); } },
    nowNs: () => BigInt(Math.floor(now * 1e6)),
    bindSabJournalArena: () => null,
    createSimHost: () => ({
      init: async () => ({}), finalize: async () => ({}), shutdown() {},
      drainStorageOps: () => [], hasPendingDurable: () => false,
      applyPresentationTimeEffects() {}, effectiveTimeScale: () => ownerScale,
      async tick(message) {
        if (message.steps > 0) batches.push({ steps: message.steps, at: now });
        for (const command of message.commands) appliedCommands.push({ command,
          debt: context.fixture.clock.accumulator, tick });
        tick += message.steps;
        now += message.steps * stepCostMs;
        if (message.steps > 0) calls++;
        const rebuilding = message.commands.some(c => c?.p?.op === 'journalRebuild');
        const active = message.steps > 0;
        const supplied = active || rebuilding ? payload?.({ tick, calls, rebuilding }) || {} : {};
        const records = supplied.records || (active || rebuilding ? Array.from({ length: bodies }, (_, i) => ({
          id: i + 1, kind: calls === 1 || rebuilding ? 1 : 3, x: tick,
        })) : []);
        const pack = packAt(cursor, tick, records);
        cursor = pack.end;
        return { stateTick: tick, simTime: tick / 60, journalStart: pack.start, journalEnd: pack.end, pack,
          journalFullRebuild: supplied.journalFullRebuild,
          completedTick: active ? { tick, simTime: tick / 60, sequence: calls, journalStart: pack.start, journalEnd: pack.end } : null,
          spawnInfos: supplied.spawnInfos || ((active && calls === 1) || rebuilding
            ? Array.from({ length: bodies }, (_, i) => info(i + 1)) : []),
          entityVitals: supplied.entityVitals || (active ? Array.from({ length: bodies }, (_, i) => [i + 1, { hull: 100, rot: tick }]) : []),
          domainUpdates: supplied.domainUpdates || (active ? [{ segs: ['fuel'], v: { current: tick } }] : []),
          events: Array.from({ length: active ? eventsPerTick : 0 }, () => ({ t: 'fixture:one-shot', p: { id: ++eventId } })),
        };
      },
    }),
  });
  vm.runInContext(adapterSource, context);
  const send = message => context.self.onmessage({ data: message });
  const settle = async () => {
    for (;;) {
      const pending = context.fixture.settled();
      await pending;
      if (pending === context.fixture.settled()) break;
    }
  };
  const setOwnerScale = scale => {
    ownerScale = scale;
    state.timeScale = scale;
    // Use the real main command boundary so refreshLocalClockScale sees the changed authority.
    laneDomEvent({ type: 'keydown', code: 'KeyS', pressed: true });
  };
  const lane = createSimLaneRuntime({ state, registry: {}, bus,
    flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
    channelFactory: () => ({
      post(message) {
        if (message.kind === 'clockAck') {
          if (holdAcks) { heldAcks.push(message); return; }
          deliveredAcks++;
        }
        send(message);
      },
      onMessage(handler) { receive = handler; }, terminate() {},
    }),
  });
  await settle();
  await lane.readyPromise;
  lane.runner.setClockActive(true);
  await settle();
  t.after(async () => { lane.close(); await settle(); });
  return {
    state, lane, posts, seenEvents, batches, appliedCommands, timerDelays, clock: context.fixture.clock,
    maxPendingTimers: () => maxPendingTimers,
    generatedEvents: () => eventId, deliveredAcks: () => deliveredAcks,
    async until(elapsedMs) {
      const target = 1000 + elapsedMs;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        if (next[1].wakeAt == null) next[1].wakeAt = next[1].at + (wakeDelays[wakes++] || 0);
        if (next[1].wakeAt > target) break;
        timers.delete(next[0]); now = Math.max(now, next[1].wakeAt); next[1].fn();
        await settle();
        await onWake?.({ clock: context.fixture.clock, lane, state, now, setOwnerScale, settle });
        await settle();
      }
      now = Math.max(now, target);
    },
    async releaseAcks() {
      holdAcks = false;
      for (const message of heldAcks.splice(0)) { deliveredAcks++; send(message); }
      await settle();
    },
    async pause() {
      lane.runner.setClockActive(false);
      await settle();
    },
    async resume() {
      lane.runner.setClockActive(true);
      await settle();
    },
  };
}

test('delayed consumer keeps cheap worker ticking with one latest scalar row per body and ordered events', async t => {
  const f = await fixture(t);
  await f.until(1000);
  assert.ok(f.clock.stepCount >= 59, 'one second of worker time advances at fixed-step cadence without presentation ACKs');
  assert.equal(f.clock.shedStepCount, 0);
  assert.equal(f.posts.filter(p => p.kind === 'clockTick').length, 1, 'no extra reply is posted before the outstanding ACK');
  assert.equal(f.deliveredAcks(), 0, 'the fixture did not secretly release a consumer ACK');
  assert.equal(f.clock.sentAwaitingAck, true);
  assert.equal(f.clock.backpressured, false);
  assert.equal(f.clock.latestReply.entityVitals.length, 142);
  assert.equal(f.clock.latestReply.domainUpdates.length, 1);
  assert.ok(f.clock.durableCount < 250, 'repeated scalar snapshots do not consume the durable backlog allowance');
  const newestTick = f.clock.stepCount;
  await f.pause();
  await f.releaseAcks();
  assert.equal(f.state.entities.get(1).rot, newestTick);
  assert.equal(f.state.fuel.current, newestTick);
  assert.deepEqual(f.seenEvents, Array.from({ length: f.generatedEvents() }, (_, i) => i + 1));
  assert.equal(f.clock.sentAwaitingAck, false);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('true one-shot backlog remains bounded and its pressure is reported before ACK recovery', async t => {
  const f = await fixture(t, { eventsPerTick: 300 });
  await f.until(1000);
  assert.equal(f.clock.backpressured, true, 'actual durable events still stop an unconsumed producer');
  assert.ok(f.clock.durableCount >= 4096 && f.clock.durableCount < 4096 + 442);
  assert.equal(f.clock.latestReply.clockDiagnostics.backpressured, true, 'diagnostics reflect pressure after merging');
  assert.equal(f.clock.backpressureEpisodes, 1);
  const stopped = f.clock.stepCount;
  await f.until(2000);
  assert.equal(f.clock.stepCount, stopped, 'a stopped consumer cannot grow the durable queue indefinitely');
  await f.pause();
  await f.releaseAcks();
  assert.deepEqual(f.seenEvents, Array.from({ length: f.generatedEvents() }, (_, i) => i + 1));
  assert.ok(f.lane.getDiagnostics().workerClockLastDiagnostics.backpressureEpisodes >= 1);
  assert.ok(f.clock.backpressureTotalMs > 0);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('delayed reply respects reused entity lives and ancestor domain reset order', async t => {
  const updates = [
    [],
    [{ segs: ['combat', 'attachments'], v: { byId: { old: { state: 'active' } } } }],
    [{ segs: ['combat', 'attachments', 'byId', 'old'], v: { state: 'broken' } }],
    [{ segs: ['combat', 'attachments'], v: null }],
    [{ segs: ['combat', 'attachments'], v: {} }],
    [{ segs: ['combat', 'attachments', 'byId', 'stale'], v: { state: 'active' } }],
    [{ segs: ['combat', 'attachments'], v: null }],
    [{ segs: ['combat', 'attachments'], v: {} }],
    [{ segs: ['combat', 'attachments', 'byId', 'fresh'], v: { state: 'active' } }],
  ];
  const f = await fixture(t, { bodies: 0, payload: ({ calls }) => {
    const records = calls === 1 ? [{ kind: 1, id: 7, generation: 1 }]
      : calls === 2 ? [{ kind: 3, id: 7, generation: 1, x: -20 }]
      : calls === 3 ? [{ kind: 2, id: 7, generation: 1 }]
      : calls === 4 ? [{ kind: 1, id: 7, generation: 2 }]
      : calls === 5 ? [{ kind: 3, id: 7, generation: 2, x: 50 }]
      : calls === 6 ? [{ kind: 1, id: 8, generation: 1 }]
      : calls === 7 ? [{ kind: 2, id: 8, generation: 1 }] : [];
    return { records, domainUpdates: updates[calls - 1] || [],
      spawnInfos: calls === 1 ? [info(7, 100, 10)] : calls === 4 ? [info(7, 101, 80)] : calls === 6 ? [info(8)] : [],
      entityVitals: calls <= 2 ? [[7, { hull: 9 }]] : [],
    };
  } });
  await f.until(40);
  const old = f.state.entities.get(7);
  await f.until(200);
  await f.pause();
  await f.releaseAcks();
  const fresh = f.state.entities.get(7);
  assert.notEqual(fresh, old);
  assert.equal(old.alive, false);
  assert.equal(fresh.occupantGeneration, 101);
  assert.equal(fresh.hull, 80, 'old-life vitals cannot overwrite the replacement spawn');
  assert.equal(fresh.pos.x, 50, 'only the newest journal generation supplies the pose');
  assert.equal(f.state.entities.has(8), false, 'a coalesced spawn followed by retire is not resurrected');
  assert.deepEqual(f.state.combat.attachments, { byId: { fresh: { state: 'active' } } });
  assert.deepEqual(f.seenEvents, Array.from({ length: f.generatedEvents() }, (_, i) => i + 1));
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('a retained spawn omitted by a later full rebuild cannot resurrect after the rebuild', async t => {
  const f = await fixture(t, { bodies: 0, payload: ({ calls, rebuilding }) => ({
    records: calls <= 3 || rebuilding ? [{ kind: 1, id: calls === 2 && !rebuilding ? 8 : 7, generation: 1 }] : [],
    spawnInfos: calls <= 3 || rebuilding ? [info(calls === 2 && !rebuilding ? 8 : 7)] : [],
    entityVitals: [], domainUpdates: [], journalFullRebuild: calls === 3 || rebuilding,
  }) });
  await f.until(200);
  await f.pause();
  await f.releaseAcks();
  assert.equal(f.state.entities.has(7), true);
  assert.equal(f.state.entities.has(8), false);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('recoverable late worker wakes retain debt and catch up through bounded yielded batches', async t => {
  let injected = false;
  const f = await fixture(t, { bodies: 4, stepCostMs: 4,
    wakeDelays: [130, ...Array(19).fill(0), 90],
    onWake: ({ clock }) => {
      if (!injected && clock.accumulator >= 1 / 60) {
        injected = true;
        laneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true });
      }
    },
  });
  await f.until(1000);
  assert.ok(f.clock.stepCount >= 59, 'recoverable scheduling delays do not permanently ratchet simulation below wall time');
  assert.equal(f.clock.shedStepCount, 0, 'debt within 250 ms is carried instead of discarded after each batch');
  assert.ok(f.batches.every(batch => batch.steps <= 4), 'catch-up never turns into a fifteen-step uninterruptible batch');
  assert.ok(f.timerDelays.some(delay => delay === 0), 'remaining whole-step debt gets a prompt yielded task');
  assert.equal(f.maxPendingTimers(), 1);
  const input = f.appliedCommands.find(row => row.command?.p?.d?.code === 'KeyW');
  assert.ok(input && input.debt >= 1 / 60, 'input interleaves before the carried debt is drained');
  await f.pause();
  await f.releaseAcks();
  assert.deepEqual(f.seenEvents, Array.from({ length: f.generatedEvents() }, (_, i) => i + 1));
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('intrinsically overloaded worker carries bounded debt without growing a timer queue or claiming 60 Hz', async t => {
  const f = await fixture(t, { bodies: 4, stepCostMs: 39 });
  await f.until(1000);
  await f.until(2000);
  assert.ok(f.clock.stepCount < 70, '39 ms authoritative steps cannot become 60 Hz through scheduler accounting');
  assert.ok(f.clock.shedStepCount > 0, 'only actual debt beyond the bound is shed under sustained overload');
  assert.ok(f.clock.accumulator >= 0 && f.clock.accumulator <= 0.25 + 1e-12);
  assert.ok(f.batches.every(batch => batch.steps <= 4));
  assert.equal(f.maxPendingTimers(), 1);
  assert.equal(f.clock.backpressured, false, 'this fixture isolates clock overload from consumer pressure');
  await f.pause();
  await f.releaseAcks();
  assert.deepEqual(f.seenEvents, Array.from({ length: f.generatedEvents() }, (_, i) => i + 1));
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('pause discards whole old debt and resume does not charge the hidden wall interval', async t => {
  let paused = false;
  let pausedSteps = 0;
  const f = await fixture(t, { bodies: 4, stepCostMs: 3, wakeDelays: [130],
    onWake: async ({ clock, lane, settle }) => {
      if (!paused && clock.accumulator >= 1 / 60) {
        paused = true;
        pausedSteps = clock.stepCount;
        lane.runner.setClockActive(false);
        await settle();
        assert.ok(clock.accumulator < 1 / 60);
      }
    },
  });
  await f.until(10000);
  assert.equal(f.clock.stepCount, pausedSteps);
  await f.resume();
  await f.until(10100);
  assert.ok(f.clock.stepCount - pausedSteps >= 5 && f.clock.stepCount - pausedSteps <= 7);
  assert.equal(f.clock.shedStepCount, 0, 'the hidden interval is excluded, not reported as overload');
  assert.equal(f.maxPendingTimers(), 1);
});

for (const boundary of ['scale', 'lifecycle']) {
  test(`${boundary} boundary starts a new wall interval instead of replaying whole old debt`, async t => {
    let reset = false;
    const f = await fixture(t, { bodies: 4, stepCostMs: 3, wakeDelays: [130],
      onWake: async ({ clock, lane, setOwnerScale, settle }) => {
        if (!reset && clock.accumulator >= 1 / 60) {
          reset = true;
          if (boundary === 'scale') setOwnerScale(0.25);
          else {
            lane.runner.setLifecycleGeneration(1);
            lane.runner.setClockActive(true);
          }
          await settle();
          assert.ok(clock.accumulator < 1 / 60, 'old whole-step debt is discarded at the explicit boundary');
        }
      },
    });
    await f.until(1000);
    assert.equal(reset, true);
    assert.equal(f.clock.scale, boundary === 'scale' ? 0.25 : 1);
    assert.equal(f.clock.shedStepCount, 0);
    assert.ok(f.batches.every(batch => batch.steps <= 4));
    assert.equal(f.maxPendingTimers(), 1);
    assert.equal(f.lane.getDiagnostics().error, null);
  });
}
