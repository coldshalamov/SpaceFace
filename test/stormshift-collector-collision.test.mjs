import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { distanceToProxy, resolveCollisionProxyManifest, validateCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { segmentHitsProxy } from '../src/combat/lineOfSight.js';
import { STORMSHIFT_COLLECTOR_COLLISION as MANIFEST, STORMSHIFT_SOURCE_SCALE as K, STORMSHIFT_SOURCE_LENGTH, STORMSHIFT_CHEEK_OUTLINE as OUTLINE } from '../src/data/stormshiftCollectorCollision.js';
const DT = 1 / 60;
function collector(radius = 14, rot = 0) {
  return { id: 71, type: 'ship', alive: true, collides: true, radius, mass: 700,
    pos: { x: 30, z: -40 }, vel: { x: 0, z: 0 }, rot, angVel: 0,
    data: { defId: 'ship_mule', trafficRole: 'stormshift_collector', anvilWork: { phase: 'harvest' } },
    physicsBody: { schemaVersion: 1, radius, mass: 700, inertiaY: 40000, dynamic: true,
      shape: 'capsule', ccd: true, revision: 1, collisionProxyManifest: MANIFEST } };
}
function world(e, x, port) {
  const lx = x * K * e.radius, lz = -port * K * e.radius;
  return { x: e.pos.x + Math.cos(e.rot) * lx - Math.sin(e.rot) * lz,
    y: 0, z: e.pos.z + Math.sin(e.rot) * lx + Math.cos(e.rot) * lz };
}
test('collector authored authority is bounded, source-fit, and never substitutes Mule measured skin', () => {
  assert.equal(validateCollisionProxyManifest(MANIFEST).ok, true);
  assert.equal(MANIFEST.primitives.length, 32);
  const e = collector();
  assert.equal(resolveCollisionProxyManifest(e).id, MANIFEST.id);
  const parts = JSON.parse(readFileSync(new URL('../assets/ships/parts/parts_manifest.json', import.meta.url)));
  const rows = Array.isArray(parts) ? parts : parts.parts;
  const row = rows.find(p => p.file === 'wholeships/ship_stormshift_collector_v01.glb');
  assert.ok(row, 'collector must be in actual manifest');
  assert.ok(Math.abs(row.bounds.dimensionsM[0] - STORMSHIFT_SOURCE_LENGTH) < .002, 'proxy normalization follows source/release draw-fit');
  const released = JSON.parse(readFileSync(new URL('../assets/ships/release/render-packages/stormshift-collector/render-package.json', import.meta.url)));
  assert.equal(released.runtime.bounds.size[0], STORMSHIFT_SOURCE_LENGTH);
  const bank = JSON.parse(readFileSync(new URL('../assets/ships/motions/stormshift-collector.motion.json', import.meta.url)));
  for (const clip of bank.clips) for (const channel of clip.channels) {
    if (!channel.group.startsWith('stormshift_cheek_')) continue;
    assert.equal(channel.path, 'rotation');
    for (let i = 0; i < channel.values.length; i += 4) assert.deepEqual(channel.values.slice(i, i + 4), [0, 0, 0, 1],
      'solid cheeks cannot animate away from their fixed compound');
  }
});
for (const radius of [7, 14, 28]) for (const rot of [0, Math.PI / 4, -Math.PI / 2]) {
  test(`real Rapier mouth, cheek, body and fan gap at radius ${radius}, yaw ${rot}`, async () => {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    try {
      const e = collector(radius, rot);
      owner.syncFromEntities([e]);
      owner.step(DT);
      const rec = owner.records.get(e.id);
      assert.equal(rec.colliders.length, 32);
      assert.ok(Math.abs(rec.body.mass() - 700) < .01, 'compound adds no mass');
      const overlap = (x, z) => rec.colliders.some(c => c.intersectsShape(
        new owner.RAPIER.Ball(.3 * K * radius), world(e, x, z), { x: 0, y: 0, z: 0, w: 1 }));
      for (const x of [4, 5, 6, 7, 8, 9, 10]) assert.equal(overlap(x, 0), false, 'small body fits in true mouth');
      assert.equal(overlap(5, 4.5), true, 'solid cheek');
      assert.equal(overlap(0, 0), true, 'solid drive body');
      assert.equal(overlap(-7, 7), false, 'raised radiator region has no invisible envelope');
      const a = world(e, 10, 0), b = world(e, 4, 0);
      assert.equal(segmentHitsProxy(e, a, b), false, 'shared LOS preserves mouth');
      assert.equal(segmentHitsProxy(e, a, world(e, 0, 0)), true, 'mouth ends at solid body');
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const ray = new owner.RAPIER.Ray(a, { x: (b.x - a.x) / length, y: 0, z: (b.z - a.z) / length });
      assert.equal(rec.colliders.some(c => c.castRay(ray, length, true) >= 0), false, 'real Rapier ray passes the mouth');
      e.data.anvilWork.phase = 'transit';
      owner.syncFromEntities([e]);
      assert.equal(owner.records.get(e.id).body.handle, rec.body.handle, 'fixed-cheek pose transition does not rebuild body');
      assert.equal(overlap(5, 0), false);
      assert.equal(overlap(5, 4.5), true);
    } finally { owner.dispose(); }
  });
}
test('moving small solid passes mouth then contacts the real back wall', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const e = collector();
    const start = world(e, 10, 0);
    const probe = { id: 72, type: 'debris', alive: true, collides: true, radius: .4, mass: 1,
      pos: { x: start.x, z: start.z }, vel: { x: -5, z: 0 }, rot: 0, angVel: 0, data: {},
      physicsBody: { schemaVersion: 1, radius: .4, mass: 1, inertiaY: .2, shape: 'ball',
        dynamic: true, ccd: true, useMeasuredSkin: false, revision: 0 } };
    owner.syncFromEntities([e, probe]);
    const mouthEnd = world(e, 4, 0).x;
    for (let i = 0; i < 95; i++) owner.step(DT);
    assert.ok(probe.pos.x < world(e, 5, 0).x && probe.pos.x > mouthEnd - .15, 'probe physically traversed mouth');
    assert.ok(probe.vel.x < -4.8, 'empty mouth did not apply contact impulse');
    for (let i = 0; i < 60; i++) owner.step(DT);
    assert.ok(probe.pos.x > world(e, 2.8, 0).x, 'back wall arrests traversal');
    assert.ok(probe.vel.x > -1, 'solid body transfers contact impulse');
  } finally { owner.dispose(); }
});

test('cheek approximation stays within the declared source tolerance without joining the mouth', () => {
  const proxies = MANIFEST.primitives.filter(p => p.id.startsWith('cheek-1-'));
  let worst = 0;
  for (let j = 0; j < OUTLINE.length; j++) {
    const a = OUTLINE[j], b = OUTLINE[(j + 1) % OUTLINE.length];
    for (let t = 0; t <= 1; t += .01) {
      const p = { x: (a[0] + (b[0] - a[0]) * t) * K, z: -(a[1] + (b[1] - a[1]) * t) * K };
      worst = Math.max(worst, Math.min(...proxies.map(q => Math.max(0, distanceToProxy(p, q)))) / K);
    }
  }
  assert.ok(worst <= MANIFEST.sourceSurfaceTolerance, `source-to-proxy deviation ${worst}`);
  // The source cheek's nearest edge is port=2.5. Every stair stays on that side of the mouth.
  assert.ok(proxies.every(p => -p.z - p.hz >= 2.5 * K - 1e-8));
});
