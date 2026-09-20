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
