/**
 * #156 radar-asteroid-still-layer — offline microbench (production census helper).
 * Soft-GPU fps NOT a KPI. Picture contract ON (≤1 radar px reuse).
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import {
  censusRadarAsteroidStillLayer,
  createRadarAsteroidStillCache,
  setRadarAsteroidStillLayerForBench,
  getRadarAsteroidStillLayerForBench,
} from '../src/ui/radar.js';

const ITERS = 60000;
const WARM = 1500;
const FIELD_N = 200;
const LIVE_N = 11;
const CELLS = 9;
const DOT_LIMIT = 14;
const SIZE = 220;
const CENTER = 110;
const RADIUS = 105;
const RANGE = 4000;
const radarScale = RADIUS / RANGE;
const rangeSq = RANGE * RANGE;

function makeRocks(n, spread, baseId) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 180 + (i % 19) * spread;
    out.push({
      id: baseId + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      fieldResident: true,
    });
  }
  return out;
}

const live = makeRocks(LIVE_N, 35, 1);
const field = makeRocks(FIELD_N, 70, 1000);
// live rocks are "in entities"; field rocks are fieldResident only
const entities = {
  get(id) {
    for (const r of live) if (r.id === id) return r;
    return null;
  },
};
const asteroidSource = [...live, ...field];
const player = { id: 0 };

function freshBuffers() {
  return {
    fieldCellCounts: new Uint16Array(CELLS * CELLS),
    nearRockSlots: Array.from({ length: DOT_LIMIT }, () => ({ x: 0, y: 0, distanceSq: Infinity })),
    cache: createRadarAsteroidStillCache(),
  };
}

function runCensus(bufs, playerX, playerZ, targetId = null) {
  return censusRadarAsteroidStillLayer({
    asteroidSource,
    player,
    playerX,
    playerZ,
    range: RANGE,
    rangeSq,
    radarScale,
    center: CENTER,
    size: SIZE,
    targetId,
    fieldVersion: 1,
    indexVersion: 1,
    entities,
    fieldCellCounts: bufs.fieldCellCounts,
    nearRockSlots: bufs.nearRockSlots,
    cache: bufs.cache,
  });
}

function bench(label, setup, body) {
  setup();
  for (let i = 0; i < WARM; i++) body();
  if (global.gc) global.gc();
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) body();
  const us = ((performance.now() - t0) * 1000) / ITERS;
  return { label, us: +us.toFixed(4) };
}

function pairParked() {
  const before = freshBuffers();
  const after = freshBuffers();
  let px = 120, pz = 40;
  // Prime after-cache with latch ON
  setRadarAsteroidStillLayerForBench(true);
  runCensus(after, px, pz);

  const b = bench('park_before', () => {
    setRadarAsteroidStillLayerForBench(false);
    before.cache.armed = false;
  }, () => runCensus(before, px, pz));

  const a = bench('park_after', () => {
    setRadarAsteroidStillLayerForBench(true);
  }, () => runCensus(after, px, pz));

  return {
    scenario: 'parked',
    beforeUs: b.us,
    afterUs: a.us,
    speedup: +(b.us / a.us).toFixed(3),
    skippedShare: null,
  };
}

function pairDrift() {
  // 0.5 wu / draw — well under 1 radar px (~38 wu)
  const before = freshBuffers();
  const after = freshBuffers();
  let pxB = 0, pxA = 0;
  setRadarAsteroidStillLayerForBench(true);
  runCensus(after, 0, 0);

  const b = bench('drift_before', () => {
    setRadarAsteroidStillLayerForBench(false);
    before.cache.armed = false;
    pxB = 0;
  }, () => { pxB += 0.5; runCensus(before, pxB, 0); });

  const a = bench('drift_after', () => {
    setRadarAsteroidStillLayerForBench(true);
    pxA = 0;
  }, () => { pxA += 0.5; runCensus(after, pxA, 0); });

  return {
    scenario: 'drift',
    beforeUs: b.us,
    afterUs: a.us,
    speedup: +(b.us / a.us).toFixed(3),
  };
}

function pairFly() {
  // 4 wu / draw ≈ 40 wu/s at 10 Hz — crosses ~1 px every ~10 draws
  const before = freshBuffers();
  const after = freshBuffers();
  let pxB = 0, pxA = 0;
  setRadarAsteroidStillLayerForBench(true);
  runCensus(after, 0, 0);

  const b = bench('fly_before', () => {
    setRadarAsteroidStillLayerForBench(false);
    before.cache.armed = false;
    pxB = 0;
  }, () => { pxB += 4; runCensus(before, pxB, 0); });

  let skips = 0;
  const a = bench('fly_after', () => {
    setRadarAsteroidStillLayerForBench(true);
    pxA = 0;
    skips = 0;
  }, () => {
    pxA += 4;
    const r = runCensus(after, pxA, 0);
    if (r.skipped) skips += 1;
  });

  return {
    scenario: 'fly',
    beforeUs: b.us,
    afterUs: a.us,
    speedup: +(b.us / a.us).toFixed(3),
    skippedShare: +(skips / ITERS).toFixed(3),
  };
}

function dirtyWake() {
  const bufs = freshBuffers();
  setRadarAsteroidStillLayerForBench(true);
  runCensus(bufs, 100, 50);
  const hit1 = runCensus(bufs, 100, 50);
  bufs.cache.fieldVersion = 1;
  // bump field version via args
  const wake = censusRadarAsteroidStillLayer({
    asteroidSource,
    player,
    playerX: 100,
    playerZ: 50,
    range: RANGE,
    rangeSq,
    radarScale,
    center: CENTER,
    size: SIZE,
    targetId: null,
    fieldVersion: 2,
    indexVersion: 1,
    entities,
    fieldCellCounts: bufs.fieldCellCounts,
    nearRockSlots: bufs.nearRockSlots,
    cache: bufs.cache,
  });
  const hit2 = runCensus(bufs, 100, 50);
  // move beyond 1 px
  const move = runCensus(bufs, 100 + 50, 50);
  return {
    firstSkip: hit1.skipped === true,
    versionWakeWalk: wake.skipped === false,
    afterWakeSkip: hit2.skipped === true,
    moveWakeWalk: move.skipped === false,
    dirtyWakeOk: hit1.skipped && !wake.skipped && hit2.skipped && !move.skipped,
  };
}

setRadarAsteroidStillLayerForBench(true);
const out = {
  label: 'radar-asteroid-still-layer',
  rocks: asteroidSource.length,
  pixelWu: +(1 / radarScale).toFixed(2),
  latchDefault: getRadarAsteroidStillLayerForBench(),
  parked: pairParked(),
  drift: pairDrift(),
  fly: pairFly(),
  wake: dirtyWake(),
};
writeFileSync('artifacts/radar-asteroid-still-layer-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
