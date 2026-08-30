// PQ-131.08 — authored gallery Fabricator release/runtime wire.
//
// The artifact checks bind release/package identity to the independently accepted source. The
// behavior checks drive the real shared Works loader so LOD selection, functional pivots, progress,
// material isolation, and resource retirement are exercised together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  authoredWorksMachineKind,
  bindAuthoredFabricator,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  FABRICATOR_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_fabricator.glb');
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_fabricator.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-fabricator/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-fabricator/render.glb');
const MACHINE_FACTORY = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');

const EXPECTED_SOURCE_SHA = '31e7e0f70ced279b5ffbefd6a482362688044306bdf4ce68d6a37294e9387b1f';
const EXPECTED_MARKERS = Object.freeze({
  gantry_head: [-0.699999988079071, 0.699999988079071, 0],
  lamp: [0.5199999809265137, 0.8199999928474426, -0.8999999761581421],
  rail: [-0.699999988079071, 0.699999988079071, 0],
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
  const material = new THREE.MeshStandardMaterial({ name: 'FabricatorPackageAtlas', map: atlas });
  return {
    assetId: 'place_works_fabricator',
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
      userData: { ...marker.userData },
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

test('the Fabricator release and package remain bound to the accepted source', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_fabricator');
  assert.ok(release, 'release manifest has the Fabricator row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const pilots = json(PILOTS);
  const pilot = pilots.pilots.find((row) => row.key === 'works-fabricator');
  assert.ok(pilot, 'generated pilots manifest has works-fabricator');
  assert.equal(pilot.runtimeAssetId, 'place_works_fabricator');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.fabricator.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  assert.deepEqual(
    metadata.runtime.markers.map((marker) => marker.name).sort(),
    [...FABRICATOR_HOOKS].sort(),
  );
});

test('the Fabricator release preserves collision, hooks, rail, and 1.4 m travel', () => {
  const release = glbJson(RELEASE_GLB);
  const nodes = new Map((release.nodes || []).map((node) => [node.name, node]));
  const collision = nodes.get('COLLISION_HULL');
  assert.ok(collision, 'the non-render collision helper survives the release build');
  assert.deepEqual(collision.translation, [0, 0.44999998807907104, 0]);
  assert.deepEqual(collision.scale, [1.0399999618530273, 0.44999998807907104, 1.0399999618530273]);
  assert.equal(collision.extras?.spaceface?.collision, true);

  for (const [name, expected] of Object.entries(EXPECTED_MARKERS)) {
    const node = nodes.get(name);
    assert.ok(node, `${name} survives the release build`);
    assert.equal(node.mesh, undefined, `${name} remains an empty functional transform`);
    assert.deepEqual(node.translation, expected, `${name} keeps its authored transform`);
  }
  assert.equal(nodes.get('gantry_head').extras?.spacefaceSocket, true);
  assert.equal(nodes.get('lamp').extras?.spacefaceSocket, true);
  assert.equal(nodes.get('rail').extras?.spacefaceRail, true);
  assert.deepEqual(nodes.get('gantry_head').extras?.travel?.axis, [1, 0, 0]);
  assert.equal(nodes.get('gantry_head').extras?.travel?.length, 1.4);
  assert.equal(nodes.get('rail').extras?.travelLength, 1.4);
});

test('the shared Works loader exposes Fabricator LODs, isolated lamp, and exact progress states', async () => {
  const metadata = json(PACKAGE_JSON);
  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const source = await loader.loadWorksPart('fabricator');

  assert.ok(source, 'Fabricator resolves through the shared Works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.fabricator.lod0]);
  assert.equal(source.userData.worksPartId, 'fabricator');
  for (const name of FABRICATOR_HOOKS) {
    assert.ok(source.userData.worksHooks[name], `${name} is exposed to the renderer`);
  }

  const byName = new Map();
  source.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_Gantry`).parent.name, 'gantry_head');
    assert.equal(byName.get(`LOD${lod}_Lamp`).parent.name, 'lamp');
  }
  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_fabricator').visible, true);
  assert.equal(byName.get('LOD1_fabricator').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_fabricator').visible, false);
  assert.equal(byName.get('LOD1_fabricator').visible, true);

  const staticMaterial = byName.get('LOD0_fabricator').material;
  const sharedLampMaterial = byName.get('LOD0_Lamp').material;
  const built = bindAuthoredFabricator(source);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up glTF is seated into the XY cut plane');
  assert.notEqual(byName.get('LOD0_Lamp').material, sharedLampMaterial, 'lamp gets an instance material');
  assert.equal(byName.get('LOD0_fabricator').material, staticMaterial, 'frame keeps the shared atlas');
  built.dyn.lamp.emissive.setHex(0xff6242);
  assert.notEqual(staticMaterial.emissive.getHex(), 0xff6242, 'status does not repaint the frame');

  built.dyn.setProgress(0);
  assert.ok(Math.abs(built.dyn.progressBar.position.x - (-0.7)) < 1e-6, 'progress 0 uses the authored rail start');
  built.dyn.setProgress(0.5);
  assert.ok(Math.abs(built.dyn.progressBar.position.x) < 1e-6, 'progress 0.5 centers the gantry head');
  built.dyn.setProgress(1);
  assert.ok(Math.abs(built.dyn.progressBar.position.x - 0.7) < 1e-6, 'progress 1 reaches the authored rail end');
  built.dyn.setProgress(2);
  assert.ok(Math.abs(built.dyn.progressBar.position.x - 0.7) < 1e-6, 'progress clamps without overshoot');

  loader.releaseWorksPart(source);
  await loader.dispose('test');
});

test('installed and ghost Fabricators select the authored route; obsolete procedural body is absent', () => {
  assert.equal(authoredWorksMachineKind('sm_fabricator'), 'fabricator');
  assert.equal(authoredWorksMachineKind('sm_extractor'), 'extractor');
  assert.equal(authoredWorksMachineKind('sm_massline_core'), 'massline_core');
  const source = readFileSync(MACHINE_FACTORY, 'utf8');
  assert.doesNotMatch(source, /kind\s*===\s*['"]fabricator['"]/);
});
