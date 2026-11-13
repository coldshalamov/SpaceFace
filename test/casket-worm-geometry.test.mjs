import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { hasUnresidentGeometry } from '../src/render/startupGpuResidency.js';
import { geometryGpuResident, invalidateResidencyContextGeneration, stampGeometryGpuResident }
  from '../src/render/residencyManager.js';

const makeWorm = () => buildFaunaMesh({ data: { strainId: 'charon_grave',
  ecology: { speciesId: 'casket_worm', driveState: 'dormant' } } });

test('Casket Worm retains its animated part contract and usable tissue coordinates', () => {
  const root = makeWorm();
  assert.equal(root.children.length, 7);
  assert.ok(root.children.every(child => child.isMesh));
  for (let i = 0; i < 6; i++) {
    const part = root.children[i];
    assert.deepEqual(part.position.toArray(), [0, (i % 2) * 0.5 - 0.3, -i * 2.2]);
    assert.deepEqual(part.scale.toArray(), [8 - i * 0.6, 6, 8]);
    assert.equal(part.geometry, root.children[0].geometry);
  }
  assert.deepEqual(root.children[6].position.toArray(), [0, 0, 2.4]);
  assert.deepEqual(root.children[6].scale.toArray(), [8, 8, 8]);
  assert.notEqual(root.children[0].geometry, root.children[6].geometry);

  for (const geometry of new Set(root.children.map(child => child.geometry))) {
    assert.equal(geometry.userData.spacefaceSharedAsset, true);
    const { position, normal, uv } = geometry.attributes;
    assert.equal(position.count, normal.count);
    assert.equal(position.count, uv.count);
    for (const attribute of [position, normal, uv]) {
      assert.ok([...attribute.array].every(Number.isFinite));
    }
    for (let i = 0; i < geometry.index.count; i += 3) {
      const a = geometry.index.getX(i), b = geometry.index.getX(i + 1), c = geometry.index.getX(i + 2);
      const area = (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a))
        - (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a));
      assert.ok(Math.abs(area) > 1e-8, 'skin UV triangles retain usable area');
    }
  }
});

test('cached Casket geometries become unresident when the GPU context generation changes', () => {
  const first = makeWorm();
  const geometries = [...new Set(first.children.map(child => child.geometry))];
  for (const geometry of geometries) stampGeometryGpuResident(geometry);
  assert.equal(hasUnresidentGeometry(first), false);

  invalidateResidencyContextGeneration();
  const rebuilt = makeWorm();
  assert.equal(rebuilt.children[0].geometry, first.children[0].geometry);
  assert.equal(rebuilt.children[6].geometry, first.children[6].geometry);
  assert.ok(geometries.every(geometry => !geometryGpuResident(geometry)));
  assert.equal(hasUnresidentGeometry(rebuilt), true);
  for (const geometry of geometries) stampGeometryGpuResident(geometry);
  assert.equal(hasUnresidentGeometry(rebuilt), false);
});
