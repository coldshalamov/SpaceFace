import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COORDINATE_SCHEMA,
  FRAME_ORIGIN_QUANTUM_WU,
  FRAME_REBASE_THRESHOLD_WU,
  applyFrameOrigin,
  deriveFrameOrigin,
  frameToGlobal,
  globalToFrame,
  sectorLocalToFrame,
  sectorLocalToGlobal,
  shouldRebaseFrameOrigin,
  snapFrameOrigin,
} from '../src/core/coordinates.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';

test('coordinate constants and state defaults are stable', () => {
  assert.equal(COORDINATE_SCHEMA, 'global_v1');
  assert.equal(FRAME_REBASE_THRESHOLD_WU, 8192);
  assert.equal(FRAME_ORIGIN_QUANTUM_WU, 4096);
  const state = createGameState(7);
  assert.equal(state.world.coordinateSchema, COORDINATE_SCHEMA);
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 0 });
  assert.equal(state.world.frameOriginSeq, 0);
  assert.ok(state.world.activeSector && state.world.entryPoint && state.world.discovery);
});

test('global/frame transforms round-trip positive, negative, and large coordinates', () => {
  const samples = [
    [{ x: 12.5, z: -40 }, { x: 4096, z: -8192 }],
    [{ x: -1e6, z: 2.5e5 }, { x: -8192, z: 4096 }],
    [{ x: 9e12, z: -8e12 }, { x: 1e9, z: -1e9 }],
  ];
  const local = { x: 0, z: 0 };
  const back = { x: 0, z: 0 };
  for (const [global, origin] of samples) {
    assert.equal(globalToFrame(global, origin, local), local);
    assert.equal(frameToGlobal(local, origin, back), back);
    assert.deepEqual(back, global);
  }
});

test('sector-local positions compose through global into frame coordinates', () => {
  const local = { x: 100, z: -50 };
  const sectorOrigin = { x: 1_000_000, z: 2_000_000 };
  const frameOrigin = { x: 999_000, z: 2_001_000 };
  const global = sectorLocalToGlobal(local, sectorOrigin);
  assert.deepEqual(global, { x: 1_000_100, z: 1_999_950 });
  assert.deepEqual(sectorLocalToFrame(local, sectorOrigin, frameOrigin), globalToFrame(global, frameOrigin));
});

test('sector coordinate composition round-trips through explicit sector origins', () => {
  const local = { x: -333.25, z: 908.5 };
  const global = sectorLocalToGlobalForSector(local, 'sector_ceres_belt');
  assert.deepEqual(globalToSectorLocalForSector(global, 'sector_ceres_belt'), local);
});

test('rebase threshold is inclusive and relative to the current origin', () => {
  const origin = { x: 100_000, z: -50_000 };
  assert.equal(shouldRebaseFrameOrigin({ x: 108_191, z: -50_000 }, origin), false);
  assert.equal(shouldRebaseFrameOrigin({ x: 108_192, z: -50_000 }, origin), true);
  assert.equal(shouldRebaseFrameOrigin({ x: 100_000, z: -58_192 }, origin), true);
});

test('quantum snapping is sign-symmetric with half ties away from zero', () => {
  assert.deepEqual(snapFrameOrigin({ x: 2048, z: -2048 }), { x: 4096, z: -4096 });
  assert.deepEqual(snapFrameOrigin({ x: 6144, z: -6144 }), { x: 8192, z: -8192 });
  assert.deepEqual(snapFrameOrigin({ x: -0, z: 0 }), { x: 0, z: 0 });
  assert.deepEqual(deriveFrameOrigin({ x: 8191, z: 0 }, { x: 0, z: 0 }), { x: 0, z: 0 });
  assert.deepEqual(deriveFrameOrigin({ x: 9000, z: -500 }, { x: 0, z: 0 }), { x: 8192, z: 0 });
});

test('applying an origin is idempotent and never mutates simulation state', () => {
  const state = createGameState(12345);
  const entity = { id: 1, pos: { x: 555, z: -777 }, vel: { x: 1, z: 2 } };
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  state.simTime = 12.5;
  state.tick = 42;
  state.rng = mulberry32(12345);
  const expectedRng = mulberry32(12345)();
  const pos = { ...entity.pos };

  assert.equal(applyFrameOrigin(state, { x: 12288, z: -4096 }), true);
  assert.equal(state.world.frameOriginSeq, 1);
  assert.deepEqual(entity.pos, pos);
  assert.equal(state.simTime, 12.5);
  assert.equal(state.tick, 42);
  assert.equal(state.rng(), expectedRng);
  assert.equal(applyFrameOrigin(state, { x: 12288, z: -4096 }), false);
  assert.equal(state.world.frameOriginSeq, 1);
});

test('non-finite coordinate inputs normalize without contaminating state', () => {
  assert.deepEqual(globalToFrame({ x: NaN, z: Infinity }, { x: -Infinity, z: 5 }), { x: 0, z: -5 });
  const state = createGameState(1);
  assert.equal(applyFrameOrigin(state, { x: NaN, z: 4096 }), true);
  assert.deepEqual(state.world.frameOrigin, { x: 0, z: 4096 });
});
