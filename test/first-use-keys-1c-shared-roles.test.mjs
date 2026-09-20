import assert from 'node:assert/strict';
import test from 'node:test';

import { ArcadeStructuralFx } from '../src/render/combat/arcadeStructuralFx.js';
import {
  makeRockMaterials,
  metalMat,
  paintMat,
  emissiveMat,
} from '../src/render/asteroidInteriorPreview.js';
import { createLivingHullPresentation } from '../src/render/livingHullPresentation.js';
import { build47aScenarioProp } from '../src/render/scenarioProps47a.js';
import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';

const SHARED_ROLES = new Set(Object.values(SHARED_MATERIAL_ROLE));

function stubCanvas() {
  const context = {
    canvas: { width: 32, height: 32 },
    fillRect() {},
    getImageData() {
      return { data: new Uint8ClampedArray(32 * 32 * 4), width: 32, height: 32 };
    },
    putImageData() {},
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    fillText() {},
    measureText() { return { width: 8 }; },
  };
  return { width: 32, height: 32, getContext: () => context };
}

if (!globalThis.document) {
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {} }),
  };
}

function litMaterials(root) {
  const list = [];
  root.traverse((object) => {
    if (!object.isMesh && !object.isInstancedMesh) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of mats) {
      if (material && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) {
        list.push(material);
      }
    }
  });
  return list;
}

test('living-hull Standard decals join the hull family', () => {
  const { root } = createLivingHullPresentation();
  const lit = litMaterials(root);
  assert.ok(lit.length >= 3, 'kill tally, patch, and graffiti are Standard');
  for (const material of lit) {
    assert.equal(material.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
    assert.equal(material.userData.spacefaceBatchKey, undefined);
  }
});

test('living-hull repair patches carry the global illustrated surface', () => {
  const { root } = createLivingHullPresentation();
  const patch = root.getObjectByName('LivingHull_RepairPatches')?.material;
  assert.ok(patch, 'repair patch material exists');
  assert.equal(patch.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(patch.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY);
});

test('47-A scenario props inherit the illustrated surface while keeping their family token', () => {
  const root = build47aScenarioProp({
    id: 'spindle-surface',
    type: 'payload',
    radius: 10,
    data: { assetRef: 'asset.slice.47a_spindle' },
  });
  const structural = litMaterials(root).filter(
    (material) => material.userData.spacefaceProgramFamily === 'SF_Scenario_standard',
  );
  assert.ok(structural.length > 0, 'expected at least one SF_Scenario_standard prop material');
  for (const material of structural) {
    assert.equal(material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY);
    // The semantic debug family stays on userData; the compiled family collapses to the single
    // illustrated key shared by every opaque hull-class surface.
    assert.match(material.userData.spacefaceProgramFamily, /SF_Scenario_standard/);
    assert.equal(material.customProgramCacheKey(), ILLUSTRATED_SURFACE_KEY);
  }
});

test('47-A props join shared families without minting a batch key', () => {
  const root = build47aScenarioProp({
    id: 'spindle-1c',
    type: 'payload',
    radius: 10,
    data: { assetRef: 'asset.slice.47a_spindle' },
  });
  const lit = litMaterials(root);
  assert.ok(lit.length > 0);
  assert.ok(lit.some((material) => material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL));
  assert.ok(lit.some((material) => material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.PLUME));
  assert.ok(lit.some((material) => material.userData.spacefaceProgramFamily === 'SF_Scenario_standard'));
  for (const material of lit) {
    assert.ok(SHARED_ROLES.has(material.userData.spacefaceSharedMaterialRole), material.name);
    assert.equal(material.userData.spacefaceBatchKey, undefined);
  }
});

test('works rock and machine helpers join rock/hull/plume families', () => {
  const rocks = makeRockMaterials(null);
  for (const [name, material] of Object.entries(rocks)) {
    assert.equal(material.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.ROCK, name);
    assert.equal(material.userData.spacefaceBatchKey, undefined, name);
  }
  assert.equal(metalMat(0x445566).userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(paintMat(0x334455).userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(emissiveMat(0x44aacc).userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.PLUME);
});

test('combat shards reuse the hull family', () => {
  const fx = new ArcadeStructuralFx({ add() {} });
  const material = fx.shards.mesh.material;
  assert.equal(material.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.HULL);
  assert.equal(material.userData.spacefaceBatchKey, undefined);
  fx.dispose();
});
