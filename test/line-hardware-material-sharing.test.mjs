import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createLineHardware, lineHardwarePart, LINE_HARDWARE_PARTS } from '../src/render/lineHardware.js';

function fixture() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const source = Array.from({ length: 4 }, (_, i) => new THREE.MeshStandardMaterial({
    color: 0x708090 + i, emissive: 0x102030 + i, emissiveIntensity: 0.3,
  }));
  const hook = () => {};
  const key = () => 'line-hardware-test';
  source[1].onBeforeCompile = hook;
  source[1].customProgramCacheKey = key;
  const primitive = (name, material) => ({ name, geometry, material, matrix: new THREE.Matrix4() });
  const records = new Map([
    [LINE_HARDWARE_PARTS[0], { primitives: [
      primitive('LOD0_drum', source[0]), primitive('LOD0_hub', source[0]), primitive('LOD0_mount', source[0]),
    ] }],
    [LINE_HARDWARE_PARTS[1], { primitives: [
      primitive('LOD0_plate', source[1]), primitive('LOD0_rim', source[2]), primitive('LOD0_bolt', source[3]),
      primitive('LOD1_excluded', source[0]),
    ] }],
  ]);
  return { geometry, source, hook, key, loadPart: async (file) => records.get(file) };
}

function state(heat) {
  return { simTime: 1, playerId: 1, player: { tether: { active: true } },
    entities: new Map(), lineProgression: { classIndex: 1, winchHeat: heat }, render: {} };
}

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

test('a rig shares repeated private materials without coupling another rig or its sources', async () => {
  const f = fixture();
  const cold = createLineHardware(state(0), { loadPart: f.loadPart });
  const hot = createLineHardware(state(1), { loadPart: f.loadPart });
  try {
    assert.equal(await cold.ready, true);
    assert.equal(await hot.ready, true);
    const coldMeshes = meshes(cold.root), hotMeshes = meshes(hot.root);
    assert.equal(coldMeshes.length, 18, 'three winch meshes and five three-part pads remain');
    assert.equal(hotMeshes.length, 18);
    const coldMaterials = new Set(coldMeshes.map((mesh) => mesh.material));
    const hotMaterials = new Set(hotMeshes.map((mesh) => mesh.material));
    assert.equal(coldMaterials.size, 4, 'one private clone per source material');
    assert.equal(hotMaterials.size, 4);
    for (const material of coldMaterials) {
      assert.ok(!hotMaterials.has(material), 'another rig owns different mutable materials');
      assert.ok(!f.source.includes(material), 'decoded source materials stay untouched');
    }
    assert.equal(coldMeshes[3].material.onBeforeCompile, f.hook);
    assert.equal(coldMeshes[3].material.customProgramCacheKey, f.key);

    const coldPlayer = { alive: true, view: { root: new THREE.Group() } };
    const hotPlayer = { alive: true, view: { root: new THREE.Group() } };
    assert.equal(cold.update(coldPlayer), true);
    assert.equal(hot.update(hotPlayer), true);
    assert.notEqual(coldMeshes[3].material.emissive.getHex(), hotMeshes[3].material.emissive.getHex(),
      'heat updates remain independent between rigs');
    assert.equal(f.source[1].emissive.getHex(), 0x102031);
    assert.equal(f.source[1].emissiveIntensity, 0.3);

    const disposalCounts = new Map([...coldMaterials].map((material) => [material, 0]));
    let siblingDisposals = 0, sourceDisposals = 0;
    for (const material of coldMaterials) material.addEventListener('dispose', () => disposalCounts.set(material, disposalCounts.get(material) + 1));
    for (const material of hotMaterials) material.addEventListener('dispose', () => { siblingDisposals++; });
    for (const material of f.source) material.addEventListener('dispose', () => { sourceDisposals++; });
    cold.dispose();
    cold.dispose();
    assert.deepEqual([...disposalCounts.values()], [1, 1, 1, 1]);
    assert.equal(siblingDisposals, 0, 'disposing one rig does not dispose the other');
    assert.equal(sourceDisposals, 0, 'disposing a rig does not dispose its source');
    assert.equal(hot.update(hotPlayer), true, 'the other rig remains usable');
  } finally {
    cold.dispose(); hot.dispose();
    f.geometry.dispose();
    for (const material of f.source) material.dispose();
  }
});

test('multi-material primitives share duplicate slots only when an owner supplies a cache', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const source = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  const record = { primitives: [{ name: 'LOD0_multi', geometry,
    material: [source[0], source[0], source[1]], matrix: new THREE.Matrix4() }] };
  const shared = [], independent = [];
  try {
    const cached = lineHardwarePart(record, 'cached', shared, new Map()).children[0].material;
    assert.equal(cached[0], cached[1]);
    assert.notEqual(cached[0], cached[2]);
    assert.equal(shared.length, 2);
    const uncached = lineHardwarePart(record, 'uncached', independent).children[0].material;
    assert.notEqual(uncached[0], uncached[1], 'the original helper contract remains available');
    assert.equal(independent.length, 3);
  } finally {
    geometry.dispose();
    for (const material of [...shared, ...independent, ...source]) material.dispose();
  }
});
