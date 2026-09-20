import assert from 'node:assert/strict';
import test from 'node:test';

import { resolve as resolveLibraryMaterial, _resetForTest } from '../src/render/materialLibrary.js';
import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { buildKestrelHero } from '../src/render/ships/kestrelHero.js';
import { machineryMaterial, pbrHullMaterial, standardMaterial } from '../src/render/ships/shipKit.js';
import { ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';

const SHARED_ROLES = new Set(Object.values(SHARED_MATERIAL_ROLE));

function stubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    getImageData(_x, _y, width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
    measureText() { return { width: 10 }; },
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    lineWidth: 1,
    globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild() {}, addEventListener() {} }),
};

function collectLitMaterials(root) {
  const materials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        materials.push({ material, name: object.name || material.name || object.type });
      }
    }
  });
  return materials;
}

test.afterEach(() => _resetForTest());

test('kit-built hull paints share one shader family and keep their own maps', () => {
  const frontier = pbrHullMaterial({
    hull: '#315f83',
    accent: '#4ecbe0',
    seed: 11,
    panelCount: 12,
  });
  const rust = pbrHullMaterial({
    hull: '#6b3f2b',
    accent: '#c28b35',
    seed: 22,
    panelCount: 12,
  });

  assert.ok(frontier && rust, 'two painted kit hulls must exist');
  assert.notEqual(frontier.uuid, rust.uuid, 'each paint keeps its own material instance');
  assert.ok(frontier.map && rust.map, 'each paint binds a hull texture');
  assert.notEqual(frontier.map, rust.map, 'paint stays a per-hull texture bind');
  assert.equal(frontier.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(rust.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(
    frontier.userData.spacefaceProgramFamily,
    rust.userData.spacefaceProgramFamily,
    'a new kit hull must reuse the existing hull shader family',
  );
  assert.equal(frontier.userData.spacefaceBatchKey, undefined);
  assert.equal(rust.userData.spacefaceBatchKey, undefined);
});

test('library body and glass join the shared role handful', () => {
  const pal = { hull: '#315f83', accent: '#4ecbe0', emissive: '#4ecbe0' };
  const body = resolveLibraryMaterial('bodyPrimary', pal);
  const glass = resolveLibraryMaterial('glass', pal);

  assert.ok(SHARED_ROLES.has(body.userData.spacefaceSharedMaterialRole), 'bodyPrimary must carry a shared role');
  assert.ok(SHARED_ROLES.has(glass.userData.spacefaceSharedMaterialRole), 'glass must carry a shared role');
  assert.equal(body.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(glass.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.GLASS);
  assert.equal(body.userData.spacefaceBatchKey, undefined);
  assert.equal(glass.userData.spacefaceBatchKey, undefined);
});

test('hero hull and canopy are stamped onto shared families', () => {
  const root = buildKestrelHero({ radius: 14 });
  const lit = collectLitMaterials(root);
  assert.ok(lit.length > 0, 'hero must create lit materials');

  const hull = lit.find((entry) => (
    entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL
    && entry.material.transparent !== true
  ));
  const canopy = lit.find((entry) => (
    entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.CANOPY
    || entry.material.name === 'Kestrel_canopy'
  ));

  assert.ok(hull, 'hero hull/metal must stamp the hull family');
  assert.ok(canopy, 'hero canopy must stamp the canopy family');
  assert.equal(canopy.material.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.CANOPY);
  assert.equal(hull.material.userData.spacefaceBatchKey, undefined);
  assert.equal(canopy.material.userData.spacefaceBatchKey, undefined);
});

test('procedural faction hulls inherit the illustrated surface light language', () => {
  // The remastered GLB fleet is shaped by installIllustratedSurface at authored admission. The
  // procedural faction builders and the Kestrel hero must join the same family instead of falling
  // back to plain physical lighting, or outside-Helios traffic reads as a different art style.
  const hull = pbrHullMaterial({ hull: '#5a4a44', accent: '#D8334A', seed: 7, panelCount: 10 });
  const plate = standardMaterial('#6b3f2b', 0.9, 0.06);
  const machine = machineryMaterial('#15100e', 0.6, 0.66);

  for (const [label, material] of [['pbrHull', hull], ['standard', plate], ['machinery', machine]]) {
    assert.equal(material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY,
      `${label} must install the illustrated surface`);
    assert.equal(material.customProgramCacheKey(), ILLUSTRATED_SURFACE_KEY,
      `${label} must share the single illustrated program family`);
    assert.equal(material.userData.spacefaceIllustratedPigment, undefined,
      `${label} keeps its baked palette; no double-painted fleet pigment`);
  }

  const heroHull = collectLitMaterials(buildKestrelHero({ radius: 14 }))
    .find((entry) => entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL
      && entry.material.transparent !== true);
  assert.equal(heroHull.material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY,
    'the Kestrel hero hull must join the illustrated surface family too');
});
