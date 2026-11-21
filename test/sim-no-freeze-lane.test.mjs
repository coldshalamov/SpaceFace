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
    const snap = feed.snapshot;
    const o = 0;
    world.applySharedPose(snap.rows[o], snap.rows[o + 1], snap.rows[o + 2], snap.rows[o + 3],
      snap.rows[o + 4], snap.rows[o + 5], snap.rows[o + 6], snap.rows[o + 7], snap.rows[o + 8]);
    const slot = world.getSlotForEntityId(7);
    assert.equal(world.x[slot], frame * 2, `frame ${frame}: the drawn world moved with no journal record`);
  }
  assert.equal(row.hull, 80, 'the HUD vitals ride the table too');
  assert.equal(lane.getDiagnostics().replyCount, 0, 'no reply was ever applied');

  // A body whose spawn the journal has not delivered is simply not drawn.
  assert.equal(world.applySharedPose(99, 1, 0, 5, 0, 5, 0, 0, 0), false);
  // A recycled id (different generation and occupant) never takes the old body's pose.
  assert.equal(world.applySharedPose(7, 2, 4, 50, 0, 50, 0, 0, 0), false);
});

test('held input is state: pointer motion and key repeats mint no transport post of their own', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { laneDomEvent } = await import('../src/core/simLaneCommands.js');
  const posts = [];
  let receive = null;
  const state = {
    entities: new Map(), entityList: [], settings: { controls: { mouse: {} } }, mode: 'flight',
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

test('a throw inside a pose-table write never leaves the seqlock odd (readers would keep a stale copy forever)', () => {
  const table = createSharedPoseTable();
  const writer = createPoseTableWriter(table);
  const reader = createPoseTableReader();
  reader.bindShared(table);
  const state = { entityList: [{ id: 3, alive: true, pos: { x: 1, y: 0, z: 2 }, vel: { x: 0, z: 0 } }], tick: 1, simTime: 0.1 };
  writer.write(state, { getActiveGeneration: () => 1 }, {});
  assert.equal(reader.read(0).snapshot.count, 1);
  writer.write(state, { getActiveGeneration: () => { throw new Error('boom'); } }, {});
  const header = new Int32Array(table.sab, 0, 16);
  assert.equal(Atomics.load(header, 2) % 2, 0, 'the sequence is even after a throw');
  assert.equal(writer.getStats().writeErrors, 1);
  state.simTime = 0.2;
  writer.write(state, { getActiveGeneration: () => 1 }, {});
  const { snapshot, advanced } = reader.read(1);
  assert.equal(advanced, true, 'the next good write still reaches the reader');
  assert.equal(snapshot.simTime, 0.2);
  assert.equal(snapshot.writeErrors, 1, 'main sees the swallowed throw');
});
