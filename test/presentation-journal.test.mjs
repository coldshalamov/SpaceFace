import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresentationJournal,
  createPresentationJournalRecord,
  PRESENTATION_JOURNAL_KINDS,
} from '../src/core/presentationJournal.js';

function entity(id, {
  type = 'ship',
  x = 0,
  y = 0,
  z = 0,
  rot = 0,
  bank = 0,
  pitch = 0,
  alive = true,
  visualRevision = 0,
} = {}) {
  return {
    id,
    type,
    alive,
    pos: { x, y, z },
    prevPos: { x, y, z },
    rot,
    prevRot: rot,
    bank,
    prevBank: bank,
    pitch,
    prevPitch: pitch,
    presentationVisualRevision: visualRevision,
    data: { retainedGraphSentinel: true },
  };
}

function readRecord(journal, sequence) {
  const record = createPresentationJournalRecord();
  assert.equal(journal.copySequence(sequence, record), true);
  return { ...record };
}

test('PresentationJournal publishes ordered scalar spawn, transform, visual, and destroy records', () => {
  const journal = createPresentationJournal(8, { entityCapacity: 4 });
  const ship = entity(2, { x: 10, y: 3, z: -4, rot: 0.25 });

  const spawnSequence = journal.recordSpawn(7, ship);
  ship.pos.x = 12;
  ship.rot = 0.5;
  const transformSequence = journal.recordTransform(7, ship);
  ship.presentationVisualRevision = 9;
  const visualSequence = journal.recordVisual(8, ship);
  const destroySequence = journal.recordDestroy(8, ship);

  assert.deepEqual(
    [spawnSequence, transformSequence, visualSequence, destroySequence],
    [1, 2, 3, 4],
  );

  // Publication owns only copied scalars; later entity/object-graph mutations cannot alter history.
  ship.pos.x = 999;
  ship.type = 'mutated';
  ship.data.retainedGraphSentinel = false;

  assert.deepEqual(readRecord(journal, 1), {
    tick: 7,
    sequence: 1,
    kind: PRESENTATION_JOURNAL_KINDS.SPAWN,
    entityId: 2,
    generation: 1,
    revision: 1,
    entityType: 'ship',
    x: 10,
    y: 3,
    z: -4,
    prevX: 10,
    prevY: 3,
    prevZ: -4,
    rot: 0.25,
    bank: 0,
    pitch: 0,
    prevRot: 0.25,
    prevBank: 0,
    prevPitch: 0,
    visualRevision: 0,
  });
  assert.deepEqual(readRecord(journal, 2), {
    tick: 7,
    sequence: 2,
    kind: PRESENTATION_JOURNAL_KINDS.TRANSFORM,
    entityId: 2,
    generation: 1,
    revision: 2,
    entityType: 'ship',
    x: 12,
    y: 3,
    z: -4,
    prevX: 10,
    prevY: 3,
    prevZ: -4,
    rot: 0.5,
    bank: 0,
    pitch: 0,
    prevRot: 0.25,
    prevBank: 0,
    prevPitch: 0,
    visualRevision: 0,
  });
  assert.equal(readRecord(journal, 3).revision, 3);
  assert.equal(readRecord(journal, 3).visualRevision, 9);
  assert.equal(readRecord(journal, 4).revision, 4);
  assert.equal('entity' in readRecord(journal, 1), false);
  assert.equal('data' in readRecord(journal, 1), false);

  const diagnostics = journal.getDiagnostics();
  assert.equal(diagnostics.publishedCount, 4);
  assert.equal(diagnostics.pending, 4);
  assert.equal(diagnostics.spawnCount, 1);
  assert.equal(diagnostics.transformCount, 1);
  assert.equal(diagnostics.visualCount, 1);
  assert.equal(diagnostics.destroyCount, 1);
  assert.equal(diagnostics.rebuildRequired, false);
});

test('PresentationJournal coalesces same-tick transform and visual writes to their latest scalars', () => {
  const journal = createPresentationJournal(4);
  const ship = entity(1);
  journal.recordSpawn(1, ship);

  ship.pos.x = 5;
  const transformSequence = journal.recordTransform(2, ship);
  ship.pos.x = 8;
  ship.bank = 0.4;
  assert.equal(journal.recordTransform(2, ship), transformSequence);

  ship.presentationVisualRevision = 1;
  const visualSequence = journal.recordVisual(2, ship);
  ship.presentationVisualRevision = 2;
  assert.equal(journal.recordVisual(2, ship), visualSequence);

  const transform = readRecord(journal, transformSequence);
  const visual = readRecord(journal, visualSequence);
  assert.equal(transform.x, 8);
  assert.equal(transform.bank, 0.4);
  assert.equal(transform.revision, 3);
  assert.equal(visual.visualRevision, 2);
  assert.equal(visual.revision, 5);

  const diagnostics = journal.getDiagnostics();
  assert.equal(diagnostics.pending, 3);
  assert.equal(diagnostics.transformCount, 1);
  assert.equal(diagnostics.visualCount, 1);
  assert.equal(diagnostics.transformCoalesceCount, 1);
  assert.equal(diagnostics.visualCoalesceCount, 1);
  assert.equal(diagnostics.overflowCount, 0);
});

test('PresentationJournal coalescing preserves monotonic revisions across interleaved record kinds', () => {
  const journal = createPresentationJournal(6);
  const ship = entity(1);
  journal.recordSpawn(1, ship);

  ship.presentationVisualRevision = 1;
  const visualSequence = journal.recordVisual(2, ship);
  ship.pos.x = 5;
  const transformSequence = journal.recordTransform(2, ship);
  ship.presentationVisualRevision = 2;
  ship.pos.x = 8;
  assert.equal(journal.recordVisual(2, ship), visualSequence);

  const visual = readRecord(journal, visualSequence);
  const transform = readRecord(journal, transformSequence);
  assert.equal(visual.revision, 4);
  assert.equal(transform.revision, 4);
  assert.equal(visual.visualRevision, 2);
  assert.equal(transform.visualRevision, 2);
  assert.equal(visual.x, 8);
  assert.equal(transform.x, 8);
});

test('PresentationJournal advances generation when an entity ID is reused', () => {
  const journal = createPresentationJournal(8);
  const first = entity(4, { type: 'debris', x: 1 });
  journal.recordSpawn(3, first);
  journal.recordDestroy(4, first);

  const replacement = entity(4, { type: 'ship', x: 20 });
  const replacementSpawn = journal.recordSpawn(5, replacement);
  replacement.pos.x = 21;
  const replacementTransform = journal.recordTransform(5, replacement);

  assert.equal(readRecord(journal, 1).generation, 1);
  assert.equal(readRecord(journal, 2).generation, 1);
  assert.equal(readRecord(journal, replacementSpawn).generation, 2);
  assert.equal(readRecord(journal, replacementSpawn).revision, 1);
  assert.equal(readRecord(journal, replacementTransform).generation, 2);
  assert.equal(readRecord(journal, replacementTransform).revision, 2);
});

test('PresentationJournal retains explicit ranges across discard and ring wrap', () => {
  const journal = createPresentationJournal(3);
  const first = entity(1);
  const second = entity(2);
  const third = entity(3);
  journal.recordSpawn(1, first);
  journal.recordSpawn(1, second);
  journal.recordSpawn(1, third);

  assert.equal(journal.hasRange(0, 3), true);
  assert.equal(journal.discardThrough(2), 2);
  assert.equal(journal.copySequence(1, createPresentationJournalRecord()), false);

  first.pos.x = 4;
  second.pos.x = 5;
  journal.recordTransform(2, first);
  journal.recordTransform(2, second);

  assert.equal(journal.getOldestSequence(), 3);
  assert.equal(journal.hasRange(2, 5), true);
  assert.equal(journal.hasRange(1, 5), false);

  const visited = [];
  const scratch = createPresentationJournalRecord();
  assert.equal(journal.visitRange(2, 5, scratch, (record) => {
    visited.push([record.sequence, record.entityId, record.kind]);
  }), 3);
  assert.deepEqual(visited, [
    [3, 3, PRESENTATION_JOURNAL_KINDS.SPAWN],
    [4, 1, PRESENTATION_JOURNAL_KINDS.TRANSFORM],
    [5, 2, PRESENTATION_JOURNAL_KINDS.TRANSFORM],
  ]);
});

test('PresentationJournal overflow is explicit and a full rebuild republishes the alive set', () => {
  const journal = createPresentationJournal(2);
  const first = entity(1, { x: 1 });
  const second = entity(2, { x: 2 });
  const third = entity(3, { x: 3 });
  journal.recordSpawn(10, first);
  journal.recordSpawn(10, second);

  assert.equal(journal.recordSpawn(10, third), 0);
  assert.equal(journal.needsRebuild(), true);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(journal.recordTransform(10, first), 0);
  assert.equal(journal.getDiagnostics().suppressedCount, 1);
  assert.equal(journal.getDiagnostics().overflowCount, 1);
  assert.equal(journal.getDiagnostics().rebuildReason, 'overflow');

  second.alive = false;
  assert.equal(journal.rebuildFrom([first, second, third], 11), true);
  assert.equal(journal.needsRebuild(), false);
  assert.equal(journal.getLastRebuildStart(), 2);
  assert.equal(journal.getLastRebuildEnd(), 4);
  assert.equal(journal.hasRange(2, 4), true);
  assert.deepEqual(
    [readRecord(journal, 3).entityId, readRecord(journal, 4).entityId],
    [1, 3],
  );
  assert.equal(readRecord(journal, 3).generation, 2);
  assert.equal(readRecord(journal, 4).generation, 1);
  assert.equal(journal.getDiagnostics().lastRebuildRecordCount, 2);
});

test('PresentationJournal rebuild failure stays diagnostic and does not throw into simulation', () => {
  const journal = createPresentationJournal(1);
  const first = entity(1);
  const second = entity(2);
  journal.requestRebuild('run-transition');

  assert.equal(journal.rebuildFrom([first, second], 0), false);
  assert.equal(journal.needsRebuild(), true);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(journal.getDiagnostics().rebuildReason, 'rebuild-capacity');
  assert.equal(journal.getDiagnostics().rebuildFailureCount, 1);
});

test('PresentationJournal detects tick rewind and impossible identity ordering as rebuild boundaries', () => {
  const journal = createPresentationJournal(4);
  const ship = entity(1);
  journal.recordSpawn(8, ship);

  assert.equal(journal.recordTransform(7, ship), 0);
  assert.equal(journal.needsRebuild(), true);
  assert.equal(journal.getDiagnostics().rebuildReason, 'tick-rewind');
  assert.equal(journal.getDiagnostics().orderErrorCount, 1);

  assert.equal(journal.rebuildFrom([ship], 2), true);
  assert.equal(journal.recordSpawn(2, ship), 0);
  assert.equal(journal.needsRebuild(), true);
  assert.equal(journal.getDiagnostics().rebuildReason, 'duplicate-spawn');
  assert.equal(journal.getDiagnostics().identityErrorCount, 1);
});

test('PresentationJournal publishes transform records only for changed poses', () => {
  const journal = createPresentationJournal(4);
  const ship = entity(1, { x: 2, z: 3, rot: 0.25 });
  journal.recordSpawn(1, ship);

  assert.equal(journal.recordTransformIfChanged(2, ship), 0);
  ship.pos.x = 2.5;
  const sequence = journal.recordTransformIfChanged(2, ship);
  assert.equal(sequence, 2);
  assert.equal(readRecord(journal, sequence).x, 2.5);
});

test('PresentationJournal terminal close drains retained records and rejects every late operation', () => {
  const journal = createPresentationJournal(4);
  const ship = entity(1, { x: 2 });
  journal.recordSpawn(1, ship);
  ship.pos.x = 3;
  journal.recordTransform(2, ship);

  assert.equal(journal.close(), true);
  assert.equal(journal.close(), false, 'terminal close must be idempotent');
  assert.equal(journal.isClosed(), true);
  assert.equal(journal.getPendingCount(), 0);
  assert.equal(journal.getWriteSequence(), 2, 'terminal close preserves sequence identity');

  const diagnostics = journal.getDiagnostics();
  assert.equal(diagnostics.closed, true);
  assert.equal(diagnostics.closeCount, 1);
  assert.equal(diagnostics.pendingAtClose, 2);
  assert.equal(diagnostics.discardedOnClose, 2);
  assert.equal(diagnostics.pending, 0);
  assert.equal(diagnostics.retainedRecordCapacity, 0);
  assert.equal(diagnostics.entityCapacity, 0);

  const lateOperations = [
    () => journal.recordSpawn(3, entity(2)),
    () => journal.recordDestroy(3, ship),
    () => journal.recordTransform(3, ship),
    () => journal.recordTransformIfChanged(3, ship),
    () => journal.recordVisual(3, ship),
    () => journal.copySequence(1, createPresentationJournalRecord()),
    () => journal.hasRange(0, 0),
    () => journal.visitRange(0, 0, createPresentationJournalRecord(), () => {}),
    () => journal.discardThrough(2),
    () => journal.requestRebuild('late'),
    () => journal.rebuildFrom([ship], 3),
  ];
  for (const operation of lateOperations) {
    assert.throws(operation, /PresentationJournal is closed/);
  }

  const rebuilding = createPresentationJournal(2);
  rebuilding.requestRebuild('run-transition');
  assert.equal(rebuilding.close(), true);
  assert.equal(rebuilding.needsRebuild(), false);
  assert.equal(rebuilding.getDiagnostics().rebuildRequired, false);
});
