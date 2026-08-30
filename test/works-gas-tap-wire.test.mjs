// PQ-131.07 — authored Gas Tap release/package/runtime wire.
//
// Artifact checks bind the sanctioned release and render package to the independently accepted
// Cycle 02 source. Behavior checks drive the shared Works loader so LOD, hook hierarchy,
// wall facing, handwheel/needle motion, and material isolation are proven without a canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  authoredWorksMachineKind,
  bindAuthoredGasTap,
  gasTapNeedleAmount,
  GAS_TAP_NEEDLE_SWEEP,
  resolveGasTapWallYaw,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  GAS_TAP_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_gas_tap.glb');
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_gas_tap.glb');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PILOTS = resolve(ROOT, 'assets/ships/render-packages/pilots.json');
const PACKAGE_JSON = resolve(ROOT, 'assets/ships/release/render-packages/works-gas-tap/render-package.json');
const PACKAGE_GLB = resolve(ROOT, 'assets/ships/release/render-packages/works-gas-tap/render.glb');
const MACHINE_FACTORY = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');
const RUNTIME_MANIFEST = resolve(ROOT, 'src/render/renderPackageManifest.js');

const EXPECTED_SOURCE_SHA = '8da1d98dafe6ef475ff94c0f47e320c90128756bfb215ce7f362c8c52af8aa60';
const EXPECTED_MARKERS = Object.freeze({
  valve_wheel: [0.5199999809265137, 0.800000011920929, -0.07999999821186066],
  gauge_needle: [0.5600000023841858, 0.7609999775886536, 0.5400000214576721],
  lamp: [0.9399999976158142, 0.9599999785423279, -0.5799999833106995],
});
const EXPECTED_COLLISION_T = Object.freeze([0.6000000238418579, 0.47999998927116394, 0]);
const EXPECTED_COLLISION_S = Object.freeze([
  0.550000011920929,
  0.5,
  0.8999999761581421,
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

function packageBlueprint(metadata) {
  const pixel = new Uint8Array([255, 255, 255, 255]);
  const atlas = new THREE.DataTexture(pixel, 1, 1);
  atlas.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ name: 'GasTapPackageAtlas', map: atlas });
  return {
    assetId: 'place_works_gas_tap',
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

test('the Gas Tap release and package remain bound to the accepted Cycle 02 source', () => {
  const releaseManifest = json(RELEASE_MANIFEST);
  const release = releaseManifest.assets.find((row) => row.id === 'place_works_gas_tap');
  assert.ok(release, 'release manifest has the Gas Tap row');
  assert.equal(sha256(SOURCE_GLB), EXPECTED_SOURCE_SHA);
  assert.equal(release.sourceSha256, EXPECTED_SOURCE_SHA);
  assert.equal(sha256(RELEASE_GLB), release.releaseSha256);
  assert.equal(readFileSync(RELEASE_GLB).length, release.releaseBytes);
  assert.equal(release.ktx2Textures, release.textures, 'every release texture is KTX2');
  assert.ok(release.meshoptBufferViews > 0, 'release geometry is meshopt encoded');

  const pilots = json(PILOTS);
  assert.equal(pilots.pilots.length, 216, 'Gas Tap admission is the 216th render package');
  const pilot = pilots.pilots.find((row) => row.key === 'works-gas-tap');
  assert.ok(pilot, 'generated pilots manifest has works-gas-tap');
  assert.equal(pilot.runtimeAssetId, 'place_works_gas_tap');
  assert.equal(pilot.sourceUrl, WORKS_PARTS.gas_tap.lod0);
  assert.equal(pilot.releaseSha256, release.releaseSha256);
  assert.match(readFileSync(RUNTIME_MANIFEST, 'utf8'), /"key": "works-gas-tap"/);

  const metadata = json(PACKAGE_JSON);
  assert.equal(metadata.provenance.sourceGlb.sha256, release.releaseSha256);
  assert.equal(metadata.render.sha256, sha256(PACKAGE_GLB));
  const markerNames = metadata.runtime.markers.map((marker) => marker.name);
  for (const name of GAS_TAP_HOOKS) {
    assert.ok(markerNames.includes(name), `${name} survives the render package`);
  }
  assert.deepEqual(metadata.collisions, []);
});

test('the Gas Tap release keeps non-identity collision and functional hook transforms', () => {
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
    assert.ok(Math.hypot(...expected) > 0.05, `${name} is not an identity/origin empty`);
  }
  assert.ok(nodes.get('LOD0_valve_wheel'));
  assert.ok(nodes.get('LOD0_gauge_needle'));
  assert.ok(nodes.get('LOD0_lamp'));
  assert.ok(nodes.get('LOD0_gas_tap'));
});

test('the shared Works loader exposes Gas Tap LODs, wall facing, and isolated lamp dynamics', async () => {
  const metadata = json(PACKAGE_JSON);
  const blueprint = packageBlueprint(metadata);
  const lease = injectedLease(blueprint);
  const loader = createWorksPartLoader({ renderer: mockRenderer(), lease });
  const source = await loader.loadWorksPart('gas_tap');

  assert.ok(source, 'Gas Tap resolves through the shared Works lease');
  assert.deepEqual(lease.loads, [WORKS_PARTS.gas_tap.lod0]);
  assert.equal(source.userData.worksPartId, 'gas_tap');
  for (const name of GAS_TAP_HOOKS) {
    assert.ok(source.userData.worksHooks[name], `${name} is exposed to the renderer`);
  }

  const byName = new Map();
  source.traverse((obj) => { if (obj.name) byName.set(obj.name, obj); });
  for (const lod of [0, 1, 2]) {
    assert.equal(byName.get(`LOD${lod}_valve_wheel`).parent.name, 'valve_wheel');
    assert.equal(byName.get(`LOD${lod}_gauge_needle`).parent.name, 'gauge_needle');
    assert.equal(byName.get(`LOD${lod}_lamp`).parent.name, 'lamp');
  }
  for (const primitive of metadata.runtime.primitives) {
    const actual = byName.get(primitive.name).getWorldPosition(new THREE.Vector3());
    assert.ok(
      actual.distanceTo(vecFromMatrix(primitive.matrix)) < 1e-5,
      `${primitive.name} kept its world transform while its hook hierarchy was rebuilt`,
    );
  }

  assert.equal(byName.get('LOD0_gas_tap').visible, true);
  assert.equal(byName.get('LOD1_gas_tap').visible, false);
  loader.setRegister('site');
  assert.equal(byName.get('LOD0_gas_tap').visible, false);
  assert.equal(byName.get('LOD1_gas_tap').visible, true);
  loader.setRegister('work');
  assert.equal(byName.get('LOD0_gas_tap').visible, true);

  const staticMaterial = byName.get('LOD0_gas_tap').material;
  const sharedLampMaterial = byName.get('LOD0_lamp').material;
  const sharedWheelMaterial = byName.get('LOD0_valve_wheel').material;
  const built = bindAuthoredGasTap(source);
  assert.equal(built.group.name, 'gas_tap_facing');
  assert.equal(built.group.children[0].rotation.x, Math.PI / 2, 'Y-up glTF is seated into the XY cut plane');
  assert.notEqual(byName.get('LOD0_lamp').material, sharedLampMaterial, 'lamp gets an instance material');
  assert.equal(byName.get('LOD0_gas_tap').material, staticMaterial, 'manifold keeps the shared atlas');
  assert.equal(byName.get('LOD0_valve_wheel').material, sharedWheelMaterial, 'handwheel keeps the shared atlas');
  built.dyn.lamp.emissive.setHex(0xff6242);
  assert.notEqual(staticMaterial.emissive.getHex(), 0xff6242, 'status does not repaint the manifold atlas');

  built.dyn.setWallYaw(Math.PI / 2);
  assert.equal(built.dyn.wallYaw(), Math.PI / 2);
  const wheelRest = built.dyn.wheel.rotation.y;
  built.dyn.setWheelSpin(0.8);
  assert.ok(Math.abs(built.dyn.wheel.rotation.y - (wheelRest + 0.8)) < 1e-6);
  const needleRest = built.dyn.needle.rotation.y;
  built.dyn.setNeedleAmount(1);
  assert.ok(Math.abs(built.dyn.needle.rotation.y - (needleRest + GAS_TAP_NEEDLE_SWEEP)) < 1e-6);
  built.dyn.setNeedleAmount(-1);
  assert.ok(Math.abs(built.dyn.needle.rotation.y - needleRest) < 1e-6, 'needle amount clamps at rest');

  loader.releaseWorksPart(source);
  await loader.dispose('test');
});

test('wall yaw and needle amount come only from existing Gas Tap status/contact semantics', () => {
  const field = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ type: 'empty' })));
  field[3][2] = { type: 'gas' };
  assert.equal(resolveGasTapWallYaw(field, 2, 2, 5, 5), 0, 'east pocket keeps authored +X');
  field[3][2] = { type: 'empty' };
  field[2][1] = { type: 'gas' };
  assert.equal(resolveGasTapWallYaw(field, 2, 2, 5, 5), Math.PI / 2, 'north pocket yaws the lance +Y');
  field[2][1] = { type: 'empty' };
  field[1][2] = { type: 'gas' };
  assert.equal(resolveGasTapWallYaw(field, 2, 2, 5, 5), Math.PI, 'west pocket yaws 180');
  assert.equal(gasTapNeedleAmount({ state: 'idle' }), 0);
  assert.equal(gasTapNeedleAmount({ state: 'no-geology' }), 0);
  assert.equal(gasTapNeedleAmount({ state: 'running', genMW: 8 }), 0.5);
  assert.equal(gasTapNeedleAmount({ state: 'running', genMW: 16 }), 1);
  assert.equal(gasTapNeedleAmount({ state: 'running', ratePerMin: { cmdty_gas_hydrogen: 1 } }), 0.5);
});

test('installed and ghost Gas Taps select the authored route; neighbors and fallback stay themselves', () => {
  assert.equal(authoredWorksMachineKind('sm_gas_tap'), 'gas_tap');
  assert.equal(authoredWorksMachineKind('sm_cargo_port'), 'cargo_port');
  assert.equal(authoredWorksMachineKind('sm_fabricator'), 'fabricator');
  assert.equal(authoredWorksMachineKind('sm_extractor'), 'extractor');
  assert.equal(authoredWorksMachineKind('sm_refinery'), 'refinery');
  assert.equal(authoredWorksMachineKind('sm_massline_core'), 'massline_core');
  const source = readFileSync(MACHINE_FACTORY, 'utf8');
  assert.match(source, /kind\s*===\s*['"]gas_tap['"]/, 'procedural gas tap remains the failure-only fallback');
  assert.match(source, /kind\s*===\s*['"]cargo_port['"]/, 'procedural cargo remains the failure-only fallback');
  assert.doesNotMatch(source, /kind\s*===\s*['"]fabricator['"]/);
  assert.doesNotMatch(source, /kind\s*===\s*['"]refinery['"]/);
  assert.doesNotMatch(source, /kind\s*===\s*['"]core['"]/);
});
