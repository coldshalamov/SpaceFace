#!/usr/bin/env node
/**
 * Offline microbench: queryAsteroidField call-site radius split + dead decode query.
 * Portable CPU — no GPU.
 */
import { performance } from 'node:perf_hooks';
import { createGameState } from '../asteroid-query-callers/src/core/gameState.js';
import {
  ensureAsteroidField,
  insertAsteroidFieldRock,
  queryAsteroidField,
  ASTEROID_FIELD_CELL,
} from '../asteroid-query-callers/src/world/asteroidField.js';
import {
  TABLE_COLLECT_HORIZON_SECONDS,
  TABLE_INBOUND_APPROACH_WU,
  TABLE_PROMOTE_HORIZON_SECONDS,
  TABLE_REFERENCE_SPEED_WU,
  residencyPrefetchRadius,
} from '../asteroid-query-callers/src/render/tabletopPolicy.js';

const ROCKS = 800;
const QUERIES = 4000;
const travel = TABLE_REFERENCE_SPEED_WU;
const radius = residencyPrefetchRadius(travel, 144, 50, 16 / 9, 60);
const wideR = radius + (travel + TABLE_INBOUND_APPROACH_WU) * TABLE_PROMOTE_HORIZON_SECONDS;
const tightR = radius + travel * TABLE_COLLECT_HORIZON_SECONDS + ASTEROID_FIELD_CELL;
const decodeR = travel * 4; // TABLE_AUTHORED_DECODE_SECONDS ≈ 4

const state = createGameState();
ensureAsteroidField(state);
for (let i = 0; i < ROCKS; i++) {
  const a = (i / ROCKS) * Math.PI * 2;
  const d = 40 + (i % 50) * 90;
  insertAsteroidFieldRock(state, {
    id: 1000 + i,
    pos: { x: Math.cos(a) * d, z: Math.sin(a) * d },
    radius: 8 + (i % 5),
  });
}

const scratch = [];
const origin = { x: 0, z: 0 };

function bench(label, r, n) {
  // warmup
  for (let i = 0; i < 50; i++) queryAsteroidField(state, origin, r, scratch);
  const t0 = performance.now();
  let hits = 0;
  for (let i = 0; i < n; i++) {
    origin.x = (i % 40) * 12;
    origin.z = ((i * 7) % 40) * 12;
    queryAsteroidField(state, origin, r, scratch);
    hits += scratch.length;
  }
  const ms = performance.now() - t0;
  return { label, ms: +ms.toFixed(2), hits, radius: +r.toFixed(1), cellSide: Math.ceil((2 * r) / ASTEROID_FIELD_CELL) };
}

const wide = bench('wide-shared-disc', wideR, QUERIES);
const tight = bench('tight-rock-disc', tightR, QUERIES);
const decode = bench('decode-runway-dead', decodeR, QUERIES);

// Dead query was once per sim tick ≈ 60 Hz. 20s sample ≈ 1200 calls.
const deadPer20s = bench('decode-runway-20s-ticks', decodeR, 1200);

const out = {
  rocks: ROCKS,
  queries: QUERIES,
  travel,
  radiusCollect: +radius.toFixed(1),
  wide,
  tight,
  decode,
  deadPer20s,
  tightSpeedup: +(wide.ms / tight.ms).toFixed(2),
  cellsWide: wide.cellSide ** 2,
  cellsTight: tight.cellSide ** 2,
};
console.log(JSON.stringify(out, null, 2));
