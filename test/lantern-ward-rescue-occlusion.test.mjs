// The rescue-exit arrival radius must not multiply its authored body into a wall
// over Lantern Ward. These tests run the installed production wrapper and async
// admission with actual compiled GLB geometry. Texture/GPU pixels are not tested.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { createVisualFactory } from '../src/render/visualFactory.js';
import {
  installVisualOverrides, materializeBoundaryResolvingMarker,
  detachBoundaryResolvingMarker, setBoundaryStandInResolver,
} from '../src/render/visualOverrides.js';
import { BeaconLampLayer, beaconLampHeight, beaconLampSize } from '../src/render/beaconLampLife.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { prepareRenderPackageBlueprint, loadAuthoredRenderPackagePilot } from '../src/render/assetLoader.js';
import { getAssetResidency } from '../src/render/assetResidency.js';

const ROOT = 'assets/ships/release/parts/';
const BEACON = `${ROOT}places/place_lane_beacon.glb`;
const CARGO = `${ROOT}pods/pod_cargo_container.glb`;
const EXPLICIT = `${ROOT}places/place_cargo_pod_standard.glb`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const disk = path => readFile(new URL('../' + path, import.meta.url));
const rescue = () => ({ id: 705, type: 'beacon', alive: true, radius: 60,
  pos: { x: 2399.994, z: -573.106 }, rot: Math.PI / 2,
  data: { rescueExit: true, onboarding: true, rescue: true, rescueRole: 'beacon' } });

function near(actual, expected, label, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
function nearVector(actual, expected, label) {
  for (const axis of ['x', 'y', 'z']) near(actual[axis], expected[axis], `${label}.${axis}`);
}
function bounds(root) {
  // Admission freezes local matrices while detached. Force the same world-matrix
  // refresh as the presentation pass after grafting under the entity's pose.
  root.updateWorldMatrix(true, true, true);
  const box = new THREE.Box3().setFromObject(root);
  assert.equal(box.isEmpty(), false, `${root.name} must contain real geometry`);
  return { box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
}
function placeRoot(root, entity) {
  root.position.set(entity.pos.x, 7.25, entity.pos.z);
  root.rotation.y = -entity.rot;
  root.updateMatrixWorld(true);
}
function productionFactory() {
  return installVisualOverrides(createVisualFactory(), {
    releaseMode: true, directAuthoredMount: true, authoredWholeShipsOnly: true,
  });
}

async function packageFixture(source) {
  const pilot = renderPackagePilotForSourceUrl(source);
  assert.ok(pilot, `release registry owns ${source}`);
  const metadata = JSON.parse(await disk(pilot.metadataUrl));
  const renderer = {};
  const loader = createRenderPackageLoader({
    residency: getAssetResidency(renderer), contentDigest: digest,
    fetchImpl: async url => {
      assert.equal(String(url).replace(/^\.\//, ''), pilot.metadataUrl);
      return { ok: true, json: async () => structuredClone(metadata) };
    },
    loadGlb: async (url, accepted) => {
      const bytes = await disk(String(url).replace(/^\.\//, ''));
      assert.equal(digest(bytes), accepted.render.sha256);
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
    assert.equal(url, source);
    assert.equal(options.slot, pilot.slot);
    return loadAuthoredRenderPackagePilot(runtime, pilot, url, options);
  };
  return { renderer, pilot, load, close: () => loader.dispose() };
}

function expectedPackageBounds(record, radius, root, metadataFit = false) {
  // Independent geometry calculation: the admission fit uses the LOD0 union,
  // recenters all three axes, then fits the longest axis to the chosen diameter.
  const source = new THREE.Box3();
  for (const primitive of record.primitives) {
    if (primitive.tags?.lod && primitive.tags.lod.toLowerCase() !== 'lod0') continue;
    if (/LOD[12][_-]/i.test(primitive.name || '')) continue;
    primitive.geometry.computeBoundingBox();
    source.union(primitive.geometry.boundingBox.clone().applyMatrix4(primitive.matrix));
  }
  assert.equal(source.isEmpty(), false);
  // A resident marker uses compiled bounds metadata; commit measures decoded
  // geometry. Keep their small metadata quantization offset in the expectation.
  const center = metadataFit ? new THREE.Vector3().fromArray(record.bounds.center)
    : source.getCenter(new THREE.Vector3());
  const size = metadataFit ? new THREE.Vector3().fromArray(record.bounds.size)
    : source.getSize(new THREE.Vector3());
  const scale = 2 * radius / Math.max(size.x, size.y, size.z);
  const fit = new THREE.Matrix4().compose(center.multiplyScalar(-scale),
    new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
  // Only the entity pose belongs above a fitted package; arrival-zone scale does not.
  const pose = new THREE.Matrix4().compose(root.position, root.quaternion, new THREE.Vector3(1, 1, 1));
  return source.applyMatrix4(fit).applyMatrix4(pose);
}

test('package admission preserves the existing beacon child transforms and animation references', () => {
  const entity = rescue(), snapshot = JSON.stringify(entity);
  const factory = createVisualFactory(), nativeBuild = factory.build.bind(factory);
  let originalRoot, children, matrices, lens, blink;
  factory.build = current => {
    originalRoot = nativeBuild(current);
    placeRoot(originalRoot, current);
    assert.deepEqual(originalRoot.scale.toArray(), [60, 60, 60]);
    children = [...originalRoot.children];
    matrices = children.map(child => child.matrixWorld.clone());
    lens = children.find(child => child.userData.blink);
    assert.ok(lens, 'the real procedural beacon has a live lens');
    blink = lens.userData.blink;
    return originalRoot;
  };
  const root = installVisualOverrides(factory, { releaseMode: true }).build(entity);
  root.updateMatrixWorld(true);
  assert.equal(root, originalRoot, 'admission retains the root known to presentation consumers');
  assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
  for (const [i, child] of children.entries()) {
    assert.equal(root.getObjectById(child.id), child, 'existing drawable identities are preserved');
    child.matrixWorld.elements.forEach((value, j) => near(value, matrices[i].elements[j], 'procedural matrix'));
    assert.equal(child.visible, false, 'explicit rescue recipe remains hidden until admission');
  }
  assert.equal(lens.userData.blink, blink, 'the live lens animation keeps its original object');
  assert.equal(JSON.stringify(entity), snapshot, 'presentation does not change the 60 WU gameplay zone');

  const ordinary = { ...rescue(), id: 706, data: {} };
  const untouched = productionFactory().build(ordinary);
  assert.deepEqual(untouched.scale.toArray(), [60, 60, 60], 'unpackaged beacons keep their original producer');
  assert.equal(untouched.userData.requestAuthoredUpgrade, undefined);
});

test('real rescue beacon marker and asynchronous package stay within their 28 WU world envelope', async () => {
  const fixture = await packageFixture(BEACON);
  const entity = rescue(), snapshot = JSON.stringify(entity);
  const scene = new THREE.Scene(), root = productionFactory().build(entity);
  placeRoot(root, entity); scene.add(root);
  try {
    setBoundaryStandInResolver(() => null);
    const abstract = materializeBoundaryResolvingMarker(root);
    assert.ok(abstract, 'the pending navigation target keeps its resolving affordance');
    assert.ok(Math.max(...bounds(abstract).size.toArray()) <= 28.0001, 'cold marker is not scaled by arrival radius');
    detachBoundaryResolvingMarker(root);

    const record = await fixture.load(BEACON, { renderer: fixture.renderer, slot: 'place' });
    setBoundaryStandInResolver(() => record);
    // A fresh ordinary boundary arms its resident stand-in through the same production path.
    const warmRoot = productionFactory().build(entity);
    placeRoot(warmRoot, entity); scene.add(warmRoot); scene.remove(root);
    const marker = materializeBoundaryResolvingMarker(warmRoot);
    assert.ok(marker?.userData.admissionStandInHull, 'resident marker uses the released authored silhouette');
    const pending = bounds(marker);
    const expectedPending = expectedPackageBounds(record, 14, warmRoot, true);
    nearVector(pending.box.min, expectedPending.min, 'resident marker world minimum');
    nearVector(pending.box.max, expectedPending.max, 'resident marker world maximum');
    assert.ok(Math.max(...pending.size.toArray()) <= 28.0001, 'resident marker stays inside the authored diameter');

    let prepared = 0, published = 0;
    const completion = warmRoot.userData.requestAuthoredUpgrade(fixture.renderer, scene, {
      loadAuthoredPart: fixture.load,
      prepareAuthoredPipelines: async detached => {
        prepared++;
        assert.equal(detached.parent, null, 'package is prepared before live publication');
        near(Math.max(...bounds(detached).size.toArray()), 28, 'detached authored diameter');
      },
      touchAuthoredExactTarget: attached => {
        published++;
        assert.equal(attached.parent, warmRoot);
        near(Math.max(...bounds(attached).size.toArray()), 28, 'published authored diameter');
      },
    });
    assert.equal(warmRoot.userData.hull, undefined, 'async admission cannot publish synchronously');
    assert.equal(await completion, true);
    assert.equal(prepared, 1); assert.equal(published, 1);
    const hull = warmRoot.userData.hull, committed = bounds(hull);
    const expected = expectedPackageBounds(record, 14, warmRoot);
    nearVector(committed.box.min, expected.min, 'translated/rotated minimum');
    nearVector(committed.box.max, expected.max, 'translated/rotated maximum');
    nearVector(committed.center, warmRoot.position, 'package center stays on its beacon');
    near(Math.max(...committed.size.toArray()), 28, 'final authored diameter');
    nearVector(pending.size, committed.size, 'pending and committed silhouette extent');
    nearVector(pending.center.clone().sub(committed.center),
      expectedPending.getCenter(new THREE.Vector3()).sub(expected.getCenter(new THREE.Vector3())),
      'pending-to-commit offset is only the existing compiled-bounds quantization');
    assert.equal(marker.parent, null, 'stand-in retires when the actual model publishes');
    assert.equal(warmRoot.userData.resolvingMarker, undefined);
    assert.equal(warmRoot.userData.authoredAssetState, 'authored');
    assert.equal(hull.userData.spacefaceRenderPackage.contentHash, fixture.pilot.expectedContentHash);
    assert.equal(JSON.stringify(entity), snapshot);

    const lamps = new BeaconLampLayer();
    try {
      lamps.update([{ ...entity, view: { root: warmRoot } }], 123, false);
      const bead = warmRoot.getObjectByName(`sf-beacon-lamp-${entity.id}`);
      assert.ok(bead);
      const world = bead.getWorldPosition(new THREE.Vector3());
      nearVector(world, warmRoot.position.clone().add(new THREE.Vector3(0, beaconLampHeight(entity), 0)),
        'later lamp attachment uses world-unit height');
      assert.ok(bounds(bead).size.x <= 2 * beaconLampSize(entity) + 1e-4,
        'later lamp attachment does not inherit the arrival-zone multiplier');
    } finally { lamps.dispose(); }
    warmRoot.userData.releaseAuthoredAssetResidency?.('rescue-occlusion-test');
  } finally {
    detachBoundaryResolvingMarker(root);
    setBoundaryStandInResolver(null); fixture.close();
  }
});

test('ordinary cargo and explicit package recipes retain their selected fit radii after async admission', async () => {
  for (const [source, radius, entity] of [
    [CARGO, 6, { id: 710, type: 'payload', alive: true, radius: 6,
      pos: { x: 1480, z: -920 }, rot: Math.PI / 2, data: {} }],
    [EXPLICIT, 4, { id: 711, type: 'beacon', alive: true, radius: 60,
      pos: { x: 1910, z: -355 }, rot: Math.PI / 2,
      data: { rescueExit: true, packagedPropFile: 'places/place_cargo_pod_standard.glb', packagedPropRadius: 4 } }],
  ]) {
    const fixture = await packageFixture(source);
    const snapshot = JSON.stringify(entity), root = productionFactory().build(entity), scene = new THREE.Scene();
    placeRoot(root, entity); scene.add(root);
    try {
      assert.equal(root.userData.authoredPackageUrl, source);
      const record = await fixture.load(source, { renderer: fixture.renderer, slot: fixture.pilot.slot });
      assert.equal(await root.userData.requestAuthoredUpgrade(fixture.renderer, scene, { loadAuthoredPart: fixture.load }), true);
      const actual = bounds(root.userData.hull), expected = expectedPackageBounds(record, radius, root);
      near(Math.max(...actual.size.toArray()), radius * 2, `${source} fitted diameter`);
      nearVector(actual.box.min, expected.min, `${source} world minimum`);
      nearVector(actual.box.max, expected.max, `${source} world maximum`);
      nearVector(actual.center, root.position, `${source} centered on owner`);
      assert.equal(JSON.stringify(entity), snapshot, 'recipe admission does not change simulation identity');
      if (source === CARGO) assert.equal(root.userData.authoredPayloadAssetId, 'pod_cargo_container');
      root.userData.releaseAuthoredAssetResidency?.('rescue-occlusion-test');
    } finally { detachBoundaryResolvingMarker(root); fixture.close(); }
  }
});
