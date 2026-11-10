import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POSE_TABLE_FLAG_ALIVE,
  packPoseTable,
  poseTableDiscoveryScan,
} from '../src/world/poseTable.js';
import { beginDirtyTick, markDirty, DIRTY } from '../src/core/dirtyJournal.js';
import { entityPresenceRadius } from '../src/world/activityClassification.js';

// Reference walk: the entityList loop selectClassifyEntities ran before the
// poseTable seam. Both sides share the seen/add contract from that function.
function discoveryWalkList(state, origin, discoverWu, alreadySeen = []) {
  const finite = (n) => (Number.isFinite(n) ? n : 0);
  const list = state.entityList || [];
  const discover = Math.max(0, finite(discoverWu));
  const seen = new Set(alreadySeen);
  const out = [];
  const add = (entity) => {
    if (!entity || entity.alive === false || seen.has(entity.id)) return;
    seen.add(entity.id);
    out.push(entity);
  };
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || !entity.pos || seen.has(entity.id)) continue;
    const limit = discover + entityPresenceRadius(entity);
    const dx = finite(entity.pos.x) - origin.x;
    const dz = finite(entity.pos.z) - origin.z;
    if (dx * dx + dz * dz <= limit * limit) add(entity);
  }
  return out;
}

// Column path: pack at the classify boundary, then run the exported scan —
// the same call site selectClassifyEntities uses when the table is current.
function discoveryWalkTable(state, origin, discoverWu, alreadySeen = []) {
  const list = state.entityList || [];
  const discover = Math.max(0, Number.isFinite(discoverWu) ? discoverWu : 0);
  const seen = new Set(alreadySeen);
  const out = [];
  const add = (entity) => {
    if (!entity || entity.alive === false || seen.has(entity.id)) return;
    seen.add(entity.id);
    out.push(entity);
  };
  const table = packPoseTable(state);
  const byId = state.entities;
  if (!(table && table.source === list && table._idlessCount === 0
      && byId && typeof byId.get === 'function')) {
    return null; // caller would fall back to the list walk
  }
  poseTableDiscoveryScan(table, byId, seen, add, discover, origin);
  return out;
}

function idsOf(list) {
  return list.map((e) => e.id);
}

function makeState(entities, extras = {}) {
  const list = entities.slice();
  const map = new Map();
  for (const entity of list) if (entity && entity.id != null) map.set(entity.id, entity);
  const state = {
    tick: extras.tick == null ? 10 : extras.tick,
    entityList: list,
    entities: map,
    entityIndex: extras.entityIndex === undefined
      ? { version: 0, __spacefaceEntityIndexV1: true }
      : extras.entityIndex,
    ...extras,
  };
  beginDirtyTick(state, state.tick);
  return state;
}

function ship(id, x, z, extras = {}) {
  return {
    id, type: 'ship', alive: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 1,
    ...extras,
  };
}

test('pose table discovery matches the entityList walk', () => {
  const entities = [
    ship(1, 0, 0),                       // player-side, inside disc
    ship(2, 30, 0),
    ship(3, 500, 500),                   // far outside the disc
    ship(4, 10, 10, { alive: false }),   // dead: skipped by both
    { id: 5, type: 'fx', alive: true, radius: 2 },                  // no pos
    ship(6, -20, 5, { data: { visualRadius: 40 } }),                // presenceRadius > radius
    ship(7, 0, NaN, { radius: 2 }),      // non-finite pos: normalizes to 0 both ways
    { id: 8, type: 'station', alive: true, pos: { x: 200, z: 0 }, radius: 10,
      data: { dockRadius: 250 } },       // station: dockRadius wins presence
  ];
  const state = makeState(entities);
  const origin = { x: 0, z: 0 };
  const expect = idsOf(discoveryWalkList(state, origin, 100));
  const got = discoveryWalkTable(state, origin, 100);
  assert.notEqual(got, null);
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect.sort((a, b) => a - b), [1, 2, 6, 7, 8]);
});

test('pose table honours seen ids (recycled id dedupe)', () => {
  const state = makeState([ship(1, 0, 0), ship(2, 10, 0)]);
  const origin = { x: 0, z: 0 };
  const expect = idsOf(discoveryWalkList(state, origin, 50, [2]));
  const got = discoveryWalkTable(state, origin, 50, [2]);
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect, [1]);
});

test('pose-dirty refresh updates x/z and re-derives presenceRadius', () => {
  const mover = ship(2, 900, 0, { data: { visualRadius: 5 } });
  const state = makeState([ship(1, 0, 0), mover]);
  const origin = { x: 0, z: 0 };
  assert.deepEqual(idsOf(discoveryWalkTable(state, origin, 50)), [1]);

  mover.pos.x = 20;
  mover.data.visualRadius = 500; // silent data.* mutation, no roster change
  markDirty(state, 2, DIRTY.POSE);
  const got = discoveryWalkTable(state, origin, 50);
  const expect = idsOf(discoveryWalkList(state, origin, 50));
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect.sort((a, b) => a - b), [1, 2]);
});

test('mid-tick death after pack is tombstoned like the live walk', () => {
  const victim = ship(2, 10, 0);
  const state = makeState([ship(1, 0, 0), victim]);
  const origin = { x: 0, z: 0 };
  packPoseTable(state); // pack first, kill after
  victim.alive = false;
  markDirty(state, 2, DIRTY.POSE);
  const got = discoveryWalkTable(state, origin, 50);
  const expect = idsOf(discoveryWalkList(state, origin, 50));
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect, [1]);
  assert.equal(state.poseTable.flags[1] & POSE_TABLE_FLAG_ALIVE, 0);
});

test('roster drift rebuilds: append, index version bump, list swap', () => {
  const state = makeState([ship(1, 0, 0)]);
  const origin = { x: 0, z: 0 };
  assert.deepEqual(idsOf(discoveryWalkTable(state, origin, 50)), [1]);

  // Sanctioned append: list.push + index.version++
  const newbie = ship(2, 5, 0);
  state.entityList.push(newbie);
  state.entities.set(2, newbie);
  state.entityIndex.version++;
  let got = discoveryWalkTable(state, origin, 50);
  let expect = idsOf(discoveryWalkList(state, origin, 50));
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect.sort((a, b) => a - b), [1, 2]);

  // Raw list append that never reaches the index
  const ghost = ship(3, 8, 0);
  state.entityList.push(ghost);
  state.entities.set(3, ghost);
  got = discoveryWalkTable(state, origin, 50);
  expect = idsOf(discoveryWalkList(state, origin, 50));
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect.sort((a, b) => a - b), [1, 2, 3]);

  // Whole entityList array swapped (load/respawn)
  const fresh = [ship(1, 0, 0), ship(9, 3, 0)];
  state.entityList = fresh;
  state.entities = new Map(fresh.map((e) => [e.id, e]));
  got = discoveryWalkTable(state, origin, 50);
  expect = idsOf(discoveryWalkList(state, origin, 50));
  assert.deepEqual(idsOf(got), expect);
  assert.deepEqual(expect.sort((a, b) => a - b), [1, 9]);
});

test('id-less entities force the caller fallback', () => {
  const entities = [ship(1, 0, 0), { type: 'debris', alive: true, pos: { x: 1, z: 1 }, radius: 2 }];
  const state = makeState(entities);
  const table = packPoseTable(state);
  assert.equal(table._idlessCount, 1);
  assert.equal(table.count, 1);
  const got = discoveryWalkTable(state, { x: 0, z: 0 }, 50);
  assert.equal(got, null); // selectClassifyEntities falls back to the list walk
  assert.deepEqual(idsOf(discoveryWalkList(state, { x: 0, z: 0 }, 50)), [1, undefined]);
});

test('quiet ticks reuse the pack; pose marks refresh in place', () => {
  const mover = ship(2, 10, 0);
  const state = makeState([ship(1, 0, 0), mover]);
  const first = packPoseTable(state);
  assert.equal(first.count, 2);
  first.x[0] = 4242; // sentinel: a rebuild would overwrite this
  const quiet = packPoseTable(state);
  assert.equal(quiet.x[0], 4242);
  state.tick = 11;
  beginDirtyTick(state, 11);
  const next = packPoseTable(state);
  assert.equal(next.x[0], 4242);
  markDirty(state, 2, DIRTY.POSE);
  mover.pos.x = 33;
  const refreshed = packPoseTable(state);
  assert.equal(refreshed.x[1], 33);
  assert.equal(refreshed.x[0], 4242); // only the dirty row was rewritten
});

test('membership mark forces a full rebuild', () => {
  const state = makeState([ship(1, 0, 0)]);
  const first = packPoseTable(state);
  first.x[0] = 777;
  markDirty(state, 1, DIRTY.MEMBERSHIP);
  const rebuilt = packPoseTable(state);
  assert.notEqual(rebuilt.x[0], 777);
  assert.equal(rebuilt.x[0], 0);
});
