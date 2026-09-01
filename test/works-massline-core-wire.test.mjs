// PQ-131.02 — Massline Core source/release/package and installed/ghost ownership contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import {
  WORKS_PARTS,
  bindMasslineCoreHookHierarchy,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import { settleAuthoredWorksArrival } from '../src/ui/asteroid/asteroidRenderer3d.js';

const ROOT = new URL('../', import.meta.url);
const SOURCE_PATH = 'assets/ships/parts/works/place_works_massline_core.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_massline_core.glb';
const PACKAGE_META_PATH = 'assets/ships/release/render-packages/works-massline-core/render-package.json';
const PACKAGE_GLB_PATH = 'assets/ships/release/render-packages/works-massline-core/render.glb';
const HOOKS = ['ring_spin', 'lamp'];

function pathUrl(path) { return new URL(path, ROOT); }
function bytes(path) { return readFileSync(pathUrl(path)); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }

function glbJson(path) {
  const payload = bytes(path);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${path} must be a GLB`);
  let offset = 12;
  while (offset + 8 <= payload.length) {
    const length = payload.readUInt32LE(offset);
    const type = payload.readUInt32LE(offset + 4);
    const chunk = payload.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) return JSON.parse(chunk.toString('utf8').replace(/\s+$/u, ''));
    offset += 8 + length;
  }
  throw new Error(`${path} contains no JSON chunk`);
}

function names(gltf) { return new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean)); }
function matrixDelta(a, b) {
  return Math.max(...a.elements.map((value, index) => Math.abs(value - b.elements[index])));
}

function makeCoreBlueprint() {
  const material = new THREE.MeshStandardMaterial({ color: 0x808080, emissive: 0x111111 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const translate = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  return {
    assetId: 'place_works_massline_core',
    primitives: [
      ...['LOD0', 'LOD1'].flatMap((lod) => [
        { name: `${lod}_massline_core`, geometry, material, matrix: translate(0, 0, 0), tags: { lod: lod.toLowerCase() } },
        { name: `${lod}_massline_core_spin`, geometry, material, matrix: translate(0, 0, 0.5), tags: { lod: lod.toLowerCase() } },
        { name: `${lod}_massline_core_lamp`, geometry, material, matrix: translate(0.18, 0.892, 0.362), tags: { lod: lod.toLowerCase() } },
      ]),
    ],
    markers: [
      { name: 'ring_spin', matrix: translate(0, 0, 0.5) },
      { name: 'lamp', matrix: translate(0.18, 0.892, 0.362) },
    ],
  };
}

test('Core source, selected release, and render package are content-addressed to one exact candidate', () => {
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  const packageMetadata = JSON.parse(readFileSync(pathUrl(PACKAGE_META_PATH), 'utf8'));
  const parts = JSON.parse(readFileSync(pathUrl('assets/ships/parts/parts_manifest.json'), 'utf8'));
  const releases = JSON.parse(readFileSync(pathUrl('assets/ships/release/release_manifest.json'), 'utf8'));
  const pilots = JSON.parse(readFileSync(pathUrl('assets/ships/render-packages/pilots.json'), 'utf8'));
  const part = parts.parts.find((row) => row.id === 'place_works_massline_core');
  const releaseRow = releases.assets.find((row) => row.id === 'place_works_massline_core');
  const pilot = pilots.pilots.find((row) => row.key === 'works-massline-core');

  assert.ok(part);
  assert.ok(releaseRow);
  assert.ok(pilot);
  assert.equal(part.file, 'works/place_works_massline_core.glb');
  assert.equal(part.bytes, source.length);
  assert.equal(releaseRow.source, SOURCE_PATH);
  assert.equal(releaseRow.release, RELEASE_PATH);
  assert.equal(releaseRow.sourceSha256, sha256(source));
  assert.equal(releaseRow.releaseSha256, sha256(release));
  assert.equal(pilot.runtimeAssetId, 'place_works_massline_core');
  assert.equal(pilot.sourceUrl, RELEASE_PATH);
  assert.equal(pilot.releaseSha256, sha256(release));
  assert.equal(packageMetadata.provenance?.sourceGlb?.sha256, sha256(release));
  assert.equal(packageMetadata.provenance?.sourceGlb?.bytes, release.length);
});

test('Core selected source/release/package keep exact hooks and only LOD0/work + LOD1/site', () => {
  for (const path of [SOURCE_PATH, RELEASE_PATH, PACKAGE_GLB_PATH]) {
    const gltf = glbJson(path);
    const nodeNames = names(gltf);
    for (const hook of HOOKS) assert.ok(nodeNames.has(hook), `${path} must expose ${hook}`);
    for (const lod of ['LOD0', 'LOD1']) {
      assert.ok(nodeNames.has(`${lod}_massline_core`), `${path} must expose ${lod} body`);
      assert.ok(nodeNames.has(`${lod}_massline_core_spin`), `${path} must expose ${lod} spin mesh`);
      assert.ok(nodeNames.has(`${lod}_massline_core_lamp`), `${path} must expose ${lod} lamp mesh`);
    }
    assert.equal([...nodeNames].some((name) => /^LOD2(?:_|$)/u.test(name)), false,
      `${path} must not ship authoring-only LOD2`);
  }
  const contract = glbJson(SOURCE_PATH).asset?.extras?.spacefaceAsset;
  assert.equal(contract?.assetId, 'place_works_massline_core');
  assert.deepEqual(contract?.exportedLods, ['lod0', 'lod1']);
  assert.deepEqual(WORKS_PARTS.place_works_massline_core.hooks, HOOKS);
});

test('Core hook binding reparents both live LOD meshes without changing their world poses', async () => {
  const blueprint = makeCoreBlueprint();
  const material = blueprint.primitives[0].material;
  const lease = { isActive: () => true, load: async () => blueprint, release: () => 0 };
  const loader = createWorksPartLoader({
    renderer: {}, lease,
    registry: { place_works_massline_core: WORKS_PARTS.place_works_massline_core },
  });
  const group = await loader.loadWorksPart('place_works_massline_core');
  assert.ok(group);
  for (const name of ['LOD0_massline_core', 'LOD0_massline_core_spin', 'LOD0_massline_core_lamp']) {
    assert.equal(group.getObjectByName(name).visible, true, `${name} is visible at work`);
  }
  for (const name of ['LOD1_massline_core', 'LOD1_massline_core_spin', 'LOD1_massline_core_lamp']) {
    assert.equal(group.getObjectByName(name).visible, false, `${name} is hidden at work`);
  }
  loader.setRegister('site');
  for (const name of ['LOD0_massline_core', 'LOD0_massline_core_spin', 'LOD0_massline_core_lamp']) {
    assert.equal(group.getObjectByName(name).visible, false, `${name} is hidden at site`);
  }
  for (const name of ['LOD1_massline_core', 'LOD1_massline_core_spin', 'LOD1_massline_core_lamp']) {
    assert.equal(group.getObjectByName(name).visible, true, `${name} is visible at site`);
  }
  loader.setRegister('work');
  assert.equal(group.getObjectByName('LOD0_massline_core').visible, true);
  assert.equal(group.getObjectByName('LOD1_massline_core').visible, false);
  group.updateWorldMatrix(true, true);
  const before = Object.fromEntries(['LOD0_massline_core_spin', 'LOD1_massline_core_spin', 'LOD0_massline_core_lamp', 'LOD1_massline_core_lamp']
    .map((name) => [name, group.getObjectByName(name).matrixWorld.clone()]));
  // Bind once more to prove the public helper preserves an already-correct world pose too.
  bindMasslineCoreHookHierarchy(group);
  group.updateWorldMatrix(true, true);
  for (const [name, matrix] of Object.entries(before)) {
    assert.ok(matrixDelta(matrix, group.getObjectByName(name).matrixWorld) <= 1e-6, `${name} world pose changed`);
  }
  assert.equal(group.getObjectByName('LOD0_massline_core_spin').parent.name, 'ring_spin');
  assert.equal(group.getObjectByName('LOD1_massline_core_lamp').parent.name, 'lamp');
  assert.notEqual(group.getObjectByName('LOD0_massline_core_lamp').material, material,
    'lamp shell is instance-owned, never the blueprint material');
  const second = await loader.loadWorksPart('place_works_massline_core');
  const lampA = group.getObjectByName('LOD0_massline_core_lamp').material;
  const lampB = second.getObjectByName('LOD0_massline_core_lamp').material;
  const bodyA = group.getObjectByName('LOD0_massline_core').material;
  const bodyAColor = bodyA.color.clone();
  const lampBEmissive = lampB.emissive.clone();
  lampA.emissive.setHex(0x7cd9a2);
  lampA.emissiveIntensity = 1.2;
  assert.ok(bodyA.color.equals(bodyAColor), 'Core A lamp change cannot repaint Core A body atlas shell');
  assert.ok(lampB.emissive.equals(lampBEmissive), 'Core A lamp change cannot repaint Core B lamp shell');
  loader.releaseWorksPart(group);
  loader.releaseWorksPart(group);
  assert.equal(loader.stats().released, 1, 'duplicate release is idempotent');
  loader.releaseWorksPart(second);
});

test('deferred Core combined-URL work/site/work resolves once at the final register', async () => {
  const blueprint = makeCoreBlueprint();
  const resolves = [];
  const urls = [];
  const lease = {
    isActive: () => true,
    load(url) {
      urls.push(url);
      return new Promise((resolve) => resolves.push(resolve));
    },
    release: () => 0,
  };
  const loader = createWorksPartLoader({
    renderer: {}, lease,
    registry: { place_works_massline_core: WORKS_PARTS.place_works_massline_core },
  });
  const pending = loader.loadWorksPart('place_works_massline_core');
  loader.setRegister('site');
  resolves[0](blueprint);
  await Promise.resolve();
  await Promise.resolve();
  // The old retry path has now requested the same combined URL a second time.
  // The corrected path has already consumed it and keeps the group live.
  loader.setRegister('work');
  resolves[1]?.(blueprint);
  const group = await pending;
  assert.ok(group, 'the combined Core blueprint must not disappear after a work/site/work flip');
  assert.equal(urls.length, 1, 'same URL must instantiate rather than consume a retry');
  assert.equal(group.userData.worksNodeLod, 'lod0');
  assert.equal(group.getObjectByName('LOD0_massline_core').visible, true);
  assert.equal(group.getObjectByName('LOD1_massline_core').visible, false);
});

test('deferred differing LOD URLs still retry to the changed register', async () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
  const blueprint = {
    assetId: 'works_switching_fixture',
    primitives: [
      { name: 'LOD0_Body', geometry, material, matrix: new THREE.Matrix4(), tags: { lod: 'lod0' } },
      { name: 'LOD1_Body', geometry, material, matrix: new THREE.Matrix4(), tags: { lod: 'lod1' } },
    ],
    markers: [],
  };
  const resolves = [];
  const urls = [];
  const lease = {
    isActive: () => true,
    load(url) {
      urls.push(url);
      return new Promise((resolve) => resolves.push(resolve));
    },
    release: () => 0,
  };
  const loader = createWorksPartLoader({
    renderer: {}, lease,
    registry: {
      works_switching_fixture: { lod0: 'work.glb', lod1: 'site.glb', slot: 'place', hooks: [] },
    },
  });
  const pending = loader.loadWorksPart('works_switching_fixture');
  loader.setRegister('site');
  resolves[0](blueprint);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(urls, ['work.glb', 'site.glb']);
  resolves[1](blueprint);
  const group = await pending;
  assert.ok(group);
  assert.equal(group.userData.worksNodeLod, 'lod1');
  assert.equal(group.getObjectByName('LOD0_Body').visible, false);
  assert.equal(group.getObjectByName('LOD1_Body').visible, true);
});

test('late authored Core arrivals are released and never installed after their record or ghost is gone', () => {
  const lateGroup = new THREE.Group();
  let released = 0;
  let installed = 0;
  const settled = settleAuthoredWorksArrival({
    loader: { releaseWorksPart(group) { assert.equal(group, lateGroup); released += 1; } },
    group: lateGroup,
    isLive: () => false,
    install() { installed += 1; },
  });
  assert.equal(settled, null);
  assert.equal(released, 1, 'a stale late group is released exactly once');
  assert.equal(installed, 0, 'a stale late group never mounts into the replacement record/ghost');
});

test('Core runtime mounts authored installed and ghost paths without per-frame material recompiles', () => {
  const renderer = readFileSync(pathUrl('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const loader = readFileSync(pathUrl('src/ui/asteroid/worksPartLoader.js'), 'utf8');
  const preview = readFileSync(pathUrl('src/render/asteroidInteriorPreview.js'), 'utf8');
  const dyn = renderer.slice(renderer.indexOf('function authoredCoreDyn'), renderer.indexOf('function installAuthoredCore'));
  const ghost = renderer.slice(renderer.indexOf('function tintGhost'), renderer.indexOf('function ensureGhost'));
  assert.match(renderer, /loadWorksPart\('place_works_massline_core'\)/u);
  assert.match(renderer, /beginAuthoredCoreGhost/u);
  assert.match(renderer, /settleAuthoredWorksArrival\(/u);
  assert.match(renderer, /releaseWorksPart\(rec\.authoredGroup\)/u);
  assert.match(loader, /bindMasslineCoreHookHierarchy/u);
  assert.match(dyn, /const ringBaseY = hooks\.ring_spin\.rotation\.y/u);
  assert.match(dyn, /hooks\.ring_spin\.rotation\.y = ringBaseY \+ angle/u);
  assert.doesNotMatch(dyn, /needsUpdate/u);
  assert.doesNotMatch(ghost, /needsUpdate/u);
  assert.doesNotMatch(preview, /kind === 'core'/u);
});
