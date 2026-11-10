import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { mergeConvexPlanarFan } from '../src/core/convexPlanarFan.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { makeEntity } from '../src/core/entity.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

function area(polygon) {
  return polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return sum + p.x * q.z - p.z * q.x;
  }, 0) / 2;
}

function inside(polygon, x, z) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p = polygon[i]; const q = polygon[j];
    if ((p.z > z) !== (q.z > z) && x < (q.x - p.x) * (z - p.z) / (q.z - p.z) + p.x) result = !result;
  }
  return result;
}

function wasp(i = 0) {
  const entity = makeEntity(makeShipEntitySpec('ship_wasp', { team: 1,
    pos: { x: (i % 8) * 20, z: Math.floor(i / 8) * 20 }, rot: (i % 3) * 0.07 }));
  entity.id = i + 1;
  entity.vel = { x: Math.sin(i * 17 + 231) * 3, z: Math.cos(i * 13 + 231) * 3 };
  return entity;
}

test('convex fan merging preserves exact area, boundary and concave notches deterministically', () => {
  const notch = [[-3,-3],[3,-3],[3,3],[1,3],[0,1],[-1,3],[-3,3]].map(([x,z]) => ({x,z}));
  const outline = resolveCollisionProxyManifest(wasp()).planarPolygon;
  for (const polygon of [notch, [...notch].reverse(), outline]) {
    const parts = mergeConvexPlanarFan(polygon);
    assert.deepEqual(mergeConvexPlanarFan(polygon), parts);
    assert.ok(parts.length < polygon.length);
    assert.ok(Math.abs(parts.reduce((sum, part) => sum + area(part), 0) - area(polygon)) < 1e-10);
    for (const part of parts) for (let i = 0; i < part.length; i++) {
      const a = part[i], b = part[(i + 1) % part.length], c = part[(i + 2) % part.length];
      assert.ok(((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x)) * Math.sign(area(part)) >= 0);
      assert.ok(a.x === 0 && a.z === 0 || polygon.includes(a), 'no replacement boundary vertex');
    }
    for (let ix = 0; ix < 81; ix++) for (let iz = 0; iz < 81; iz++) {
      const x = -3.2 + (ix + 0.312345) * 6.4 / 81;
      const z = -3.2 + (iz + 0.412345) * 6.4 / 81;
      assert.equal(parts.some(part => inside(part, x, z)), inside(polygon, x, z));
    }
  }
  const parts = mergeConvexPlanarFan(notch);
  assert.equal(parts.some(part => inside(part, 0, 2)), false, 'the notch remains empty');
});

test('production Wasp keeps native planar footprint, authored mass/inertia and impulse response', async () => {
  const entity = wasp(); entity.vel = { x: 0, z: 0 };
  const outline = resolveCollisionProxyManifest(entity).planarPolygon;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities([entity]);
    const rec = owner.records.get(entity.id);
    assert.equal(rec.colliders.length, 8);
    assert.equal(rec.body.mass(), Math.fround(rec.spec.mass));
    assert.equal(rec.body.principalInertia().y, Math.fround(rec.spec.inertiaY));
    assert.ok(rec.colliders.every(collider => collider.density() === 0));
    for (let ix = 0; ix < 61; ix++) for (let iz = 0; iz < 61; iz++) {
      const x = -1.2 + (ix + 0.312345) * 2.4 / 61;
      const z = -1.2 + (iz + 0.412345) * 2.4 / 61;
      assert.equal(rec.colliders.some(collider => collider.projectPoint({
        x: x * entity.radius, y: 0, z: z * entity.radius,
      }, true).isInside), inside(outline, x, z));
    }
    assert.equal(owner.applyImpulse({ entityId: entity.id, impulse: { x: rec.spec.mass * 10, y: 0, z: 0 } }), true);
    owner.step(1 / 60);
    assert.ok(Math.abs(entity.vel.x - 10) < 1e-5, 'same impulse retains the authored mass response');
  } finally { owner.dispose(); }
});

async function crowd(merged) {
  const entities = Array.from({ length: 32 }, (_, i) => {
    const entity = wasp(i);
    const manifest = resolveCollisionProxyManifest(entity);
    const vertices = manifest.planarPolygon;
    const points = merged ? mergeConvexPlanarFan(vertices)
      : vertices.map((a, j) => [{x:0,z:0}, a, vertices[(j + 1) % vertices.length]]);
    entity.physicsBody = { ...entity.physicsBody, collisionProxyManifest: {
      ...manifest, id: `bench_wasp_${merged ? 'merged' : 'fan'}`, planarPolygon: undefined,
      convexParts: points.map((points, j) => ({ id: `part${j}`, points })),
    } };
    return entity;
  });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(entities);
    const record = owner.records.get(1);
    for (const rec of owner.records.values()) {
      assert.equal(rec.body.mass(), rec.spec.mass);
      assert.ok(rec.colliders.every(collider => collider.density() === 0));
    }
    let solveMs = 0, contacts = 0;
    const nativeStep = owner.world.step.bind(owner.world);
    owner.world.step = (...args) => {
      const start = performance.now();
      const result = nativeStep(...args);
      solveMs += performance.now() - start;
      return result;
    };
    owner.createAttachment({ attachmentId: 'tow', defId: 'tether_standard', ownerId: 1, targetId: 2,
      sourceWorld: entities[0].pos, targetWorld: entities[1].pos, restLength: 18 });
    for (let i = 0; i < 120; i++) {
      owner.step(1 / 60);
      const impacts = owner.drainContactImpacts();
      assert.equal(new Set(impacts.map(impact => `${impact.aId}:${impact.bId}`)).size, impacts.length,
        'one entity-pair impact per step despite compound contacts');
      contacts += impacts.length;
    }
    return { merged, bodies: entities.length, collidersPerBody: record.colliders.length, solveMs, contacts };
  } finally { owner.dispose(); }
}

test('seed231 dense32-Wasp tether workload retains contacts with fewer native colliders', async t => {
  const before = await crowd(false), after = await crowd(true);
  t.diagnostic(JSON.stringify({ before, after, timing: 'busy-host native solve diagnostic only' }));
  assert.equal(before.collidersPerBody, 24);
  assert.ok(after.collidersPerBody < before.collidersPerBody);
  assert.ok(before.contacts > 0 && after.contacts > 0);
});
