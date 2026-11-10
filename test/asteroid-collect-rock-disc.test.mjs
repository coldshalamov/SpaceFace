import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  residencyPrefetchRadius,
  TABLE_REFERENCE_SPEED_WU,
} from '../src/render/tabletopPolicy.js';
import {
  ensureAsteroidField,
  insertAsteroidFieldRock,
  queryAsteroidField,
} from '../src/world/asteroidField.js';
import { insertFarActor } from '../src/world/farActorTable.js';
import { collectMeshPresentationEntities } from '../src/world/presentationSources.js';

// The ledger collect used to walk the far decode-runway disc for BOTH row kinds —
// the vm-drop asteroid-query-callers audit measured ~18x more asteroid cell
// visits than the collect-horizon walk needs. These tests pin the split: rocks
// walk their own collect-horizon disc (never larger than the far disc), far
// actors keep the decode runway, and every verdict-admissible row stays admitted.

function boot(seed = 21) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  state.camera = { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 };
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = { x: 0, z: 0 };
  player.maxSpeed = TABLE_REFERENCE_SPEED_WU;
  return { state, helpers, player };
}

function insertFar(state, id, x, z) {
  return insertFarActor(state, {
    id,
    type: 'ship',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'hauler' },
    flags: {},
  });
}

function ids(list) {
  return new Set(list.map((row) => row && row.id));
}

// Grid.get is the per-cell cost both query shapes pay, whichever walk path runs
// (per-cell walk or occupied-key scan). Counting it measures cell visits the
// same way the vm-drop microbench did.
class CountingMap extends Map {
  constructor(inner) {
    super(inner);
    this.gets = 0;
  }
  get(key) {
    this.gets += 1;
    return super.get(key);
  }
}

test('ledger collect walks a collect-horizon rock disc, not the decode runway', () => {
  const { state } = boot();
  state.simTime = 0;
  const field = ensureAsteroidField(state);
  for (let i = 0; i < 8; i++) {
    insertAsteroidFieldRock(state, {
      id: 700 + i,
      pos: { x: 120 + i * 200, z: 300 - i * 40 },
      radius: 10,
      data: { typeId: 'ast_common_rock' },
    });
  }
  // Dense ring well inside the far decode disc but far outside the rock disc.
  for (let i = 0; i < 240; i++) {
    const angle = (i / 240) * Math.PI * 2;
    const reach = 6000 + (i % 5) * 4000; // 6k..22k — inside the far disc, outside the rock disc
    insertAsteroidFieldRock(state, {
      pos: { x: Math.cos(angle) * reach, z: Math.sin(angle) * reach },
      radius: 8,
      data: { typeId: 'ast_common_rock' },
    });
  }
  insertFar(state, 801, 8000, 0);

  // First collect fills both memos.
  collectMeshPresentationEntities(state, []);

  const countingRocks = new CountingMap(field.grid);
  field.grid = countingRocks;

  // Force the rock memo to miss without moving anything (the far memo key holds —
  // only the rock side refills here).
  field.version += 1;
  collectMeshPresentationEntities(state, []);
  const rockVisits = countingRocks.gets;
  assert.ok(rockVisits > 0, 'rock memo refill must walk the field grid');

  // The old shape: the rock walk rode the same disc the far walk just stamped.
  const disc = state.world.farActors.collectDisc;
  assert.ok(disc && disc.r > 0, 'far walk stamps its collect disc for rim-cross bumps');
  countingRocks.gets = 0;
  queryAsteroidField(state, { x: disc.x, z: disc.z }, disc.r, []);
  const sharedDiscVisits = countingRocks.gets;
  assert.ok(
    rockVisits * 8 <= sharedDiscVisits,
    `rock walk ${rockVisits} cell visits vs shared-disc ${sharedDiscVisits} — expected >=8x cut`,
  );
});

test('the tighter rock disc still admits every verdict-reachable row', () => {
  const { state } = boot();
  state.simTime = 40;
  const prefetch = residencyPrefetchRadius(TABLE_REFERENCE_SPEED_WU, 144, 50, 16 / 9, 60);
  const inside = insertAsteroidFieldRock(state, {
    id: 710,
    pos: { x: prefetch * 0.4, z: 0 },
    radius: 10,
    data: { typeId: 'ast_common_rock' },
  });
  // Closing fast enough to reach the glass inside the 4.5 s collect horizon —
  // its stored pos sits outside the bare radius but inside the margin.
  const closing = insertAsteroidFieldRock(state, {
    id: 711,
    pos: { x: prefetch + 1200, z: 0 },
    vel: { x: -500, z: 0 },
    radius: 10,
    data: { typeId: 'ast_common_rock' },
  });
  // Shelf-row staleness: this rock drifted for 30 s of sim while dormant, so its
  // stored pos trails its ballistic pose by vel*drift. Its eff lands inside the
  // collect radius — the disc must cover the pos↔eff gap or it is missed.
  const drifting = insertAsteroidFieldRock(state, {
    id: 712,
    pos: { x: prefetch + 1300, z: 0 },
    vel: { x: -60, z: 0 },
    radius: 10,
    data: { typeId: 'ast_common_rock' },
  });
  const field = state.world.asteroidField;
  drifting.lastExactT = 10;
  field.minDriftRockLastExactT = Math.min(
    Number.isFinite(field.minDriftRockLastExactT) ? field.minDriftRockLastExactT : Infinity,
    10,
  );
  const farOut = insertAsteroidFieldRock(state, {
    id: 713,
    pos: { x: prefetch + 30000, z: 0 },
    radius: 10,
    data: { typeId: 'ast_common_rock' },
  });

  const seen = ids(collectMeshPresentationEntities(state, []));
  assert.ok(seen.has(inside.id), 'a rock inside the collect radius still cooks');
  assert.ok(seen.has(closing.id), 'a fast inbound rock reaches the collect inside the horizon');
  assert.ok(seen.has(drifting.id), 'a dormant drift row is admitted on its ballistic pose');
  assert.equal(seen.has(farOut.id), false, 'a static rock far outside the disc stays out');
});

test('a parked player still revalidates the rock walk on the sim bucket', () => {
  const { state } = boot();
  state.simTime = 0;
  const field = ensureAsteroidField(state);
  for (let i = 0; i < 6; i++) {
    insertAsteroidFieldRock(state, {
      id: 720 + i,
      pos: { x: 100 + i * 150, z: 200 },
      radius: 10,
      data: { typeId: 'ast_common_rock' },
    });
  }
  insertFar(state, 901, 5000, 0);
  const table = state.world.farActors;
  collectMeshPresentationEntities(state, []);

  const countingRocks = new CountingMap(field.grid);
  field.grid = countingRocks;
  // far.collectDisc is re-stamped on every far memo refill — corrupt it so a
  // quiet refill (the far query takes a linear row scan over small tables and
  // never touches the grid) is still observable.
  table.collectDisc.r = -1;

  // Same position, same versions, 11 s of parked sim time — only the rock key's
  // time bucket turns, so the rock disc revalidates while the far memo holds.
  state.simTime = 11;
  collectMeshPresentationEntities(state, []);
  assert.ok(countingRocks.gets > 0, 'rock walk revalidates dormant drift gaps while parked');
  assert.equal(table.collectDisc.r, -1, 'far memo has no time bucket and stays latched');
});
