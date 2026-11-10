// PQ-131.04 — Refinery source/release/package and Asteroid Works lifecycle contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { PNG } from 'pngjs';

import {
  REFINERY_HOOKS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import {
  bindAuthoredRefinery,
  settleAuthoredWorksArrival,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORING_SOURCE_PATH = 'assets/works/refinery/source/refinery.glb';
const SOURCE_PATH = 'assets/ships/parts/works/place_works_refinery.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_refinery.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-refinery/render-package.json';
const REVIEWED_SOURCE_SHA = '55b35c4e28d23972e7e130bce35bd3d8a5aeec261ee022b992f5d1c490692795';
const HOOKS = ['furnace_slit', 'stack_vent', 'lamp'];

function pathOf(relative) { return resolve(ROOT, relative); }
function bytes(relative) { return readFileSync(pathOf(relative)); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }
function json(relative) { return JSON.parse(readFileSync(pathOf(relative), 'utf8')); }

function glbJson(relative) {
  const payload = bytes(relative);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${relative} must be a GLB`);
  const jsonLength = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + jsonLength).toString('utf8').replace(/\s+$/u, ''));
}

function embeddedPng(relative, gltf, imageIndex) {
  const payload = bytes(relative);
  let offset = 12;
  let binary = null;
  while (offset + 8 <= payload.length) {
    const length = payload.readUInt32LE(offset);
    const type = payload.readUInt32LE(offset + 4);
    if (type === 0x004e4942) binary = payload.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  assert.ok(binary, `${relative} has no binary GLB chunk`);
  const image = gltf.images[imageIndex];
  const view = gltf.bufferViews[image.bufferView];
  const start = view.byteOffset || 0;
  return PNG.sync.read(binary.subarray(start, start + view.byteLength));
}

function averageMaskedRgb(image, id, roleRgb) {
  const total = [0, 0, 0];
  let count = 0;
  for (let index = 0; index < id.data.length; index += 4) {
    const distance = (id.data[index] - roleRgb[0]) ** 2
      + (id.data[index + 1] - roleRgb[1]) ** 2
      + (id.data[index + 2] - roleRgb[2]) ** 2;
    if (distance >= 80) continue;
    total[0] += image.data[index];
    total[1] += image.data[index + 1];
    total[2] += image.data[index + 2];
    count += 1;
  }
  assert.ok(count > 0, 'expected a non-empty semantic atlas mask');
  return total.map((value) => value / count);
}

function nodeByName(gltf, name) {
  const node = (gltf.nodes || []).find((entry) => entry.name === name);
  assert.ok(node, `missing ${name}`);
  return node;
}

function matrixDelta(left, right) {
  return Math.max(...left.elements.map((value, index) => Math.abs(value - right.elements[index])));
}
function translate(x, y, z) { return new THREE.Matrix4().makeTranslation(x, y, z); }

function makeRefineryBlueprint() {
  const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const atlas = new THREE.DataTexture(new Uint8Array([64, 72, 76, 255]), 1, 1);
  atlas.needsUpdate = true;
  const jacket = new THREE.MeshStandardMaterial({ color: 0x59616a, map: atlas, emissive: 0x030303 });
  const furnace = new THREE.MeshStandardMaterial({ color: 0x321507, emissive: 0xff8a30, emissiveIntensity: 0.08 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf0b35c, emissive: 0x100804, emissiveIntensity: 0.12 });
  const primitives = [
    ['LOD0_refinery', jacket, [0, 0, 0], 'lod0'],
    ['LOD1_refinery', jacket, [0, 0, 0], 'lod1'],
    ['LOD0_furnace_slit', furnace, [-0.22, 0.292, -0.04], 'lod0'],
    ['LOD1_furnace_slit', furnace, [-0.22, 0.292, -0.04], 'lod1'],
    ['LOD0_lamp_lens', lamp, [0.31, 0.74, -0.65], 'lod0'],
    ['LOD1_lamp_lens', lamp, [0.31, 0.74, -0.65], 'lod1'],
  ].map(([name, material, position, lod]) => ({
    name,
    geometry,
    material,
    matrix: translate(...position),
    tags: { lod },
  }));
  return {
    assetId: 'place_works_refinery',
    primitives,
    markers: [
      { name: 'furnace_slit', matrix: translate(-0.22, 0.292, -0.04) },
      { name: 'stack_vent', matrix: translate(0.18, 1.12, -0.8) },
      { name: 'lamp', matrix: translate(0.31, 0.74, -0.65) },
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
    registry: { place_works_refinery: WORKS_PARTS.place_works_refinery },
  });
}

test('Refinery selected source, release, package, and pilot bind to the reviewed full authoring source', () => {
  const authoringSource = bytes(AUTHORING_SOURCE_PATH);
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  const parts = json('assets/ships/parts/parts_manifest.json');
  const releases = json('assets/ships/release/release_manifest.json');
  const pilots = json('assets/ships/render-packages/pilots.json');
  const packageMetadata = json(PACKAGE_PATH);
  const part = parts.parts.find((row) => row.id === 'place_works_refinery');
  const releaseRow = releases.assets.find((row) => row.id === 'place_works_refinery');
  const pilot = pilots.pilots.find((row) => row.key === 'works-refinery');

  assert.equal(sha256(authoringSource), REVIEWED_SOURCE_SHA,
    'the full authoring source remains the independently accepted candidate');
  assert.notEqual(sha256(source), REVIEWED_SOURCE_SHA,
    'the selected runtime source intentionally excludes evidence-only LOD2');
  assert.ok(part);
  assert.ok(releaseRow);
  assert.ok(pilot);
  assert.equal(part.category, 'places');
  assert.equal(part.file, 'works/place_works_refinery.glb');
  assert.equal(part.bytes, source.length);
  assert.equal(releaseRow.kind, 'part:places');
  assert.equal(releaseRow.source, SOURCE_PATH);
  assert.equal(releaseRow.release, RELEASE_PATH);
  assert.equal(releaseRow.sourceSha256, sha256(source));
  assert.equal(releaseRow.releaseSha256, sha256(release));
  assert.equal(releaseRow.ktx2Textures, releaseRow.textures);
  assert.ok(releaseRow.meshoptBufferViews > 0);
  assert.equal(pilot.runtimeAssetId, 'place_works_refinery');
  assert.equal(pilot.sourceUrl, RELEASE_PATH);
  assert.equal(pilot.releaseSha256, sha256(release));
  assert.equal(packageMetadata.provenance.sourceGlb.sha256, sha256(release));
  assert.equal(packageMetadata.provenance.sourceGlb.bytes, release.length);
  assert.equal(renderPackagePilotForAssetId('sf.render.works-refinery')?.sourceUrl, RELEASE_PATH);
});

test('Refinery carries repaired markers/collision through selected source, release, and package without LOD2', () => {
  const expectedMarkers = {
    furnace_slit: [-0.22, 0.292, -0.04],
    stack_vent: [0.18, 1.12, -0.8],
    lamp: [0.31, 0.74, -0.65],
  };
  for (const relative of [SOURCE_PATH, RELEASE_PATH]) {
    const gltf = glbJson(relative);
    for (const [name, expected] of Object.entries(expectedMarkers)) {
      const actual = nodeByName(gltf, name).translation;
      assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-4),
        `${relative} preserves repaired ${name} translation`);
    }
    const collision = nodeByName(gltf, 'COLLISION_HULL');
    assert.deepEqual(collision.translation.map((value) => Number(value.toFixed(4))), [0, 0.6, 0]);
    assert.deepEqual(collision.scale.map((value) => Number(value.toFixed(4))), [1.05, 0.6, 1.05]);
    const names = new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean));
    for (const hook of HOOKS) assert.ok(names.has(hook), `${relative} exposes ${hook}`);
    for (const lod of ['LOD0', 'LOD1']) {
      for (const suffix of ['refinery', 'furnace_slit', 'lamp_lens']) {
        assert.ok(names.has(`${lod}_${suffix}`), `${relative} exposes ${lod}_${suffix}`);
      }
    }
    assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false,
      `${relative} must exclude evidence-only LOD2`);
    assert.deepEqual(gltf.asset?.extras?.spacefaceAsset?.exportedLods, ['lod0', 'lod1']);
  }
  const metadata = json(PACKAGE_PATH);
  assert.deepEqual(metadata.runtime.markers.map((marker) => marker.name).sort(), [...HOOKS].sort());
  assert.deepEqual([...new Set(metadata.runtime.primitives.map((row) => row.tags?.lod))].sort(), ['lod0', 'lod1']);
  assert.equal(metadata.runtime.primitives.some((row) => /^LOD2(?:_|$)/u.test(row.name)), false);
  assert.deepEqual(REFINERY_HOOKS, HOOKS);
});

test('Refinery selected LOD1 keeps a non-emissive three-mass site atlas without changing the full source', () => {
  const authoring = glbJson(AUTHORING_SOURCE_PATH);
  const selected = glbJson(SOURCE_PATH);
  const lod1 = nodeByName(selected, 'LOD1_refinery');
  const material = selected.materials[selected.meshes[lod1.mesh].primitives[0].material];
  const baseTexture = selected.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const ormTexture = selected.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index];
  const baseImageIndex = baseTexture.source;
  const ormImageIndex = ormTexture.source;
  const base = embeddedPng(SOURCE_PATH, selected, baseImageIndex);
  const orm = embeddedPng(SOURCE_PATH, selected, ormImageIndex);
  const id = PNG.sync.read(readFileSync(pathOf('assets/works/refinery/source/textures/refinery_lod1_id.png')));
  const roleIds = {
    structure: [41, 46, 51],
    stack: [92, 36, 18],
    tank: [107, 31, 12],
  };
  const structure = averageMaskedRgb(base, id, roleIds.structure);
  const stack = averageMaskedRgb(base, id, roleIds.stack);
  const tank = averageMaskedRgb(base, id, roleIds.tank);
  const stackOrm = averageMaskedRgb(orm, id, roleIds.stack);
  const tankOrm = averageMaskedRgb(orm, id, roleIds.tank);

  assert.equal(authoring.asset?.extras?.spacefaceAsset?.siteLodMaterialProfile, undefined,
    'the immutable full authoring source remains unchanged');
  assert.equal(selected.asset?.extras?.spacefaceAsset?.siteLodMaterialProfile, 'three_mass_process_train_v1');
  assert.equal(selected.images[baseImageIndex].name, 'refinery_lod1_site_basecolor');
  assert.equal(selected.images[ormImageIndex].name, 'refinery_lod1_site_orm');
  assert.equal(selected.materials.length, authoring.materials.length,
    'site readability cannot introduce extra runtime material slots');
  assert.equal(material.emissiveTexture, undefined, 'site readability cannot add an emissive cheat');
  assert.ok(structure[2] > structure[1] + 8 && structure[1] > structure[0] + 8,
    'furnace jacket remains a readable cool structural mass');
  assert.ok(stack[0] > stack[1] * 3 && stack[0] > 100,
    'oxidized stack remains a distinct restrained rust mass');
  assert.ok(tank[0] > tank[1] * 10 && tank[0] > stack[0] + 15,
    'saddle tank remains a distinct oxide-red mass');
  assert.ok(stackOrm[2] < 60 && tankOrm[2] < 12,
    'site stack/tank stay matte enough to retain value against the dark environment');
});

test('Refinery hierarchy preserves world poses, keeps static atlas shared, and isolates LOD0/1 heat and lamp shells', async () => {
  const blueprint = makeRefineryBlueprint();
  const loader = loaderFor(blueprint);
  const group = await loader.loadWorksPart('place_works_refinery');
  assert.ok(group);
  group.updateWorldMatrix(true, true);
  const before = Object.fromEntries(blueprint.primitives.map((primitive) => [
    primitive.name,
    new THREE.Matrix4().fromArray(primitive.matrix.elements),
  ]));
  for (const [name, expected] of Object.entries(before)) {
    assert.ok(matrixDelta(expected, group.getObjectByName(name).matrixWorld) <= 1e-6, `${name} world pose changed`);
  }
  for (const name of ['LOD0_furnace_slit', 'LOD1_furnace_slit']) {
    assert.equal(group.getObjectByName(name).parent.name, 'furnace_slit');
  }
  for (const name of ['LOD0_lamp_lens', 'LOD1_lamp_lens']) {
    assert.equal(group.getObjectByName(name).parent.name, 'lamp');
  }
  assert.ok(group.getObjectByName('stack_vent'), 'stack vent remains an exposed authored marker');
  assert.equal(group.getObjectByName('LOD0_refinery').visible, true);
  assert.equal(group.getObjectByName('LOD1_refinery').visible, false);
  loader.setRegister('site');
  assert.equal(group.getObjectByName('LOD0_refinery').visible, false);
  assert.equal(group.getObjectByName('LOD1_refinery').visible, true);

  const second = await loader.loadWorksPart('place_works_refinery');
  const built = bindAuthoredRefinery(group);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up source is seated into the Works XY plane');
  assert.equal(built.dyn.furnaceAnchor, group.getObjectByName('furnace_slit'));
  assert.equal(built.dyn.stackVent, group.getObjectByName('stack_vent'));
  const jacketA = group.getObjectByName('LOD0_refinery').material;
  const jacketB = second.getObjectByName('LOD0_refinery').material;
  const slitA0 = group.getObjectByName('LOD0_furnace_slit').material;
  const slitA1 = group.getObjectByName('LOD1_furnace_slit').material;
  const slitB0 = second.getObjectByName('LOD0_furnace_slit').material;
  const lampA0 = group.getObjectByName('LOD0_lamp_lens').material;
  const lampA1 = group.getObjectByName('LOD1_lamp_lens').material;
  const lampB0 = second.getObjectByName('LOD0_lamp_lens').material;
  const jacketColor = jacketA.color.clone();
  const jacketEmission = jacketA.emissive.clone();
  assert.equal(jacketA, jacketB, 'static jacket/stack/tank atlas shell remains shared');
  assert.equal(jacketA.map, jacketB.map, 'static atlas texture remains shared');
  assert.notEqual(slitA0, slitB0, 'each Refinery owns its furnace slit material shell');
  assert.notEqual(lampA0, lampB0, 'each Refinery owns its lamp lens material shell');

  built.dyn.setFurnaceIntensity(1.6);
  assert.equal(slitA0.emissiveIntensity, 1.6, 'LOD0 slit receives heat');
  assert.equal(slitA1.emissiveIntensity, 1.6, 'LOD1 slit receives heat');
  assert.notEqual(slitB0.emissiveIntensity, 1.6, 'furnace heat cannot leak across Refinery instances');
  built.dyn.setLamp(0xff6242, 0.62);
  assert.equal(lampA0.emissive.getHex(), 0xff6242, 'LOD0 lens receives status emission');
  assert.equal(lampA1.emissive.getHex(), 0xff6242, 'LOD1 lens receives status emission');
  assert.equal(lampA0.emissiveIntensity, 0.62);
  assert.ok(jacketA.color.equals(jacketColor), 'status cannot repaint static jacket atlas material');
  assert.ok(jacketA.emissive.equals(jacketEmission), 'status cannot emissify static jacket atlas material');
  assert.notEqual(lampB0.emissive.getHex(), 0xff6242, 'lamp status cannot leak across Refinery instances');

  loader.releaseWorksPart(group);
  loader.releaseWorksPart(group);
  assert.equal(loader.stats().released, 1, 'installed teardown is idempotent');
  loader.releaseWorksPart(second);
});

test('Refinery same-URL work/site/work race resolves once at the final register', async () => {
  const blueprint = makeRefineryBlueprint();
  const resolves = [];
  const urls = [];
  const loader = loaderFor(blueprint, {
    load(url) {
      urls.push(url);
      return new Promise((resolve) => resolves.push(resolve));
    },
  });
  const pending = loader.loadWorksPart('place_works_refinery');
  loader.setRegister('site');
  resolves[0](blueprint);
  await Promise.resolve();
  await Promise.resolve();
  loader.setRegister('work');
  const group = await pending;
  assert.ok(group);
  assert.equal(urls.length, 1, 'combined source must not reload on an equivalent URL race');
  assert.equal(group.userData.worksNodeLod, 'lod0');
  assert.equal(group.getObjectByName('LOD0_refinery').visible, true);
  assert.equal(group.getObjectByName('LOD1_refinery').visible, false);
  loader.releaseWorksPart(group);
});

test('Refinery late arrivals release without mounting and loader disposal remains idempotent', async () => {
  const late = new THREE.Group();
  let released = 0;
  const settled = settleAuthoredWorksArrival({
    loader: { releaseWorksPart(group) { assert.equal(group, late); released += 1; } },
    group: late,
    isLive: () => false,
    install() { throw new Error('stale Refinery must not install'); },
  });
  assert.equal(settled, null);
  assert.equal(released, 1);

  const loader = loaderFor(makeRefineryBlueprint());
  const group = await loader.loadWorksPart('place_works_refinery');
  await loader.dispose('refinery-test');
  assert.equal(await loader.dispose('refinery-test-again'), 0, 'loader teardown is idempotent');
  assert.equal(group.userData.worksReleased, true);
});

test('Refinery installed, ghost, and proof routes are authored-only with no procedural body fallback', () => {
  const renderer = readFileSync(pathOf('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const loader = readFileSync(pathOf('src/ui/asteroid/worksPartLoader.js'), 'utf8');
  const preview = readFileSync(pathOf('src/render/asteroidInteriorPreview.js'), 'utf8');
  const bindStart = renderer.indexOf('export function bindAuthoredRefinery');
  const bindEnd = renderer.indexOf('/**', bindStart + 1);
  const updateStart = renderer.indexOf('if (rec.dyn.furnace)');
  const updateEnd = renderer.indexOf('if (rec.dyn.progressBar)', updateStart);
  const bind = renderer.slice(bindStart, bindEnd);
  const update = renderer.slice(updateStart, updateEnd);

  assert.match(renderer, /loadWorksPart\('place_works_refinery'\)/u);
  assert.match(renderer, /buildAuthoredRefineryAt/u);
  assert.match(renderer, /beginAuthoredRefineryGhost/u);
  assert.match(renderer, /settleAuthoredWorksArrival\(/u);
  assert.match(renderer, /releaseWorksPart\(rec\.authoredGroup\)/u);
  assert.match(renderer, /if \(id === 'place_works_refinery'\) bindAuthoredRefinery\(group\);/u,
    'the capture route must exercise the Refinery production binding');
  assert.match(loader, /bindWorksRefineryHookHierarchy/u);
  assert.match(bind, /setFurnaceIntensity/u);
  assert.match(bind, /setLamp/u);
  assert.doesNotMatch(bind, /LOD[01]_refinery/u, 'static refinery body cannot enter status mutation');
  assert.match(update, /setFurnaceIntensity\(intensity\)/u,
    'the running/idle/reduced-motion heat value must fan out through the multi-LOD setter');
  assert.doesNotMatch(preview, /kind\s*===\s*['"]refinery['"]/u);
});
