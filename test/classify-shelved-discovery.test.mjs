// W125 hitches F1 — shelved-member discovery cell map.
//
// The classify discovery authority used to walk O(entityList) every pass because the
// spatial hash only sees last pass's physics lanes. Partition-0 members (shelved tiers,
// unstamped gap entities) now sit in a coarse cell map keyed on build-time pos: quiet
// passes query cells in O(cells + candidates); the full walk survives as the cold build
// and a bounded audit cadence for silently-moved shelved members.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureActivityClassified,
  setClassifyEarlyQuietLatchForBench,
  setClassifyFrameQuietRetainForBench,
} from '../src/world/activityRuntime.js';

const FAR_WU = 50000;

function makeWorld(rockCount = 24) {
  const rocks = [];
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2;
    const r = 80 + (i % 7) * 30;
    rocks.push({
      id: 200 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      vel: { x: 0, z: 0 },
      radius: 10,
      data: {},
      flags: {},
    });
  }
  const far = {
    id: 999,
    type: 'asteroid',
    alive: true,
    pos: { x: FAR_WU, z: FAR_WU },
    vel: { x: 0, z: 0 },
    radius: 10,
    data: {},
    flags: {},
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    maxSpeed: 120,
    data: { combat: {} },
    flags: {},
  };
  const list = [player, ...rocks, far];
  const entities = new Map(list.map((e) => [e.id, e]));
  return {
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: list,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      physicsStaticVersion: 1,
      projectiles: [],
      closedFormMovers: [],
    },
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
    runtime: { profileId: 'production' },
    rocks,
    far,
    player,
  };
}

function step(state) {
  state.tick++;
  state.simTime += 1 / 60;
  return ensureActivityClassified(state);
}

// shelvedDiscovery is lazily created inside incremental passes — drive until it exists.
function warm(state, max = 12) {
  let rt = step(state);
  for (let i = 0; i < max && !(rt && rt.shelvedDiscovery && rt.shelvedDiscovery.cells); i++) {
    rt = step(state);
  }
  return rt;
}

test('the cold build populates cells with partition-0 members', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  const rt = warm(state);
  const shelved = rt && rt.shelvedDiscovery;
  assert.ok(shelved && shelved.cells instanceof Map, 'shelved discovery map exists');
  let members = 0;
  for (const bucket of shelved.cells.values()) members += bucket.size;
  assert.ok(members > 0, 'partition-0 members land in cells');
  assert.ok(shelved.walks >= 1, 'the cold build paid the authority walk');
});

test('a far shelved member is rediscovered through the cells query when the player returns', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  const rt = warm(state);
  const shelved = rt.shelvedDiscovery;
  assert.ok(shelved && shelved.cells, 'cells populated before the return');
  const far = state.far;
  assert.ok(far.activity && far.activity.simTier, 'far member carries a stamp');
  const walksBefore = shelved.walks;
  // Fly the player to the rock — same cells, different query band. No membership or
  // partition movement means the fresh path must answer without re-walking the list.
  state.player.pos.x = FAR_WU;
  state.player.pos.z = FAR_WU;
  let rtNow = null;
  for (let i = 0; i < 4; i++) {
    rtNow = step(state);
    if (far.activity && (far.activity.simTier === 'S0_EXACT' || far.activity.simTier === 'S1_NEAR')) break;
  }
  void rtNow;
  assert.ok(
    far.activity && (far.activity.simTier === 'S0_EXACT' || far.activity.simTier === 'S1_NEAR'),
    `returned player should re-discover the shelved rock, got ${far.activity && far.activity.simTier}`,
  );
  assert.ok(shelved.queries >= 1, 'the fresh path served at least one cells query');
  assert.equal(shelved.walks, walksBefore, 'no rebuild was needed for the origin move');
});

test('a silently-moved shelved member is recovered inside the audit cadence', () => {
  // Under the quiet latches classify skips selectClassify entirely — the discovery walk
  // (and audit) only runs when a pass executes, same as the walk's own reach before F1.
  // Disarm them so the cadence itself is what gets measured.
  setClassifyEarlyQuietLatchForBench(false);
  setClassifyFrameQuietRetainForBench(false);
  const state = makeWorld();
  ensureActivityClassified(state);
  const rt = warm(state);
  const shelved = rt.shelvedDiscovery;
  assert.ok(shelved && shelved.cells, 'cells populated');
  const far = state.far;
  // Silent pos write — no index version, no partition flip, no restamp hook. This is the
  // exact miss the audit cadence exists to bound.
  far.pos.x = 100;
  far.pos.z = 100;
  let discoveredAt = -1;
  for (let i = 0; i < 9; i++) {
    step(state);
    if (far.activity && (far.activity.simTier === 'S0_EXACT' || far.activity.simTier === 'S1_NEAR')) {
      discoveredAt = i + 1;
      break;
    }
  }
  assert.ok(
    discoveredAt >= 0 && discoveredAt <= 9,
    `audit sweep must recover a silently-moved shelved member within the cadence (got ${discoveredAt})`,
  );
});

test('a tier flip forces a rebuild on the next pass', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  const rt = warm(state);
  const shelved = rt.shelvedDiscovery;
  assert.ok(shelved && shelved.cells, 'cells populated');
  const walksBefore = shelved.walks;
  // Bring the far rock inside the discovery disc so its stamp flips dormant -> near —
  // refreshPhysicsPartition inside the republish bumps the partition epoch and the next
  // pass must rebuild rather than serve the pre-flip map.
  state.player.pos.x = FAR_WU;
  state.player.pos.z = FAR_WU;
  for (let i = 0; i < 6; i++) step(state);
  assert.ok(
    shelved.walks > walksBefore,
    `a partition movement must rebuild the map (walks ${walksBefore} -> ${shelved.walks})`,
  );
});
