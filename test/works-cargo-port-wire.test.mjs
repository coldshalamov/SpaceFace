// PQ-131.09 — cargo port + crates + courier selected source/release/package and live Works routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  CARGO_PORT_HOOKS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';
import {
  bindAuthoredCargoPort,
  settleAuthoredWorksArrival,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_PATH = 'assets/ships/parts/works/place_works_cargo_port.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_cargo_port.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-cargo-port/render-package.json';
const HOOKS = ['crate_0', 'crate_1', 'crate_2', 'crate_3', 'crate_4', 'cradle', 'pod_root', 'pod_thruster'];

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

function makePortBlueprint() {
  const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const atlas = new THREE.DataTexture(new Uint8Array([64, 72, 76, 255]), 1, 1);
  atlas.needsUpdate = true;
  const staticMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4540, map: atlas });
  const thrustMaterial = new THREE.MeshStandardMaterial({ color: 0x33210b, emissive: 0x110804 });
  const primitives = [
    { name: 'LOD0_cargo_port', geometry, material: staticMaterial, matrix: translate(0, 0, 0), tags: { lod: 'lod0' } },
    { name: 'LOD1_cargo_port', geometry, material: staticMaterial, matrix: translate(0, 0, 0), tags: { lod: 'lod1' } },
    ...HOOKS.flatMap((hook) => {
      const meshBase = hook === 'pod_root' ? 'pod'
        : (hook === 'pod_thruster' ? 'pod_thruster' : hook);
      const material = hook === 'pod_thruster' ? thrustMaterial : staticMaterial;
      return [['LOD0_', 'lod0'], ['LOD1_', 'lod1']].map(([lod, tag]) => ({
        name: `${lod}${meshBase}`, geometry, material, matrix: translate(0, 0, 0), tags: { lod: tag },
      }));
    }),
  ];
  return {
    assetId: 'place_works_cargo_port',
    primitives,
    markers: HOOKS.map((name) => ({ name, matrix: translate(0, 0, 0) })),
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
    registry: { place_works_cargo_port: WORKS_PARTS.place_works_cargo_port },
  });
}

test('Cargo port selected runtime carries the full hook set and no LOD2', () => {
  const gltf = glbJson(SOURCE_PATH);
  const names = nodeNames(gltf);
  for (const hook of HOOKS) assert.ok(names.has(hook), `missing hook ${hook}`);
  for (const hook of HOOKS) {
    const meshBase = hook === 'pod_root' ? 'pod'
      : (hook === 'pod_thruster' ? 'pod_thruster' : hook);
    assert.ok(names.has(`LOD0_${meshBase}`), `missing LOD0_${meshBase}`);
  }
  assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false, 'LOD2 must not ship');
  assert.equal(gltf.asset.extras.spacefaceAsset.exportedLods.join(','), 'lod0,lod1');
  assert.equal(gltf.nodes.find((n) => n.name === 'pod_root').extras.spaceface.role, 'works_hook');
});

test('Cargo port release, manifest, package, and pilot bind to the selected runtime source', () => {
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  assert.notDeepEqual(release, source);
  const releaseManifest = json('assets/ships/release/release_manifest.json');
  const row = releaseManifest.assets.find((asset) => asset.id === 'place_works_cargo_port');
  assert.ok(row, 'release manifest row missing');
  assert.equal(row.sourceSha256, sha256(source));
  assert.equal(row.releaseSha256, sha256(release));
  assert.equal(row.releaseBytes, release.length);
  const manifest = json('assets/ships/parts/parts_manifest.json');
  const part = manifest.parts.find((entry) => entry.id === 'place_works_cargo_port');
  assert.ok(part, 'parts manifest row missing');
  assert.deepEqual([...part.hooks].sort(), [...HOOKS].sort());
  const metadata = json(PACKAGE_PATH);
  assert.equal(metadata.assetId, 'sf.render.works-cargo-port');
  assert.ok(metadata.runtime.primitives.every((row2) => !/^LOD2/u.test(row2.name)));
  const pilot = renderPackagePilotForAssetId('sf.render.works-cargo-port');
  assert.equal(pilot.key, 'works-cargo-port');
  assert.equal(pilot.runtimeAssetId, 'place_works_cargo_port');
  assert.equal(pilot.sourceUrl, 'assets/ships/release/parts/works/place_works_cargo_port.glb');
  assert.equal(pilot.sourceSha256, sha256(bytes(RELEASE_PATH)));
  assert.equal(pilot.assetId, 'sf.render.works-cargo-port');
});

test('Cargo port hierarchy binds, stages five crates, and isolates only the thruster materials', async () => {
  const loader = loaderFor(makePortBlueprint());
  const group = await loader.loadWorksPart('place_works_cargo_port');
  assert.ok(group, 'loader returned no group');
  const authored = bindAuthoredCargoPort(group);
  assert.equal(authored.group, group);
  assert.equal(group.scale.x, 1);
  // Five-stage stack: stage 2 shows crate_0..1 and hides the rest.
  authored.dyn.setCrateStage(2);
  const visibility = authored.dyn.crates.map((c) => c.visible);
  assert.deepEqual(visibility, [true, true, false, false, false]);
  authored.dyn.setCrateStage(5);
  assert.deepEqual(authored.dyn.crates.map((c) => c.visible), [true, true, true, true, true]);
  authored.dyn.setCrateStage(0);
  assert.deepEqual(authored.dyn.crates.map((c) => c.visible), [false, false, false, false, false]);
  // Only the two thruster shells are instance-owned; everything else stays shared.
  const thrusterShells = [];
  const sharedShells = [];
  group.traverse((node) => {
    if (!node.isMesh) return;
    const rows = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of rows) {
      if (material.userData?.worksInstanceOwned === true) thrusterShells.push(node.name);
      else sharedShells.push(node.name);
    }
  });
  assert.deepEqual(thrusterShells.sort(), ['LOD0_pod_thruster', 'LOD1_pod_thruster']);
  assert.ok(sharedShells.includes('LOD0_cargo_port') && sharedShells.includes('LOD1_crate_4'));
  // The thruster is the only mutable surface; the port has no lamp (documented no-op).
  authored.dyn.setThruster(2.4);
  authored.dyn.setLamp(0x7cd9a2, 1);
  assert.ok(authored.dyn.pod, 'berthed courier pod_root must be exposed');
  loader.releaseWorksPart(group);
});

test('Cargo port late arrival releases without mounting', async () => {
  const loader = loaderFor(makePortBlueprint());
  let installed = 0;
  let released = 0;
  const settled = await settleAuthoredWorksArrival({
    loader: { releaseWorksPart: () => { released += 1; } },
    group: makePortBlueprint(),
    isLive: () => false,
    install: () => { installed += 1; },
    onInstallError: () => {},
  });
  assert.equal(settled, null, 'stale arrival must not install');
  assert.equal(installed, 0);
  assert.equal(released, 1, 'the stale group must be released, not leaked');
});
