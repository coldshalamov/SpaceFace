// PQ-131.07 — wall-mounted gas tap selected source/release/package and live Works routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  GAS_TAP_HOOKS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import {
  advanceGasTapWheelPhase,
  bindAuthoredGasTap,
  gasTapContactYawForContacts,
  gasTapNeedleTarget,
  gasTapProofTransform,
  settleAuthoredWorksArrival,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORING_SOURCE_PATH = 'assets/works/gas_tap/source/gas_tap.glb';
const SOURCE_PATH = 'assets/ships/parts/works/place_works_gas_tap.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_gas_tap.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-gas-tap/render-package.json';
const FROZEN_AUTHORING_SHA = '8da1d98dafe6ef475ff94c0f47e320c90128756bfb215ce7f362c8c52af8aa60';
const HOOKS = ['valve_wheel', 'gauge_needle', 'lamp'];

function pathOf(relative) { return resolve(ROOT, relative); }
function bytes(relative) { return readFileSync(pathOf(relative)); }
function json(relative) { return JSON.parse(readFileSync(pathOf(relative), 'utf8')); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }
function glbJson(relative) {
  const payload = bytes(relative);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${relative} must be a GLB`);
  const jsonLength = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + jsonLength).toString('utf-8').replace(/\s+$/u, ''));
}
function nodeNames(gltf) {
  return new Set((gltf.nodes || []).map((node) => node.name || ''));
}
function translate(x, y, z) { return new THREE.Matrix4().makeTranslation(x, y, z); }

function makeGasTapBlueprint() {
  const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const atlas = new THREE.DataTexture(new Uint8Array([64, 72, 76, 255]), 1, 1);
  atlas.needsUpdate = true;
  const staticMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4540, map: atlas });
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x33210b, emissive: 0x110804 });
  const positions = {
    valve_wheel: [0.52, 0.8, 0.08],
    gauge_needle: [0.56, 0.761, -0.54],
    lamp: [0.94, 0.96, 0.58],
  };
  const primitives = [
    ['LOD0_gas_tap', staticMaterial, [0, 0, 0], 'lod0'],
    ['LOD1_gas_tap', staticMaterial, [0, 0, 0], 'lod1'],
    ['LOD0_valve_wheel', staticMaterial, positions.valve_wheel, 'lod0'],
    ['LOD1_valve_wheel', staticMaterial, positions.valve_wheel, 'lod1'],
    ['LOD0_gauge_needle', staticMaterial, positions.gauge_needle, 'lod0'],
    ['LOD1_gauge_needle', staticMaterial, positions.gauge_needle, 'lod1'],
    ['LOD0_lamp', lensMaterial, positions.lamp, 'lod0'],
    ['LOD1_lamp', lensMaterial, positions.lamp, 'lod1'],
  ].map(([name, material, position, lod]) => ({
    name, geometry, material, matrix: translate(...position), tags: { lod },
  }));
  return {
    assetId: 'place_works_gas_tap',
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
    registry: { place_works_gas_tap: WORKS_PARTS.place_works_gas_tap },
  });
}

test('Gas tap selected runtime derives from the frozen authoring candidate without LOD2', () => {
  const authoring = bytes(AUTHORING_SOURCE_PATH);
  const source = bytes(SOURCE_PATH);
  assert.equal(sha256(authoring), FROZEN_AUTHORING_SHA, 'cycle-2 authoring candidate must stay frozen');
  assert.notEqual(sha256(source), FROZEN_AUTHORING_SHA);
  const gltf = glbJson(SOURCE_PATH);
  const names = nodeNames(gltf);
  for (const hook of HOOKS) assert.ok(names.has(hook), `missing hook ${hook}`);
  for (const lod of ['LOD0_', 'LOD1_']) {
    assert.ok([...names].some((name) => name.startsWith(lod)), `missing ${lod} register`);
  }
  assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false, 'LOD2 must not ship');
  assert.equal(gltf.asset.extras.spacefaceAsset.exportedLods.join(','), 'lod0,lod1');
  assert.equal(gltf.nodes.find((n) => n.name === 'valve_wheel').extras.spaceface.role, 'works_hook');
});

test('Gas tap release, manifest, package, and pilot bind to the selected runtime source', () => {
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  assert.notDeepEqual(release, source);
  const releaseManifest = json('assets/ships/release/release_manifest.json');
  const row = releaseManifest.assets.find((asset) => asset.id === 'place_works_gas_tap');
  assert.ok(row, 'release manifest row missing');
  assert.equal(row.sourceSha256, sha256(source));
  assert.equal(row.releaseSha256, sha256(release));
  assert.equal(row.releaseBytes, release.length);
  const manifest = json('assets/ships/parts/parts_manifest.json');
  const part = manifest.parts.find((entry) => entry.id === 'place_works_gas_tap');
  assert.ok(part, 'parts manifest row missing');
  assert.deepEqual([...part.hooks].sort(), [...HOOKS].sort());
  const metadata = json(PACKAGE_PATH);
  assert.equal(metadata.assetId, 'sf.render.works-gas-tap');
  assert.ok(metadata.runtime.primitives.every((row2) => !/^LOD2/u.test(row2.name)));
  const pilot = renderPackagePilotForAssetId('sf.render.works-gas-tap');
  assert.equal(pilot.key, 'works-gas-tap');
  assert.equal(pilot.runtimeAssetId, 'place_works_gas_tap');
  assert.equal(pilot.sourceUrl, 'assets/ships/release/parts/works/place_works_gas_tap.glb');
  assert.equal(pilot.sourceSha256, sha256(bytes(RELEASE_PATH)));
  assert.equal(pilot.assetId, 'sf.render.works-gas-tap');
});

test('Gas tap hierarchy preserves pose and isolates only the lamp lens materials', async () => {
  const loader = loaderFor(makeGasTapBlueprint());
  const group = await loader.loadWorksPart('place_works_gas_tap');
  assert.ok(group, 'loader returned no group');
  const bound = loader.bindGasTapForTest?.() || null;
  assert.ok(!bound, 'loader must not expose private helpers');
  const authored = bindAuthoredGasTap(group);
  assert.equal(authored.group, group);
  assert.equal(group.scale.x, 1);
  // Wheel/needle meshes live under their pivots and the wheel clears a spin without moving pose.
  const wheel = group.getObjectByName('valve_wheel');
  const wheelChild = wheel.getObjectByName('LOD0_valve_wheel');
  assert.ok(wheelChild, 'wheel mesh not bound under the valve_wheel pivot');
  const before = wheelChild.getWorldPosition(new THREE.Vector3());
  authored.dyn.setWheelPhase(1.3);
  assert.ok(wheel.rotation.y !== 0);
  assert.ok(wheelChild.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-4);
  const needle = group.getObjectByName('gauge_needle');
  authored.dyn.setNeedleAngle(-1.2);
  assert.ok(Math.abs(needle.rotation.y + 1.2) < 1e-6);
  // Only the two lamp shells are instance-owned; the atlas shell stays shared.
  const lampShells = [];
  const sharedShells = [];
  group.traverse((node) => {
    if (!node.isMesh) return;
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of rows) {
      if (material.userData?.worksInstanceOwned === true) lampShells.push(node.name);
      else sharedShells.push(node.name);
    }
  });
  assert.deepEqual(lampShells.sort(), ['LOD0_lamp', 'LOD1_lamp']);
  assert.ok(sharedShells.includes('LOD0_gas_tap') && sharedShells.includes('LOD1_gas_tap'));
  authored.dyn.setLamp(0x7cd9a2, 0.9);
  loader.releaseWorksPart(group);
});

test('Gas tap wheel phase and needle follow frame deltas, not wall time', () => {
  const phase = advanceGasTapWheelPhase(2, true, false, 0.25);
  assert.ok(Math.abs(phase - 2.6) < 1e-9);
  assert.equal(advanceGasTapWheelPhase(2, false, false, 0.25), 2, 'stopped wheel keeps its pose');
  assert.equal(advanceGasTapWheelPhase(2, true, true, 0.25), 2, 'reduced motion holds the pose');
  assert.equal(advanceGasTapWheelPhase(2, true, false, 0), 2, 'no negative/zero delta');
  assert.equal(advanceGasTapWheelPhase(undefined, true, false, 0.5), 1.2);
  assert.equal(gasTapNeedleTarget('running', false), -1.2);
  assert.equal(gasTapNeedleTarget('no-power', false), 0);
});

test('Gas tap yaws to the live gas contact and proof seating mirrors the permanent mount', () => {
  assert.equal(gasTapContactYawForContacts([{ kind: 'gas', dx: 1, dy: 0 }]), 0);
  assert.ok(Math.abs(gasTapContactYawForContacts([{ kind: 'gas', dx: 0, dy: 1 }]) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(gasTapContactYawForContacts([{ kind: 'gas', dx: -1, dy: 0 }]) - Math.PI) < 1e-9);
  assert.equal(gasTapContactYawForContacts([{ kind: 'ore', dx: 1, dy: 0 }]), 0);
  const transform = gasTapProofTransform({ cellX: 10, cellY: -8, cellSize: 2.2 });
  assert.equal(transform.scale, 1);
  assert.deepEqual(transform.rotation, [0, 0, 0]);
  assert.equal(transform.footprintCells, 1);
  assert.ok(Math.abs(transform.position[0] - 10) < 1e-9);
  assert.ok(Math.abs(transform.position[1] - (-8 - 1.1)) < 1e-9, 'native base anchors on the cell floor');
  assert.equal(transform.position[2], 0);
  assert.throws(() => gasTapProofTransform({ cellX: NaN, cellY: 0, cellSize: 1 }));
});

test('Gas tap late arrival releases without mounting', async () => {
  const loader = loaderFor(makeGasTapBlueprint());
  let installed = 0;
  let staleGroup = null;
  const outcome = await loader.loadWorksPart('place_works_gas_tap').then((group) => {
    staleGroup = group;
    return settleAuthoredWorksArrival({
      loader,
      group,
      isLive: () => false,
      install: () => { installed += 1; },
      onInstallError: () => { throw new Error('must not install'); },
    });
  });
  assert.equal(installed, 0, 'a stale arrival must never mount');
  assert.equal(outcome, null);
  assert.equal(staleGroup.userData.worksReleased, true, 'stale arrival must release its group');
});
