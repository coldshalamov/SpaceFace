import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualFactory } from '../src/render/visualFactory.js';

function build(data = {}) {
  return createVisualFactory().build({
    id: `wreck-${data.parentType || 'hull'}`,
    type: 'wreck',
    alive: true,
    radius: 8,
    data,
  });
}

function inspect(root) {
  const names = [];
  const materials = new Set();
  let spriteCount = 0;
  let meshCount = 0;
  root.traverse((object) => {
    if (object.name) names.push(object.name);
    if (object.isSprite) spriteCount++;
    if (object.isMesh) {
      meshCount++;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) if (material) materials.add(material);
    }
  });
  return { names, spriteCount, meshCount, materials: [...materials] };
}

test('ordinary wreck reads as named mechanical wreckage without a rock-like halo', () => {
  const root = build({ parentType: 'hull' });
  const result = inspect(root);

  assert.equal(root.userData.kind, 'wreck');
  assert.equal(root.userData.interactionKind, 'wreck');
  assert.equal(root.userData.visualLanguage, 'mechanical-wreckage');
  assert.equal(result.spriteCount, 0);
  assert.ok(result.meshCount >= 7);
  assert.ok(result.names.some((name) => /Spine/.test(name)));
  assert.ok(result.names.some((name) => /HullPlate/.test(name)));
  assert.ok(result.names.some((name) => /TornRib/.test(name)));
  assert.ok(result.materials.some((material) => material.map && material.normalMap && material.roughnessMap),
    'wreck surfaces need deterministic panel, normal, and roughness response');
  assert.ok(new Set(result.materials.map((material) => `${material.roughness}:${material.metalness}`)).size >= 3,
    'structure, coating, and torn edges must not share one clay response');
});

test('unstable reactor wreck has a contained mechanical hazard core, not asteroid language', () => {
  const root = build({ parentType: 'reactor', unstableReactor: { dueAt: 20 } });
  const result = inspect(root);

  assert.equal(root.userData.interactionKind, 'unstable_reactor_wreck');
  assert.equal(root.userData.visualLanguage, 'mechanical-reactor-hazard');
  assert.equal(result.spriteCount, 0);
  assert.ok(result.names.some((name) => /ReactorCore/.test(name)));
  assert.ok(result.names.filter((name) => /ReactorCage/.test(name)).length >= 3);
  assert.ok(result.names.some((name) => /Ceramic/.test(name)), 'reactor needs a readable ceramic containment role');
  assert.ok(result.names.some((name) => /Conduit/.test(name)), 'reactor needs service conduits, not only rings');
  assert.ok(result.names.some((name) => /Radiator/.test(name)), 'reactor needs thermal hardware beyond a glowing ball');
  assert.ok(result.materials.some((material) => material.userData?.spacefaceMaterialRole === 'reactor-ceramic'));
  assert.ok(result.materials.some((material) => material.userData?.spacefaceMaterialRole === 'heat-affected-metal'));
  const effectiveMetalness = (role) => {
    const material = result.materials.find((entry) => entry.userData?.spacefaceMaterialRole === role);
    assert(material?.metalnessMap?.image?.data, `missing packed material role ${role}`);
    return material.metalness * (material.metalnessMap.image.data[2] / 255);
  };
  assert(effectiveMetalness('torn-exposed-metal') > 0.5, 'torn structural metal cannot shade like painted clay');
  assert(effectiveMetalness('heat-affected-metal') > 0.2, 'heat tint must not erase the underlying metal response');
  assert(effectiveMetalness('reactor-ceramic') < 0.02, 'ceramic must stay dielectric');
});
