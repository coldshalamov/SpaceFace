import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAR_ROW_BUDGET,
  FAR_ROW_ORPHAN_GRACE_S,
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

test('a spent orphan is swept only after its grace window; authored site rows are never spent', () => {
  // PQ-033.02 D28 residual: a shelved traffic row kept its durability exemption after the
  // 180 s recent-memory gc reclaimed its RECENT record — the one far-row channel with no
  // plateau. Two classes must NOT be swept with it:
  //   • authored world-site component rows — their data.worldRecordId is a site component id
  //     (persistenceOwner:'asteroidSites'), which captureEntityRecord refuses by design, so
  //     it can never resolve in the records bag; the first sweep ate Ceres site wrecks and
  //     turned check:pq020:ceres-topology red (materializedEntities 1 vs 15).
  //   • freshly shelved rows whose record has not landed yet (capture walks live entities on
  //     its own cadence) — the FAR_ROW_ORPHAN_GRACE_S window absorbs the transient.
  const state = {
    world: { records: { byId: { 'wr:convoy:live': { recordId: 'wr:convoy:live' } } } },
    npcJobs: { byId: { 'job:live': { job: {} } } },
    simTime: 1000,
  };
  const anchored = expendableRow(state, 1);
  anchored.data = { worldRecordId: 'wr:convoy:live' }; // record still in the bag
  const jobRow = expendableRow(state, 2);
  jobRow.jobId = 'job:live'; // job bag entry still exists

  // Authored site component, shelved long ago: never spent, whatever the bags say.
  const siteWreck = expendableRow(state, 3);
  siteWreck.virtualizedAt = 1000 - (FAR_ROW_ORPHAN_GRACE_S * 4);
  siteWreck.data = {
    persistenceOwner: 'asteroidSites',
    worldSiteId: 'world_site_ceres_cinder_sluice',
    worldSiteComponentId: 'world_site_ceres_cinder_sluice/component/wreck_1',
    worldRecordId: 'world_site_ceres_cinder_sluice/component/wreck_1',
  };

  // Unanchored id-carrying rows: swept only once the grace window has fully elapsed.
  const staleOrphan = expendableRow(state, 4);
  staleOrphan.virtualizedAt = 1000 - (FAR_ROW_ORPHAN_GRACE_S + 5);
  staleOrphan.data = { worldRecordId: 'wr:gone:old' }; // record reclaimed long ago
  const youngOrphan = expendableRow(state, 5);
  youngOrphan.virtualizedAt = 1000 - 10; // shelved moments ago; its record may still land
  youngOrphan.data = { worldRecordId: 'wr:gone:new' };
  const plain = expendableRow(state, 6); // no ids at all: the budget, not the sweep, decides

  const evicted = enforceFarRowBudget(state); // rows far under FAR_ROW_BUDGET
  const table = ensureFarActorTable(state);
  assert.equal(table.byId.has(1), true, 'the record-anchored row survives');
  assert.equal(table.byId.has(2), true, 'the job-anchored row survives');
  assert.equal(table.byId.has(3), true,
    'an authored site-component row is durable by construction (persistenceOwner/worldSiteId)');
  assert.equal(table.byId.has(4), false, 'a row whose anchors vanished past the grace window is swept');
  assert.equal(table.byId.has(5), true, 'a row still inside its grace window is not swept');
  assert.equal(table.byId.has(6), true, 'a plain under-budget row is the budget\'s business, not the sweep\'s');
  assert.equal(evicted, 1, 'exactly the one spent orphan was evicted');

  // Once the transient's grace closes with no record ever landing, it is spent too.
  state.simTime = youngOrphan.virtualizedAt + FAR_ROW_ORPHAN_GRACE_S + 1;
  enforceFarRowBudget(state);
  assert.equal(table.byId.has(5), false, 'after the grace window an still-unanchored row is swept');
  assert.equal(table.byId.has(3), true, 'the authored site row still survives the later pass');
});
