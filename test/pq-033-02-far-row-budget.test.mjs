import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAR_ROW_BUDGET,
  FAR_ACTOR_SCHEMA,
  ensureFarActorTable,
  enforceFarRowBudget,
  insertFarActor,
  serializeFarActorTable,
  farActorHoldsWorldRecord,
} from '../src/world/farActorTable.js';

function bareState() {
  return { world: {}, simTime: 1000 };
}

function expendableRow(state, id) {
  // Ordinary shelved ambience: no jobId, no worldRecordId anywhere.
  return insertFarActor(state, { id, type: 'ship', pos: { x: id * 10, z: 0 }, vel: { x: 0, z: 0 } }, 900);
}

test('the far table keeps its newest rows within the budget and evicts oldest-first', () => {
  const state = bareState();
  for (let id = 1; id <= FAR_ROW_BUDGET + 12; id += 1) expendableRow(state, id);
  const table = ensureFarActorTable(state);
  assert.equal(table.rows.length, FAR_ROW_BUDGET + 12, 'precondition: rows over budget before the sweep');

  const evicted = enforceFarRowBudget(state);
  assert.equal(table.rows.length, FAR_ROW_BUDGET, 'the sweep holds the table at the budget');
  assert.ok(evicted >= 12, 'the sweep evicted the overage');
  assert.equal(table.rows[0].id, 13, 'eviction is oldest-first');
  assert.equal(table.rows[table.rows.length - 1].id, FAR_ROW_BUDGET + 12, 'newest rows survive');
  assert.equal(table.byId.size, table.rows.length, 'byId tracks the surviving rows');
  for (const row of table.rows) assert.ok(table.grid.get(row._cell).includes(row), 'grid tracks the surviving rows');
});

test('a row anchoring a world record or a job relink is never evicted, even oldest', () => {
  const state = bareState();
  // Durable rows inserted FIRST (oldest positions).
  const recordRow = expendableRow(state, 1);
  recordRow.data = { worldRecordId: 'wr:convoy:1' };
  const jobRow = expendableRow(state, 2);
  jobRow.jobId = 'job:7';
  const nestedJobRow = expendableRow(state, 3);
  nestedJobRow.data = { jobId: 'job:9' };
  for (let id = 4; id <= FAR_ROW_BUDGET + 30; id += 1) expendableRow(state, id);

  enforceFarRowBudget(state);
  const table = ensureFarActorTable(state);
  assert.ok(table.rows.length <= FAR_ROW_BUDGET, 'the budget still holds');
  assert.equal(farActorHoldsWorldRecord(state, 'wr:convoy:1'), true, 'the record-anchoring row survives');
  assert.ok(table.byId.has(2), 'the job-relinking row survives');
  assert.ok(table.byId.has(3), 'the nested-job row survives');
  assert.equal(table.byId.has(4), false, 'the oldest expendable neighbour was evicted first');
});

test('the serialized far table stays bounded across an endless shelving session', () => {
  const state = bareState();
  // Simulate a long dock-camper session: far more shelves than any live budget would allow.
  for (let id = 1; id <= FAR_ROW_BUDGET * 4; id += 1) {
    const row = expendableRow(state, id);
    if (id % 5 === 0) { row.type = 'wreck'; row.hull = 0; } // far-fight wreckage never expires on its own
    if (id % 7 === 0) { row.data = { worldRecordId: `wr:convoy:${id}` }; } // durable rows keep arriving too
    enforceFarRowBudget(state);
  }
  const data = serializeFarActorTable(state.world.farActors);
  assert.ok(data, 'the table serializes');
  assert.equal(data.schema, FAR_ACTOR_SCHEMA);
  assert.ok(data.rows.length <= FAR_ROW_BUDGET + 40, `serialized rows bounded (got ${data.rows.length})`);
  assert.ok(data.rows.length < FAR_ROW_BUDGET * 4, 'the save does not accumulate every actor ever shelved');
});

test('a row whose record AND job anchors both vanished is swept as an orphan, even under budget', () => {
  // PQ-033.02 D28 residual: a shelved traffic row kept its durability exemption after the
  // 180 s recent-memory gc reclaimed its RECENT record (and the per-sector cap evicted it) —
  // the one far-row channel with no plateau. When the owner bags are present, a row is
  // durable only while it still anchors a live record or a live npcJobs entry.
  const state = {
    world: { records: { byId: { 'wr:convoy:live': { recordId: 'wr:convoy:live' } } } },
    npcJobs: { byId: { 'job:live': { job: {} } } },
    simTime: 1000,
  };
  const anchored = expendableRow(state, 1);
  anchored.data = { worldRecordId: 'wr:convoy:live' }; // record still in the bag
  const jobRow = expendableRow(state, 2);
  jobRow.jobId = 'job:live'; // job bag entry still exists
  const orphanRecord = expendableRow(state, 3);
  orphanRecord.data = { worldRecordId: 'wr:convoy:gone' }; // record reclaimed by the gc
  const orphanJob = expendableRow(state, 4);
  orphanJob.jobId = 'job:gone'; // job completed and left the bag
  const orphanNested = expendableRow(state, 5);
  orphanNested.data = { jobId: 'job:gone' };
  const plain = expendableRow(state, 6); // no ids at all: the budget, not the sweep, decides

  const evicted = enforceFarRowBudget(state); // rows far under FAR_ROW_BUDGET
  const table = ensureFarActorTable(state);
  assert.equal(table.byId.has(1), true, 'the record-anchored row survives');
  assert.equal(table.byId.has(2), true, 'the job-anchored row survives');
  assert.equal(table.byId.has(3), false, 'a row whose record vanished is swept');
  assert.equal(table.byId.has(4), false, 'a row whose job vanished is swept');
  assert.equal(table.byId.has(5), false, 'a nested jobId orphan is swept too');
  assert.equal(table.byId.has(6), true, 'a plain under-budget row is the budget\'s business, not the sweep\'s');
  assert.equal(evicted, 3, 'exactly the three orphans were evicted');
});
