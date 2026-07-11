// M2b save / global-anchor stability fixtures.
// Pure unit checks over live migration + coordinate tables and frontier pack origins.
// Touch contract: this file only — no production edits, no golden rewrites.
//
// Authority: design/production/01_BUILD_PROGRAM.md M2b (10 story + 14 frontier regions),
// src/data/sectorCoordinates.js, src/save/migrations.js (v8→v9 global, v9→v10 careerOrigins),
// world.serialize / deserialize frame + residency policy.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECTOR_GLOBAL_ORIGINS,
  SECTOR_ORIGIN_LATTICE_WU,
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import { COORDINATE_SCHEMA } from '../src/core/coordinates.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { createGameState } from '../src/core/gameState.js';
import { world } from '../src/systems/world.js';

import {
  EAST_ORIGINS,
  EAST_SECTOR_IDS,
  FROZEN_ORIGINAL_SECTOR_IDS,
  LATTICE_WU as EAST_LATTICE,
} from '../src/data/frontierRegions/east.js';
import {
  FROZEN_CORE_SECTOR_IDS,
  LATTICE_WU as NORTH_LATTICE,
  NORTH_ORIGINS,
  NORTH_SECTOR_IDS,
} from '../src/data/frontierRegions/north.js';
import {
  FROZEN_STORY_SECTOR_IDS,
  SECTOR_ORIGIN_LATTICE_WU as WEST_LATTICE,
  WEST_REGION_IDS,
  westGlobalOrigins,
} from '../src/data/frontierRegions/west.js';
import {
  SOUTH_ORIGINS,
  SOUTH_SECTOR_IDS,
  LATTICE_WU as SOUTH_LATTICE,
} from '../src/data/frontierRegions/south.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';

/** M2 program: 10 authored story + 14 frontier = 24 stable regions. */
const EXPECTED_STORY_COUNT = 10;
const EXPECTED_FRONTIER_COUNT = 14;

/**
 * Frozen galactic-global origins for the original 10 story sectors.
 * These must never drift — migrations and Continue paths key off this table.
 * globalX = map.x * 4096, globalZ = map.y * 4096 (see sectorCoordinates.js).
 */
const FROZEN_STORY_ORIGINS = Object.freeze({
  sector_helios_prime: Object.freeze({ x: 0, z: 0 }),
  sector_ceres_belt: Object.freeze({ x: -3 * 4096, z: 2 * 4096 }),
  sector_tethys_junction: Object.freeze({ x: 3 * 4096, z: 2 * 4096 }),
  sector_vesta_forge: Object.freeze({ x: 0 * 4096, z: 4 * 4096 }),
  sector_pallas_drift: Object.freeze({ x: -5 * 4096, z: 5 * 4096 }),
  sector_io_reach: Object.freeze({ x: 5 * 4096, z: 5 * 4096 }),
  sector_charon_expanse: Object.freeze({ x: 2 * 4096, z: 7 * 4096 }),
  sector_sker_haven: Object.freeze({ x: -7 * 4096, z: 8 * 4096 }),
  sector_veil_nebula: Object.freeze({ x: 7 * 4096, z: 9 * 4096 }),
  sector_ashfall_reach: Object.freeze({ x: 4 * 4096, z: 11 * 4096 }),
});

const FROZEN_STORY_IDS = Object.freeze(Object.keys(FROZEN_STORY_ORIGINS));

/** Runtime residency / frame fields that must never ride through save → Continue. */
const RUNTIME_WORLD_TRANSIENTS = Object.freeze([
  'frameOrigin',
  'frameOriginSeq',
  'residentSectors',
  'sectorContents',
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Run ordered migration chain from `fromVer` up to CURRENT_VERSION (mutates data). */
function migrateChain(data, fromVer) {
  let v = fromVer | 0;
  let guard = 0;
  while (v < CURRENT_VERSION && guard++ < 64) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) break;
    step.fn(data);
    v = step.to;
  }
  return v;
}

function isLatticeMultiple(n, lattice = SECTOR_ORIGIN_LATTICE_WU) {
  if (!Number.isFinite(n)) return false;
  // Integer division check — JS `%` yields -0 for negative exact multiples.
  return n / lattice === Math.trunc(n / lattice);
}

function hasXZ(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/** Union of all authored M2b frontier pack origins. */
function collectFrontierOrigins() {
  const west = westGlobalOrigins();
  const out = {};
  for (const [id, o] of Object.entries(EAST_ORIGINS)) out[id] = { x: o.x, z: o.z };
  for (const [id, o] of Object.entries(NORTH_ORIGINS)) out[id] = { x: o.x, z: o.z };
  for (const [id, o] of Object.entries(west)) out[id] = { x: o.x, z: o.z };
  for (const [id, o] of Object.entries(SOUTH_ORIGINS)) out[id] = { x: o.x, z: o.z };
  return out;
}

function makeWorldHost(state) {
  return Object.assign(Object.create(world), { state });
}

// ── frozen original 10 ──────────────────────────────────────────────────────────────────────

test('frozen original 10 global origins remain exact', () => {
  assert.equal(SECTOR_ORIGIN_LATTICE_WU, 4096);
  assert.equal(Object.keys(FROZEN_STORY_ORIGINS).length, EXPECTED_STORY_COUNT);
  assert.equal(Object.keys(SECTOR_GLOBAL_ORIGINS).length, 24);

  // Pack freeze lists must agree with the canonical story set.
  assert.deepEqual([...FROZEN_ORIGINAL_SECTOR_IDS], [...FROZEN_STORY_IDS]);
  assert.deepEqual([...FROZEN_CORE_SECTOR_IDS], [...FROZEN_STORY_IDS]);
  assert.deepEqual([...FROZEN_STORY_SECTOR_IDS], [...FROZEN_STORY_IDS]);

  for (const id of FROZEN_STORY_IDS) {
    const live = SECTOR_GLOBAL_ORIGINS[id];
    const expected = FROZEN_STORY_ORIGINS[id];
    assert.ok(live, `missing live origin for ${id}`);
    assert.ok(Object.isFrozen(live), `origin for ${id} should be frozen`);
    assert.deepEqual(live, expected, `origin drift for ${id}`);
    assert.deepEqual(sectorGlobalOrigin(id), expected);
    assert.ok(isLatticeMultiple(live.x), `${id}.x not on 4096 lattice`);
    assert.ok(isLatticeMultiple(live.z), `${id}.z not on 4096 lattice`);
  }
  assert.ok(Object.isFrozen(SECTOR_GLOBAL_ORIGINS));
  assert.deepEqual(sectorGlobalOrigin(HELIOS), { x: 0, z: 0 });
});

// ── 14 frontier origins ─────────────────────────────────────────────────────────────────────

test('all 14 frontier origins are stable 4096-lattice values', () => {
  assert.equal(EAST_LATTICE, 4096);
  assert.equal(NORTH_LATTICE, 4096);
  assert.equal(WEST_LATTICE, 4096);
  assert.equal(SOUTH_LATTICE, 4096);
  assert.equal(SECTOR_ORIGIN_LATTICE_WU, 4096);

  const frontier = collectFrontierOrigins();
  const frontierIds = Object.keys(frontier).sort();
  const packIds = [
    ...EAST_SECTOR_IDS,
    ...NORTH_SECTOR_IDS,
    ...WEST_REGION_IDS,
    ...SOUTH_SECTOR_IDS,
  ].sort();

  assert.deepEqual(frontierIds, packIds, 'frontier origin keys must match pack sector id lists');

  // Validate every authored pack origin first (even if the 14-count is still incomplete).
  const storySet = new Set(FROZEN_STORY_IDS);
  const seenKeys = new Set();
  const storyOriginKeys = new Set(
    FROZEN_STORY_IDS.map((id) => {
      const o = FROZEN_STORY_ORIGINS[id];
      return `${o.x},${o.z}`;
    }),
  );
  const gaps = [];

  for (const id of frontierIds) {
    if (storySet.has(id)) gaps.push(`frontier id collides with story set: ${id}`);
    const o = frontier[id];
    if (!hasXZ(o)) {
      gaps.push(`missing frontier origin ${id}`);
      continue;
    }
    if (!isLatticeMultiple(o.x)) gaps.push(`${id}.x not on 4096 lattice (got ${o.x})`);
    if (!isLatticeMultiple(o.z)) gaps.push(`${id}.z not on 4096 lattice (got ${o.z})`);
    const key = `${o.x},${o.z}`;
    if (seenKeys.has(key)) gaps.push(`duplicate frontier origin ${key} at ${id}`);
    seenKeys.add(key);
    if (storyOriginKeys.has(key)) gaps.push(`${id} origin collides with a story origin`);
  }

  // M2b exit bar: 14 stable frontier regions.
  if (frontierIds.length !== EXPECTED_FRONTIER_COUNT) {
    gaps.push(
      `pack count ${frontierIds.length} !== ${EXPECTED_FRONTIER_COUNT} `
      + `(missing ${EXPECTED_FRONTIER_COUNT - frontierIds.length}): ${frontierIds.join(', ')}`,
    );
  }

  // Canonical integration: save migration resolves origins via SECTOR_GLOBAL_ORIGINS.
  // Until wired, sectorGlobalOrigin(frontierId) fails closed to Helios.
  const unresolved = [];
  for (const id of frontierIds) {
    const packO = frontier[id];
    if (!hasXZ(packO)) continue;
    const live = sectorGlobalOrigin(id);
    if (live.x !== packO.x || live.z !== packO.z) unresolved.push(id);
  }
  if (unresolved.length) {
    gaps.push(`SECTOR_GLOBAL_ORIGINS missing frontier anchors: ${unresolved.join(', ')}`);
  }

  assert.equal(gaps.length, 0, `M2b frontier/global-anchor gaps:\n- ${gaps.join('\n- ')}`);
});

// ── current-version save / Continue ─────────────────────────────────────────────────────────

test('current-version save/Continue never double-adds an origin', () => {
  assert.ok(CURRENT_VERSION >= 10, `expected CURRENT_VERSION >= 10, got ${CURRENT_VERSION}`);

  const ceresO = FROZEN_STORY_ORIGINS[CERES];
  const local = { x: 120.5, z: -80 };
  const global = {
    x: local.x + ceresO.x,
    z: local.z + ceresO.z,
  };

  // Already-global v10 payload (what a current-version Continue reloads).
  const data = {
    world: {
      currentSectorId: CERES,
      coordinateSchema: COORDINATE_SCHEMA,
      frameOrigin: { x: 12288, z: -4096 },
      frameOriginSeq: 5,
    },
    entities: {
      player: { type: 'ship', pos: { x: global.x, z: global.z }, vel: { x: 1, z: 0 } },
      persistent: [{ type: 'ship', pos: { x: global.x + 10, z: global.z - 5 } }],
    },
    nav: {
      waypoint: {
        sectorId: TETHYS,
        pos: sectorLocalToGlobalForSector({ x: -40, z: 55 }, TETHYS),
      },
    },
  };

  const before = deepClone(data);
  const to = migrateChain(data, CURRENT_VERSION);
  assert.equal(to, CURRENT_VERSION);
  assert.deepEqual(data.entities.player.pos, before.entities.player.pos);
  assert.deepEqual(data.entities.persistent[0].pos, before.entities.persistent[0].pos);
  assert.deepEqual(data.nav.waypoint.pos, before.nav.waypoint.pos);

  // v8→v9 step itself must be re-runnable on a stamped global payload without re-offsetting.
  const step89 = MIGRATIONS.find((m) => m.from === 8 && m.to === 9);
  assert.ok(step89, 'missing v8→v9 migration step');
  step89.fn(data);
  assert.deepEqual(data.entities.player.pos, global);
  assert.equal(data.world.coordinateSchema, COORDINATE_SCHEMA);
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(data.world.frameOriginSeq, 0);

  // v9→v10 is independent and must not touch spatial fields.
  const step910 = MIGRATIONS.find((m) => m.from === 9 && m.to === 10);
  assert.ok(step910, 'missing v9→v10 migration step');
  const mid = deepClone(data);
  step910.fn(data);
  assert.deepEqual(data.entities.player.pos, mid.entities.player.pos);
  assert.ok(data.careerOrigins && data.careerOrigins.schemaId === 'spaceface.careerOrigins.v1');
});

test('current-version serialize never persists frameOrigin or residency transients', () => {
  const state = createGameState(77);
  state.world.currentSectorId = CERES;
  state.world.coordinateSchema = COORDINATE_SCHEMA;
  state.world.frameOrigin = { x: 16384, z: -8192 };
  state.world.frameOriginSeq = 9;
  // Runtime residency / content maps (if present) must never leak into the world overlay.
  state.world.residentSectors = {
    [CERES]: { tier: 'FULL', reason: 'test' },
    [HELIOS]: { tier: 'REDUCED', reason: 'test' },
  };
  state.world.sectorContents = {
    [CERES]: { epoch: 3, stationIds: ['station_x'] },
  };
  state.world.scanPings = {
    [CERES]: [{ id: 'p', pos: { x: ceresGlobal(120).x, z: ceresGlobal(120).z }, kind: 'unknown' }],
  };
  state.world.pendingSpawns = {};
  state.world.discovery = { [CERES]: { charted: true } };
  state.jump = { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 };
  state.fuel = { current: 80, max: 100 };

  const host = makeWorldHost(state);
  const serialized = host.serialize();

  assert.equal(serialized.coordinateSchema, COORDINATE_SCHEMA);
  for (const key of RUNTIME_WORLD_TRANSIENTS) {
    assert.equal(key in serialized, false, `world.serialize must omit runtime transient ${key}`);
  }
  // Global scan positions pass through unchanged (already galactic-global).
  assert.deepEqual(serialized.scanPings[CERES][0].pos, {
    x: ceresGlobal(120).x,
    z: ceresGlobal(120).z,
  });

  // Corrupt smuggled frame + residency on load must be wiped / ignored.
  state.world.frameOrigin = { x: 99999, z: -88888 };
  state.world.frameOriginSeq = 42;
  host.deserialize({
    ...serialized,
    frameOrigin: { x: 55555, z: -55555 },
    frameOriginSeq: 12,
    residentSectors: { [TETHYS]: { tier: 'FULL' } },
    sectorContents: { [TETHYS]: { epoch: 1 } },
  });
  assert.equal(state.world.coordinateSchema, COORDINATE_SCHEMA);
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);
  // Deserialize does not rehydrate residency maps from disk (runtime-only).
  // Live maps may still hold pre-load values; the contract is: they are not save-sourced.
  assert.equal('residentSectors' in serialized, false);
  assert.equal('sectorContents' in serialized, false);
});

function ceresGlobal(localX, localZ = 0) {
  const o = FROZEN_STORY_ORIGINS[CERES];
  return { x: localX + o.x, z: localZ + o.z };
}

// ── historical migrations composable / idempotent ───────────────────────────────────────────

test('historical migrations remain composable and idempotent', () => {
  // Minimal v1 envelope that gains every intermediate subtree through the chain.
  const v1 = {
    entities: {
      player: {
        type: 'ship',
        pos: { x: 15, z: -9 },
        vel: { x: 0.5, z: -0.25 },
      },
      persistent: [{
        type: 'ship',
        pos: { x: 30, z: 4 },
      }],
    },
    world: {
      currentSectorId: CERES,
      // Intentionally sector-local (pre-v9); migration must add Ceres origin exactly once.
      scanPings: {
        [CERES]: [{ id: 'ping', pos: { x: 7, z: 8 }, kind: 'unknown' }],
      },
      pendingSpawns: {},
    },
  };

  const data = deepClone(v1);
  const to = migrateChain(data, 1);
  assert.equal(to, CURRENT_VERSION);

  // Every historical step contributed its required subtree.
  assert.ok(data.crafting && data.crafting.queues);
  assert.ok(data.sectorSim && data.sectorSim.sectors);
  assert.ok(data.nav);
  assert.ok(data.lossLedger);
  assert.ok(data.aftermathWrecks);
  assert.ok(data.careerOrigins && data.careerOrigins.origins);
  assert.equal(data.world.coordinateSchema, COORDINATE_SCHEMA);
  assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(data.world.frameOriginSeq, 0);

  const ceresO = FROZEN_STORY_ORIGINS[CERES];
  assert.deepEqual(data.entities.player.pos, {
    x: 15 + ceresO.x,
    z: -9 + ceresO.z,
  });
  assert.deepEqual(data.entities.persistent[0].pos, {
    x: 30 + ceresO.x,
    z: 4 + ceresO.z,
  });
  assert.deepEqual(data.world.scanPings[CERES][0].pos, {
    x: 7 + ceresO.x,
    z: 8 + ceresO.z,
  });

  // Re-running the full chain from CURRENT_VERSION is a pure no-op.
  const afterFirst = deepClone(data);
  assert.equal(migrateChain(data, CURRENT_VERSION), CURRENT_VERSION);
  assert.deepEqual(data, afterFirst);

  // Each discrete step is safe to re-invoke (idempotent / composable).
  for (const step of MIGRATIONS) {
    const snapshot = deepClone(data);
    step.fn(data);
    // Spatial surfaces must not re-offset; frame stays zeroed after v8→v9.
    assert.deepEqual(data.entities.player.pos, snapshot.entities.player.pos, `step ${step.from}→${step.to} mutated player.pos`);
    assert.deepEqual(data.world.scanPings[CERES][0].pos, snapshot.world.scanPings[CERES][0].pos, `step ${step.from}→${step.to} mutated scan ping`);
    assert.equal(data.world.coordinateSchema, COORDINATE_SCHEMA);
    assert.deepEqual(data.world.frameOrigin, { x: 0, z: 0 });
    assert.equal(data.world.frameOriginSeq, 0);
  }

  // Two independent v1→current migrations of the same seed yield identical spatial results.
  const a = deepClone(v1);
  const b = deepClone(v1);
  migrateChain(a, 1);
  migrateChain(b, 1);
  assert.deepEqual(a.entities.player.pos, b.entities.player.pos);
  assert.deepEqual(a.world.scanPings, b.world.scanPings);
  assert.equal(a.world.coordinateSchema, b.world.coordinateSchema);
  assert.deepEqual(a.world.frameOrigin, b.world.frameOrigin);

  // Partial chain composition: v1→8 then v8→current equals v1→current.
  const partial = deepClone(v1);
  let v = 1;
  while (v < 8) {
    const step = MIGRATIONS.find((m) => m.from === v);
    assert.ok(step, `missing migration from ${v}`);
    step.fn(partial);
    v = step.to;
  }
  assert.equal(v, 8);
  // Still sector-local before v9.
  assert.deepEqual(partial.entities.player.pos, v1.entities.player.pos);
  migrateChain(partial, 8);
  assert.deepEqual(partial.entities.player.pos, a.entities.player.pos);
  assert.equal(partial.world.coordinateSchema, COORDINATE_SCHEMA);
});
