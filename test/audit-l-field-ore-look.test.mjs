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

test('ordinary crystal-surface ore keeps a rock body while lattice diamonds keep their optic skin', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  }) }) };
  const factory = createVisualFactory();
  const oreData = environmentSurfaceData('crystal', { typeId: 'ast_common_rock', fieldId: 'f_helios_starter', asteroidSlotId: '4' });
  const ore = factory.build(rock('ore', oreData));
  const spentOre = factory.build(rock('spent_ore', { ...oreData, opticMaterial: 'spent' }));
  const cell = factory.build(rock('cell', { typeId: 'ast_crystalline', opticMaterial: 'diamond', opticStructureId: 'lattice_1', opticCell: '0,0' }));
  assert.equal(oreData.opticMaterial, 'diamond', 'ordinary ore retains its combat surface');
  assert.equal(ore.userData.sfOpticSkin, undefined, 'crystal-surface field ore uses the rock presentation');
  assert.equal(spentOre.userData.sfOpticSkin, undefined, 'spent crystal-surface field ore stays on the rock presentation');
  assert.equal(cell.userData.sfOpticSkin, 'diamond', 'authored lattice cell keeps the prism presentation');
  assert.notEqual(ore.userData.asteroidBody.geometry, cell.userData.asteroidBody.geometry);
  globalThis.document = originalDocument;
});
