// PQ-131.04 — authored gallery Refinery release/runtime wire.
//
// Artifact checks bind release/package identity to the Cycle 03 visible LOD/maps and the
// transform-corrected combined export. Behavior checks drive the shared Works loader so
// functional anchors land on the charging well, lamp fixture, and flue outlet — not origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  authoredWorksMachineKind,
  bindAuthoredRefinery,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  REFINERY_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_refinery.glb');
const SOURCE_LODS = [0, 1, 2].map((lod) => (
  resolve(ROOT, `assets/works/refinery/source/refinery_lod${lod}.glb`)
));
const LOD0_MAPS = Object.freeze({
  basecolor: resolve(ROOT, 'assets/works/refinery/source/textures/refinery_lod0_basecolor.png'),
  normal: resolve(ROOT, 'assets/works/refinery/source/textures/refinery_lod0_normal.png'),
  orm: resolve(ROOT, 'assets/works/refinery/source/textures/refinery_lod0_orm.png'),
});
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_refinery.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-refinery/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-refinery/render.glb');
const MACHINE_FACTORY = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');

const EXPECTED_SOURCE_SHA = '55b35c4e28d23972e7e130bce35bd3d8a5aeec261ee022b992f5d1c490692795';
const EXPECTED_SOURCE_BYTES = 8295200;
const EXPECTED_LOD_SHA = Object.freeze([
  'f5d1e2e37351159919f8a9614e1a0384df06776c5f6a5714fd71e97bd91285a7',
  'f87b0c95768002b7d62d06cbb1e64db026e2679c7db016b0f1fc1d2b22d66ef6',
  '46dabce9edfc6504a135f2bd5abd5f86f2fe849fa8074faa96a50254c7770b1f',
]);
const EXPECTED_LOD0_MAPS = Object.freeze({
  basecolor: '1597e7002955ed41a8957a8e6362699f6fc1fd96a2bd4951c5baa008eb2e9452',
  normal: '160fbd102019ca1ae49156c83c0c6a3191c9a869e17f163672a2b1cc7490162d',
  orm: '554141cdaee28eb4b25e214c00e087739bbb91e61880c91260f72c536f364052',
});
const EXPECTED_LOD_TRIS = Object.freeze([7442, 1840, 560]);
const EXPECTED_MARKERS = Object.freeze({
  furnace_slit: [-0.2199999988079071, 0.2919999957084656, -0.03999999910593033],
  stack_vent: [0.18000000715255737, 1.1200000047683716, -0.800000011920929],
  lamp: [0.3100000023841858, 0.7400000095367432, -0.6499999761581421],
});
const EXPECTED_COLLISION_T = Object.freeze([0, 0.6000000238418579, 0]);
const EXPECTED_COLLISION_S = Object.freeze([
  1.0499999523162842,
  0.6000000238418579,
  1.0499999523162842,
]);

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

function geomBox(metadata, suffix) {
  const geo = metadata.geometry.find((entry) => String(entry.nodeId).endsWith(suffix));
  assert.ok(geo, `package geometry includes ${suffix}`);
  return new THREE.Box3(
    new THREE.Vector3(...geo.bounds.min),
    new THREE.Vector3(...geo.bounds.max),
  );
}

function assertNearFeature(box, point, limit, label) {
  const distance = box.distanceToPoint(point);
  assert.ok(
    distance <= limit,
    `${label} must sit on its physical feature (distance ${distance}, limit ${limit})`,
  );
}

function packageBlueprint(metadata) {
  const pixel = new Uint8Array([255, 255, 255, 255]);
  const atlas = new THREE.DataTexture(pixel, 1, 1);
  atlas.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ name: 'RefineryPackageAtlas', map: atlas });
  return {
    assetId: 'place_works_refinery',
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

test('the Refinery release and package remain bound to the accepted visible LODs', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_refinery');
  assert.ok(release, 'release manifest has the Refinery row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.deepEqual(SOURCE_LODS.map(sha256), EXPECTED_LOD_SHA);
  assert.equal(sha256(LOD0_MAPS.basecolor), EXPECTED_LOD0_MAPS.basecolor);
  assert.equal(sha256(LOD0_MAPS.normal), EXPECTED_LOD0_MAPS.normal);
  assert.equal(sha256(LOD0_MAPS.orm), EXPECTED_LOD0_MAPS.orm);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(readFileSync(SOURCE_GLB).length, EXPECTED_SOURCE_BYTES);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const source = glbJson(SOURCE_GLB);
  const sourceRoot = (source.nodes || []).find((node) => node.name === 'SF_WORKS_REFINERY_V1');
  assert.deepEqual(sourceRoot?.extras?.spacefaceAsset?.lodTriangles, {
    lod0: EXPECTED_LOD_TRIS[0],
    lod1: EXPECTED_LOD_TRIS[1],
    lod2: EXPECTED_LOD_TRIS[2],
  });

  const pilots = json(PILOTS);
  const pilot = pilots.pilots.find((row) => row.key === 'works-refinery');
  assert.ok(pilot, 'generated pilots manifest has works-refinery');
  assert.equal(pilot.runtimeAssetId, 'place_works_refinery');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.refinery.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  assert.deepEqual(
    metadata.runtime.markers.map((marker) => marker.name).sort(),
    [...REFINERY_HOOKS].sort(),
  );
  // Asteroid Works occupancy is the cell grid. This helper is the authored envelope in
  // the GLB contract; the package compiler correctly emits no physics collision for it.
  assert.deepEqual(metadata.collisions, []);
});

test('the Refinery release preserves non-identity collision and functional hook transforms', () => {
  const release = glbJson(RELEASE_GLB);
  const nodes = new Map((release.nodes || []).map((node) => [node.name, node]));
  const collision = nodes.get('COLLISION_HULL');
  assert.ok(collision, 'the non-render collision helper survives the release build');
  assert.equal(collision.mesh, undefined);
  assert.equal(collision.extras?.spaceface?.collision, true);
  assert.deepEqual(collision.translation, EXPECTED_COLLISION_T);
  assert.deepEqual(collision.scale, EXPECTED_COLLISION_S);

  for (const [name, expected] of Object.entries(EXPECTED_MARKERS)) {
    const node = nodes.get(name);
    assert.ok(node, `${name} survives the release build`);
    assert.equal(node.mesh, undefined, `${name} remains an empty functional transform`);
    assert.equal(node.extras?.spacefaceSocket, true);
    assert.deepEqual(node.translation, expected, `${name} keeps its authored transform`);
    assert.ok(
      Math.hypot(...expected) > 0.05,
      `${name} is not an identity/origin empty`,
    );
  }
  assert.ok(nodes.get('LOD0_furnace_slit'));
  assert.ok(nodes.get('LOD0_lamp_lens'));
  assert.ok(nodes.get('LOD0_refinery'));
});

test('package and runtime anchors land on the well, lamp fixture, and flue outlet', async () => {
  const metadata = json(PACKAGE_JSON);
  const byMarker = new Map(metadata.runtime.markers.map((marker) => [marker.name, marker]));
  const slitBox = geomBox(metadata, 'lod0-furnace-slit');
  const lampBox = geomBox(metadata, 'lod0-lamp-lens');
  const bodyBox = geomBox(metadata, 'lod0-refinery');

  for (const [name, expected] of Object.entries(EXPECTED_MARKERS)) {
    const marker = byMarker.get(name);
    assert.ok(marker, `package records ${name}`);
    const pos = vecFromMatrix(marker.matrix);
    assert.ok(pos.distanceTo(new THREE.Vector3(...expected)) < 1e-6, `${name} package matrix is not identity`);
  }
  assertNearFeature(slitBox, vecFromMatrix(byMarker.get('furnace_slit').matrix), 0.02, 'furnace_slit');
  assertNearFeature(lampBox, vecFromMatrix(byMarker.get('lamp').matrix), 0.03, 'lamp');
  const vent = vecFromMatrix(byMarker.get('stack_vent').matrix);
  assert.equal(bodyBox.containsPoint(vent), true, 'stack_vent sits on the authored flue, not the origin');

  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const source = await loader.loadWorksPart('refinery');

  assert.ok(source, 'Refinery resolves through the shared Works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.refinery.lod0]);
  assert.equal(source.userData.worksPartId, 'refinery');

  const byName = new Map();
  source.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const [name, expected] of Object.entries(EXPECTED_MARKERS)) {
    const hook = source.userData.worksHooks[name];
    assert.ok(hook, `${name} is exposed to the renderer`);
    hook.updateMatrixWorld(true);
    const world = hook.getWorldPosition(new THREE.Vector3());
    assert.ok(
      world.distanceTo(new THREE.Vector3(...expected)) < 1e-5,
      `${name} instantiated anchor is ${world.toArray()}, not the physical feature ${expected}`,
    );
  }
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_furnace_slit`).parent.name, 'furnace_slit');
    assert.equal(byName.get(`LOD${lod}_lamp_lens`).parent.name, 'lamp');
  }
  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_refinery').visible, true);
  assert.equal(byName.get('LOD1_refinery').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_refinery').visible, false);
  assert.equal(byName.get('LOD1_refinery').visible, true);

  const staticMaterial = byName.get('LOD0_refinery').material;
  const sharedLampMaterial = byName.get('LOD0_lamp_lens').material;
  const sharedFurnaceMaterial = byName.get('LOD0_furnace_slit').material;
  const built = bindAuthoredRefinery(source);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up glTF is seated into the XY cut plane');
  built.group.updateMatrixWorld(true);
  const seatedFurnace = built.dyn.furnaceAnchor.getWorldPosition(new THREE.Vector3());
  const seatedLamp = built.dyn.lampAnchor.getWorldPosition(new THREE.Vector3());
  const seatedVent = built.dyn.stackVent.getWorldPosition(new THREE.Vector3());
  assert.ok(seatedFurnace.length() > 0.05, 'seated furnace light is not at the cell origin');
  assert.ok(seatedLamp.length() > 0.05, 'seated lamp fixture is not at the cell origin');
  assert.ok(seatedVent.length() > 0.05, 'seated stack vent is not at the cell origin');
  assert.notEqual(byName.get('LOD0_lamp_lens').material, sharedLampMaterial, 'lamp gets an instance material');
  assert.notEqual(byName.get('LOD0_furnace_slit').material, sharedFurnaceMaterial, 'furnace slit gets an instance material');
  assert.equal(byName.get('LOD0_refinery').material, staticMaterial, 'jacket/stack/tank keep the shared atlas');
  built.dyn.lamp.emissive.setHex(0xff6242);
  assert.notEqual(staticMaterial.emissive.getHex(), 0xff6242, 'status does not repaint the jacket');

  built.dyn.setFurnaceIntensity(0.08);
  assert.equal(built.dyn.furnace.emissiveIntensity, 0.08, 'idle slit stays a faint ember');
  built.dyn.setFurnaceIntensity(1.5);
  for (const lod of [0, 1, 2]) {
    assert.equal(
      byName.get(`LOD${lod}_furnace_slit`).material.emissiveIntensity,
      1.5,
      `reduced-motion heat reaches LOD${lod} slit only`,
    );
  }
  assert.notEqual(staticMaterial.emissiveIntensity, 1.5, 'heat does not lift the shared atlas');

  assert.equal(loader.releaseWorksPart(source), true);
  assert.equal(loader.releaseWorksPart(source), false, 'duplicate async teardown is harmless');
  loader.dispose('refinery-test');
  assert.deepEqual(lease.releases, ['refinery-test']);
});

test('installed and ghost Refineries select the authored route; other Works assets stay themselves', () => {
  assert.equal(authoredWorksMachineKind('sm_refinery'), 'refinery');
  assert.equal(authoredWorksMachineKind('sm_massline_core'), 'massline_core');
  assert.equal(authoredWorksMachineKind('sm_fabricator'), 'fabricator');
  assert.equal(authoredWorksMachineKind('sm_extractor'), 'extractor');
  assert.equal(authoredWorksMachineKind('sm_gas_tap'), null);
  assert.equal(authoredWorksMachineKind('sm_cargo_port'), null);
  const source = readFileSync(MACHINE_FACTORY, 'utf8');
  assert.doesNotMatch(source, /kind\s*===\s*['"]refinery['"]/);
});
