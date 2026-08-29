// PQ-131.05 — authored surface Derrick release/runtime wire.
//
// This test reads the generated release/package artifacts and drives the real works loader. It does
// not invent hook transforms: the blueprint below is reconstructed from render-package.json, which
// is the table createAuthoredAssetLease consumes on the production package path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  bindAuthoredDerrick,
  replaceDerrickInScene,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  DERRICK_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_derrick.glb');
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_derrick.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-derrick/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-derrick/render.glb');

const EXPECTED_SOURCE_SHA = 'b35007a82902bfc57017950e2a7bb4c8221984d3e090229a507bcceffb6f492a';
const EXPECTED_HOOKS = Object.freeze({
  drum_spin: [-0.6200000047683716, 1.3799999952316284, 0],
  cable_anchor: [-0.46400001645088196, 1.503999948501587, 0],
  lamp_L: [0.05000000074505806, 6.300000190734863, -0.4000000059604645],
  lamp_R: [0.05000000074505806, 6.300000190734863, 0.4000000059604645],
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
  const material = new THREE.MeshStandardMaterial({ name: 'DerrickPackageMaterial' });
  const primitives = metadata.runtime.primitives.map((primitive) => ({
    name: primitive.name,
    geometry: new THREE.BoxGeometry(0.05, 0.05, 0.05),
    material,
    matrix: new THREE.Matrix4().fromArray(primitive.matrix),
    tags: { ...primitive.tags },
  }));
  const markers = metadata.runtime.markers.map((marker) => ({
    name: marker.name,
    matrix: new THREE.Matrix4().fromArray(marker.matrix),
    tags: { ...marker.tags },
  }));
  return {
    assetId: 'place_works_derrick',
    primitives,
    markers,
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

test('the generated Derrick release and package are bound to the exact reviewed source', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_derrick');
  assert.ok(release, 'release manifest has the Derrick row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const pilots = json(PILOTS);
  const pilot = pilots.pilots.find((row) => row.key === 'works-derrick');
  assert.ok(pilot, 'generated pilots manifest has works-derrick');
  assert.equal(pilot.runtimeAssetId, 'place_works_derrick');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.derrick.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  assert.equal(metadata.runtime.markers.length, DERRICK_HOOKS.length);
  assert.deepEqual(
    metadata.runtime.markers.map((marker) => marker.name).sort(),
    [...DERRICK_HOOKS].sort(),
  );
});

test('the release preserves Derrick collision and functional hook transforms', () => {
  const release = glbJson(RELEASE_GLB);
  const nodes = new Map((release.nodes || []).map((node) => [node.name, node]));
  const collision = nodes.get('COLLISION_HULL');
  assert.ok(collision, 'the non-render collision helper survives the release build');
  assert.deepEqual(collision.translation, [0, 3.200000047683716, 0]);
  assert.deepEqual(collision.scale, [1.0800000429153442, 3.25, 1]);
  assert.equal(collision.extras?.spaceface?.collision, true);

  for (const [name, expected] of Object.entries(EXPECTED_HOOKS)) {
    const node = nodes.get(name);
    assert.ok(node, `${name} survives the release build`);
    assert.equal(node.mesh, undefined, `${name} remains an empty functional transform`);
    assert.equal(node.extras?.spacefaceSocket, true, `${name} remains a socket`);
    assert.deepEqual(node.translation, expected, `${name} keeps its authored transform`);
  }
});

test('the real works loader exposes Derrick hooks, hierarchy, LODs, and authored cable origin', async () => {
  const metadata = json(PACKAGE_JSON);
  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const group = await loader.loadStandingPart('derrick');

  assert.ok(group, 'Derrick resolves through the standing works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.derrick.lod0]);
  assert.equal(group.userData.worksPartId, 'derrick');
  for (const [name, expected] of Object.entries(EXPECTED_HOOKS)) {
    const hook = group.userData.worksHooks[name];
    assert.ok(hook, `${name} is exposed to the renderer`);
    assert.ok(
      hook.position.distanceTo(new THREE.Vector3(...expected)) < 1e-6,
      `${name} transform is exact`,
    );
  }

  const byName = new Map();
  group.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_drum`).parent.name, 'drum_spin');
    assert.equal(byName.get(`LOD${lod}_cable`).parent.name, 'cable_anchor');
    assert.equal(byName.get(`LOD${lod}_lamp_L`).parent.name, 'lamp_L');
    assert.equal(byName.get(`LOD${lod}_lamp_L_lens`).parent.name, 'lamp_L');
    assert.equal(byName.get(`LOD${lod}_lamp_R`).parent.name, 'lamp_R');
    assert.equal(byName.get(`LOD${lod}_lamp_R_lens`).parent.name, 'lamp_R');
  }

  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_derrick').visible, true);
  assert.equal(byName.get('LOD1_derrick').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_derrick').visible, false);
  assert.equal(byName.get('LOD1_derrick').visible, true);

  const built = bindAuthoredDerrick(group);
  const scene = new THREE.Scene();
  const oldDerrick = { group: new THREE.Group() };
  oldDerrick.group.name = 'old-derrick-only';
  const rover = new THREE.Group(); rover.name = 'rover-sentinel';
  const machine = new THREE.Group(); machine.name = 'machine-sentinel';
  scene.add(oldDerrick.group, rover, machine);
  replaceDerrickInScene(scene, oldDerrick, built, new THREE.Vector3(11, 22, 3));
  assert.equal(oldDerrick.group.parent, null, 'only the replaced Derrick leaves the scene');
  assert.equal(rover.parent, scene, 'the rover is untouched by the Derrick swap');
  assert.equal(machine.parent, scene, 'machines are untouched by the Derrick swap');
  assert.equal(built.group.parent, scene);
  assert.deepEqual(built.group.position.toArray(), [11, 22, 3]);

  const anchor = built.dyn.cableAnchor.getWorldPosition(new THREE.Vector3());
  assert.ok(
    anchor.distanceTo(new THREE.Vector3(11, 22, 3).add(new THREE.Vector3(...EXPECTED_HOOKS.cable_anchor))) < 1e-5,
    'the live umbilical origin comes from cable_anchor at the mounted transform',
  );
  const lampsBefore = built.dyn.lamps.map((lamp) => lamp.getWorldPosition(new THREE.Vector3()));
  built.dyn.setDrumSpin(1.25);
  assert.ok(Math.abs(built.dyn.drum.rotation.z - 1.25) < 1e-8, 'drum_spin is animated around its pivot');
  built.dyn.lamps.forEach((lamp, index) => {
    assert.ok(
      lamp.getWorldPosition(new THREE.Vector3()).distanceTo(lampsBefore[index]) < 1e-8,
      'drum animation does not move the lamps',
    );
  });

  loader.releaseWorksPart(group);
  await loader.dispose('test');
});
