import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  createPresentationJournal,
  createPresentationJournalRecord,
} from '../src/core/presentationJournal.js';
import { createSimHost, createSabJournalArena } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';

function recordAt(journal, sequence) {
  const record = createPresentationJournalRecord();
  assert.equal(journal.copySequence(sequence, record), true);
  return record;
}

test('transferred journal poses stay immutable until ACK while unsent poses still coalesce', () => {
  const journal = createPresentationJournal(16);
  const player = { id: 1, type: 'ship', pos: { x: 0, y: 0, z: 0 }, rot: 0 };
  journal.recordSpawn(0, player);
  journal.discardThrough(1);
  player.pos.x = 1;
  const firstTransform = journal.recordTransform(1, player);
  const firstVisual = journal.recordVisual(1, player);
  const transferredTransform = recordAt(journal, firstTransform);
  const transferredVisual = recordAt(journal, firstVisual);
  journal.markTransferredThrough(firstVisual);

  // The next directive may complete before presentation ACKs the previous one.
  player.pos.x = 2;
  const nextTransform = journal.recordTransform(2, player);
  player.presentationVisualRevision = 1;
  const nextVisual = journal.recordVisual(2, player);
  assert.ok(nextTransform > firstVisual, 'a later pose must enter the next transfer range');
  assert.ok(nextVisual > nextTransform);
  assert.deepEqual(recordAt(journal, firstTransform), transferredTransform);
  assert.deepEqual(recordAt(journal, firstVisual), transferredVisual);

  player.pos.x = 3;
  assert.equal(journal.recordTransform(3, player), nextTransform,
    'multiple ticks within one unsent batch retain bounded coalescing');
  assert.equal(recordAt(journal, nextTransform).x, 3);
  assert.equal(recordAt(journal, nextVisual).x, 3);
  journal.markTransferredThrough(nextVisual);
  journal.markTransferredThrough(firstVisual); // A late watermark cannot unfreeze old records.
  player.pos.x = 4;
  assert.ok(journal.recordTransform(4, player) > nextVisual);
  assert.equal(recordAt(journal, nextTransform).x, 3);
  assert.equal(journal.discardThrough(firstVisual), 2,
    'transfer freezes records; only presentation ACK frees them');
  assert.equal(journal.copySequence(firstTransform, createPresentationJournalRecord()), false);
  assert.equal(journal.hasRange(firstVisual, journal.getWriteSequence()), true);
  assert.equal(journal.needsRebuild(), false);
});

test('transfer watermark preserves rebuild generations and rejects invalid or terminal advances', () => {
  const journal = createPresentationJournal(8);
  const player = { id: 1, type: 'ship', pos: { x: 0, z: 0 }, rot: 0 };
  journal.recordSpawn(0, player);
  assert.equal(journal.markTransferredThrough(2), false, 'unsent future sequences cannot be frozen');
  assert.equal(journal.markTransferredThrough(1), true);
  const generation = recordAt(journal, 1).generation;
  journal.requestRebuild('test');
  assert.equal(journal.rebuildFrom([player], 1), true);
  const rebuiltSpawn = journal.getLastRebuildEnd();
  assert.ok(recordAt(journal, rebuiltSpawn).generation > generation);
  assert.equal(journal.markTransferredThrough(rebuiltSpawn), true);
  player.pos.x = 1;
  assert.ok(journal.recordTransform(2, player) > rebuiltSpawn);
  assert.equal(journal.needsRebuild(), false);
  journal.close();
  assert.throws(() => journal.markTransferredThrough(rebuiltSpawn), /PresentationJournal is closed/);
});

function packedPlayerPose(reply, playerId) {
  const { pack } = reply;
  let pose = null;
  for (let i = 0; i < pack.count; i++) {
    const offset = i * 18;
    if (pack.scalars[offset + 2] !== playerId) continue;
    pose = {
      tick: pack.scalars[offset],
      sequence: pack.scalars[offset + 1],
      x: pack.scalars[offset + 5],
      z: pack.scalars[offset + 7],
      prevX: pack.scalars[offset + 8],
      prevZ: pack.scalars[offset + 10],
    };
  }
  return pose;
}

async function assertWorkerTransfersCompletedPoses(shared) {
  const worker = createSimHost();
  try {
    const scenarioContract = JSON.parse(readFileSync(
      new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
    ));
    const sabArena = shared ? createSabJournalArena({ slotCount: 8, recordCap: 4096 }) : undefined;
    await worker.init({ profile: 'production', seed: 4242, sabArena,
      viewport: { w: 1280, h: 720 }, scenarioContract });
    let directive = 0;
    const send = async (steps, ackJournalEnd, ...commands) => {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      return worker.tick({ tick: ++directive, steps, ackJournalEnd,
        commands: structuredClone(ring.drain()) });
    };
    const boot = await send(0, 0,
      { kind: 'rpc', id: 'boot', op: 'newGameBoot', args: { opts: { seed: 4242 } } },
      { kind: 'mode', mode: 'flight' });
    const state = worker.host.state;
    const player = state.entities.get(state.playerId);
    assert.ok(player);
    const bootAck = boot.journalEnd;
    let prior = { x: player.pos.x, z: player.pos.z };
    let previousEnd = boot.journalEnd;
    for (let tick = 0; tick < 4; tick++) {
      const reply = await send(1, bootAck, ...(tick === 0 ? [
        { kind: 'domEvent', d: { type: 'keydown', code: 'KeyW', pressed: true, blocked: false } },
      ] : []));
      assert.ok(Math.hypot(player.pos.x - prior.x, player.pos.z - prior.z) > 0,
        'the native production player actually moves this completed tick');
      const pose = packedPlayerPose(reply, player.id);
      assert.ok(pose, `completed tick ${reply.completedTick.tick} must carry its current player pose`);
      assert.equal(reply.pack.sab, shared);
      assert.equal(pose.tick, reply.completedTick.tick);
      assert.equal(reply.completedTick.simTime, state.simTime);
      assert.equal(pose.x, player.pos.x);
      assert.equal(pose.z, player.pos.z);
      assert.equal(pose.prevX, player.prevPos.x);
      assert.equal(pose.prevZ, player.prevPos.z);
      assert.ok(pose.sequence > previousEnd);
      assert.equal(reply.journalStart, previousEnd);
      assert.equal(reply.journalFullRebuild, false, 'ordinary motion must not need a recovery rebuild');
      prior = { x: player.pos.x, z: player.pos.z };
      previousEnd = reply.journalEnd;
    }
    assert.ok(worker.host.journal.getOldestSequence() > bootAck,
      'the acknowledged boot has been retired');
    assert.ok(worker.host.journal.getPendingCount() > 0,
      'unacknowledged tick records remain retained');
    await send(0, previousEnd);
    assert.equal(worker.host.journal.getPendingCount(), 0,
      'a later presentation ACK releases all transferred tick records');
  } finally {
    worker.shutdown();
  }
}

for (const shared of [false, true]) {
  test(`production worker transfers every completed player pose with presentation ACK delayed (${shared ? 'SAB' : 'clone'})`,
    () => assertWorkerTransfersCompletedPoses(shared));
}
