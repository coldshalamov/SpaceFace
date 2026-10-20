import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attachShipHeadlamps } from '../src/render/ships/headlamps.js';

function shipRoot() {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 6), new THREE.MeshBasicMaterial());
  root.add(hull);
  root.updateWorldMatrix(true, true);
  return root;
}

test('headlamps attach once, add no lights, and fit the bow', () => {
  const root = shipRoot();
  const entity = { id: 's1', type: 'ship', radius: 12, data: {} };
  const group = attachShipHeadlamps(root, entity);
  assert.ok(group, 'group attached');
  assert.equal(group.name, 'GLTFKit_Headlamps');
  assert.equal(group.children.length, 2, 'lens pair + beam fan only');
  let lights = 0;
  root.traverse((o) => { if (o.isLight) lights++; });
  assert.equal(lights, 0, 'the fixed light census is untouched');
  const lenses = group.children.find((m) => m.name === 'GLTFKit_Headlamp_Lenses');
  const beam = group.children.find((m) => m.name === 'GLTFKit_Headlamp_Beam');
  assert.ok(lenses && beam);
  assert.ok(lenses.position.x > 9, 'lenses sit at the +X nose of a 20-long hull');
  assert.ok(beam.position.x > lenses.position.x, 'beam is thrown ahead of the lenses');
  assert.equal(beam.material.blending, THREE.AdditiveBlending);
  // Idempotent: the same root reuses the group; a swapped root re-fits.
  assert.equal(attachShipHeadlamps(root, entity), group);
  const fresh = shipRoot();
  assert.notEqual(attachShipHeadlamps(fresh, entity), group);
});

test('headlamps survive degenerate roots without throwing', () => {
  const empty = new THREE.Group();
  assert.doesNotThrow(() => attachShipHeadlamps(empty, { type: 'ship', radius: 8, data: {} }));
  assert.equal(attachShipHeadlamps(null, { type: 'ship' }), null);
});
