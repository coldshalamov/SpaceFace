// PQ-131.05 — standing Derrick selected source/release/package and permanent Works route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { PNG } from 'pngjs';

import {
  DERRICK_HOOKS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import {
  advanceDerrickDrumPhase,
  bindAuthoredDerrick,
  derrickDepthLiftForBounds,
  derrickProofTransformForBounds,
  settleAuthoredWorksArrival,
  worksProofRotationXForPart,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORING_SOURCE_PATH = 'assets/works/derrick/source/derrick.glb';
const SOURCE_PATH = 'assets/ships/parts/works/place_works_derrick.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_derrick.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-derrick/render-package.json';
const REVIEWED_SOURCE_SHA = 'b35007a82902bfc57017950e2a7bb4c8221984d3e090229a507bcceffb6f492a';
const HOOKS = ['drum_spin', 'cable_anchor', 'lamp_L', 'lamp_R'];

function pathOf(relative) { return resolve(ROOT, relative); }
function bytes(relative) { return readFileSync(pathOf(relative)); }
function json(relative) { return JSON.parse(readFileSync(pathOf(relative), 'utf8')); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }
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
  assert.ok(count > 0, 'expected a non-empty LOD1 semantic atlas mask');
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

function makeDerrickBlueprint() {
  const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const atlas = new THREE.DataTexture(new Uint8Array([64, 72, 76, 255]), 1, 1);
  atlas.needsUpdate = true;
  const staticMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4540, map: atlas, emissive: 0x040302 });
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x33210b, emissive: 0x110804, emissiveIntensity: 0.1 });
  const positions = {
    drum_spin: [-0.62, 1.38, 0],
    cable_anchor: [-0.464, 1.504, 0],
    lamp_L: [0.05, 6.3, -0.4],
    lamp_R: [0.05, 6.3, 0.4],
  };
  const primitives = [
    ['LOD0_derrick', staticMaterial, [0, 0, 0], 'lod0'],
    ['LOD1_derrick', staticMaterial, [0, 0, 0], 'lod1'],
    ['LOD0_drum', staticMaterial, positions.drum_spin, 'lod0'],
    ['LOD1_drum', staticMaterial, positions.drum_spin, 'lod1'],
    ['LOD0_cable', staticMaterial, positions.cable_anchor, 'lod0'],
    ['LOD1_cable', staticMaterial, positions.cable_anchor, 'lod1'],
    ['LOD0_lamp_L', staticMaterial, positions.lamp_L, 'lod0'],
    ['LOD1_lamp_L', staticMaterial, positions.lamp_L, 'lod1'],
    ['LOD0_lamp_R', staticMaterial, positions.lamp_R, 'lod0'],
    ['LOD1_lamp_R', staticMaterial, positions.lamp_R, 'lod1'],
    ['LOD0_lamp_L_lens', lensMaterial, positions.lamp_L, 'lod0'],
    ['LOD1_lamp_L_lens', lensMaterial, positions.lamp_L, 'lod1'],
    ['LOD0_lamp_R_lens', lensMaterial, positions.lamp_R, 'lod0'],
    ['LOD1_lamp_R_lens', lensMaterial, positions.lamp_R, 'lod1'],
  ].map(([name, material, position, lod]) => ({
    name, geometry, material, matrix: translate(...position), tags: { lod },
  }));
  return {
    assetId: 'place_works_derrick',
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
    registry: { place_works_derrick: WORKS_PARTS.place_works_derrick },
  });
}

test('Derrick selected source, release, package, and pilot bind to the immutable full authoring source', () => {
  const authoring = bytes(AUTHORING_SOURCE_PATH);
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  const part = json('assets/ships/parts/parts_manifest.json').parts.find((row) => row.id === 'place_works_derrick');
  const releaseRow = json('assets/ships/release/release_manifest.json').assets.find((row) => row.id === 'place_works_derrick');
  const pilot = json('assets/ships/render-packages/pilots.json').pilots.find((row) => row.key === 'works-derrick');
  const metadata = json(PACKAGE_PATH);

  assert.equal(sha256(authoring), REVIEWED_SOURCE_SHA);
  assert.notEqual(sha256(source), REVIEWED_SOURCE_SHA, 'selected runtime source excludes LOD2');
  assert.ok(part);
  assert.equal(part.category, 'places');
  assert.equal(part.file, 'works/place_works_derrick.glb');
  assert.equal(part.bytes, source.length);
  assert.equal(releaseRow.kind, 'part:places');
  assert.equal(releaseRow.source, SOURCE_PATH);
  assert.equal(releaseRow.release, RELEASE_PATH);
  assert.equal(releaseRow.sourceSha256, sha256(source));
  assert.equal(releaseRow.releaseSha256, sha256(release));
  assert.equal(releaseRow.ktx2Textures, releaseRow.textures);
  assert.ok(releaseRow.meshoptBufferViews > 0);
  assert.equal(pilot.runtimeAssetId, 'place_works_derrick');
  assert.equal(pilot.sourceUrl, RELEASE_PATH);
  assert.equal(pilot.releaseSha256, sha256(release));
  assert.equal(metadata.provenance.sourceGlb.sha256, sha256(release));
  assert.equal(renderPackagePilotForAssetId('sf.render.works-derrick')?.sourceUrl, RELEASE_PATH);
});

test('Derrick selected source, release, and package retain four fixed hooks and collision without LOD2', () => {
  const expected = {
    drum_spin: [-0.62, 1.38, 0],
    cable_anchor: [-0.464, 1.504, 0],
    lamp_L: [0.05, 6.3, -0.4],
    lamp_R: [0.05, 6.3, 0.4],
  };
  for (const relative of [SOURCE_PATH, RELEASE_PATH]) {
    const gltf = glbJson(relative);
    for (const [name, vector] of Object.entries(expected)) {
      const actual = nodeByName(gltf, name).translation;
      assert.ok(actual.every((value, index) => Math.abs(value - vector[index]) < 1e-4), `${relative} moved ${name}`);
    }
    const collision = nodeByName(gltf, 'COLLISION_HULL');
    assert.deepEqual(collision.translation.map((value) => Number(value.toFixed(4))), [0, 3.2, 0]);
    assert.deepEqual(collision.scale.map((value) => Number(value.toFixed(4))), [1.08, 3.25, 1]);
    const names = new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean));
    for (const hook of HOOKS) assert.ok(names.has(hook));
    for (const lod of ['LOD0', 'LOD1']) {
      for (const suffix of ['derrick', 'drum', 'cable', 'lamp_L', 'lamp_L_lens', 'lamp_R', 'lamp_R_lens']) {
        assert.ok(names.has(`${lod}_${suffix}`), `${relative} misses ${lod}_${suffix}`);
      }
    }
    assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false);
    assert.deepEqual(gltf.asset?.extras?.spacefaceAsset?.exportedLods, ['lod0', 'lod1']);
  }
  const metadata = json(PACKAGE_PATH);
  assert.deepEqual(metadata.runtime.markers.map((marker) => marker.name).sort(), HOOKS.slice().sort());
  assert.deepEqual([...new Set(metadata.runtime.primitives.map((row) => row.tags?.lod))].sort(), ['lod0', 'lod1']);
  assert.equal(metadata.runtime.primitives.some((row) => /^LOD2(?:_|$)/u.test(row.name)), false);
  assert.deepEqual(DERRICK_HOOKS, HOOKS);
});

test('Derrick selected LOD1 restores grounded headframe roles without changing full source, LOD0, or emission', () => {
  const authoring = glbJson(AUTHORING_SOURCE_PATH);
  const selected = glbJson(SOURCE_PATH);
  const lod0 = nodeByName(selected, 'LOD0_derrick');
  const lod1 = nodeByName(selected, 'LOD1_derrick');
  const lod0Material = selected.materials[selected.meshes[lod0.mesh].primitives[0].material];
  const lod1Material = selected.materials[selected.meshes[lod1.mesh].primitives[0].material];
  const baseTexture = selected.textures[lod1Material.pbrMetallicRoughness.baseColorTexture.index];
  const ormTexture = selected.textures[lod1Material.pbrMetallicRoughness.metallicRoughnessTexture.index];
  const base = embeddedPng(SOURCE_PATH, selected, baseTexture.source);
  const orm = embeddedPng(SOURCE_PATH, selected, ormTexture.source);
  const id = PNG.sync.read(readFileSync(pathOf('assets/works/derrick/source/textures/derrick_atlas_lod1_id.png')));
  const structure = averageMaskedRgb(base, id, [255, 0, 0]);
  const winch = averageMaskedRgb(base, id, [0, 0, 255]);
  const cable = averageMaskedRgb(base, id, [255, 0, 255]);
  const structureOrm = averageMaskedRgb(orm, id, [255, 0, 0]);

  assert.equal(authoring.asset?.extras?.spacefaceAsset?.siteLodMaterialProfile, undefined,
    'immutable full authoring source remains untouched');
  assert.equal(selected.asset?.extras?.spacefaceAsset?.siteLodMaterialProfile,
    'grounded_headframe_value_roles_v1');
  assert.equal(selected.images[baseTexture.source].name, 'derrick_lod1_site_basecolor');
  assert.equal(selected.images[ormTexture.source].name, 'derrick_lod1_site_orm');
  assert.equal(selected.materials.length, authoring.materials.length,
    'site readability cannot add material slots');
  assert.equal(lod1Material.emissiveTexture, undefined, 'static headframe material cannot become emissive');
  assert.equal(lod0Material.pbrMetallicRoughness.baseColorTexture.index, 1,
    'selected LOD0 keeps the reviewed original atlas binding');
  assert.ok(structure[2] > structure[1] + 4 && structure[1] > structure[0] + 4,
    'A-frame/collar structure becomes a cool readable mass');
  assert.ok(winch[0] > winch[1] * 1.25 && winch[1] > winch[2] * 1.25,
    'offset winch remains a restrained warm secondary mass');
  assert.ok(structure.reduce((sum, value) => sum + value, 0) > winch.reduce((sum, value) => sum + value, 0) + 65,
    'the grounded frame/collar mass stays stronger than its small rust/winch hardware');
  assert.ok(cable.reduce((sum, value) => sum + value, 0) < structure.reduce((sum, value) => sum + value, 0) * 0.35,
    'cable stays subordinate to legs/collar rather than becoming an outline treatment');
  assert.ok(structureOrm[1] > 130 && structureOrm[2] > 50,
    'structural LOD1 retains non-emissive rough metal response');
});

test('Derrick hierarchy preserves pose, leaves structural atlas shared, and isolates only lamp lenses', async () => {
  const blueprint = makeDerrickBlueprint();
  const loader = loaderFor(blueprint);
  const group = await loader.loadWorksPart('place_works_derrick');
  const second = await loader.loadWorksPart('place_works_derrick');
  assert.ok(group && second);
  group.updateWorldMatrix(true, true);
  for (const primitive of blueprint.primitives) {
    const expected = new THREE.Matrix4().fromArray(primitive.matrix.elements);
    assert.ok(matrixDelta(expected, group.getObjectByName(primitive.name).matrixWorld) <= 1e-6,
      `${primitive.name} world pose changed`);
  }
  for (const name of ['LOD0_drum', 'LOD1_drum']) assert.equal(group.getObjectByName(name).parent.name, 'drum_spin');
  for (const name of ['LOD0_cable', 'LOD1_cable']) assert.equal(group.getObjectByName(name).parent.name, 'cable_anchor');
  for (const side of ['L', 'R']) {
    for (const lod of ['LOD0', 'LOD1']) {
      assert.equal(group.getObjectByName(`${lod}_lamp_${side}`).parent.name, `lamp_${side}`);
      assert.equal(group.getObjectByName(`${lod}_lamp_${side}_lens`).parent.name, `lamp_${side}`);
    }
  }
  const built = bindAuthoredDerrick(group);
  assert.equal(built.group.rotation.x, 0, 'standing source must not receive interior Y-up seating');
  assert.equal(built.dyn.cableAnchor, group.getObjectByName('cable_anchor'));
  const bodyA = group.getObjectByName('LOD0_derrick').material;
  const drumA = group.getObjectByName('LOD0_drum').material;
  const hoodA = group.getObjectByName('LOD0_lamp_L').material;
  const bodyB = second.getObjectByName('LOD0_derrick').material;
  const lensA0 = group.getObjectByName('LOD0_lamp_L_lens').material;
  const lensA1 = group.getObjectByName('LOD1_lamp_R_lens').material;
  const lensB = second.getObjectByName('LOD0_lamp_L_lens').material;
  const bodyColor = bodyA.color.clone();
  const bodyEmission = bodyA.emissive.clone();
  assert.equal(bodyA, bodyB, 'Derrick structural atlas shell stays shared');
  assert.equal(bodyA, drumA, 'drum stays on shared authored atlas shell');
  assert.equal(bodyA, hoodA, 'lamp hood stays on shared authored atlas shell');
  assert.notEqual(lensA0, lensB, 'one Derrick cannot repaint another lens');
  built.dyn.setLamp(0xffb648, 0.56);
  assert.equal(lensA0.emissive.getHex(), 0xffb648);
  assert.equal(lensA1.emissiveIntensity, 0.56, 'both LOD lens variants receive status');
  assert.ok(bodyA.color.equals(bodyColor), 'status cannot repaint frame/drum/hood atlas');
  assert.ok(bodyA.emissive.equals(bodyEmission), 'status cannot emissify frame/drum/hood atlas');
  assert.notEqual(lensB.emissive.getHex(), 0xffb648, 'lens status stays instance-local');
  const before = group.getObjectByName('drum_spin').rotation.y;
  built.dyn.setSpin(0.75);
  assert.equal(group.getObjectByName('drum_spin').rotation.y, before + 0.75);
  loader.releaseWorksPart(group);
  loader.releaseWorksPart(group);
  assert.equal(loader.stats().released, 1, 'Derrick release is idempotent');
  loader.releaseWorksPart(second);
});

test('Derrick tether arrival invalidates the fallback line once and drum phase advances only while moving', () => {
  let phase = advanceDerrickDrumPhase(0.4, true, false, 0.25);
  assert.equal(phase, 0.675, 'movement advances the existing drum angle by frame delta');
  phase = advanceDerrickDrumPhase(phase, false, false, 12);
  assert.equal(phase, 0.675, 'idle duration cannot advance or snap the drum');
  phase = advanceDerrickDrumPhase(phase, true, true, 12);
  assert.equal(phase, 0.675, 'reduced motion holds the drum still');
  assert.equal(advanceDerrickDrumPhase(phase, true, false, 0.1), 0.785,
    'movement resumes continuously from the held angle');

  const renderer = readFileSync(pathOf('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const installStart = renderer.indexOf('function installAuthoredDerrick');
  const installEnd = renderer.indexOf('function loadAuthoredDerrick', installStart);
  const install = renderer.slice(installStart, installEnd);
  assert.match(install, /umbilicalKey = ''/u,
    'authored arrival forces exactly the next tether sync to replace a fallback origin');
  assert.match(renderer, /advanceDerrickDrumPhase\(\s*derrickBuilt\.drumPhase, moving, motionReduce, dt/u);
  assert.doesNotMatch(renderer, /setSpin\(timeS \* 1\.1\)/u,
    'drum phase cannot be reset from global elapsed time');
});

test('Works loader register and pending Derrick shape are initialized before first authored startup load', () => {
  const renderer = readFileSync(pathOf('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const zoomDeclaration = renderer.indexOf("let zoomRegister = 'work'");
  const loader = renderer.indexOf('function ensureWorksLoader');
  const firstRoverLoad = renderer.indexOf('void loadAuthoredRover();');
  assert.ok(zoomDeclaration >= 0 && zoomDeclaration < loader && zoomDeclaration < firstRoverLoad,
    'the initial work register must exist before construction starts the authored Rover/Derrick loader');
  assert.equal((renderer.match(/let zoomRegister = 'work'/gu) || []).length, 1,
    'Works keeps one register declaration and preserves normal zoom state ownership');

  const surfaceStart = renderer.indexOf('function buildSurface()');
  const installStart = renderer.indexOf('function installAuthoredDerrick', surfaceStart);
  const pending = renderer.slice(surfaceStart, installStart);
  assert.match(pending, /pulses:\s*\[\]/u,
    'a pending Derrick already has the iterable shape begin() spreads before async arrival');
  assert.match(renderer, /\.\.\.\(derrickBuilt \? derrickBuilt\.pulses : \[\]\)/u,
    'begin() continues to consume the pending authored record without a fallback body');
});

test('Derrick proof seating remains standing while interior proof seating retains its quarter-turn', async () => {
  const group = await loaderFor(makeDerrickBlueprint()).loadWorksPart('place_works_derrick');
  assert.ok(group);
  bindAuthoredDerrick(group);
  group.rotation.set(worksProofRotationXForPart('place_works_derrick'), 0, 0);
  assert.equal(group.rotation.x, 0, 'standing Derrick proof pose cannot lay on its side');
  assert.equal(worksProofRotationXForPart('place_works_extractor'), Math.PI / 2,
    'interior proof candidates retain the established seating conversion');

  const transform = derrickProofTransformForBounds({
    min: [-1.08, 0, -0.87], max: [1.08, 6.49, 0.87],
  }, { cellX: 44, cellY: -8.8 });
  assert.equal(transform.scale, 1);
  assert.deepEqual(transform.rotation, [0, 0, 0]);
  assert.equal(transform.footprintCells, 1);
  assert.deepEqual(transform.position.slice(0, 2), [44, -8.8]);
  assert.ok(Math.abs(transform.position[2] - 4.17) < 1e-9,
    'proof lifts native min-z -0.87 exactly onto ROCK_FACE 3.3');
  const native = { min: [-1.08, 0, -0.87], max: [1.08, 6.49, 0.87] };
  const proofLift = derrickDepthLiftForBounds(native);
  const permanentRootZ = 1.485;
  const permanentLift = derrickDepthLiftForBounds(native, permanentRootZ);
  assert.ok(Math.abs(proofLift + native.min[2] - 3.3) < 1e-9,
    'proof native min-z lands exactly at ROCK_FACE');
  assert.ok(Math.abs(permanentRootZ + permanentLift + native.min[2] - 3.3) < 1e-9,
    'permanent child lift lands the same native min-z exactly at ROCK_FACE');

  const renderer = readFileSync(pathOf('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  assert.match(renderer, /\? seatWorksDerrickProofGroup\(group\)\s*:\s*seatWorksProofGroup\(group, worksProofRotationXForPart\(id\)\)/u,
    'Derrick takes the production-scale proof seater while interior candidates keep the generic path');
  assert.match(renderer, /authored\.group\.position\.z = derrickDepthLiftForBounds\(native, rec\.group\.position\.z\);/u,
    'permanent install derives its local depth lift from current bounds without moving the root');
});

test('Derrick late arrival releases without mounting and authored-only permanent/proof routes have no procedural body', async () => {
  const late = new THREE.Group();
  let released = 0;
  assert.equal(settleAuthoredWorksArrival({
    loader: { releaseWorksPart(group) { assert.equal(group, late); released += 1; } },
    group: late,
    isLive: () => false,
    install() { throw new Error('stale Derrick must not install'); },
  }), null);
  assert.equal(released, 1);
  const renderer = readFileSync(pathOf('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const loader = readFileSync(pathOf('src/ui/asteroid/worksPartLoader.js'), 'utf8');
  const preview = readFileSync(pathOf('src/render/asteroidInteriorPreview.js'), 'utf8');
  const bindStart = renderer.indexOf('export function bindAuthoredDerrick');
  const bindEnd = renderer.indexOf('/**', bindStart + 1);
  const bind = renderer.slice(bindStart, bindEnd);
  assert.match(renderer, /loadWorksPart\('place_works_derrick'\)/u);
  assert.match(renderer, /clearAuthoredDerrick\(\);[\s\S]*const loader = worksLoader/u,
    'Derrick token/release must happen before loader retirement');
  assert.match(renderer, /if \(id === 'place_works_derrick'\) bindAuthoredDerrick\(group\);/u);
  assert.match(renderer, /getWorldPosition\(derrickCableStart\)/u);
  assert.match(renderer, /if \(moving && !motionReduce\) derrickBuilt\.dyn\.setSpin\(derrickBuilt\.drumPhase\);/u);
  assert.doesNotMatch(bind, /rotation\.x\s*=\s*Math\.PI/u);
  assert.match(bind, /LOD\[01\]_lamp_\[LR\]_lens/u);
  assert.doesNotMatch(bind, /LOD\[01\]_lamp_[LR](?!_lens)/u);
  assert.match(loader, /bindWorksDerrickHookHierarchy/u);
  assert.doesNotMatch(preview, /makeDerrick/u);

  const instance = await loaderFor(makeDerrickBlueprint()).loadWorksPart('place_works_derrick');
  assert.ok(instance);
});
