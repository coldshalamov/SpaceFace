import { writeFileSync } from 'node:fs';
import { surfaceResponseFor, SURFACE_RESPONSE } from './src/core/surfaceContact.js';

const materialSurface = e => surfaceResponseFor(
  e.surfaceMaterial ?? e.surfaceKind ?? e.data?.surfaceMaterial ?? e.data?.surfaceKind
) === SURFACE_RESPONSE.reflect;
const valid = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);

function world(n, nearReflect = 8) {
  const entities = new Map();
  const player = {
    id: 1, type: 'ship', alive: true, collides: true, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0,
    surfaceMaterial: 'ship', data: {},
  };
  entities.set(1, player);
  let reflectPlaced = 0;
  for (let i = 2; i <= n; i++) {
    const kind = i % 11;
    let type = 'ship', surfaceMaterial = 'ship', collides = true, radius = 10, dist;
    if (kind === 0 && reflectPlaced < nearReflect) {
      type = 'structure'; surfaceMaterial = 'plate'; dist = 80 + reflectPlaced * 70; reflectPlaced++; radius = 20;
    } else if (kind === 1) {
      type = 'asteroid'; surfaceMaterial = 'rock'; dist = 100 + (i % 50) * 40; radius = 30;
    } else if (kind === 2) {
      type = 'projectile'; surfaceMaterial = 'projectile'; dist = 50 + (i % 20) * 30; radius = 1;
    } else if (kind === 3) {
      type = 'structure'; surfaceMaterial = 'mirror'; dist = 900 + (i % 40) * 50; radius = 20;
    } else {
      dist = 200 + (i % 80) * 60;
    }
    const ang = i * 0.37;
    entities.set(i, {
      id: i, type, alive: true, collides, rot: 0, radius,
      pos: { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist },
      vel: { x: 1, z: 0 }, surfaceMaterial, data: { surfaceMaterial },
    });
  }
  return { entities, player };
}

function sampleBefore(entities, player) {
  let count = 0, hits = 0;
  for (const entity of entities.values()) {
    if (count >= 8) break;
    if (!entity.alive || !entity.collides || !valid(entity.pos) || !materialSurface(entity)
      || Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) > 600) continue;
    hits ^= entity.id; count++;
  }
  return hits;
}
function sampleAfter(entities, player) {
  let count = 0, hits = 0;
  const px = player.pos.x, pz = player.pos.z;
  for (const entity of entities.values()) {
    if (count >= 8) break;
    if (!entity.alive || !entity.collides || !valid(entity.pos)) continue;
    const dx = entity.pos.x - px, dz = entity.pos.z - pz;
    if (dx * dx + dz * dz > 360000) continue;
    if (!materialSurface(entity)) continue;
    hits ^= entity.id; count++;
  }
  return hits;
}

const N = 2500, ITERS = 4000;
const { entities, player } = world(N);
function time(fn) {
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) sink ^= fn();
  return { ms: performance.now() - t0, sink };
}
time(() => sampleBefore(entities, player));
time(() => sampleAfter(entities, player));
const before = time(() => sampleBefore(entities, player));
const after = time(() => sampleAfter(entities, player));
const result = {
  entities: N, iters: ITERS,
  beforeMs: before.ms, afterMs: after.ms,
  speedup: before.ms / after.ms,
  sinkMatch: before.sink === after.sink,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync('scratch-projectile-surface-bench.json', `${JSON.stringify(result, null, 2)}\n`);
