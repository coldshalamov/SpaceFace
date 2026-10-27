// Neutral Last Shift recorder: exact production identity and CPU package/admission contracts.
// Actual compiled GLB Meshopt geometry and metadata are decoded. KTX2 image decoding is
// deliberately omitted by the texture plugin: these are not GPU, material-pixel or browser tests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { LAST_SHIFT, lastShiftBodyKey } from '../src/data/lastShift.js';
import { packagedPropSpec, lastShiftRecorderPackagedPropSpec, installVisualOverrides,
  setBoundaryStandInResolver, materializeBoundaryResolvingMarker,
  detachBoundaryResolvingMarker } from '../src/render/visualOverrides.js';
import { saveEnvelopeSectorStubs } from '../src/render/saveEnvelopeSectorWarm.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { prepareRenderPackageBlueprint, loadAuthoredRenderPackagePilot } from '../src/render/assetLoader.js';
import { getAssetResidency } from '../src/render/assetResidency.js';
import { computeRenderPackageContentHash, computeRenderPackageRuntimeHash } from '../src/contracts/renderPackage.js';

const SOURCE = 'assets/ships/release/parts/wholeships/thimble_recorder.glb';
const META = 'assets/ships/release/render-packages/thimble-recorder/render-package.json';
const RENDER = 'assets/ships/release/render-packages/thimble-recorder/render.glb';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const disk = path => readFile(new URL('../' + path, import.meta.url));
const original = () => ({ id: 9123, alive: true, type: 'wreck', mass: 5, radius: 5,
  x: 0, y: 0, z: 0, angle: 0, data: { persistenceOwner: LAST_SHIFT.persistenceOwner,
    lastShiftSiteId: LAST_SHIFT.siteId, lastShiftClueId: 'recorder',
    lastShiftBodyKey: lastShiftBodyKey('recorder'), parentType: 'communicator' } });

async function fixture() {
  const metadata = JSON.parse(await disk(META));
  const bytes = await disk(RENDER);
  const release = await disk(SOURCE);
  const pilot = renderPackagePilotForSourceUrl(SOURCE);
  assert.ok(pilot, 'production registry must bind the recorder');
  assert.equal(pilot.slot, 'pod');
  assert.equal(pilot.sourceSha256, digest(release));
  assert.equal(digest(bytes), metadata.render.sha256);
  assert.equal(bytes.length, metadata.render.bytes);
  assert.equal(await computeRenderPackageContentHash(metadata, { digest }), pilot.expectedContentHash);
  assert.equal(await computeRenderPackageRuntimeHash(metadata, { digest }), metadata.runtimeHash);
  const renderer = {};
  const residency = getAssetResidency(renderer);
  let decodeCount = 0;
  const loader = createRenderPackageLoader({
    residency, contentDigest: digest,
    fetchImpl: async url => {
      assert.equal(String(url).replace(/^\.\//, ''), META);
      return { ok: true, json: async () => structuredClone(metadata) };
    },
    loadGlb: async (url, accepted) => {
      assert.ok(String(url).endsWith('/thimble-recorder/render.glb'));
      assert.equal(digest(bytes), accepted.render.sha256);
      decodeCount++;
      const parser = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      parser.register(() => ({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(null) }));
      await MeshoptDecoder.ready;
      return parser.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    },
    prepareDecoded: (decoded, accepted, url, plan) =>
      prepareRenderPackageBlueprint(pilot, decoded, accepted, { renderer, plan }),
  });
  const runtime = { assets: new Map(), failures: new Map(), retiring: false, renderPackages: loader };
  const load = (url, options = {}) => {
    assert.equal(url, SOURCE);
    assert.equal(options.slot, 'pod');
    const actual = renderPackagePilotForSourceUrl(url);
    assert.equal(actual, pilot);
    return loadAuthoredRenderPackagePilot(runtime, actual, url, options);
  };
  return { metadata, pilot, renderer, residency, loader, runtime, load,
    decodeCount: () => decodeCount, close: () => loader.dispose() };
}

function boundary(entity) {
  let fallbackCalls = 0;
  const factory = installVisualOverrides({ build() { fallbackCalls++; throw Error('generic wreck must not run'); } },
    { releaseMode: true });
  const root = factory.build(entity);
  assert.equal(fallbackCalls, 0);
  assert.equal(root.userData.authoredPackageUrl, SOURCE);
  assert.equal(root.userData.authoredPackageSlot, 'pod');
  const scene = new THREE.Scene();
  scene.add(root);
  return { root, scene };
}

function planarEnvelope(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  let radius = 0, count = 0;
  const p = new THREE.Vector3();
  root.traverse(node => {
    const a = node.isMesh && node.geometry?.getAttribute('position');
    if (!a) return;
    for (let i = 0; i < a.count; i++) {
      p.fromBufferAttribute(a, i).applyMatrix4(node.matrixWorld);
      radius = Math.max(radius, Math.hypot(p.x, p.z)); count++;
    }
  });
  return { box, center, radius, count, size: box.getSize(new THREE.Vector3()) };
}

test('original recorder selects static pod; spoof/conflict/unrelated identities do not specialize', () => {
  const e = original(), snapshot = JSON.stringify(e), spec = lastShiftRecorderPackagedPropSpec(e);
  assert.deepEqual(spec, { file: 'wholeships/thimble_recorder.glb', slot: 'pod', radius: 4.4, hideImmediately: true });
  assert.equal(JSON.stringify(e), snapshot);
  for (const k of ['persistenceOwner', 'lastShiftSiteId', 'lastShiftClueId', 'lastShiftBodyKey', 'parentType']) {
    const bad = original(); bad.data[k] = 'wrong'; assert.equal(lastShiftRecorderPackagedPropSpec(bad), null, k);
  }
  for (const [k, v] of [['type', 'payload'], ['mass', 6], ['radius', 6], ['alive', false]]) {
    const bad = original(); bad[k] = v; assert.equal(lastShiftRecorderPackagedPropSpec(bad), null, k);
  }
  for (const [k, v] of [['assetRef', 'asset.slice.47a_spindle'], ['packagedPropFile', 'other.glb'],
    ['packagedPropRadius', 99], ['authoredPayloadAssetId', 'other'], ['precompileProbe', true]]) {
    const bad = original(); bad.data[k] = v; assert.equal(lastShiftRecorderPackagedPropSpec(bad), null, k);
  }
  const restored = original(); restored.id++; assert.equal(lastShiftRecorderPackagedPropSpec(restored), spec);
});

test('save warm is decode-only and converges with live recorder URL::pod, without reviving terminal records', () => {
  for (const status of [undefined, 'present', 'towed', 'destroyed', 'salvaged', 'returned']) {
    const data = { world: { currentSectorId: LAST_SHIFT.sectorId, lastShift: { bodies: { recorder: { status } } } } };
    const before = JSON.stringify(data);
    const stubs = saveEnvelopeSectorStubs(data).placeStubs.filter(e => e.data?.packagedPropFile === 'wholeships/thimble_recorder.glb');
    assert.equal(stubs.length, ['destroyed', 'salvaged', 'returned'].includes(status) ? 0 : 1);
    assert.equal(JSON.stringify(data), before);
    if (stubs.length) {
      assert.equal(stubs[0].type, 'prop'); assert.equal(stubs[0].data.persistenceOwner, undefined);
      assert.equal(packagedPropSpec(stubs[0]).file, packagedPropSpec(original()).file);
      assert.equal(packagedPropSpec(stubs[0]).slot, 'pod');
    }
  }
});

test('actual compiled recorder marker, commit, package identity and residency retain the conservative planar fit', async () => {
  const f = await fixture();
  const e = original(), before = JSON.stringify(e);
  let root;
  try {
    const record = await f.load(SOURCE, { renderer: f.renderer, slot: 'pod' });
    assert.equal(record.assetId, 'SF_PROP_THIMBLE_RECORDER');
    assert.equal(record.primitives.length, 4);
    assert.equal(record.renderPackage.contentHash, f.pilot.expectedContentHash);
    setBoundaryStandInResolver(() => null);
    ({ root } = boundary(e));
    const abstract = materializeBoundaryResolvingMarker(root);
    assert.ok(abstract);
    assert.equal(root.userData.boundaryResolvingStandInFit, 8.8);
    assert.equal(root.userData.boundaryResolvingStandInRecenter, 'xyz');
    assert.ok(planarEnvelope(abstract).size.x <= 8.8 + 1e-5, 'missing-record marker respects armed fit');
    detachBoundaryResolvingMarker(root);
    root.parent.remove(root);
    setBoundaryStandInResolver((entity, file) => {
      assert.equal(file, 'wholeships/thimble_recorder.glb'); return record;
    });
    const live = boundary(e); root = live.root;
    const marker = materializeBoundaryResolvingMarker(root);
    const pending = planarEnvelope(marker);
    assert.ok(pending.count > 2000, 'resident stand-in uses actual recorder geometry');
    assert.ok(pending.radius <= 5 + 1e-5);
    assert.ok(pending.size.x > 8.7 && pending.size.x <= 8.80001, 'readable planned size');
    const receipt = await root.userData.requestAuthoredUpgrade(f.renderer, live.scene, { loadAuthoredPart: f.load });
    assert.equal(receipt, true);
    const committed = planarEnvelope(root.userData.hull);
    assert.ok(committed.count > 2000);
    assert.ok(Math.abs(committed.radius - 4.855893) < 0.001);
    assert.ok(committed.center.length() < 1e-5);
    assert.ok(Math.abs(pending.size.x - committed.size.x) < 1e-5);
    assert.equal(root.userData.resolvingMarker, undefined);
    assert.equal(root.userData.hull.userData.spacefaceRenderPackage.contentHash, f.pilot.expectedContentHash);
    assert.equal(JSON.stringify(e), before, 'presentation must not mutate original actor/custody');
    assert.equal(f.decodeCount(), 1, 'warm and live use the same package decode');
    const resident = f.residency.diagnostics().assets.find(a => a.key.startsWith('render-package:'));
    assert.ok(resident);
    f.residency.releaseUnreferencedCacheOwners('recorder-pressure', { minAgeMs: 0, maxCacheOnlyBytes: 0 });
    assert.equal(record.renderPackage.evicted, false);
    root.userData.releaseAuthoredAssetResidency('recorder-release');
    f.residency.releaseUnreferencedCacheOwners('recorder-after-release', { minAgeMs: 0, maxCacheOnlyBytes: 0 });
    assert.equal(record.renderPackage.evicted, true);
  } finally { setBoundaryStandInResolver(null); f.close(); }
});

test('actual decoded recorder cannot publish into an orphaned boundary or superseded admission epoch', async () => {
  for (const mode of ['orphan', 'epoch']) {
    const f = await fixture(), { root, scene } = boundary(original());
    try {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const run = root.userData.requestAuthoredUpgrade(f.renderer, scene, {
        loadAuthoredPart: async (url, options) => { const record = await f.load(url, options); await gate; return record; },
      });
      if (mode === 'orphan') scene.remove(root);
      else root.userData.admissionEpoch++;
      release();
      assert.equal(await run, false, mode);
      assert.equal(root.userData.hull, undefined, mode);
    } finally { f.close(); }
  }
});
