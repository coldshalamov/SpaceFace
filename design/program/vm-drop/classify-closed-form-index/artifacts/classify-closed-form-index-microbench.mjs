/**
 * Fair harness for selectClassifyEntities closed-form catch-up residual.
 *
 * Prior weak miss: inline `physicsBody === false` filter still walked the full
 * entityList (O(N) property checks) → ~1.3×. This bench compares:
 *   full   — current master (distance-test every unseen live entity)
 *   filter — prior weak package (full walk + property filter)
 *   index  — shipped: walk only closedFormMovers lane
 */
import { writeFileSync } from 'node:fs';

const ENTITIES = 8000;
const CLOSED = 24;
const ITERS = 4000;
const ORIGIN = { x: 0, z: 0 };
const ENTER2 = 200 * 200;

function makeWorld() {
  const list = [];
  const closedFormMovers = [];
  const seen = new Set();
  for (let i = 0; i < ENTITIES; i++) {
    const isClosed = i < CLOSED;
    const entity = {
      id: i,
      alive: true,
      physicsBody: isClosed ? false : { dynamic: true },
      pos: {
        x: isClosed ? (i % 2 === 0 ? 40 : 5000) : 3000 + (i % 500),
        z: (i % 17) * 10,
      },
    };
    list.push(entity);
    if (isClosed) closedFormMovers.push(entity);
    // Mimic post-hash: physics-backed near entities already in seen.
    if (!isClosed && entity.pos.x * entity.pos.x + entity.pos.z * entity.pos.z <= ENTER2) {
      seen.add(entity.id);
    }
  }
  // Seed seen with a typical hash neighborhood (~80 ids) so full/filter still
  // pay Set lookups on most of the list — matches production incremental path.
  for (let i = CLOSED; i < CLOSED + 80; i++) seen.add(i);
  return { list, closedFormMovers, seen };
}

function catchUpFull(list, seen, out) {
  out.length = 0;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || !entity.pos || seen.has(entity.id)) continue;
    const dx = entity.pos.x - ORIGIN.x;
    const dz = entity.pos.z - ORIGIN.z;
    if (dx * dx + dz * dz <= ENTER2) out.push(entity);
  }
  return out.length;
}

function catchUpFilter(list, seen, out) {
  out.length = 0;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || !entity.pos || seen.has(entity.id)) continue;
    if (entity.physicsBody !== false) continue;
    const dx = entity.pos.x - ORIGIN.x;
    const dz = entity.pos.z - ORIGIN.z;
    if (dx * dx + dz * dz <= ENTER2) out.push(entity);
  }
  return out.length;
}

function catchUpIndex(closedFormMovers, seen, out) {
  out.length = 0;
  for (let i = 0; i < closedFormMovers.length; i++) {
    const entity = closedFormMovers[i];
    if (!entity || entity.alive === false || !entity.pos || seen.has(entity.id)) continue;
    const dx = entity.pos.x - ORIGIN.x;
    const dz = entity.pos.z - ORIGIN.z;
    if (dx * dx + dz * dz <= ENTER2) out.push(entity);
  }
  return out.length;
}

function time(fn) {
  const out = [];
  let sink = 0;
  let worst = 0;
  // warm
  for (let i = 0; i < 200; i++) sink += fn(out);
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    const s0 = performance.now();
    sink += fn(out);
    const dt = performance.now() - s0;
    if (dt > worst) worst = dt;
  }
  return { ms: performance.now() - t0, worstMs: worst, sink, hits: out.length };
}

const world = makeWorld();
const full = time((out) => catchUpFull(world.list, world.seen, out));
const filter = time((out) => catchUpFilter(world.list, world.seen, out));
const indexed = time((out) => catchUpIndex(world.closedFormMovers, world.seen, out));

const result = {
  label: 'classifyClosedFormIndex',
  entities: ENTITIES,
  closedForm: CLOSED,
  iters: ITERS,
  fullMs: +full.ms.toFixed(2),
  filterMs: +filter.ms.toFixed(2),
  indexMs: +indexed.ms.toFixed(2),
  filterSpeedupVsFull: +(full.ms / filter.ms).toFixed(3),
  indexSpeedupVsFull: +(full.ms / indexed.ms).toFixed(3),
  indexSpeedupVsFilter: +(filter.ms / indexed.ms).toFixed(3),
  fullWorstMs: +full.worstMs.toFixed(4),
  filterWorstMs: +filter.worstMs.toFixed(4),
  indexWorstMs: +indexed.worstMs.toFixed(4),
  worstSpeedupVsFull: +(full.worstMs / Math.max(indexed.worstMs, 1e-9)).toFixed(3),
  hitsFull: full.hits,
  hitsFilter: filter.hits,
  hitsIndex: indexed.hits,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync('/tmp/sf-bench/classify-closed-form-index-microbench.json', `${JSON.stringify(result, null, 2)}\n`);
