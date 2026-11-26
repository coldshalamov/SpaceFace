// NO-FREEZE (owner bug 2026-11-21: "it freezes for 3 straight seconds… the locations of the objects
// are frozen while the game is running"). These pin the structural rules that make a frozen picture
// over a live simulation impossible:
//   1. the worker's clock never waits for ACKs or a dense retained reply;
//   2. poses reach the main thread through the shared pose table, which advances while the reliable
//      reply journal is stalled, and the renderer's world takes those poses for bodies it holds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import {
  createSharedPoseTable, createPoseTableReader, createPoseTableWriter, getActivePoseFeed,
} from '../src/core/simPoseTable.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';

function waitFor(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) { resolve(); return; }
      if (Date.now() >= deadline) { reject(new Error('timed out')); return; }
      setTimeout(poll, 5);
    };
    poll();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootWorker(t, tag, extraInit = {}) {
  const previousSelf = globalThis.self;
  const replies = [];
  const workerSelf = { postMessage(message) { replies.push(message); } };
  globalThis.self = workerSelf;
  await import(`../src/core/wholeSimBrowserWorker.js?${tag}-${Date.now()}`);
  const send = (data) => workerSelf.onmessage({ data });
  t.after(async () => {
    try { send({ kind: 'shutdown', seq: `${tag}-shutdown` }); } catch (_) {}
    await sleep(30);
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  send({
    kind: 'init', seq: `${tag}-init`, profile: 'production', clockMode: 'worker-local',
    timeScale: 0, seed: 4242, settings: {}, domainMirroring: {}, bridgeAll: false, tacticalAI: false,
    viewport: { w: 800, h: 600 },
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
    scenarioContractPath: 'src/data/scenarios/47a.scenario.json', scenarioContractHash: tag,
    ...extraInit,
  });
  await waitFor(() => replies.some((r) => r.kind === 'ready'), 30000);
  send({ kind: 'clockControl', seq: `${tag}-control`, active: true, generation: 1, lifecycleGeneration: 0, timeScale: 1 });
  return { replies, send };
}

const lastClock = (replies) => replies.filter((r) => r.kind === 'clockTick').at(-1);

test('the worker keeps stepping and the pose table keeps advancing while every ACK is withheld', { timeout: 60000 }, async (t) => {
  const table = createSharedPoseTable();
  assert.ok(table, 'SharedArrayBuffer is available in this realm');
  const reader = createPoseTableReader();
  reader.bindShared(table);
  const { replies } = await bootWorker(t, 'no-ack', { poseTable: table });
  await waitFor(() => lastClock(replies)?.clockDiagnostics?.scale === 1, 10000);
  const startSteps = lastClock(replies).clockDiagnostics.steps;
  const startWrites = reader.peekWrites();
  // No clockAck, no command ACK fields, no heartbeat watermark: the old protocol stopped here.
  await sleep(1500);
  const { snapshot } = reader.read(0);
  const steps = reader.snapshot.steps;
  assert.ok(snapshot.valid, 'the table holds a coherent snapshot');
  assert.ok(reader.peekWrites() - startWrites >= 45,
    `the table advanced every step while ACKs were withheld (${reader.peekWrites() - startWrites} writes in 1.5 s)`);
  assert.ok(steps - startSteps >= 45, `the world's clock kept stepping without ACKs (${steps - startSteps} steps in 1.5 s)`);
  // (Which bodies are journaled depends on the route; the Electron gate checks real rows.)
});

test('a dense retained reply (thousands of durable rows) never stops the clock', { timeout: 60000 }, async (t) => {
  const table = createSharedPoseTable();
  const reader = createPoseTableReader();
  reader.bindShared(table);
  const { replies, send } = await bootWorker(t, 'dense', { poseTable: table });
  await waitFor(() => lastClock(replies)?.clockDiagnostics?.scale === 1, 10000);
  send({ kind: 'laneForce', padRows: 2000 });
  await sleep(300);
  const before = reader.peekWrites();
  await sleep(1500);
  const after = reader.peekWrites();
  const diag = lastClock(replies)?.clockDiagnostics;
  assert.ok(after - before >= 45, `stepping continued under a dense retained reply (${after - before} steps in 1.5 s)`);
  assert.ok((diag?.retainedRows ?? 0) >= 4096 || diag?.backpressured === true || (diag?.unacked ?? 0) >= 1,
    'the retained reply really was dense/unacked during the measurement');
});

test('a blocked transferable pose port retains one newest table while the worker steps', { timeout: 60000 }, async (t) => {
  const { port1, port2 } = new MessageChannel();
  const tables = [];
  port1.onmessage = ({ data }) => tables.push(data);
  t.after(() => port1.close());
  const { replies } = await bootWorker(t, 'transfer-backpressure', { posePort: port2 });
  const reader = createPoseTableReader();
  await waitFor(() => tables.length === 1);
  const first = tables[0];
  reader.acceptTransfer(first.buffer);
  const firstTick = reader.read().snapshot.tick;

  await sleep(250);
  assert.equal(tables.length, 1, 'there is never a queue of old pose messages');
  assert.ok(!replies.some((reply) => reply.kind === 'poseTable'), 'motion uses the separate port');
  port1.postMessage({ kind: 'poseTableAck', sequence: first.sequence });
  await waitFor(() => tables.length === 2);
  reader.acceptTransfer(tables[1].buffer);
  assert.ok(reader.read().snapshot.tick > firstTick + 1, 'the next delivery skips to the newest completed step');
});

test('the main lane serves poses from the table while the reply journal is stalled', (t) => {
  const posts = [];
  let receive = null;
  const state = {
    entities: new Map(), entityList: [], settings: { controls: { mouse: {} } },
    meta: { seed: 1 }, input: {}, ui: { screenStack: [] }, tick: 0, simTime: 0, accumulator: 0, timeScale: 1,
  };
  const lane = createSimLaneRuntime({
    state, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false, sabEnvelope: false },
    clockMode: 'worker-local',
    channelFactory: () => ({ post(msg) { posts.push(msg); }, onMessage(h) { receive = h; }, terminate() {} }),
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq });
  const descriptor = posts[0].poseTable;
  assert.ok(descriptor && descriptor.sab instanceof SharedArrayBuffer, 'init ships the shared pose table');

  // A facade row the journal delivered earlier; then the journal stalls (no more replies).
  const row = { id: 7, type: 'ship', alive: true, occupantGeneration: 3, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  state.entities.set(7, row);
  state.playerId = 7;
  const writer = createPoseTableWriter(descriptor);
  const journal = { getActiveGeneration: (id) => (id === 7 ? 1 : 0) };
  const sim = { entityList: [{ id: 7, alive: true, occupantGeneration: 3, pos: { x: 0, y: 0, z: 0 }, vel: { x: 120, z: 0 }, rot: 0.5, hull: 80 }],
    entities: new Map(), tick: 0, simTime: 0, playerId: 7 };
  sim.entities.set(7, sim.entityList[0]);

  const world = createPresentationWorld();
  world.allocateRecord({ entityId: 7, generation: 1, x: 0, y: 0, z: 0 }, row);

  for (let frame = 1; frame <= 5; frame++) {
    sim.tick = frame; sim.simTime = frame / 60; sim.entityList[0].pos.x = frame * 2;
    writer.write(sim, journal, { lifecycleGeneration: 0, steps: frame });
    lane.runner.prepareWithoutAdvance();
    const feed = getActivePoseFeed();
    assert.equal(feed.active, true, 'the frame reads a live pose feed');
    assert.equal(row.pos.x, frame * 2, `frame ${frame}: the facade row moved with no reply applied`);
    world.applySharedPoseTable(feed.snapshot);
    const slot = world.getSlotForEntityId(7);
    assert.equal(world.x[slot], frame * 2, `frame ${frame}: the drawn world moved with no journal record`);
  }
  assert.equal(row.hull, 80, 'the HUD vitals ride the table too');
  assert.equal(lane.getDiagnostics().replyCount, 0, 'no reply was ever applied');

  // A body whose spawn the journal has not delivered is simply not drawn.
  const snapshotOf = (id, generation, occupant) => ({
    count: 1, rows: new Float64Array([id, generation, occupant, 50, 0, 50, 0, 0, 0, 0, 0, 0]),
  });
  assert.equal(world.applySharedPoseTable(snapshotOf(99, 1, 0), false), 0);
  // A recycled id (different generation and occupant) never takes the old body's pose.
  assert.equal(world.applySharedPoseTable(snapshotOf(7, 2, 4), false), 0);
  assert.equal(world.applySharedPoseTable(snapshotOf(7, 1, 4), false), 0);
});

test('held input is state: pointer motion and key repeats mint no transport post of their own', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { laneDomEvent } = await import('../src/core/simLaneCommands.js');
  const posts = [];
  const deferredBoundaries = [];
  let receive = null;
  const state = {
    entities: new Map(), entityList: [], settings: { controls: { mouse: {} } }, mode: 'flight',
    meta: { seed: 1 }, input: {}, ui: { screenStack: [] }, tick: 0, simTime: 0, accumulator: 0, timeScale: 1,
  };
  const lane = createSimLaneRuntime({
    state, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false, sabEnvelope: false },
    clockMode: 'worker-local',
    channelFactory: () => ({
      post(msg) { posts.push(msg); },
      onMessage(h) { receive = h; },
      setDeferral() {},
      drainDeferred() { deferredBoundaries.push(posts.length); },
      deferredStats() { return { held: 0 }; },
      terminate() {},
    }),
  });
  t.after(() => lane.close());
  receive({ kind: 'ready', seq: posts[0].seq });
  lane.runner.setClockActive(true);
  lane.runner.prepareWithoutAdvance();
  const commandsBefore = posts.filter((m) => m.kind === 'clockCommand').length;
  // A hand on a 1000 Hz mouse with two keys auto-repeating, for one 16 ms frame.
  for (let i = 0; i < 16; i++) {
    laneDomEvent({ type: 'mousemove', clientX: 100 + i, clientY: 50, movementX: 1, movementY: 0 });
    laneDomEvent({ type: 'pointermove', clientX: 100 + i, clientY: 50, movementX: 1, movementY: 0 });
  }
  laneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true, repeat: true });
  assert.equal(posts.filter((m) => m.kind === 'clockCommand').length, commandsBefore,
    'pointer motion and auto-repeat never post between frames');
  // Answer any command still in flight so the frame batch can post.
  const inflight = posts.filter((m) => m.kind === 'clockCommand').at(-1);
  if (inflight) {
    receive({ kind: 'clockTick', clockSequence: 1, commandSequence: inflight.commandSequence,
      clockDiagnostics: { appliedCommandSequence: inflight.commandSequence }, stateTick: 1, simTime: 1 / 60,
      journalStart: 0, journalEnd: 0, pack: { count: 0, start: 0, end: 0 } });
  }
  lane.runner.prepareWithoutAdvance();
  const batch = posts.filter((m) => m.kind === 'clockCommand').at(-1);
  const moves = batch.commands.filter((env) => env.t === 'dom' && /move$/.test(env.p?.d?.type || ''));
  assert.equal(moves.length, 2, 'one latest row per pointer event type reaches the frame batch');
  assert.ok(posts.indexOf(batch) < deferredBoundaries.at(-1), 'live input posts before deferred read-model delivery');
  assert.equal(moves[0].p.d.movementX, 16, 'relative motion is summed, not lost');
  assert.equal(lane.getDiagnostics().coalescedPointerEvents, 32);
});

test('the worker never returns per-frame camera envelopes as durable receipt rows', { timeout: 60000 }, async (t) => {
  const { replies, send } = await bootWorker(t, 'camera-acks');
  await waitFor(() => lastClock(replies)?.clockDiagnostics?.scale === 1, 10000);
  for (let i = 1; i <= 20; i++) {
    send({ kind: 'clockCommand', commandSequence: i, lifecycleGeneration: 0, timeScale: 1,
      commands: [{ t: 'camera', seq: i, p: { zoom: 1 } }] });
    await sleep(5);
  }
  await sleep(200);
  const cameraAcks = replies.filter((r) => r.kind === 'clockTick')
    .flatMap((r) => r.commandAcks || []).filter((a) => a.t === 'camera');
  assert.equal(cameraAcks.length, 0, 'camera receipts are latest-wins state, not reply rows');
});

for (const shared of [true, false]) {
  test(`a partial ${shared ? 'shared' : 'transferred'} pose write preserves the latest complete table`, () => {
    const table = shared ? createSharedPoseTable() : null;
    const writer = createPoseTableWriter(table);
    const reader = createPoseTableReader();
    if (table) assert.equal(reader.bindShared(table), true);
    const first = { id: 3, pos: { x: 1, z: 2 } };
    const second = { id: 4, pos: { x: 3, z: 4 } };
    const state = { entityList: [first, second], tick: 1, simTime: 0.1 };
    const goodJournal = { getActiveGeneration: () => 1 };
    const read = (now) => {
      if (!shared) reader.acceptTransfer(writer.takeTransfer());
      return reader.read(now);
    };

    assert.equal(read(0).snapshot.valid, false, 'an empty buffer has no completed physics step');
    writer.write(state, goodJournal);

    // The reader has not seen the last successful write yet. A sequence check
    // against its previous reads cannot detect this partial write on its own.
    first.pos.x = 99;
    state.tick = 2;
    state.simTime = 0.2;
    writer.write(state, {
      getActiveGeneration(id) {
        if (id === second.id) throw new Error('failed after the first row');
        return 1;
      },
    });
    const retained = read(1).snapshot;
    assert.equal(retained.tick, 1);
    assert.equal(retained.count, 2);
    assert.equal(retained.rows[3], 1, 'the partial first row is never published');
    assert.equal(retained.writeErrors, 1, 'the producer reports the failed attempt');

    writer.write(state, goodJournal);
    const { snapshot, advanced } = read(2);
    assert.equal(advanced, true);
    assert.equal(snapshot.tick, 2);
    assert.equal(snapshot.rows[3], 99);
  });
}

test('the pose table reports whether the current roster is incomplete', () => {
  const table = createSharedPoseTable(1);
  const writer = createPoseTableWriter(table);
  const reader = createPoseTableReader();
  reader.bindShared(table);
  const state = { entityList: [{ id: 1 }, { id: 2 }], tick: 1 };
  const journal = { getActiveGeneration: () => 1 };
  writer.write(state, journal);
  assert.equal(reader.read().snapshot.overflow, true);
  state.entityList.pop();
  writer.write(state, journal);
  assert.equal(reader.read().snapshot.overflow, false);
  assert.equal(reader.snapshot.truncated, 1, 'historical overflow count is independent of current completeness');
});

test('the pose writer visits journaled lives and never takes pose from a replacement awaiting spawn', () => {
  const journal = createPresentationJournal(16);
  const writer = createPoseTableWriter();
  const reader = createPoseTableReader();
  const previous = { id: 1, occupantGeneration: 5, pos: { x: 20, z: 0 } };
  const replacement = { id: 1, occupantGeneration: 6, pos: { x: 90, z: 0 } };
  const state = { tick: 1, entities: new Map([[1, previous]]),
    get entityList() { throw new Error('the writer must not scan unrelated world records'); } };
  const publish = () => {
    writer.write(state, journal);
    reader.acceptTransfer(writer.takeTransfer());
    return reader.read().snapshot;
  };
  journal.recordSpawn(1, previous);
  assert.equal(publish().rows[3], 20);
  state.entities.set(1, replacement);
  assert.equal(publish().count, 0);
  journal.recordDestroy(1, previous);
  journal.recordSpawn(1, replacement);
  const snapshot = publish();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.rows[2], 6);
  assert.equal(snapshot.rows[3], 90);
  assert.equal(journal.getActiveGenerationFor(previous), 0);
});

test('a drawn row whose life the simulation no longer has is hidden at once; a rebuilt same body is not', () => {
  const world = createPresentationWorld();
  world.allocateRecord({ entityId: 5, generation: 1, x: 0, z: 0 }, { id: 5, occupantGeneration: 50 });
  world.allocateRecord({ entityId: 6, generation: 1, x: 0, z: 0 }, { id: 6, occupantGeneration: 60 });
  world.allocateRecord({ entityId: 7, generation: 1, x: 0, z: 0 }, { id: 7, occupantGeneration: 70 });
  // id 5 recycled into a new occupant; id 6 re-minted by a transport rebuild (same occupant); id 7 retired.
  const snapshot = { count: 2, rows: new Float64Array([
    5, 2, 51, 40, 0, 0, 0, 0, 0, 0, 0, 0,
    6, 2, 60, 50, 0, 0, 0, 0, 0, 0, 0, 0,
  ]) };
  assert.equal(world.applySharedPoseTable({ ...snapshot, overflow: true }), 1);
  assert.equal(world.doomed[world.getSlotForEntityId(7)], 0, 'a truncated roster cannot hide a missing row');
  world.applySharedPoseTable(snapshot);
  assert.equal(world.doomed[world.getSlotForEntityId(5)], 1, 'recycled id: the old life is hidden');
  assert.equal(world.doomed[world.getSlotForEntityId(6)], 0, 'rebuilt same body stays drawn');
  assert.equal(world.doomed[world.getSlotForEntityId(7)], 1, 'retired body is hidden');
  assert.equal(world.getDiagnostics().tableRetiredHidden, 2);
});
