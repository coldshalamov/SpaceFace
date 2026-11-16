import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';
import { createVisualFactory } from '../src/render/visualFactory.js';

function rock(id, data) {
  return { id, type: 'asteroid', radius: 16, pos: { x: 0, y: 0, z: 0 }, data };
}

test('ordinary reflective ore keeps a rock body while lattice mirrors keep their optic skin', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  }) }) };
  const factory = createVisualFactory();
  const oreData = environmentSurfaceData('metal', { typeId: 'ast_metallic', fieldId: 'ceres_field', asteroidSlotId: '2' });
  const ore = factory.build(rock('ore', oreData));
  const mirror = factory.build(rock('mirror', { typeId: 'ast_metallic', opticMaterial: 'metal', opticStructureId: 'lattice_1' }));
  assert.equal(oreData.opticMaterial, 'metal', 'ordinary ore retains its combat surface');
  assert.equal(ore.userData.sfOpticSkin, undefined, 'ordinary field ore uses the rock presentation');
  assert.equal(mirror.userData.sfOpticSkin, 'metal', 'authored lattice cell retains mirror presentation');
  assert.notEqual(ore.userData.asteroidBody.geometry, mirror.userData.asteroidBody.geometry);
  globalThis.document = originalDocument;
});
