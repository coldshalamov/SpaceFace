// PQ-131.09 — authored Cargo Port release/package/runtime wire.
//
// Artifact checks bind the sanctioned release and render package to the independently accepted
// Cycle 04 source. Behavior checks drive the shared Works loader so LOD, hook hierarchy,
// seated/launch-clear pod motion, cumulative crate stages, and material isolation are proven
// together without a canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  authoredWorksMachineKind,
  bindAuthoredCargoPort,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  CARGO_PORT_HOOKS,
  CARGO_PORT_LAUNCH_CLEAR_WU,
  createWorksPartLoader,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_cargo_port.glb');
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_cargo_port.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-cargo-port/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-cargo-port/render.glb');
const MACHINE_FACTORY = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');
const RUNTIME_MANIFEST = resolve(ROOT, 'src/render/renderPackageManifest.js');

const EXPECTED_SOURCE_SHA = 'f4b8c87df96fce899c540e71f1ed76cfe2422d751dc5b1ab1214f2c0d1189614';
const EXPECTED_MARKERS = Object.freeze({
  cradle: [-0.2800000011920929, 0.41999998688697815, 0],
  crate_0: [0.7799999713897705, 0.09000000357627869, 0.699999988079071],
  crate_1: [0.800000011920929, 0.09000000357627869, 0.3799999952316284],
  crate_2: [0.9800000190734863, 0.09000000357627869, 0.03999999910593033],
  crate_3: [0.6600000262260437, 0.09000000357627869, -0.5199999809265137],
  crate_4: [0.9399999976158142, 0.09000000357627869, -0.5199999809265137],
  pod_root: [-0.2199999988079071, 0.18000000715255737, 0.03999999910593033],
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
  const material = new THREE.MeshStandardMaterial({ name: 'CargoPortPackageAtlas', map: atlas });
  return {
    assetId: 'place_works_cargo_port',
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

test('the Cargo Port release and package remain bound to the accepted Cycle 04 source', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_cargo_port');
  assert.ok(release, 'release manifest has the Cargo Port row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const pilots = json(PILOTS);
  assert.equal(pilots.pilots.length, 215, 'Cargo admission is the 215th render package');
  const pilot = pilots.pilots.find((row) => row.key === 'works-cargo-port');
  assert.ok(pilot, 'generated pilots manifest has works-cargo-port');
  assert.equal(pilot.runtimeAssetId, 'place_works_cargo_port');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.cargo_port.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);
  assert.match(readFileSync(RUNTIME_MANIFEST, 'utf8'), /"key": "works-cargo-port"/);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  assert.equal(readFileSync(PACKAGE_GLB).length, 1323332);
  const markerNames = metadata.runtime.markers.map((marker) => marker.name);
  for (const name of CARGO_PORT_HOOKS) {
    assert.ok(markerNames.includes(name), `${name} survives the render package`);
  }
});

test('the Cargo Port release keeps the eight hooks, keyed well, and +X freight stations', () => {
  const release = glbJson(RELEASE_GLB);
  const nodes = new Map((release.nodes || []).map((node) => [node.name, node]));
  for (const [name, expected] of Object.entries(EXPECTED_MARKERS)) {
    const node = nodes.get(name);
    assert.ok(node, `${name} survives the release build`);
    assert.equal(node.mesh, undefined, `${name} remains an empty functional transform`);
    assert.deepEqual(node.translation, expected, `${name} keeps its authored transform`);
  }
  assert.ok(nodes.get('pod_thruster'), 'pod_thruster survives the release build');
  assert.equal(nodes.get('pod_thruster').mesh, undefined);
  for (let i = 0; i < 5; i++) {
    assert.ok(nodes.get(`crate_${i}`).translation[0] > 0.6, `crate_${i} stays on the +X path`);
  }
  assert.ok(nodes.get('cradle').translation[0] < 0, 'the C cradle remains in the well');
  assert.ok(nodes.get('pod_root').translation[0] < 0, 'the pod remains seated in the well');
  assert.equal(nodes.get('crate_0').extras?.spacefaceSocket, true);
  assert.equal(nodes.get('pod_root').extras?.spacefaceSocket, true);
});

test('the shared Works loader exposes Cargo LODs, isolated dynamics, crates, and pod climb', async () => {
  const metadata = json(PACKAGE_JSON);
  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const source = await loader.loadWorksPart('cargo_port');

  assert.ok(source, 'Cargo Port resolves through the shared Works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.cargo_port.lod0]);
  assert.equal(source.userData.worksPartId, 'cargo_port');
  for (const name of CARGO_PORT_HOOKS) {
    assert.ok(source.userData.worksHooks[name], `${name} is exposed to the renderer`);
  }

  const byName = new Map();
  source.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_crate_0`).parent.name, 'crate_0');
    assert.equal(byName.get(`LOD${lod}_cradle`).parent.name, 'cradle');
    assert.equal(byName.get(`LOD${lod}_pod`).parent.name, 'pod_root');
    assert.equal(byName.get(`LOD${lod}_pod_thruster`).parent.name, 'pod_thruster');
  }
  assert.equal(byName.get('pod_thruster').parent.name, 'pod_root', 'the thruster climbs with the pod');
  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_cargo_port').visible, true);
  assert.equal(byName.get('LOD1_cargo_port').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_cargo_port').visible, false);
  assert.equal(byName.get('LOD1_cargo_port').visible, true);
  loader.setRegister('work');
  assert.equal(byName.get('LOD0_cargo_port').visible, true);

  const staticMaterial = byName.get('LOD0_cargo_port').material;
  const sharedCrateMaterial = byName.get('LOD0_crate_0').material;
  const sharedPodMaterial = byName.get('LOD0_pod').material;
  const sharedThrusterMaterial = byName.get('LOD0_pod_thruster').material;
  const built = bindAuthoredCargoPort(source);
  assert.equal(built.group.rotation.x, Math.PI / 2, 'Y-up glTF is seated into the XY cut plane');
  assert.equal(byName.get('LOD0_cargo_port').material, staticMaterial, 'port body keeps the shared atlas');
  assert.equal(byName.get('LOD0_cradle').material, staticMaterial, 'cradle keeps the shared atlas');
  assert.notEqual(byName.get('LOD0_crate_0').material, sharedCrateMaterial, 'crates get instance materials');
  assert.notEqual(byName.get('LOD0_pod').material, sharedPodMaterial, 'the pod gets an instance material');
  assert.notEqual(byName.get('LOD0_pod_thruster').material, sharedThrusterMaterial, 'the thruster lamp is instance-owned');
  built.dyn.lamp.emissive.setHex(0xff6242);
  assert.notEqual(staticMaterial.emissive.getHex(), 0xff6242, 'status does not repaint the port atlas');

  assert.equal(built.dyn.crateStage(), 0);
  for (let i = 0; i < 5; i++) assert.equal(built.dyn.crates[i].visible, false, `empty port hides crate_${i}`);
  built.dyn.setCrateStage(3);
  assert.equal(built.dyn.crateStage(), 3);
  assert.equal(built.dyn.crates[0].visible, true);
  assert.equal(built.dyn.crates[1].visible, true);
  assert.equal(built.dyn.crates[2].visible, true);
  assert.equal(built.dyn.crates[3].visible, false);
  assert.equal(built.dyn.crates[4].visible, false);
  built.dyn.setCrateStage(5);
  assert.ok(built.dyn.crates.every((crate) => crate.visible), 'stage 5 shows all five freight planforms');
  built.dyn.setCrateStage(9);
  assert.equal(built.dyn.crateStage(), 5, 'crate stage clamps without inventing a sixth module');

  const seatedY = built.dyn.pod.position.y;
  const podWorldBefore = built.dyn.pod.getWorldPosition(new THREE.Vector3());
  const thrusterBefore = byName.get('LOD0_pod_thruster').getWorldPosition(new THREE.Vector3());
  built.dyn.setPodLaunch(0);
  assert.ok(Math.abs(built.dyn.pod.position.y - seatedY) < 1e-6, 'seated pose is the authored rest');
  built.dyn.setPodLaunch(1);
  assert.ok(
    Math.abs(built.dyn.pod.position.y - (seatedY + CARGO_PORT_LAUNCH_CLEAR_WU)) < 1e-6,
    'launch-clear climbs 1.55 wu along glTF +Y',
  );
  const podWorldAfter = built.dyn.pod.getWorldPosition(new THREE.Vector3());
  const thrusterAfter = byName.get('LOD0_pod_thruster').getWorldPosition(new THREE.Vector3());
  assert.ok(podWorldAfter.distanceTo(podWorldBefore) > 1.5, 'the seated-to-clear climb is a real displacement');
  assert.ok(thrusterAfter.distanceTo(thrusterBefore) > 1.5, 'the thruster rides the pod out of the well');
  assert.ok(
    Math.abs(thrusterAfter.distanceTo(podWorldAfter) - thrusterBefore.distanceTo(podWorldBefore)) < 1e-4,
    'the thruster keeps its authored offset on the pod',
  );
  built.dyn.setPodLaunch(2);
  assert.ok(
    Math.abs(built.dyn.pod.position.y - (seatedY + CARGO_PORT_LAUNCH_CLEAR_WU)) < 1e-6,
    'pod climb clamps at launch-clear',
  );
  built.dyn.setPodVisible(false);
  assert.equal(built.dyn.pod.visible, false);

  loader.releaseWorksPart(source);
  await loader.dispose('test');
});

test('installed and ghost Cargo Ports select the authored route; neighbors and fallback stay themselves', () => {
  assert.equal(authoredWorksMachineKind('sm_cargo_port'), 'cargo_port');
  assert.equal(authoredWorksMachineKind('sm_fabricator'), 'fabricator');
  assert.equal(authoredWorksMachineKind('sm_extractor'), 'extractor');
  assert.equal(authoredWorksMachineKind('sm_refinery'), 'refinery');
  assert.equal(authoredWorksMachineKind('sm_massline_core'), 'massline_core');
  assert.equal(authoredWorksMachineKind('sm_gas_tap'), null);
  const source = readFileSync(MACHINE_FACTORY, 'utf8');
  assert.match(source, /kind\s*===\s*['"]cargo_port['"]/, 'procedural cargo remains the failure-only fallback');
  assert.doesNotMatch(source, /kind\s*===\s*['"]fabricator['"]/);
  assert.doesNotMatch(source, /kind\s*===\s*['"]refinery['"]/);
  assert.doesNotMatch(source, /kind\s*===\s*['"]core['"]/);
});
