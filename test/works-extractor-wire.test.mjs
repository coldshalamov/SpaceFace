// PQ-131.03 — authored gallery Extractor release/runtime wire.
//
// Artifact assertions bind the generated release/package to the independently reviewed source.
// Behavior assertions drive the real Works loader so flattened package transforms, LOD selection,
// functional pivots, atlas isolation, and lifecycle are exercised together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import { bindAuthoredExtractor } from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  EXTRACTOR_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_extractor.glb');
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_extractor.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-extractor/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-extractor/render.glb');
const EPOCH = resolve(ROOT, 'assets/works/extractor/evidence/cycle_006/EPOCH.json');
const HIDDEN_FACES = resolve(ROOT, 'assets/works/extractor/evidence/cycle_006/hidden_faces.json');
const MACHINE_FACTORY = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');

const EXPECTED_SOURCE_SHA = '3e071a9a7a143480af6a09088f032207153d441d4a0d3e0409bd5eba21d92ba8';
const EXPECTED_HIDDEN_FACE_SHA = 'e174d8a9481cfd5da915d6804f76e77c801af1449366cd2a99ea16de07f07089';
const EXPECTED_HOOKS = Object.freeze({
  belt: [-0.07999999821186066, 0.17000000178813934, 0],
  head_face: [0.41999998688697815, 0.30000001192092896, 0],
  lamp: [0.2800000011920929, 0.550000011920929, -0.7300000190734863],
});

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function glbJson(path) {
  const payload = readFileSync(path);
  assert.equal(payload.readUInt32LE(0), 0x46546c67, `${path} is a GLB`);
  const length = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + length).toString('utf8'));
}

function vecFromMatrix(matrix) {
  return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(matrix));
}

function packageBlueprint(metadata) {
  const pixel = new Uint8Array([255, 255, 255, 255]);
  const atlas = new THREE.DataTexture(pixel, 1, 1);
  atlas.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ name: 'ExtractorPackageAtlas', map: atlas });
  return {
    assetId: 'place_works_extractor',
    primitives: metadata.runtime.primitives.map((primitive) => ({
      name: primitive.name,
      geometry: new THREE.BoxGeometry(0.05, 0.05, 0.05),
      material,
      matrix: new THREE.Matrix4().fromArray(primitive.matrix),
      tags: { ...primitive.tags },
    })),
    markers: metadata.runtime.markers.map((marker) => ({
      name: marker.name,
      matrix: new THREE.Matrix4().fromArray(marker.matrix),
      tags: { ...marker.tags },
    })),
  };
}

function mockRenderer() {
  return {
    domElement: {
      width: 8,
      height: 8,
      style: {},
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
    },
    info: { memory: { geometries: 0, textures: 0 }, render: { triangles: 0, calls: 0 }, programs: [] },
    capabilities: { isWebGL2: true },
    getContext() { return {}; },
    render() {},
    dispose() {},
  };
}

function injectedLease(blueprint) {
  return {
    loads: [],
    isActive() { return true; },
    async load(url) {
      this.loads.push(url);
      return blueprint;
    },
    release() { return 0; },
  };
}

test('the Extractor release, package, and evidence remain bound to the reviewed source', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_extractor');
  assert.ok(release, 'release manifest has the Extractor row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const pilots = json(PILOTS);
  const pilot = pilots.pilots.find((row) => row.key === 'works-extractor');
  assert.ok(pilot, 'generated pilots manifest has works-extractor');
  assert.equal(pilot.runtimeAssetId, 'place_works_extractor');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.extractor.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  assert.deepEqual(
    metadata.runtime.markers.map((marker) => marker.name).sort(),
    [...EXTRACTOR_HOOKS].sort(),
  );

  const epoch = json(EPOCH);
  assert.equal(epoch.candidate.sha256.toLowerCase(), EXPECTED_SOURCE_SHA);
  assert.equal(epoch.hiddenFaceDiagnostic.sha256.toLowerCase(), EXPECTED_HIDDEN_FACE_SHA);
  assert.equal(epoch.hiddenFaceDiagnostic.authority, 'diagnostic_only_not_culling_proof');
  assert.equal(sha256(HIDDEN_FACES), EXPECTED_HIDDEN_FACE_SHA);
});

test('the Extractor release preserves collision and exact functional hook transforms', () => {
  const release = glbJson(RELEASE_GLB);
  const nodes = new Map((release.nodes || []).map((node) => [node.name, node]));
  const collision = nodes.get('COLLISION_HULL');
  assert.ok(collision, 'the non-render collision helper survives the release build');
  assert.deepEqual(collision.translation, [0, 0.4000000059604645, 0]);
  assert.deepEqual(collision.scale, [1.0499999523162842, 0.41999998688697815, 0.800000011920929]);
  assert.equal(collision.extras?.spaceface?.collision, true);

  for (const [name, expected] of Object.entries(EXPECTED_HOOKS)) {
    const node = nodes.get(name);
    assert.ok(node, `${name} survives the release build`);
    assert.equal(node.mesh, undefined, `${name} remains an empty functional transform`);
    assert.equal(node.extras?.spacefaceSocket, true, `${name} remains a socket`);
    assert.deepEqual(node.translation, expected, `${name} keeps its authored transform`);
  }
});

test('the real Works loader exposes Extractor LODs, pivots, isolated lamp, and moving belt', async () => {
  const metadata = json(PACKAGE_JSON);
  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const source = await loader.loadWorksPart('extractor');

  assert.ok(source, 'Extractor resolves through the shared Works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.extractor.lod0]);
  assert.equal(source.userData.worksPartId, 'extractor');
  for (const [name, expected] of Object.entries(EXPECTED_HOOKS)) {
    const hook = source.userData.worksHooks[name];
    assert.ok(hook, `${name} is exposed to the renderer`);
    assert.ok(
      hook.position.distanceTo(new THREE.Vector3(...expected)) < 1e-6,
      `${name} transform is exact`,
    );
  }

  const byName = new Map();
  source.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_head`).parent.name, 'head_face');
    assert.equal(byName.get(`LOD${lod}_belt`).parent.name, 'belt');
    assert.equal(byName.get(`LOD${lod}_lamp`).parent.name, 'lamp');
    assert.equal(byName.get(`LOD${lod}_lamp_lens`).parent.name, 'lamp');
  }
  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_extractor').visible, true);
  assert.equal(byName.get('LOD1_extractor').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_extractor').visible, false);
  assert.equal(byName.get('LOD1_extractor').visible, true);

  const staticMaterial = byName.get('LOD0_extractor').material;
  const sharedLampMaterial = byName.get('LOD0_lamp_lens').material;
  const built = bindAuthoredExtractor(source);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up glTF is seated into the XY cut plane');
  assert.notEqual(byName.get('LOD0_lamp_lens').material, sharedLampMaterial, 'lamp gets an instance material');
  assert.equal(byName.get('LOD0_extractor').material, staticMaterial, 'frame keeps the shared atlas');
  built.dyn.lamp.emissive.setHex(0xff6242);
  assert.notEqual(staticMaterial.emissive.getHex(), 0xff6242, 'status does not repaint the frame');

  const headX = built.dyn.piston.position.x;
  built.dyn.piston.position.x = built.dyn.pistonBase - 0.12;
  assert.ok(Math.abs(built.dyn.piston.position.x - (headX - 0.12)) < 1e-8, 'head reciprocates from head_face');

  const beltMap = byName.get('LOD0_belt').material.map;
  assert.ok(beltMap, 'belt owns a scrollable atlas sampler');
  built.dyn.setBeltPhase(0.625, true);
  assert.ok(Math.abs(beltMap.offset.x - 0.625) < 1e-8, 'running belt advances its sampler');
  built.dyn.setBeltPhase(0.9, false);
  assert.ok(Math.abs(beltMap.offset.x - 0.625) < 1e-8, 'stopped/reduced-motion belt holds its phase');

  loader.releaseWorksPart(source);
  await loader.dispose('test');
});

test('the obsolete procedural Extractor body is absent from the machine factory', () => {
  const source = readFileSync(MACHINE_FACTORY, 'utf8');
  assert.doesNotMatch(source, /kind\s*===\s*['"]extractor['"]/);
});
