import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { velocityPlaneRecord } from '../src/data/velocityPlane.js';
import { fieldRawAcceleration, normalizeField } from '../src/core/fields/fieldKernel.js';
import { buildAuthoredPlaceProp } from '../src/render/partsLibrary.js';
import { siteRuntime } from './helpers/mj4-site-runtime.mjs';

const site = MACHINE_SITES.charon_star_marker;

for (const offset of [{ x: 0, z: 0 }, { x: 40000, z: -17000 }]) {
  test(`the materialized Star Marker draws the velocity boundary at offset ${offset.x}, ${offset.z}`, () => {
    const runtime = siteRuntime(site.sectorId, { offset });
    runtime.materializeMachines();
    const row = runtime.state.world.dressing.rows.find((entry) => (
      entry.data.machineSite === site.siteId && entry.data.placeId === 'machine_marker'
    ));
    assert.ok(row, 'the default materializer must publish the marker dressing');
    assert.ok(runtime.world.active.dressing.some((entry) => entry.id === row.id));

    const visual = buildAuthoredPlaceProp(row);
    assert.ok(visual, 'the production place builder must resolve the marker');
    visual.position.set(row.pos.x, 0, row.pos.z);
    visual.rotation.y = -row.rot;
    visual.updateMatrixWorld(true);
    const rings = [];
    let needle;
    visual.traverse((node) => {
      if (node.geometry?.type === 'TorusGeometry') rings.push(node);
      if (node.geometry?.type === 'ConeGeometry') needle = node;
    });
    assert.equal(rings.length, 1);

    const center = runtime.world._toGlobal(site.center);
    const plane = normalizeField(velocityPlaneRecord(center));
    const ring = rings[0];
    const vertices = ring.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    let minRadius = Infinity;
    let maxRadius = 0;
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(ring.matrixWorld);
      const radius = Math.hypot(point.x - center.x, point.z - center.z);
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
    }
    assert.ok(Math.abs(maxRadius - plane.radius) < 1,
      `visible ring outer radius ${maxRadius.toFixed(3)} must follow velocity plane radius ${plane.radius}`);
    assert.ok(Math.abs(minRadius - plane.radius) < 1,
      `the entire ring must follow the boundary, inner radius was ${minRadius.toFixed(3)}`);
    const bounds = new THREE.Box3().setFromObject(ring, true);
    assert.ok(bounds.max.y - bounds.min.y < 2, 'the boundary must lie in the XZ flight plane');
    assert.ok(Math.abs(bounds.getCenter(point).y) < 1);
    assert.ok(row.radius >= plane.radius, 'dressing culling must include the visible boundary');
    assert.ok(new THREE.Box3().setFromObject(needle, true).getSize(point).y < 60,
      'expanding the boundary must preserve the reference needle size');

    const velocity = { x: 10, z: 7 };
    assert.ok(fieldRawAcceleration(plane, center.x + plane.radius - 1, center.z, null, velocity).ax < 0);
    assert.deepEqual(fieldRawAcceleration(plane, center.x + plane.radius + 1, center.z, null, velocity),
      { ax: 0, az: 0 }, 'the face must release just outside the drawn ring');
    console.log(`Star Marker ring: ${minRadius.toFixed(3)}..${maxRadius.toFixed(3)} WU; velocity plane: ${plane.radius} WU`);
  });
}
