import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { deriveAuthoredRuntimeTable } from '../src/render/assetLoader.js';

test('runtime marker userData copies plain data without traversing Three.js objects', () => {
  const scene = new THREE.Group();
  const marker = new THREE.Group();
  marker.name = 'SOCKET_WEAPON';

  const texture = new THREE.Texture({ width: 1, height: 1 });
  const metadata = {
    label: 'plain-data',
    nested: {
      count: 0,
      enabled: false,
      empty: '',
      texture,
    },
  };
  marker.userData.payload = metadata;
  scene.add(marker);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  let table;
  try {
    table = deriveAuthoredRuntimeTable(scene, { url: 'fixture.glb' });
  } finally {
    console.warn = originalWarn;
  }

  const copied = table.markers[0].userData.payload;
  assert.deepEqual(copied, {
    label: 'plain-data',
    nested: { count: 0, enabled: false, empty: '' },
  });
  assert.notStrictEqual(copied, metadata);
  assert.notStrictEqual(copied.nested, metadata.nested);
  assert.equal(
    warnings.filter((warning) => warning.includes('Unable to serialize Texture')).length,
    0,
  );
});
