// NXI-226 — a reused packed discovery buffer cannot retain or resurrect a removed body.
// Owner: src/world/activityRuntime.js (the classify pass consumes poseTableDiscoveryScan
// through packPoseTable; entity objects remain the only authority — the packed table is a
// read view, never the save authority).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POSE_TABLE_FLAG_ALIVE,
  packPoseTable,
  poseTableDiscoveryScan,
} from '../src/world/poseTable.js';
import { beginDirtyTick, markDirty, DIRTY } from '../src/core/dirtyJournal.js';

function makeState(entities, tick = 10) {
  const list = entities.slice();
  const map = new Map();
  for (const entity of list) if (entity && entity.id != null) map.set(entity.id, entity);
  const state = {
    tick,
    entityList: list,
    entities: map,
    entityIndex: { version: 0, __spacefaceEntityIndexV1: true },
  };
  beginDirtyTick(state, tick);
  return state;
}

function ship(id, x, z, extras = {}) {
  return {
    id, type: 'ship', alive: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 1,
    ...extras,
  };
}

function discoveredIds(state, origin, discoverWu) {
  const table = packPoseTable(state);
  const seen = new Set();
  const out = [];
  const add = (entity) => {
    if (!entity || entity.alive === false || seen.has(entity.id)) return;
    seen.add(entity.id);
    out.push(entity.id);
  };
  poseTableDiscoveryScan(table, state.entities, seen, add, discoverWu, origin);
  return out;
}

test('NXI-226: a removed body cannot reappear from a reused packed slot', () => {
  const removed = ship(2, 10, 0);
  const state = makeState([ship(1, 0, 0), removed, ship(3, 30, 0)]);
  const origin = { x: 0, z: 0 };
  assert.deepEqual(discoveredIds(state, origin, 50).sort((a, b) => a - b), [1, 2, 3]);

  // Sanctioned removal: leave the list and the map, mark membership.
  state.entityList.splice(1, 1);
  state.entities.delete(2);
  markDirty(state, 2, DIRTY.MEMBERSHIP);
  const table = packPoseTable(state);
  // The packed buffer may be reused, but no live row may retain the dead id.
  assert.equal(table.rowById.has(2), false, 'row index must drop the removed id');
  const liveRows = Array.from(table.id.slice(0, table.count));
  assert.equal(liveRows.includes(2), false, 'no packed row may still name the removed body');
  const got = discoveredIds(state, origin, 50);
  assert.deepEqual(got.sort((a, b) => a - b), [1, 3],
    'a removed body cannot reappear as a discovery');
  // Neighboring success: both survivors still resolve through the same reused buffer.
});

test('NXI-226: same-tick removal plus append cannot alias the old slot to the dead body', () => {
  const removed = ship(2, 10, 0);
  const state = makeState([ship(1, 0, 0), removed]);
  const origin = { x: 0, z: 0 };
  assert.deepEqual(discoveredIds(state, origin, 50).sort((a, b) => a - b), [1, 2]);

  state.entityList.splice(1, 1);
  state.entities.delete(2);
  const replacement = ship(9, 12, 0);
  state.entityList.push(replacement);
  state.entities.set(9, replacement);
  state.entityIndex.version++;
  const table = packPoseTable(state);
  assert.equal(table.rowById.has(2), false);
  assert.equal(table.rowById.has(9), true);
  const got = discoveredIds(state, origin, 50);
  assert.deepEqual(got.sort((a, b) => a - b), [1, 9],
    'the reused slot resolves the new body, never the removed one');
});

test('NXI-226: a stale retained row resolves through membership, not its frozen columns', () => {
  // The adversarial corner: a body is deleted from the membership map while nothing marks
  // dirty or drifts the roster — the packed row keeps its stale id/pose/ALIVE flag. The
  // scan must resolve the CURRENT map, so the frozen row still cannot resurrect it.
  const ghost = ship(2, 10, 0);
  const state = makeState([ship(1, 0, 0), ghost]);
  const origin = { x: 0, z: 0 };
  assert.deepEqual(discoveredIds(state, origin, 50).sort((a, b) => a - b), [1, 2]);

  state.entities.delete(2); // silent: no dirty mark, no index bump, list untouched
  const table = packPoseTable(state);
  const staleRow = table.rowById.get(2);
  assert.ok(staleRow != null && (table.flags[staleRow] & POSE_TABLE_FLAG_ALIVE) !== 0,
    'the fixture must really leave a stale live row in the reused buffer');
  const got = discoveredIds(state, origin, 50);
  assert.deepEqual(got, [1],
    'a frozen packed row cannot resurrect a body the membership map no longer holds');
});

test('NXI-226: a neighboring legitimate body beside the removed slot still discovers', () => {
  const removed = ship(2, 10, 0);
  const state = makeState([ship(1, 0, 0), removed, ship(3, 40, 0)]);
  const origin = { x: 0, z: 0 };
  discoveredIds(state, origin, 50); // pack once
  state.entityList.splice(1, 1);
  state.entities.delete(2);
  state.entityIndex.version++;
  const got = discoveredIds(state, origin, 50);
  assert.deepEqual(got.sort((a, b) => a - b), [1, 3],
    'removing one row must not starve the surviving neighbors');
});
