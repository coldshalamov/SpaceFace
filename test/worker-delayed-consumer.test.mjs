import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { laneDomEvent } from '../src/core/simLaneCommands.js';
import { createPoseTableWriter } from '../src/core/simPoseTable.js';

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
  stepCostMs = 0, wakeDelays = [], onWake, eventFor = id => ({ t: 'fixture:one-shot', p: { id } }) } = {}) {
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
  const seenImpacts = [];
  const state = createGameState(4242);
  const bus = createBus();
  bus.on('fixture:one-shot', event => seenEvents.push(event.id));
  bus.on('physics:impact', event => seenImpacts.push(event.id));
  const context = vm.createContext({
    performance: { now: () => now, timeOrigin: 0 },
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
    // The eval'd adapter strips its imports; worker-local clock now builds a real pose-table
    // writer (private buffer, transfer mode) — inject the same binding the import provides.
    createPoseTableWriter,
    loadModelTruthCensus: async () => {},
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
          events: Array.from({ length: active ? eventsPerTick : 0 }, () => eventFor(++eventId)),
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
    // Both clock origins are controlled here: the worker adapter runs on the vm
    // performance clock (timeOrigin 0, now driven by this harness) and the main
    // lane stamps heartbeats from the same fake timebase through this injection.
    // The emitted stamp therefore rides the queue intact — a bad main timestamp
    // cannot be laundered into a passing one by delivery.
    pumpScheduler: { nowMs: () => now, timeOriginMs: 0 },
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
    state, lane, posts, seenEvents, seenImpacts, batches, appliedCommands, timerDelays, clock: context.fixture.clock,
    send,
    now: () => now,
    skip(ms) { now += Math.max(0, ms); },
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
    // Fire exactly one pending timer turn, whatever is due next. Ordering probes use this
    // to run a worker timer BEFORE a queued heartbeat batch drains (timer-first delivery).
    async stepTimer() {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) return false;
      if (next[1].wakeAt == null) next[1].wakeAt = next[1].at + (wakeDelays[wakes++] || 0);
      timers.delete(next[0]);
      now = Math.max(now, next[1].wakeAt);
      next[1].fn();
      await settle();
      await onWake?.({ clock: context.fixture.clock, lane, state, now, setOwnerScale, settle });
      await settle();
      return true;
    },
    async releaseAcks() {
      holdAcks = false;
      for (const message of heldAcks.splice(0)) { deliveredAcks++; send(message); }
      await settle();
    },
    async sampleHeartbeat(clockSequence, ackJournalEnd, lifecycleGeneration) {
      send({ kind: 'laneHeartbeat', motionSampleId: 1, clockSequence, ackJournalEnd, lifecycleGeneration });
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
  assert.ok(f.posts.filter(p => p.kind === 'clockTick').length <= 4,
    'replies may pipeline only up to the bounded outstanding window before coalescing resumes');
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

test('continuous production heartbeats keep worker congestion as honest catch-up debt', async t => {
  const f = await fixture(t, { bodies: 4 });
  await f.releaseAcks();
  f.lane.runner.heartbeat();
  await f.until(100);
  assert.ok(f.clock.stepCount >= 5);

  // Block the worker event loop for 1.4 s of fake time while the main thread keeps
  // producing frames. In the real browser those beats queue behind the blocked worker;
  // deliver that queued batch afterwards with their original production stamps.
  const stepsBefore = f.clock.stepCount;
  const shedBefore = f.clock.shedStepCount;
  f.skip(1400);
  const endAt = f.now();
  let lastSent = f.clock.lastHeartbeatSentAtMs;
  assert.ok(lastSent > 0);
  for (let sentAt = lastSent + 1000 / 60; sentAt <= endAt; sentAt += 1000 / 60) {
    f.send({ kind: 'laneHeartbeat', sentAtMs: sentAt, clockKind: 'performance' });
    lastSent = sentAt;
  }
  await f.releaseAcks();

  assert.equal(f.clock.heartbeatHolds, 0,
    'continuously produced beats prove the page was alive, so no dead-page hold is recorded');
  assert.equal(f.clock.heartbeatHeld, false);
  assert.ok(f.clock.lastHeartbeatProductionGapMs <= 20,
    `the queued production stream stayed at frame cadence (gap ${f.clock.lastHeartbeatProductionGapMs})`);

  await f.until(f.now() - 1000 + 50);
  assert.ok(f.clock.stepCount > stepsBefore, 'the worker resumes stepping after its event loop unblocks');
  assert.ok(f.clock.shedStepCount > shedBefore,
    'the 1.4 s congestion interval remains bounded catch-up debt instead of being silently deleted');
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('true one-shot backlog remains bounded and its pressure is reported before ACK recovery', async t => {
  const f = await fixture(t, {
    eventsPerTick: 300,
    eventFor: id => id % 300 === 1
      ? { t: 'fixture:one-shot', p: { id } }
      : { t: 'physics:impact', p: { id, playerInvolved: false } },
    payload: ({ tick }) => ({
      spawnInfos: Array.from({ length: 200 }, (_, i) => info(9000 + tick * 200 + i)),
    }),
  });
  // Arm the heartbeat-hold guard exactly once: in production rAF beats always precede a stall,
  // so a dead consumer means beats STOP — 1 s later the hold parks the clock and the durable
  // queue freezes. Without a first beat the guard cannot tell a stall from a page that never
  // presented, and the queue would grow forever on this harness only.
  f.lane.runner.heartbeat();
  await f.until(1000);
  assert.equal(f.clock.backpressured, true, 'durable pressure is still reported while rows retain');
  // NO-FREEZE (173afdeea4): durable rows are never shed, so the queue keeps retaining past the
  // pressure flag — the bound is the heartbeat hold parking the producer, not a row ceiling.
  assert.ok(f.clock.durableCount >= 4096,
    `the durable queue must reach the pressure flag: ${f.clock.durableCount}`);
  assert.equal(f.clock.latestReply.clockDiagnostics.backpressured, true, 'diagnostics reflect pressure after merging');
  assert.equal(f.clock.backpressureEpisodes, 1);
  await f.until(2000);
  assert.equal(f.clock.heartbeatHeld, true,
    'one second of missing beats parks the producer (the bound on a stopped consumer)');
  const stopped = f.clock.stepCount;
  const durableFrozen = f.clock.durableCount;
  await f.until(2500);
  assert.equal(f.clock.stepCount, stopped, 'a held producer cannot grow the durable queue indefinitely');
  assert.equal(f.clock.durableCount, durableFrozen, 'the durable queue freezes with the producer');
  await f.pause();
  await f.releaseAcks();
  assert.deepEqual(f.seenEvents, Array.from({ length: f.generatedEvents() / 300 }, (_, i) => i * 300 + 1),
    'the durable one-shots all arrive in order');
  assert.ok(f.seenImpacts.every((v, i) => i === 0 || v > f.seenImpacts[i - 1]),
    'ambient impacts are delivered in order and without duplicates');
  const shedImpacts = f.generatedEvents() - f.seenEvents.length - f.seenImpacts.length;
  assert.ok(shedImpacts > 0, 'the worker actually sheds stale ambient impacts');
  assert.equal(f.lane.getDiagnostics().workerClockLastDiagnostics.shedEvents, shedImpacts);
  assert.ok(f.lane.getDiagnostics().workerClockLastDiagnostics.backpressureEpisodes >= 1);
  assert.ok(f.clock.backpressureTotalMs > 0);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('a heartbeat recovers a lost reply credit without waiting for a journal rebuild', async t => {
  const f = await fixture(t, { bodies: 4 });
  await f.until(500);
  const applied = f.posts.filter(message => message.kind === 'clockTick').at(-1);
  assert.ok(applied);
  // 173afdeea4: the reply window is 2 in flight (was 4) — replies stop flooding a busy main.
  assert.equal(f.clock.unackedSequences.length, 2);
  assert.equal(f.deliveredAcks(), 0);
  assert.equal(f.state.tick, applied.stateTick);
  assert.ok(f.clock.stepCount > f.state.tick, 'authoritative motion outlasted the reply window');

  await f.sampleHeartbeat(applied.clockSequence, applied.journalEnd, 1);
  assert.equal(f.clock.unackedSequences.length, 2, 'a stale lifecycle cannot release current credits');
  await f.sampleHeartbeat(applied.clockSequence + 1, applied.journalEnd, 0);
  assert.equal(f.clock.unackedSequences.length, 2, 'a future watermark cannot release current credits');
  await f.sampleHeartbeat(applied.clockSequence, applied.journalEnd, 0);
  await f.until(600);
  assert.ok(f.state.tick > applied.stateTick, 'the next pose arrives without the watchdog');
  assert.equal(f.clock.staleAckRecoveries, 0);
  assert.equal(f.deliveredAcks(), 0);
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
  // ENGINE slice 5: a late wake dips the world clock (dilation) instead of dropping steps; it
  // recovers toward real time as soon as the debt clears.
  assert.ok(f.clock.stepCount >= 50, 'recoverable scheduling delays dip the clock, not ratchet it down');
  assert.equal(f.clock.shedStepCount, 0, 'debt within the hard cap is carried, never discarded');
  assert.ok(f.clock.dilation > 0.8, 'the world clock recovers toward real time once debt clears');
  assert.ok(f.batches.every(batch => batch.steps <= 4), 'catch-up never turns into a fifteen-step uninterruptible batch');
  assert.ok(f.timerDelays.some(delay => delay === 0), 'remaining whole-step debt gets a prompt yielded task');
  // Two bounded timers: the fixed-step clock and the stale-ACK watchdog. The
  // assertion still fails on timer-queue growth.
  assert.ok(f.maxPendingTimers() <= 2);
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
  // ENGINE slice 5: sustained overload slows the whole world smoothly (dilation) rather than
  // shedding steps; only debt beyond the 1 s hard cap would ever be dropped.
  assert.equal(f.clock.shedStepCount, 0, 'sustained overload dilates the world instead of shedding steps');
  assert.ok(f.clock.dilation < 1, 'the world clock is dilated under overload');
  assert.ok(f.clock.accumulator >= 0 && f.clock.accumulator <= 1.0 + 1e-12);
  assert.ok(f.batches.every(batch => batch.steps <= 4));
  assert.ok(f.maxPendingTimers() <= 2, 'clock timer plus stale-ACK watchdog, no queue growth');
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
  assert.ok(f.maxPendingTimers() <= 2, 'clock timer plus stale-ACK watchdog, no queue growth');
});

test('timer-first continuous delivery releases the provisional hold and recovers promptly', async t => {
  // Ordering probe: the worker's overdue timer runs BEFORE the queued heartbeat batch
  // drains. Continuous production means the hold is transport congestion, never a dead
  // page — it must park without destroying debt, refuse release on stale beats, and
  // replace the coarse 100 ms recheck the moment a current beat lands.
  const f = await fixture(t, { bodies: 4 });
  await f.releaseAcks();
  f.lane.runner.heartbeat();
  await f.until(100);
  assert.ok(f.clock.stepCount >= 5);

  // The worker event loop blocks for 1.2 s while the main thread keeps producing frames.
  f.skip(1200);
  const congestedUntil = f.now();
  const beats = [];
  for (let sentAt = 1000 + 1000 / 60; sentAt <= congestedUntil; sentAt += 1000 / 60) beats.push(sentAt);
  const stale = beats.filter(sentAt => congestedUntil - sentAt > 1000);
  const fresh = beats.filter(sentAt => congestedUntil - sentAt <= 1000);
  assert.ok(stale.length > 10 && fresh.length > 10, 'the batch has both stale and current production');

  // Timer-first: one overdue fixed-step timer fires before any queued beat is consumed.
  assert.equal(await f.stepTimer(), true, 'an overdue clock timer is pending');
  assert.equal(f.clock.heartbeatHeld, true, 'the timer parks stepping while production is unproven');
  assert.equal(f.clock.heartbeatHolds, 1, 'the parking episode is counted at entry, not deferred');
  assert.equal(f.clock.heartbeatSilences, 0, 'continuous production is never producer silence');
  const stepsHeld = f.clock.stepCount;

  // Stale beats only prove the cadence of old frames. They must not release the hold.
  for (const sentAt of stale) f.send({ kind: 'laneHeartbeat', sentAtMs: sentAt, clockKind: 'performance' });
  assert.equal(f.clock.heartbeatHeld, true, 'a stale queued beat cannot release the provisional hold');
  assert.equal(f.clock.stepCount, stepsHeld, 'stepping stays parked on stale production');
  assert.equal(f.clock.heartbeatSilences, 0, 'frame-cadence gaps confirm no silence');

  // The current tail of the same batch proves production is alive now: release at once,
  // with the parked 100 ms recheck replaced by a prompt wake.
  for (const sentAt of fresh) f.send({ kind: 'laneHeartbeat', sentAtMs: sentAt, clockKind: 'performance' });
  assert.equal(f.clock.heartbeatHeld, false, 'a current beat releases the hold');
  assert.equal(f.clock.heartbeatSilences, 0);

  const shedBefore = f.clock.shedStepCount;
  // Recovery must not wait another coarse recheck: 40 ms is well inside the 100 ms park cycle.
  await f.until(f.now() - 1000 + 40);
  assert.ok(f.clock.stepCount > stepsHeld,
    'stepping resumes promptly instead of waiting out the parked recheck');
  assert.ok(f.clock.shedStepCount > shedBefore,
    'the congestion interval stays honest capped catch-up debt, not deleted time');
  assert.equal(f.clock.heartbeatSilences, 0, 'no production time was discarded as dead-page time');
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('a late-drained restart after a true producer gap keeps the live suffix as capped catch-up debt', async t => {
  // The receipt probe: last pre-gap beat at 1100, the page resumes production at 2200, but
  // the blocked worker only consumes the batch at 3000 — and a timer parks stepping before
  // the messages drain. The live suffix after the restart must survive as ordinary capped
  // debt (and shed accounting) instead of vanishing into a receipt-time reset.
  const f = await fixture(t, { bodies: 4 });
  await f.releaseAcks();
  f.lane.runner.heartbeat();
  await f.until(100);
  // The last frame the page produced before dying, stamped exactly at 1100.
  f.send({ kind: 'laneHeartbeat', sentAtMs: 1100, clockKind: 'performance' });

  f.skip(1900); // now = 3000: the worker was blocked across the stall AND the restart.
  assert.equal(await f.stepTimer(), true, 'timer-first: one overdue turn runs before the batch');
  assert.equal(f.clock.heartbeatHeld, true, 'the hold engages while the restart is still queued');
  assert.equal(f.clock.heartbeatHolds, 1);
  const stepsBeforeDrain = f.clock.stepCount;
  const shedBeforeDrain = f.clock.shedStepCount;

  // The page resumed at 2200 producing at frame cadence; the whole batch drains late at 3000.
  for (let sentAt = 2200; sentAt <= 3000; sentAt += 1000 / 60) {
    f.send({ kind: 'laneHeartbeat', sentAtMs: sentAt, clockKind: 'performance' });
  }
  assert.equal(f.clock.heartbeatHeld, false, 'the confirmed restart releases the hold');
  assert.equal(f.clock.heartbeatSilences, 1, 'the dead interval is producer silence, not worker parking');
  assert.equal(f.clock.heartbeatHolds, 1, 'the one parking episode is neither lost nor double-counted');
  // 1100 ms of production gap less the 1000 ms grace window = 100 ms deliberately discarded.
  assert.ok(Math.abs(f.clock.heartbeatSilenceMs - 100) < 1,
    `only the silence past the grace window is discarded (got ${f.clock.heartbeatSilenceMs})`);
  // The anchor moved to the producer restart in worker coordinates (timeOrigin 0 here),
  // not to message receipt time — the live suffix [2200, 3000] is still owed.
  assert.ok(Math.abs(f.clock.anchorMs - 2200) < 1,
    `anchor follows the producer restart, not receipt time (got ${f.clock.anchorMs})`);

  // One tick turn accrues the suffix through the ordinary cap path: the grace second plus
  // the 800 ms live suffix exceed the 1 s debt cap, so the excess surfaces in shed accounting
  // instead of vanishing unattributed — the original bug zeroed it at receipt.
  assert.equal(await f.stepTimer(), true);
  assert.ok(f.clock.shedStepCount - shedBeforeDrain >= 40,
    `the live suffix stays inside capped debt accounting (shed +${f.clock.shedStepCount - shedBeforeDrain})`);
  assert.ok(f.clock.stepCount > stepsBeforeDrain, 'the world resumes stepping after the restart');

  await f.until(f.now() - 1000 + 100);
  const diagnostics = f.lane.getDiagnostics().workerClockLastDiagnostics;
  assert.ok(diagnostics.heartbeatSilences >= 1, 'main-side diagnostics project producer silence');
  assert.ok(diagnostics.heartbeatSilenceMs >= 100, 'main-side diagnostics project discarded silence time');
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('a deliberate pause does not become a dead-page hold across reactivation', async t => {
  // Hidden-page probe: beats stop while the clock is intentionally paused. Reactivation is
  // itself main-thread liveness, so the first timer of the new active period must not age
  // the pre-pause beat into a dead-page hold before the next heartbeat can even arrive.
  const f = await fixture(t, { bodies: 4 });
  await f.releaseAcks();
  f.lane.runner.heartbeat();
  await f.until(100);
  assert.ok(f.clock.stepCount >= 5);

  await f.pause();
  f.skip(3000); // hidden for three seconds: no frames, no beats, by design
  await f.resume();

  // The reactivation timer fires before any new-period beat can be delivered.
  assert.equal(await f.stepTimer(), true);
  assert.equal(f.clock.heartbeatHeld, false,
    'deliberate paused time is not charged as dead-page time');
  assert.equal(f.clock.heartbeatHolds, 0, 'no hold is attributed across the intentional boundary');
  assert.equal(f.clock.heartbeatSilences, 0);
  const stepsAtResume = f.clock.stepCount;

  // Once foreground production actually resumes, the new period steps at cadence.
  f.lane.runner.heartbeat();
  await f.until(f.now() - 1000 + 100);
  assert.ok(f.clock.stepCount > stepsAtResume, 'the reactivated clock resumes stepping');
  assert.equal(f.clock.heartbeatHolds, 0);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('mixed-format beats fall back to receipt time without re-tripping the guard', async t => {
  // Clock-format transition probe: once an unstamped (or clock-incompatible) beat arrives,
  // the producer stamp baseline must be abandoned. Otherwise the timer keeps aging the old
  // stamp and the guard holds repeatedly even though fresh unstamped beats keep landing.
  const f = await fixture(t, { bodies: 4 });
  await f.releaseAcks();
  f.lane.runner.heartbeat();
  await f.until(100);
  f.send({ kind: 'laneHeartbeat', sentAtMs: 1100, clockKind: 'performance' });
  assert.ok(f.clock.lastHeartbeatSentAtMs > 0, 'a stamped baseline is established');

  // The stream switches to unstamped legacy beats at a slow but live cadence.
  for (let elapsed = 200; elapsed <= 1400; elapsed += 200) {
    f.send({ kind: 'laneHeartbeat' });
    await f.until(elapsed);
  }
  assert.equal(f.clock.lastHeartbeatSentAtMs, 0, 'the incompatible format clears the stamp baseline');
  assert.equal(f.clock.heartbeatHolds, 0,
    'fresh unstamped beats are not aged against a stale producer stamp');
  assert.equal(f.clock.heartbeatHeld, false);
  assert.equal(f.lane.getDiagnostics().error, null);
});

test('stopped presentation heartbeats hold the world until foreground beats resume', async t => {
  // ENGINE slice 5: the hold is a dead-main-thread guard at 1 s; an ordinary render stall shorter
  // than that keeps the world running and the fence plays the backlog out.
  const f = await fixture(t, { bodies: 4 });
  await f.releaseAcks();
  f.lane.runner.heartbeat();
  await f.until(100);
  assert.ok(f.clock.stepCount >= 5);
  assert.equal(f.clock.heartbeatHeld, false);
  await f.until(700);
  assert.equal(f.clock.heartbeatHeld, false, 'a sub-second stall does not hold the world');

  await f.until(1300);
  assert.equal(f.clock.heartbeatHeld, true, 'the real worker clock enters its heartbeat hold');
  const heldTick = f.clock.stepCount;
  await f.until(1800);
  assert.equal(f.clock.stepCount, heldTick, 'ticks stay parked during the hold');

  for (let elapsed = 1820; elapsed <= 2000; elapsed += 20) {
    f.lane.runner.heartbeat();
    await f.until(elapsed);
  }
  assert.equal(f.clock.heartbeatHeld, false);
  assert.ok(f.clock.stepCount - heldTick >= 11 && f.clock.stepCount - heldTick <= 12,
    'recurring foreground beats resume the fixed-step cadence without charging the held interval');
  assert.equal(f.lane.getDiagnostics().workerClockLastDiagnostics.heartbeatHolds, 1);
  assert.equal(f.clock.shedStepCount, 0);
  assert.equal(f.lane.getDiagnostics().error, null);
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
    assert.ok(f.maxPendingTimers() <= 2, 'clock timer plus stale-ACK watchdog, no queue growth');
    assert.equal(f.lane.getDiagnostics().error, null);
  });
}
