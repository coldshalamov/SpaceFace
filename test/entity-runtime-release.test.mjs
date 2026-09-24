import assert from 'node:assert/strict';
import test from 'node:test';

import { makeEntity, clearEntityRuntime } from '../src/core/entity.js';
import { insertDressingRow, dropDressingRow } from '../src/world/dressingTable.js';
import { resetWorldPresentationTables } from '../src/world/presentationSources.js';

// Render attachments (entity.mesh/entity.view) live outside the serializable entity graph —
// proto entities through a WeakMap membrane, ledger rows as own fields. Save/load and sector
// teardown replace entity objects while stale module scratches and deferred closures keep the
// old objects reachable; unless teardown clears the attachment, one retained corpse pins its
// entire disposed boundary tree (PQ-033.02 retention evidence).

test('clearEntityRuntime releases proto-entity attachments', () => {
  const e = makeEntity({ id: 7, type: 'ship', pos: { x: 0, z: 0 } });
  const mesh = { isObject3D: true, name: 'boundary' };
  e.mesh = mesh;
  e.view = { root: mesh };
  assert.equal(e.mesh, mesh);
  clearEntityRuntime(e);
  assert.equal(e.mesh, null);
  assert.equal(e.view, null);
  // A second clear is a no-op and must not resurrect the record.
  clearEntityRuntime(e);
  assert.equal(e.mesh, null);
});

test('clearEntityRuntime releases plain-row attachments', () => {
  const row = { id: 9, type: 'fx', alive: true };
  const mesh = { isObject3D: true, name: 'pod' };
  row.mesh = mesh;
  row.view = { root: mesh };
  clearEntityRuntime(row);
  assert.equal(row.mesh, null);
  assert.equal(row.view, null);
});

test('dropDressingRow releases the row attachment', () => {
  const state = { entities: new Map(), world: {}, nextEntityId: 100 };
  const row = insertDressingRow(state, { type: 'fx', pos: { x: 1, z: 2 }, radius: 4 });
  const mesh = { isObject3D: true, name: 'boundary' };
  row.mesh = mesh;
  row.view = { root: mesh };
  assert.equal(dropDressingRow(state, row.id), true);
  assert.equal(row.mesh, null);
  assert.equal(row.view, null);
});

test('resetWorldPresentationTables releases every table row attachment', () => {
  const dressingRow = { id: 1, type: 'fx', alive: true, mesh: { name: 'd' }, view: { root: 1 } };
  const rock = { id: 2, type: 'asteroid', alive: true, mesh: { name: 'r' } };
  const farRow = { id: 3, type: 'ship', alive: true, mesh: { name: 'f' } };
  const state = {
    entities: new Map(),
    world: {
      dressing: { schema: 'dressing-v1', rows: [dressingRow], byId: new Map([[1, dressingRow]]) },
      asteroidField: { schema: 'af-v1', rocks: [rock], byId: new Map([[2, rock]]) },
      farActors: { schema: 'far-v1', rows: [farRow], byId: new Map([[3, farRow]]) },
    },
  };
  resetWorldPresentationTables(state);
  assert.equal(dressingRow.mesh, null);
  assert.equal(dressingRow.view, null);
  assert.equal(rock.mesh, null);
  assert.equal(farRow.mesh, null);
  assert.equal(state.world.dressing, null);
  assert.equal(state.world.asteroidField, null);
});
