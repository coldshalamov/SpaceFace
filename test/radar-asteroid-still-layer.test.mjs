import test from 'node:test';
import assert from 'node:assert/strict';
import {
  censusRadarAsteroidStillLayer,
  createRadarAsteroidStillCache,
  setRadarAsteroidStillLayerForBench,
  getRadarAsteroidStillLayerForBench,
  setRadarDrawTrailBatchForBench,
  getRadarDrawTrailBatchForBench,
} from '../src/ui/radar.js';

const SIZE = 220;
const CENTER = 110;
const RADIUS = 105;
const RANGE = 4000;
const radarScale = RADIUS / RANGE;
const rangeSq = RANGE * RANGE;
const CELLS = 9;
const DOT_LIMIT = 14;

function makeSource(n = 40) {
  const live = [];
  const field = [];
  for (let i = 0; i < 8; i++) {
    live.push({
      id: i + 1,
      type: 'asteroid',
      alive: true,
      pos: { x: 80 + i * 30, z: i * 20 },
      fieldResident: false,
    });
  }
  for (let i = 0; i < n; i++) {
    field.push({
      id: 1000 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(i) * (200 + i * 10), z: Math.sin(i) * (200 + i * 10) },
      fieldResident: true,
    });
  }
  const entities = {
    get(id) {
      for (const r of live) if (r.id === id) return r;
      return null;
    },
  };
  return { asteroidSource: [...live, ...field], entities, player: { id: 0 } };
}

function buffers() {
  return {
    fieldCellCounts: new Uint16Array(CELLS * CELLS),
    nearRockSlots: Array.from({ length: DOT_LIMIT }, () => ({ x: 0, y: 0, distanceSq: Infinity })),
    cache: createRadarAsteroidStillCache(),
  };
}

function run(bufs, opts) {
  const { asteroidSource, entities, player } = opts.source;
  return censusRadarAsteroidStillLayer({
    asteroidSource,
    player,
    playerX: opts.x,
    playerZ: opts.z,
    range: RANGE,
    rangeSq,
    radarScale,
    center: CENTER,
    size: SIZE,
    targetId: opts.targetId ?? null,
    fieldVersion: opts.fieldVersion ?? 1,
    indexVersion: opts.indexVersion ?? 1,
    entities,
    fieldCellCounts: bufs.fieldCellCounts,
    nearRockSlots: bufs.nearRockSlots,
    cache: bufs.cache,
  });
}

test('radar asteroid still-layer defaults ON', () => {
  assert.equal(getRadarAsteroidStillLayerForBench(), true);
  assert.equal(getRadarDrawTrailBatchForBench(), true);
});

test('first census walks; still pose then skips', () => {
  setRadarAsteroidStillLayerForBench(true);
  const source = makeSource();
  const bufs = buffers();
  const first = run(bufs, { source, x: 100, z: 40 });
  assert.equal(first.skipped, false);
  assert.ok(first.nearRockCount >= 0);
  const second = run(bufs, { source, x: 100, z: 40 });
  assert.equal(second.skipped, true);
  assert.equal(second.nearRockCount, first.nearRockCount);
  assert.equal(second.fieldOccupied, first.fieldOccupied);
});

test('latch OFF always walks', () => {
  setRadarAsteroidStillLayerForBench(false);
  const source = makeSource();
  const bufs = buffers();
  run(bufs, { source, x: 100, z: 40 });
  const second = run(bufs, { source, x: 100, z: 40 });
  assert.equal(second.skipped, false);
  setRadarAsteroidStillLayerForBench(true);
});

test('field.version bump wakes the still-layer', () => {
  setRadarAsteroidStillLayerForBench(true);
  const source = makeSource();
  const bufs = buffers();
  run(bufs, { source, x: 100, z: 40, fieldVersion: 1 });
  assert.equal(run(bufs, { source, x: 100, z: 40, fieldVersion: 1 }).skipped, true);
  const woke = run(bufs, { source, x: 100, z: 40, fieldVersion: 2 });
  assert.equal(woke.skipped, false);
  assert.equal(run(bufs, { source, x: 100, z: 40, fieldVersion: 2 }).skipped, true);
});

test('player move beyond one radar pixel wakes', () => {
  setRadarAsteroidStillLayerForBench(true);
  const source = makeSource();
  const bufs = buffers();
  run(bufs, { source, x: 100, z: 40 });
  assert.equal(run(bufs, { source, x: 100, z: 40 }).skipped, true);
  // 1 radar px ≈ 38 wu
  const woke = run(bufs, { source, x: 100 + 50, z: 40 });
  assert.equal(woke.skipped, false);
});

test('sub-pixel drift stays latched', () => {
  setRadarAsteroidStillLayerForBench(true);
  const source = makeSource();
  const bufs = buffers();
  run(bufs, { source, x: 0, z: 0 });
  for (let i = 1; i <= 4; i++) {
    const r = run(bufs, { source, x: i * 0.5, z: 0 });
    assert.equal(r.skipped, true, `drift step ${i}`);
  }
});

test('rescan budget eventually forces a walk', () => {
  setRadarAsteroidStillLayerForBench(true);
  const source = makeSource();
  const bufs = buffers();
  run(bufs, { source, x: 50, z: 50 });
  let walks = 0;
  let skips = 0;
  for (let i = 0; i < 12; i++) {
    const r = run(bufs, { source, x: 50, z: 50 });
    if (r.skipped) skips += 1;
    else walks += 1;
  }
  assert.ok(skips >= 8, `skips=${skips}`);
  assert.ok(walks >= 1, `walks=${walks}`);
});

test('bench toggles restore', () => {
  setRadarAsteroidStillLayerForBench(false);
  setRadarDrawTrailBatchForBench(false);
  assert.equal(getRadarAsteroidStillLayerForBench(), false);
  assert.equal(getRadarDrawTrailBatchForBench(), false);
  setRadarAsteroidStillLayerForBench(true);
  setRadarDrawTrailBatchForBench(true);
  assert.equal(getRadarAsteroidStillLayerForBench(), true);
  assert.equal(getRadarDrawTrailBatchForBench(), true);
});
