// PQ-131.02 — authored gallery Massline Core release/runtime wire.
//
// The artifact checks bind release/package identity to the independently accepted source. The
// behavior checks drive the shared Works loader so LOD selection, hook hierarchy, ring motion,
// lamp isolation, authored route selection, and idempotent retirement are exercised together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  authoredWorksMachineKind,
  bindAuthoredMasslineCore,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  MASSLINE_CORE_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_massline_core.glb');
const SOURCE_LODS = [0, 1, 2].map((lod) => (
  resolve(ROOT, `assets/works/massline_core/source/massline_core_lod${lod}.glb`)
));
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_massline_core.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-massline-core/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-massline-core/render.glb');
const MACHINE_FACTORY = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');

const EXPECTED_SOURCE_SHA = '0f7dc23f35a43ab7e51988a15a9736461b036de4d373e3268dfead495958102d';
const EXPECTED_LOD_SHA = Object.freeze([
  'a665b42a874a232e9521b8898fa67ac80658577ace088a2a282e257c8e87c151',
  '9c6955896a4cf834f8fb537361aa633e0a33bad12e0f257b0fdcf39872a7493e',
  '3823fa5615b6e66d4e07edd49e8197233e6a9a860cdb49361266dd44b26ae97c',
]);
const EXPECTED_MARKERS = Object.freeze({
  lamp: [0.18000000715255737, 0.3619999885559082, -0.8920000195503235],
  ring_spin: [0, 0.5024999976158142, 0],
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
  const material = new THREE.MeshStandardMaterial({ name: 'MasslineCorePackageAtlas', map: atlas });
  return {
    assetId: 'place_works_massline_core',
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
    releases: [],
    isActive() { return true; },
    async load(url) {
      this.loads.push(url);
      return blueprint;
    },
    release(reason) {
      this.releases.push(reason);
      return 0;
    },
  };
}

test('the Massline Core release and package remain bound to the accepted source and LODs', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_massline_core');
  assert.ok(release, 'release manifest has the Massline Core row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.deepEqual(SOURCE_LODS.map(sha256), EXPECTED_LOD_SHA);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const pilots = json(PILOTS);
  const pilot = pilots.pilots.find((row) => row.key === 'works-massline-core');
  assert.ok(pilot, 'generated pilots manifest has works-massline-core');
  assert.equal(pilot.runtimeAssetId, 'place_works_massline_core');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.massline_core.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  assert.deepEqual(
    metadata.runtime.markers.map((marker) => marker.name).sort(),
    [...MASSLINE_CORE_HOOKS].sort(),
  );
});

test('the Massline Core release preserves collision and functional hook transforms', () => {
  const release = glbJson(RELEASE_GLB);
  const nodes = new Map((release.nodes || []).map((node) => [node.name, node]));
  const collision = nodes.get('COLLISION_HULL');
  assert.ok(collision, 'the non-render collision helper survives the release build');
  assert.equal(collision.mesh, undefined);
  assert.equal(collision.extras?.spaceface?.collision, true);

  for (const [name, expected] of Object.entries(EXPECTED_MARKERS)) {
    const node = nodes.get(name);
    assert.ok(node, `${name} survives the release build`);
    assert.equal(node.mesh, undefined, `${name} remains an empty functional transform`);
    assert.deepEqual(node.translation, expected, `${name} keeps its authored transform`);
    assert.equal(node.extras?.spacefaceSocket, true);
  }
});

test('the shared Works loader exposes Massline Core LODs, ring pivot, and isolated lamp', async () => {
  const metadata = json(PACKAGE_JSON);
  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const source = await loader.loadWorksPart('massline_core');

  assert.ok(source, 'Massline Core resolves through the shared Works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.massline_core.lod0]);
  assert.equal(source.userData.worksPartId, 'massline_core');
  for (const name of MASSLINE_CORE_HOOKS) {
    assert.ok(source.userData.worksHooks[name], `${name} is exposed to the renderer`);
  }

  const byName = new Map();
  source.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_massline_core_spin`).parent.name, 'ring_spin');
    assert.equal(byName.get(`LOD${lod}_massline_core_lamp`).parent.name, 'lamp');
  }
  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_massline_core').visible, true);
  assert.equal(byName.get('LOD1_massline_core').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_massline_core').visible, false);
  assert.equal(byName.get('LOD1_massline_core').visible, true);

  const staticMaterial = byName.get('LOD0_massline_core').material;
  const sharedLampMaterial = byName.get('LOD0_massline_core_lamp').material;
  const built = bindAuthoredMasslineCore(source);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up glTF is seated into the XY cut plane');
  assert.notEqual(byName.get('LOD0_massline_core_lamp').material, sharedLampMaterial, 'lamp gets an instance material');
  assert.equal(byName.get('LOD0_massline_core').material, staticMaterial, 'wellhead keeps the shared atlas');
  built.dyn.lamp.emissive.setHex(0xff6242);
  assert.notEqual(staticMaterial.emissive.getHex(), 0xff6242, 'status does not repaint the wellhead');

  built.dyn.setOrbitTheta(0.8);
  assert.ok(Math.abs(built.dyn.ring.rotation.y - 0.8) < 1e-6, 'reduced motion uses the stable ring pose');
  assert.ok(Math.abs(built.dyn.ring.rotation.z) < 1e-6, 'ring turns about exported local Y, not a tilted axis');
  built.dyn.setOrbitTheta(2.2);
  assert.ok(Math.abs(built.dyn.ring.rotation.y - 2.2) < 1e-6, 'normal motion preserves the old orbit phase contract');

  assert.equal(loader.releaseWorksPart(source), true);
  assert.equal(loader.releaseWorksPart(source), false, 'duplicate async teardown is harmless');
  loader.dispose('massline-core-test');
  assert.deepEqual(lease.releases, ['massline-core-test']);
});

test('installed and ghost Massline Cores select the authored route; obsolete procedural body is absent', () => {
  assert.equal(authoredWorksMachineKind('sm_massline_core'), 'massline_core');
  assert.equal(authoredWorksMachineKind('sm_fabricator'), 'fabricator');
  assert.equal(authoredWorksMachineKind('sm_refinery'), null);
  const source = readFileSync(MACHINE_FACTORY, 'utf8');
  assert.doesNotMatch(source, /kind\s*===\s*['"]core['"]/);
});
