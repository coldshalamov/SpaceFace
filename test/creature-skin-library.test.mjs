import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import {
  CREATURE_SKIN_ASSETS,
  CREATURE_SKIN_REPEAT,
  creatureSkin,
  getReadyCreatureSkins,
  preloadCreatureSkinLibrary,
} from '../src/render/creatureSkinLibrary.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { MACHINE_KINDS } from '../src/data/precursorMachines.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { buildMachineMesh } from '../src/render/machineVisuals.js';

function meshMaterials(root) {
  const out = [];
  root.traverse((node) => { if (node.isMesh) out.push(node.material); });
  return out;
}

const fauna = (speciesId) => buildFaunaMesh({ data: { strainId: 'charon_grave', ecology: { speciesId } } });
const machine = (kind) => buildMachineMesh({ data: { machine: { kind } } });

test('every skin map ships in the packaged release tree', () => {
  assert.deepEqual(Object.keys(CREATURE_SKIN_ASSETS), ['tissue', 'nacre']);
  for (const [skin, files] of Object.entries(CREATURE_SKIN_ASSETS)) {
    for (const [slot, url] of Object.entries(files)) {
      assert.match(url, /^\/assets\/ships\/release\//);
      assert.equal(existsSync(fileURLToPath(new URL(`..${url}`, import.meta.url))), true, `${skin}.${slot} is missing`);
    }
  }
});

test('before the skins decode, creatures and machines keep their flat colours', () => {
  assert.equal(getReadyCreatureSkins(), null);
  assert.equal(creatureSkin('tissue'), null);
  for (const material of meshMaterials(fauna('veil_ray'))) assert.equal(material.map, null);
  for (const material of meshMaterials(machine('custodian'))) assert.equal(material.map, null);
});

test('a failed decode publishes nothing and resolves null instead of throwing', async () => {
  const isolated = await import('../src/render/creatureSkinLibrary.js?skin-failure-contract');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await isolated.preloadCreatureSkinLibrary(null, { loadTexture: async () => { throw new Error('decode failed'); } }), null);
    assert.equal(isolated.getReadyCreatureSkins(), null);
  } finally {
    console.warn = warn;
  }
});

test('decoded skins are configured, warmed once each, and worn by every species and machine', async () => {
  const initialized = [];
  const skins = await preloadCreatureSkinLibrary({ initTexture: (texture) => initialized.push(texture) }, {
    loadTexture: async () => new THREE.Texture(),
  });
  assert.equal(getReadyCreatureSkins(), skins);
  assert.equal(initialized.length, 4, 'tissue and nacre, albedo and normal, each warmed exactly once');
  assert.equal(skins.tissue.baseColor.colorSpace, THREE.SRGBColorSpace);
  assert.equal(skins.tissue.normal.colorSpace, THREE.NoColorSpace, 'normal data is never colour-managed');
  assert.deepEqual(skins.tissue.baseColor.repeat.toArray(), CREATURE_SKIN_REPEAT.tissue);
  assert.deepEqual(skins.nacre.baseColor.repeat.toArray(), CREATURE_SKIN_REPEAT.nacre);
  for (const [u, v] of Object.values(CREATURE_SKIN_REPEAT)) {
    assert.equal(Number.isInteger(u) && Number.isInteger(v), true, 'integer repeats keep every wrap seam invisible');
  }

  let builtFauna = 0;
  for (const speciesId of Object.keys(FAUNA_SPECIES)) {
    const root = fauna(speciesId);
    if (!root) continue; // a species with no authored body (the carrier spawns from another builder)
    builtFauna++;
    const bodies = meshMaterials(root).filter((material) => material.map === skins.tissue.baseColor);
    assert.ok(bodies.length > 0, `${speciesId} must wear the tissue skin`);
    for (const material of bodies) assert.equal(material.normalMap, skins.tissue.normal);
  }
  assert.ok(builtFauna >= 18, `expected nearly every species to build, got ${builtFauna}`);
  // Most machines are pale-metal bodies; a few are built wholly from light or seam materials and wear no plating.
  let plated = 0;
  let builtMachines = 0;
  for (const kindId of Object.keys(MACHINE_KINDS)) {
    const root = machine(kindId);
    if (!root) continue;
    builtMachines++;
    if (meshMaterials(root).some((material) => material.map === skins.nacre.baseColor)) plated++;
  }
  assert.ok(builtMachines >= 12, `expected nearly every machine to build, got ${builtMachines}`);
  assert.ok(plated >= Math.ceil(builtMachines * 0.7), `most machines must wear nacre, got ${plated} of ${builtMachines}`);
});
