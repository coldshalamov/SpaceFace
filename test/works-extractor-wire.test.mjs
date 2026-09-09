// PQ-131.03 — Extractor source/release/package and Asteroid Works lifecycle contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  EXTRACTOR_HOOKS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import {
  bindAuthoredExtractor,
  settleAuthoredWorksArrival,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORING_SOURCE_PATH = 'assets/works/extractor/source/extractor.glb';
const SOURCE_PATH = 'assets/ships/parts/works/place_works_extractor.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_extractor.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-extractor/render-package.json';
const REVIEWED_SOURCE_SHA = '3e071a9a7a143480af6a09088f032207153d441d4a0d3e0409bd5eba21d92ba8';
const HOOKS = ['head_face', 'belt', 'lamp'];

function pathOf(relative) { return resolve(ROOT, relative); }
function bytes(relative) { return readFileSync(pathOf(relative)); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }
function json(relative) { return JSON.parse(readFileSync(pathOf(relative), 'utf8')); }

function glbJson(relative) {
  const payload = bytes(relative);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${relative} must be a GLB`);
  let offset = 12;
  while (offset + 8 <= payload.length) {
    const length = payload.readUInt32LE(offset);
    const type = payload.readUInt32LE(offset + 4);
    const chunk = payload.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) return JSON.parse(chunk.toString('utf8').replace(/\s+$/u, ''));
    offset += 8 + length;
  }
  throw new Error(`${relative} has no JSON chunk`);
}

function names(gltf) { return new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean)); }
function matrixDelta(left, right) {
  return Math.max(...left.elements.map((value, index) => Math.abs(value - right.elements[index])));
}
function translate(x, y, z) { return new THREE.Matrix4().makeTranslation(x, y, z); }

function makeExtractorBlueprint() {
  const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const beltSampler = (rgba) => {
    const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
    texture.needsUpdate = true;
    return texture;
  };
  const beltBase = beltSampler([18, 18, 18, 255]);
  const beltNormal = beltSampler([128, 128, 255, 255]);
  const beltOrm = beltSampler([180, 210, 12, 255]);
  const body = new THREE.MeshStandardMaterial({ color: 0x6d7075, emissive: 0x050505 });
  const belt = new THREE.MeshStandardMaterial({
    color: 0x161616,
    map: beltBase,
    normalMap: beltNormal,
    aoMap: beltOrm,
    roughnessMap: beltOrm,
    metalnessMap: beltOrm,
  });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffbc58, emissive: 0x111111 });
  const primitives = [
    ['LOD0_extractor', body, [0, 0, 0], 'lod0'],
    ['LOD1_extractor', body, [0, 0, 0], 'lod1'],
    ['LOD0_head', body, [0.50, 0.26, 0], 'lod0'],
    ['LOD1_head', body, [0.49, 0.25, 0], 'lod1'],
    ['LOD0_belt', belt, [-0.10, 0.11, 0], 'lod0'],
    ['LOD1_belt', belt, [-0.11, 0.12, 0], 'lod1'],
    ['LOD0_lamp', lamp, [0.24, 0.54, -0.73], 'lod0'],
    ['LOD0_lamp_lens', lamp, [0.34, 0.55, -0.73], 'lod0'],
    ['LOD1_lamp', lamp, [0.24, 0.54, -0.73], 'lod1'],
    ['LOD1_lamp_lens', lamp, [0.34, 0.55, -0.73], 'lod1'],
  ].map(([name, material, position, lod]) => ({
    name,
    geometry,
    material,
    matrix: translate(...position),
    tags: { lod },
  }));
  return {
    assetId: 'place_works_extractor',
    primitives,
    markers: [
      { name: 'head_face', matrix: translate(0.42, 0.30, 0) },
      { name: 'belt', matrix: translate(-0.08, 0.17, 0) },
      { name: 'lamp', matrix: translate(0.28, 0.55, -0.73) },
    ],
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
    registry: { place_works_extractor: WORKS_PARTS.place_works_extractor },
  });
}

test('Extractor selected source, release, package, and pilot bind to the independently reviewed source', () => {
  const authoringSource = bytes(AUTHORING_SOURCE_PATH);
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  const parts = json('assets/ships/parts/parts_manifest.json');
  const releases = json('assets/ships/release/release_manifest.json');
  const pilots = json('assets/ships/render-packages/pilots.json');
  const packageMetadata = json(PACKAGE_PATH);
  const part = parts.parts.find((row) => row.id === 'place_works_extractor');
  const releaseRow = releases.assets.find((row) => row.id === 'place_works_extractor');
  const pilot = pilots.pilots.find((row) => row.key === 'works-extractor');

  assert.equal(sha256(authoringSource), REVIEWED_SOURCE_SHA,
    'the complete authoring source remains the independently reviewed candidate');
  assert.notEqual(sha256(source), REVIEWED_SOURCE_SHA,
    'the selected source is intentionally narrower because it excludes authoring-only LOD2');
  assert.ok(part);
  assert.ok(releaseRow);
  assert.ok(pilot);
  assert.equal(part.file, 'works/place_works_extractor.glb');
  assert.equal(part.bytes, source.length);
  assert.equal(releaseRow.source, SOURCE_PATH);
  assert.equal(releaseRow.release, RELEASE_PATH);
  assert.equal(releaseRow.sourceSha256, sha256(source));
  assert.equal(releaseRow.releaseSha256, sha256(release));
  assert.equal(releaseRow.ktx2Textures, releaseRow.textures);
  assert.ok(releaseRow.meshoptBufferViews > 0);
  assert.equal(pilot.runtimeAssetId, 'place_works_extractor');
  assert.equal(pilot.sourceUrl, RELEASE_PATH);
  assert.equal(pilot.releaseSha256, sha256(release));
  assert.equal(packageMetadata.provenance.sourceGlb.sha256, sha256(release));
  assert.equal(packageMetadata.provenance.sourceGlb.bytes, release.length);
  assert.equal(renderPackagePilotForAssetId('sf.render.works-extractor')?.sourceUrl, RELEASE_PATH);
});

test('Extractor ships only LOD0/work and LOD1/site, with all three functional hooks', () => {
  for (const relative of [SOURCE_PATH, RELEASE_PATH]) {
    const gltf = glbJson(relative);
    const nodeNames = names(gltf);
    for (const hook of HOOKS) assert.ok(nodeNames.has(hook), `${relative} exposes ${hook}`);
    for (const lod of ['LOD0', 'LOD1']) {
      for (const suffix of ['extractor', 'head', 'belt', 'lamp', 'lamp_lens']) {
        assert.ok(nodeNames.has(`${lod}_${suffix}`), `${relative} exposes ${lod}_${suffix}`);
      }
    }
    assert.equal([...nodeNames].some((name) => /^LOD2(?:_|$)/u.test(name)), false,
      `${relative} must exclude evidence-only LOD2`);
    const contract = gltf.asset?.extras?.spacefaceAsset;
    assert.deepEqual(contract?.exportedLods, ['lod0', 'lod1']);
  }
  const metadata = json(PACKAGE_PATH);
  assert.deepEqual(metadata.runtime.markers.map((marker) => marker.name).sort(), [...HOOKS].sort());
  assert.deepEqual([...new Set(metadata.runtime.primitives.map((row) => row.tags?.lod))].sort(), ['lod0', 'lod1']);
  assert.equal(metadata.runtime.primitives.some((row) => /^LOD2(?:_|$)/u.test(row.name)), false);
  assert.deepEqual(EXTRACTOR_HOOKS, HOOKS);
});

test('Extractor hierarchy preserves flattened world poses, isolates lamp and belt state, and switches LOD', async () => {
  const blueprint = makeExtractorBlueprint();
  const loader = loaderFor(blueprint);
  const group = await loader.loadWorksPart('place_works_extractor');
  assert.ok(group);
  group.updateWorldMatrix(true, true);
  const before = Object.fromEntries(blueprint.primitives.map((primitive) => [
    primitive.name,
    new THREE.Matrix4().fromArray(primitive.matrix.elements),
  ]));
  for (const [name, expected] of Object.entries(before)) {
    assert.ok(matrixDelta(expected, group.getObjectByName(name).matrixWorld) <= 1e-6, `${name} world pose changed`);
  }
  for (const name of ['LOD0_head', 'LOD1_head']) assert.equal(group.getObjectByName(name).parent.name, 'head_face');
  for (const name of ['LOD0_belt', 'LOD1_belt']) assert.equal(group.getObjectByName(name).parent.name, 'belt');
  for (const name of ['LOD0_lamp', 'LOD0_lamp_lens', 'LOD1_lamp', 'LOD1_lamp_lens']) {
    assert.equal(group.getObjectByName(name).parent.name, 'lamp');
  }
  assert.equal(group.getObjectByName('LOD0_extractor').visible, true);
  assert.equal(group.getObjectByName('LOD1_extractor').visible, false);
  loader.setRegister('site');
  assert.equal(group.getObjectByName('LOD0_extractor').visible, false);
  assert.equal(group.getObjectByName('LOD1_extractor').visible, true);

  const second = await loader.loadWorksPart('place_works_extractor');
  const built = bindAuthoredExtractor(group);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up source is seated into the Works XY plane');
  const body = group.getObjectByName('LOD0_extractor').material;
  const lampLensA0 = group.getObjectByName('LOD0_lamp_lens').material;
  const lampLensA1 = group.getObjectByName('LOD1_lamp_lens').material;
  const lampLensB = second.getObjectByName('LOD0_lamp_lens').material;
  const lampHousingA0 = group.getObjectByName('LOD0_lamp').material;
  const lampHousingA1 = group.getObjectByName('LOD1_lamp').material;
  const beltMaterialA = group.getObjectByName('LOD0_belt').material;
  const beltMaterialB = second.getObjectByName('LOD0_belt').material;
  const beltSamplersA = [
    beltMaterialA.map,
    beltMaterialA.normalMap,
    beltMaterialA.aoMap,
    beltMaterialA.roughnessMap,
    beltMaterialA.metalnessMap,
  ];
  const beltSamplersB = [
    beltMaterialB.map,
    beltMaterialB.normalMap,
    beltMaterialB.aoMap,
    beltMaterialB.roughnessMap,
    beltMaterialB.metalnessMap,
  ];
  assert.notEqual(lampLensA0, lampLensB, 'each Extractor owns its lamp lens shell');
  for (let index = 0; index < beltSamplersA.length; index += 1) {
    assert.notEqual(beltSamplersA[index], beltSamplersB[index], `belt sampler ${index} is instance-owned`);
  }
  const bodyColor = body.color.clone();
  const lampHousingA0Color = lampHousingA0.color.clone();
  const lampHousingA0Emission = lampHousingA0.emissive.clone();
  const lampHousingA1Color = lampHousingA1.color.clone();
  const lampHousingA1Emission = lampHousingA1.emissive.clone();
  const lampLensBEmission = lampLensB.emissive.clone();
  built.dyn.setLamp(0xff6242, 0.62);
  assert.ok(body.color.equals(bodyColor), 'lamp status cannot repaint frame materials');
  assert.equal(lampLensA0.emissive.getHex(), 0xff6242, 'LOD0 lamp lens receives status emission');
  assert.equal(lampLensA1.emissive.getHex(), 0xff6242, 'LOD1 lamp lens receives status emission');
  assert.ok(lampHousingA0.color.equals(lampHousingA0Color), 'LOD0 lamp housing keeps authored color');
  assert.ok(lampHousingA0.emissive.equals(lampHousingA0Emission), 'LOD0 lamp housing keeps authored emission');
  assert.ok(lampHousingA1.color.equals(lampHousingA1Color), 'LOD1 lamp housing keeps authored color');
  assert.ok(lampHousingA1.emissive.equals(lampHousingA1Emission), 'LOD1 lamp housing keeps authored emission');
  assert.ok(lampLensB.emissive.equals(lampLensBEmission), 'lamp status cannot repaint another Extractor');
  built.dyn.setBeltPhase(0.625, true);
  for (const sampler of beltSamplersA) {
    assert.ok(Math.abs(sampler.offset.x - 0.625) < 1e-8, 'running belt advances every sampler');
  }
  built.dyn.setBeltPhase(0.9, false);
  for (const sampler of beltSamplersA) {
    assert.ok(Math.abs(sampler.offset.x - 0.625) < 1e-8, 'reduced/stopped belt holds every sampler phase');
  }
  for (const sampler of beltSamplersB) {
    assert.equal(sampler.offset.x, 0, 'belt phase cannot leak across instances');
  }
  const headBase = built.dyn.pistonBase;
  built.dyn.piston.position.x = headBase - 0.12;
  assert.ok(Math.abs(built.dyn.piston.position.x - (headBase - 0.12)) < 1e-8,
    'head reciprocates from its authored base pose');

  loader.releaseWorksPart(group);
  loader.releaseWorksPart(group);
  assert.equal(loader.stats().released, 1, 'installed teardown is idempotent');
  loader.releaseWorksPart(second);
});

test('Extractor same-URL work/site/work race resolves once at the final register', async () => {
  const blueprint = makeExtractorBlueprint();
  const resolves = [];
  const urls = [];
  const loader = loaderFor(blueprint, {
    load(url) {
      urls.push(url);
      return new Promise((resolve) => resolves.push(resolve));
    },
  });
  const pending = loader.loadWorksPart('place_works_extractor');
  loader.setRegister('site');
  resolves[0](blueprint);
  await Promise.resolve();
  await Promise.resolve();
  loader.setRegister('work');
  const group = await pending;
  assert.ok(group);
  assert.equal(urls.length, 1, 'combined source must not reload on an equivalent URL race');
  assert.equal(group.userData.worksNodeLod, 'lod0');
  assert.equal(group.getObjectByName('LOD0_extractor').visible, true);
  assert.equal(group.getObjectByName('LOD1_extractor').visible, false);
  loader.releaseWorksPart(group);
});

test('Extractor late arrivals release without mounting, and loader disposal remains idempotent', async () => {
  const late = new THREE.Group();
  let released = 0;
  const settled = settleAuthoredWorksArrival({
    loader: { releaseWorksPart(group) { assert.equal(group, late); released += 1; } },
    group: late,
    isLive: () => false,
    install() { throw new Error('stale Extractor must not install'); },
  });
  assert.equal(settled, null);
  assert.equal(released, 1);

  const loader = loaderFor(makeExtractorBlueprint());
  const group = await loader.loadWorksPart('place_works_extractor');
  await loader.dispose('extractor-test');
  assert.equal(await loader.dispose('extractor-test-again'), 0, 'loader teardown is idempotent');
  assert.equal(group.userData.worksReleased, true);
});

test('Extractor installed and ghost paths are authored-only and do not request per-frame material recompiles', () => {
  const renderer = readFileSync(pathOf('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const loader = readFileSync(pathOf('src/ui/asteroid/worksPartLoader.js'), 'utf8');
  const preview = readFileSync(pathOf('src/render/asteroidInteriorPreview.js'), 'utf8');
  const capture = readFileSync(pathOf('scripts/capture-asteroid-works.mjs'), 'utf8');
  const bindStart = renderer.indexOf('export function bindAuthoredExtractor');
  const bindEnd = renderer.indexOf('/**', bindStart + 1);
  const updateStart = renderer.indexOf('if (rec.dyn.piston)');
  const updateEnd = renderer.indexOf('if (rec.dyn.furnace)', updateStart);
  const bind = renderer.slice(bindStart, bindEnd);
  const update = renderer.slice(updateStart, updateEnd);

  assert.match(renderer, /loadWorksPart\('place_works_extractor'\)/u);
  assert.match(renderer, /buildAuthoredExtractorAt/u);
  assert.match(renderer, /beginAuthoredExtractorGhost/u);
  assert.match(renderer, /settleAuthoredWorksArrival\(/u);
  assert.match(renderer, /releaseWorksPart\(rec\.authoredGroup\)/u);
  assert.match(renderer, /if \(id === 'place_works_extractor'\) bindAuthoredExtractor\(group\);/u,
    'the capture route must exercise the Extractor production binding');
  assert.match(renderer, /const transform = seatWorksProofGroup\(group\);/u,
    'the capture route must seat the selected release at the framed proof cell');
  assert.match(renderer, /if \(worksProofGroup && zoomRegister === 'work'\)/u,
    'the work-register proof must hold the camera on the mounted authored part');
  assert.doesNotMatch(renderer, /if \(!group\.parent\) scene\.add\(group\);/u,
    'the capture route cannot add an unseated Y-up GLB at scene origin');
  assert.match(capture, /returned an unseated capture mount/u,
    'the capture script must fail closed when the proof transform is absent');
  assert.match(loader, /bindWorksExtractorHookHierarchy/u);
  assert.match(bind, /const pistonBase = hooks\.head_face\.position\.x/u);
  assert.match(update, /rec\.dyn\.piston\.position\.x = rec\.dyn\.pistonBase - bob/u);
  assert.match(update, /setBeltPhase\(timeS \* 0\.58, running && !motionReduce\)/u);
  assert.doesNotMatch(bind, /needsUpdate/u);
  assert.doesNotMatch(update, /needsUpdate/u);
  assert.doesNotMatch(preview, /kind\s*===\s*['"]extractor['"]/u);
});
