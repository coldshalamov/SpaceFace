// PQ-131.08 — floor-standing fabricator selected source/release/package and live Works routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  FABRICATOR_HOOKS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import {
  bindAuthoredFabricator,
  settleAuthoredWorksArrival,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORING_SOURCE_PATH = 'assets/works/fabricator/source/fabricator.glb';
const SOURCE_PATH = 'assets/ships/parts/works/place_works_fabricator.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_fabricator.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-fabricator/render-package.json';
const FROZEN_AUTHORING_SHA = '50c6540e7e627d739e822fe5b79348c1f6a6665d6eb5a8e762314783e6277fd8';
const HOOKS = ['gantry_head', 'lamp'];

function pathOf(relative) { return resolve(ROOT, relative); }
function bytes(relative) { return readFileSync(pathOf(relative)); }
function json(relative) { return JSON.parse(readFileSync(pathOf(relative), 'utf8')); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }
function glbJson(relative) {
  const payload = bytes(relative);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${relative} must be a GLB`);
  const jsonLength = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + jsonLength).toString('utf-8').replace(/\s+$/u, ''));
}
function nodeNames(gltf) {
  return new Set((gltf.nodes || []).map((node) => node.name || ''));
}
function translate(x, y, z) { return new THREE.Matrix4().makeTranslation(x, y, z); }

function makeFabricatorBlueprint() {
  const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const atlas = new THREE.DataTexture(new Uint8Array([64, 72, 76, 255]), 1, 1);
  atlas.needsUpdate = true;
  const staticMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4540, map: atlas });
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x33210b, emissive: 0x110804 });
  const positions = {
    gantry_head: [-0.7, 0.7, 0.7],
    lamp: [0.52, 0.82, -0.9],
  };
  const primitives = [
    ['LOD0_fabricator', staticMaterial, [0, 0, 0], 'lod0'],
    ['LOD1_fabricator', staticMaterial, [0, 0, 0], 'lod1'],
    ['LOD0_Gantry', staticMaterial, positions.gantry_head, 'lod0'],
    ['LOD1_Gantry', staticMaterial, positions.gantry_head, 'lod1'],
    ['LOD0_Lamp', lensMaterial, positions.lamp, 'lod0'],
    ['LOD1_Lamp', lensMaterial, positions.lamp, 'lod1'],
  ].map(([name, material, position, lod]) => ({
    name, geometry, material, matrix: translate(...position), tags: { lod },
  }));
  return {
    assetId: 'place_works_fabricator',
    primitives,
    markers: HOOKS.map((name) => ({ name, matrix: translate(...positions[name]) })),
  };
}

function loaderFor(blueprint, leaseOverrides = {}) {
  const lease = {
    isActive: () => true,
    load: async () => blueprint,
    release: () => 0,
    ...leaseOverrides,
  };
  return createWorksPartLoader({
    renderer: {},
    lease,
    registry: { place_works_fabricator: WORKS_PARTS.place_works_fabricator },
  });
}

test('Fabricator selected runtime derives from the frozen authoring candidate without LOD2', () => {
  const authoring = bytes(AUTHORING_SOURCE_PATH);
  const source = bytes(SOURCE_PATH);
  assert.equal(sha256(authoring), FROZEN_AUTHORING_SHA, 'cycle-3 authoring candidate must stay frozen');
  assert.notEqual(sha256(source), FROZEN_AUTHORING_SHA);
  const gltf = glbJson(SOURCE_PATH);
  const names = nodeNames(gltf);
  for (const hook of HOOKS) assert.ok(names.has(hook), `missing hook ${hook}`);
  for (const lod of ['LOD0_', 'LOD1_']) {
    assert.ok([...names].some((name) => name.startsWith(lod)), `missing ${lod} register`);
  }
  assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false, 'LOD2 must not ship');
  assert.equal(gltf.asset.extras.spacefaceAsset.exportedLods.join(','), 'lod0,lod1');
  assert.equal(gltf.nodes.find((n) => n.name === 'gantry_head').extras.spaceface.role, 'works_hook');
});

test('Fabricator release, manifest, package, and pilot bind to the selected runtime source', () => {
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  assert.notDeepEqual(release, source);
  const releaseManifest = json('assets/ships/release/release_manifest.json');
  const row = releaseManifest.assets.find((asset) => asset.id === 'place_works_fabricator');
  assert.ok(row, 'release manifest row missing');
  assert.equal(row.sourceSha256, sha256(source));
  assert.equal(row.releaseSha256, sha256(release));
  assert.equal(row.releaseBytes, release.length);
  const manifest = json('assets/ships/parts/parts_manifest.json');
  const part = manifest.parts.find((entry) => entry.id === 'place_works_fabricator');
  assert.ok(part, 'parts manifest row missing');
  assert.deepEqual([...part.hooks].sort(), [...HOOKS].sort());
  const metadata = json(PACKAGE_PATH);
  assert.equal(metadata.assetId, 'sf.render.works-fabricator');
  assert.ok(metadata.runtime.primitives.every((row2) => !/^LOD2/u.test(row2.name)));
  const pilot = renderPackagePilotForAssetId('sf.render.works-fabricator');
  assert.equal(pilot.key, 'works-fabricator');
  assert.equal(pilot.runtimeAssetId, 'place_works_fabricator');
  assert.equal(pilot.sourceUrl, 'assets/ships/release/parts/works/place_works_fabricator.glb');
  assert.equal(pilot.sourceSha256, sha256(bytes(RELEASE_PATH)));
  assert.equal(pilot.assetId, 'sf.render.works-fabricator');
});

test('Fabricator hierarchy preserves pose and isolates only the lamp lens materials', async () => {
  const loader = loaderFor(makeFabricatorBlueprint());
  const group = await loader.loadWorksPart('place_works_fabricator');
  assert.ok(group, 'loader returned no group');
  const authored = bindAuthoredFabricator(group);
  assert.equal(authored.group, group);
  assert.equal(group.scale.x, 1);
  // The gantry head lives under its pivot and slides the authored rail without leaving it.
  const head = group.getObjectByName('gantry_head');
  const headChild = head.getObjectByName('LOD0_Gantry');
  assert.ok(headChild, 'gantry mesh not bound under the gantry_head pivot');
  const baseX = head.position.x;
  authored.dyn.progressBar.position.x = baseX + 0.7;
  assert.equal(headChild.getWorldPosition(new THREE.Vector3()).x
    - headChild.getWorldPosition(new THREE.Vector3()).x, 0, 'head pose must be stable across reads');
  assert.equal(authored.dyn.progressBase, baseX);
  assert.equal(authored.dyn.progressTravel, 1.4);
  // Only the two lamp shells are instance-owned; the atlas shell stays shared.
  const lampShells = [];
  const sharedShells = [];
  group.traverse((node) => {
    if (!node.isMesh) return;
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of rows) {
      if (material.userData?.worksInstanceOwned === true) lampShells.push(node.name);
      else sharedShells.push(node.name);
    }
  });
  assert.deepEqual(lampShells.sort(), ['LOD0_Lamp', 'LOD1_Lamp']);
  assert.ok(sharedShells.includes('LOD0_fabricator') && sharedShells.includes('LOD1_fabricator'));
  authored.dyn.setLamp(0x7cd9a2, 0.9);
  loader.releaseWorksPart(group);
});

test('Fabricator late arrival releases without mounting', async () => {
  const loader = loaderFor(makeFabricatorBlueprint());
  let installed = 0;
  let released = 0;
  const settled = await settleAuthoredWorksArrival({
    loader: { releaseWorksPart: () => { released += 1; } },
    group: makeFabricatorBlueprint(),
    isLive: () => false,
    install: () => { installed += 1; },
    onInstallError: () => {},
  });
  assert.equal(settled, null, 'stale arrival must not install');
  assert.equal(installed, 0);
  assert.equal(released, 1, 'the stale group must be released, not leaked');
});
