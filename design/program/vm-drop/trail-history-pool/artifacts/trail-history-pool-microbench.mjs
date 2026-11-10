/**
 * Offline microbench: radar trail history.push({x,z}) + shift vs pooled recycle.
 */
const TRAIL_MAX = 7;

function updateBefore(trailMap, entity) {
  let history = trailMap.get(entity.id);
  if (!history) {
    history = [];
    trailMap.set(entity.id, history);
  }
  const last = history[history.length - 1];
  const dx = last ? entity.pos.x - last.x : Infinity;
  const dz = last ? entity.pos.z - last.z : Infinity;
  if (!last || dx * dx + dz * dz > 400) {
    history.push({ x: entity.pos.x, z: entity.pos.z });
    if (history.length > TRAIL_MAX) history.shift();
  }
}

function updateAfter(trailMap, pointPool, entity) {
  let history = trailMap.get(entity.id);
  if (!history) {
    history = [];
    trailMap.set(entity.id, history);
  }
  const last = history[history.length - 1];
  const dx = last ? entity.pos.x - last.x : Infinity;
  const dz = last ? entity.pos.z - last.z : Infinity;
  if (!last || dx * dx + dz * dz > 400) {
    let pt;
    if (history.length >= TRAIL_MAX) {
      pt = history.shift();
      pt.x = entity.pos.x;
      pt.z = entity.pos.z;
      history.push(pt);
    } else {
      pt = pointPool.length ? pointPool.pop() : { x: 0, z: 0 };
      pt.x = entity.pos.x;
      pt.z = entity.pos.z;
      history.push(pt);
    }
  }
}

function checksum(trailMap) {
  let h = trailMap.size * 13;
  for (const [id, history] of trailMap) {
    h = (h * 31 + id + history.length) | 0;
    for (let i = 0; i < history.length; i++) {
      h = (h + ((history[i].x * 10) | 0) + ((history[i].z * 10) | 0)) | 0;
    }
  }
  return h;
}

function resetPos(entities) {
  for (let i = 0; i < entities.length; i++) {
    entities[i].pos.x = i * 10;
    entities[i].pos.z = i * -7;
  }
}

function run(updateFn, trailMap, pointPool, entities, ticks) {
  let sum = 0;
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      e.pos.x += 18 + (t % 5);
      e.pos.z += 12 + ((t + i) % 3);
      updateFn(trailMap, pointPool, e);
    }
    if ((t & 63) === 0) sum = (sum + checksum(trailMap)) | 0;
  }
  return sum;
}

const ENTITIES = 64;
const TICKS = 20000;
const entities = Array.from({ length: ENTITIES }, (_, i) => ({
  id: i + 1,
  pos: { x: 0, z: 0 },
}));

const mapA = new Map();
const mapB = new Map();
const pool = [];

resetPos(entities);
run((m, _p, e) => updateBefore(m, e), mapA, null, entities, 50);
resetPos(entities);
run((m, p, e) => updateAfter(m, p, e), mapB, pool, entities, 50);
if (checksum(mapA) !== checksum(mapB)) {
  console.error('warmup checksum mismatch', checksum(mapA), checksum(mapB));
  process.exit(1);
}

resetPos(entities);
mapA.clear();
const t0 = performance.now();
const sumA = run((m, _p, e) => updateBefore(m, e), mapA, null, entities, TICKS);
const t1 = performance.now();

resetPos(entities);
mapB.clear();
pool.length = 0;
const t2 = performance.now();
const sumB = run((m, p, e) => updateAfter(m, p, e), mapB, pool, entities, TICKS);
const t3 = performance.now();

const beforeMs = t1 - t0;
const afterMs = t3 - t2;
const out = {
  name: 'trail-history-pool',
  entities: ENTITIES,
  ticks: TICKS,
  trailMax: TRAIL_MAX,
  beforeMs: +beforeMs.toFixed(3),
  afterMs: +afterMs.toFixed(3),
  speedup: +(beforeMs / afterMs).toFixed(3),
  checksumBefore: checksum(mapA),
  checksumAfter: checksum(mapB),
  checksumMatch: checksum(mapA) === checksum(mapB) && sumA === sumB,
  sumA,
  sumB,
  poolFree: pool.length,
};
console.log(JSON.stringify(out, null, 2));
