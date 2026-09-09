import assert from 'node:assert/strict';
import test from 'node:test';

import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';

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

test.before(() => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
});
test.after(() => {
  delete globalThis.__SF_VISUAL_FACTORY_THROW__;
});

function collectLitMaterials(root) {
  const materials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        materials.push({ material, name: object.name || object.type });
      }
    }
  });
  return materials;
}

function assertFactoryRoles(root, label) {
  const lit = collectLitMaterials(root);
  assert.ok(lit.length > 0, `${label} must create at least one Standard/Physical material`);
  for (const { material, name } of lit) {
    const role = material.userData && material.userData.spacefaceSharedMaterialRole;
    assert.ok(
      SHARED_ROLES.has(role),
      `${label} ${name} missing shared role (got ${role})`,
    );
    assert.equal(
      material.userData.spacefaceBatchKey,
      undefined,
      `${label} ${name} must not collapse unlike hulls into one BatchedMesh`,
    );
  }
  return lit;
}

test.afterEach(() => invalidateVisualFactoryCaches());

test('factory ship and rock materials join an existing shader family', () => {
  const factory = createVisualFactory();
  const ship = factory.build({
    id: 11,
    type: 'ship',
    radius: 8,
    team: 0,
    isPlayer: true,
    data: { defId: 'ship_kestrel' },
  });
  const rock = factory.build({
    id: 21,
    type: 'asteroid',
    radius: 12,
    data: { typeId: 'ast_common_rock' },
  });

  const shipLit = assertFactoryRoles(ship, 'ship');
  const rockLit = assertFactoryRoles(rock, 'rock');

  assert.ok(
    shipLit.some((entry) => entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL),
    'a factory ship must stamp at least one hull family material',
  );
  assert.ok(
    shipLit.some((entry) => entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.CANOPY),
    'a factory ship must stamp canopy glass onto the shared canopy family',
  );
  assert.ok(
    rockLit.every((entry) => entry.material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.ROCK),
    'a factory rock must stay on the rock family',
  );
});

test('a new factory hull reuses the hull program family instead of minting one', () => {
  const factory = createVisualFactory();
  const player = factory.build({
    id: 31,
    type: 'ship',
    radius: 8,
    team: 0,
    isPlayer: true,
    data: { defId: 'ship_kestrel' },
  });
  const hostile = factory.build({
    id: 32,
    type: 'ship',
    radius: 8,
    team: 1,
    data: { defId: 'ship_kestrel' },
  });

  const paintedHull = (root) => collectLitMaterials(root)
    .map((entry) => entry.material)
    .find((material) => material.userData.spacefaceSharedMaterialRole === SHARED_MATERIAL_ROLE.HULL
      && material.map && material.roughnessMap && material.normalMap
      && material.transparent !== true);
  const playerHull = paintedHull(player);
  const hostileHull = paintedHull(hostile);

  assert.ok(playerHull && hostileHull, 'both ships need a painted hull');
  assert.notEqual(playerHull.uuid, hostileHull.uuid, 'each hull keeps its own material instance');
  assert.notEqual(playerHull.map, hostileHull.map, 'paint stays a per-hull texture bind');
  assert.equal(
    playerHull.userData.spacefaceProgramFamily,
    hostileHull.userData.spacefaceProgramFamily,
    'a new hull must reuse the existing hull shader family',
  );
});
