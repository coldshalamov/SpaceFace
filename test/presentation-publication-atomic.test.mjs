import assert from 'node:assert/strict';
import test from 'node:test';

import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { createSimLaneJournal } from '../src/core/simLaneJournal.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  createSnapshotFence,
  packPresentationWorldToFence,
  snapshotIndexOf,
} from '../src/render/snapshotFence.js';

const COUNT = 600;
const ATOMIC = Object.freeze({ atomic: true });

function fixture() {
  const rows = Array.from({ length: COUNT }, (_, index) => ({
    id: index + 1, type: 'ship', alive: true,
    pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 },
    rot: 0, radius: 1,
  }));
  const state = {
    mode: 'flight', tick: 2, simTime: 2,
    entities: new Map(rows.map((row) => [row.id, row])), entityList: rows, world: {},
  };
  const world = createPresentationWorld();
  world.rebuildFromEntities(rows);
  for (const row of rows) row.pos.x = 20;
  return { state, world, rows };
}

function withExpiredSlice(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true, value: { now: () => (now += 5) },
  });
  try { return run(); }
  finally { Object.defineProperty(globalThis, 'performance', descriptor); }
}

function workerRebuild(rows) {
  const source = createPresentationJournal(2048);
  source.rebuildFrom(rows, 2);
  const start = source.getLastRebuildStart();
  const end = source.getLastRebuildEnd();
  const count = end - start;
  const scalars = new Float64Array(count * 18);
  let index = 0;
  source.visitRange(start, end, {}, (record) => {
    scalars.set([
      record.tick, record.sequence, record.entityId, record.generation, record.revision,
      record.x, record.y, record.z, record.prevX, record.prevY, record.prevZ,
      record.rot, record.bank, record.pitch, record.prevRot, record.prevBank,
      record.prevPitch, record.visualRevision,
    ], index++ * 18);
  });
  const journal = createSimLaneJournal();
  journal.applyRebuildPack({ start, end, pack: {
    start, end, count, scalars,
    kinds: new Uint8Array(count).fill(1), typeIndex: new Uint16Array(count), typeTable: ['ship'],
  } });
  const frame = {
    journal, journalStart: start, journalEnd: end, journalFullRebuild: true,
    journalRebuildGeneration: journal.getRebuildGeneration(), journalValid: true,
    completedTickCount: 1,
  };
  return { journal, frame };
}

function assertCompleteSnapshot(world, state) {
  const fence = createSnapshotFence();
  packPresentationWorldToFence(world, fence, state.simTime, 1);
  const snapshot = fence.latestSnapshot();
  assert.equal(snapshot.simTime, 2);
  assert.equal(snapshot.count, COUNT, 'a completed live picture retains the whole resident set');
  for (const row of state.entityList) {
    const index = snapshotIndexOf(snapshot, row.id);
    assert.ok(index >= 0, `entity ${row.id} is present`);
    assert.equal(snapshot.columns.position[index * 3], row.pos.x,
      `entity ${row.id} must match the completed state stamped on this picture`);
  }
}

test('atomic worker rebuild finishes clear and apply before publishing its completed clock', () => {
  const { state, world, rows } = fixture();
  const { journal, frame } = workerRebuild(rows);
  const publisher = createPresentationPublisher(world, state, { journal });
  const publication = withExpiredSlice(() => publisher.consume(frame, ATOMIC));
  assert.equal(publication.valid, true);
  assert.equal(publisher.getLastAppliedSequence(), frame.journalEnd,
    'acknowledging this range must not drop unapplied rows');
  assertCompleteSnapshot(world, state);
});

test('atomic main-lane visit applies every transform before returning', () => {
  const { state, world, rows } = fixture();
  const journal = createPresentationJournal(2048);
  world.clear();
  for (const row of rows) {
    row.pos.x = 0;
    journal.recordSpawn(1, row);
  }
  const publisher = createPresentationPublisher(world, state, { journal });
  const frame = { journal, journalStart: 0, journalEnd: journal.getWriteSequence(), journalValid: true };
  publisher.consume(frame, ATOMIC);
  while (publisher.getLastAppliedSequence() < frame.journalEnd) publisher.consume(frame, ATOMIC);
  journal.discardThrough(frame.journalEnd);
  frame.journalStart = frame.journalEnd;
  for (const row of rows) {
    row.pos.x = 20;
    journal.recordTransform(2, row);
  }
  frame.journalEnd = journal.getWriteSequence();
  const publication = withExpiredSlice(() => publisher.consume(frame, ATOMIC));
  assert.equal(publication.fallback, false, 'the normal transform range stays on its journal path');
  assert.equal(publication.applied, COUNT);
  assert.equal(publisher.getLastAppliedSequence(), frame.journalEnd);
  assertCompleteSnapshot(world, state);
});

test('atomic invalid-journal fallback reconstructs the complete current state', () => {
  const { state, world } = fixture();
  const journal = createSimLaneJournal();
  journal.requestRebuild();
  const publisher = createPresentationPublisher(world, state, { journal });
  const frame = {
    journal, journalStart: 0, journalEnd: 0, journalValid: false,
    completedTickCount: 1, lifecycleGeneration: 0,
  };
  const publication = withExpiredSlice(() => publisher.consume(frame, ATOMIC));
  assert.equal(publication.fallback, true);
  assert.equal(publication.refreshed, true, 'a same-clock fallback still requires a fresh pose pack');
  assertCompleteSnapshot(world, state);
});

test('flight atomic mode finishes a clear parked while loading', () => {
  const { state, world, rows } = fixture();
  const { journal, frame } = workerRebuild(rows);
  const publisher = createPresentationPublisher(world, state, { journal });
  state.mode = 'loading';
  withExpiredSlice(() => publisher.consume(frame));
  assert.equal(world.activeCount, COUNT - 256, 'loading keeps its bounded clear slice');
  state.mode = 'flight';
  const publication = withExpiredSlice(() => publisher.consume(frame, ATOMIC));
  assert.ok(publication.applied > 0, 'finishing the parked range requires a fresh pose pack');
  assertCompleteSnapshot(world, state);
});

test('flight atomic fallback replaces an incomplete loading collection with current rows', () => {
  const { state, world } = fixture();
  const journal = createSimLaneJournal();
  journal.requestRebuild();
  const publisher = createPresentationPublisher(world, state, { journal });
  const frame = {
    journal, journalStart: 0, journalEnd: 0, journalValid: false,
    completedTickCount: 1, lifecycleGeneration: 0,
  };
  state.mode = 'loading';
  withExpiredSlice(() => publisher.consume(frame));
  state.mode = 'flight';
  frame.completedTickCount = 0;
  const publication = withExpiredSlice(() => publisher.consume(frame, ATOMIC));
  assert.equal(publication.refreshed, true, 'a repaired loading prefix repacks at the same tick');
  assertCompleteSnapshot(world, state);
});
