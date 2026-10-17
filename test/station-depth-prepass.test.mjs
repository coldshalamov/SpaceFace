import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildPlacePropRootSteps } from '../src/render/partsLibrary.js';

test('station depth coverage uses the visible surface projection and follows its LOD', () => {
  const geometry = new THREE.BoxGeometry(160, 90, 100);
  const record = {
    url: 'assets/ships/release/parts/places/place_station_military.glb',
    assetId: 'place_station_military', slot: 'place',
    bounds: { size: [160, 90, 100], center: [0, 0, 0] },
    primitives: ['lod0', 'lod1'].map(lod => ({
      key: `${lod}:keep`, name: `${lod}_Keep`, geometry,
      material: new THREE.MeshStandardMaterial(),
      matrix: new THREE.Matrix4().makeTranslation(2.75, 3.125, -1.375),
      tags: { lod },
    })),
    markers: [],
  };
  const entity = {
    id: 88117, type: 'station', radius: 70,
    data: { placeId: 'place_station_military', archetypeGlb: 'place_station_military', placeScale: 1 },
  };
  const steps = buildPlacePropRootSteps(entity, record, new THREE.Scene(), null);
  let step = steps.next();
  while (!step.done) step = steps.next();
  const root = step.value.root;
  const depth = [], surfaces = [];
  root.traverse(o => {
    if (o.userData.spacefaceDepthPrepass) depth.push(o);
    else if (o.isMesh) surfaces.push(o);
  });
  assert.equal(depth.length, 2, 'each authored LOD retains its overdraw protection');
  for (const prepass of depth) {
    const source = surfaces.find(o => o.userData.spacefaceTags?.lod === prepass.userData.spacefaceTags.lod);
    assert.ok(source);
    assert.equal(prepass.geometry.getAttribute('position'), source.geometry.getAttribute('position'));
    assert.equal(prepass.material.colorWrite, false, 'the extra pass only establishes coverage');
    // Matrix-matrix-vector regrouping is algebraically equivalent, but rounds differently on
    // the GPU and makes the visible draw fail its own depth test in moving horizontal strips.
    assert.match(prepass.material.vertexShader, /#include <project_vertex>/,
      'depth uses the same ordered vertex projection as Three physical materials');
    assert.match(prepass.material.vertexShader, /#include <begin_vertex>/);
  }
  root.userData.updateLod('lod1');
  for (const prepass of depth) {
    assert.equal(prepass.visible, prepass.userData.spacefaceTags.lod === 'lod1');
  }
});
