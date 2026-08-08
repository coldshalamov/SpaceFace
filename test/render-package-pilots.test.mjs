import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';

import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import {
  buildAuthoredPlaceProp,
  invalidatePartsLibraryCaches,
  preloadAuthoredPartLibrary,
  syncAuthoredInstancePools,
  upgradeAuthoredPlaceBoundaryForProbe,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';
import {
  RENDER_PACKAGE_PILOTS,
  renderPackagePilotForAssetId,
  renderPackagePilotForSourceUrl,
} from '../src/render/renderPackageManifest.js';

if (!globalThis.document) {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return { style: {}, appendChild() {}, addEventListener() {} };
      const context = {
        canvas: { width: 256, height: 256 },
        fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
        bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        getImageData(_x, _y, width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        putImageData() {},
        measureText() { return { width: 10 }; },
        fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
      };
      return {
        width: 256,
        height: 256,
        style: {},
        addEventListener() {},
        getContext: () => context,
      };
    },
  };
}

test('production package build rejects runtime asset identity drift', async () => {
  await assert.rejects(
    derivePilotSemanticManifest({
      key: 'identity-drift',
      assetId: 'sf.render.identity-drift',
      runtimeAssetId: 'wrong-runtime-id',
      kind: 'place',
      rootNode: 'place_debris_chunk',
      dynamicNameIncludes: [],
    }, 'assets/ships/release/parts/places/place_debris_chunk.glb'),
    /runtime assetId wrong-runtime-id does not match source place_debris_chunk/,
  );
});

test('production manifest packages every live whole-ship family and admitted authored place', async () => {
  // Coverage is derived from the release manifest by scripts/generate-render-package-pilots.mjs, so
  // a frozen key list would defeat the point — it could only prove that someone remembered to add an
  // asset. Assert instead that the originally-admitted families are all still packaged, and let
  // `npm run check:render-package-coverage` own the "nothing is missing" half.
  const keys = new Set(RENDER_PACKAGE_PILOTS.map((entry) => entry.key));
  for (const key of [
    'kestrel',
    'ashline-dart',
    'ashline-lode',
    'ashline-rig',
    'helios-lark',
    'helios-cradle',
    'helios-span',
    'helios-trade-hub',
    'ceres-refinery',
    'jump-ring',
    'helios-rock-a',
    'helios-rock-b',
    'helios-rock-c',
    'seamed-asteroid',
    'conveyor-barge',
    'claim-outpost-base',
    'claim-outpost-refinery',
    'claim-outpost-relay',
    'nav-buoy',
    'lane-beacon',
    'station-billboard',
    'memorial-array',
    'debris-chunk',
    'dead-hulk',
    'dock-interior',
    'wasp',
  ]) assert.ok(keys.has(key), `${key} is still packaged`);
  assert.ok(RENDER_PACKAGE_PILOTS.length >= 26, 'coverage never shrinks below the admitted set');

  const wasp = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
  );
  assert.equal(wasp?.runtimeAssetId, 'SF_WASP_PRODUCTION_V1');
  const tradeHub = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_station_trade_hub.glb',
  );
  assert.equal(tradeHub?.runtimeAssetId, 'SF_PLACE_STATION_TRADE_HUB');
  const refinery = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_station_refinery.glb',
  );
  assert.equal(refinery?.runtimeAssetId, 'SF_PLACE_STATION_REFINERY');
  const jumpRing = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_gate_jump_ring.glb',
  );
  assert.equal(jumpRing?.runtimeAssetId, 'SF_PLACE_GATE_JUMP_RING');
  for (const suffix of ['a', 'b', 'c']) {
    const geology = renderPackagePilotForSourceUrl(
      `assets/ships/release/parts/places/place_asteroid_rock_${suffix}.glb`,
    );
    assert.equal(geology?.runtimeAssetId, `SF_PLACE_HELIOS_ROCK_${suffix.toUpperCase()}`);
  }
  for (const [sourceId, runtimeAssetId] of [
    ['place_asteroid_seamed', 'SF_PLACE_ASTEROID_SEAMED_GEOLOGY_V3'],
    ['place_conveyor_barge', 'SF_PLACE_CONVEYOR_BARGE'],
    ['place_claim_outpost_base', 'SF_PLACE_CLAIM_OUTPOST_BASE'],
    ['place_claim_outpost_refinery', 'SF_PLACE_CLAIM_OUTPOST_REFINERY'],
    ['place_claim_outpost_relay', 'SF_PLACE_CLAIM_OUTPOST_RELAY'],
  ]) {
    const worksite = renderPackagePilotForSourceUrl(
      `assets/ships/release/parts/places/${sourceId}.glb`,
    );
    assert.equal(worksite?.runtimeAssetId, runtimeAssetId);
  }
  for (const [sourceId, runtimeAssetId] of [
    ['place_nav_buoy', 'SF_PLACE_HELIOS_NAV_SPIRE'],
    ['place_lane_beacon', 'SF_PLACE_HELIOS_SUPPORT_GANTRY'],
    ['place_station_billboard', 'SF_PLACE_HELIOS_SUPPORT_DOCK_ARM'],
    ['place_memorial_array', 'SF_PLACE_MEMORIAL_ARRAY'],
  ]) {
    const marker = renderPackagePilotForSourceUrl(
      `assets/ships/release/parts/places/${sourceId}.glb`,
    );
    assert.equal(marker?.runtimeAssetId, runtimeAssetId);
  }

  for (const binding of RENDER_PACKAGE_PILOTS) {
    assert.strictEqual(renderPackagePilotForSourceUrl(binding.sourceUrl), binding);
    assert.strictEqual(renderPackagePilotForSourceUrl(`${binding.sourceUrl}?cache=1`), binding);
    assert.strictEqual(renderPackagePilotForAssetId(binding.assetId), binding);
    const [sourceBytes, metadataBytes] = await Promise.all([
      readFile(binding.sourceUrl),
      readFile(binding.metadataUrl),
    ]);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), binding.sourceSha256);
    assert.equal(metadata.assetId, binding.assetId);
    assert.equal(metadata.contentHash, binding.expectedContentHash);
    assert.equal(metadata.provenance.sourceGlb.sha256, binding.sourceSha256);
    assert.ok(metadata.geometry.every((geometry) => geometry.indexed === true),
      `${binding.key} preserves indexed production geometry`);
    if (binding.key === 'helios-trade-hub') {
      assert.ok(metadata.nodes.filter((node) => node.parentId === null).length > 1,
        'scene-root package preserves the authored multi-root hierarchy');
      assert.ok(metadata.anchors.some((anchor) => anchor.nodeName === 'SOCKET_Structure_Core'));
      assert.ok(metadata.collisions.some((collision) => collision.reference === 'COLLISION_HULL'));
    }
  }

  assert.equal(renderPackagePilotForSourceUrl('assets/ships/release/parts/wholeships/pelican.glb'), null);
  assert.equal(renderPackagePilotForAssetId('sf.render.unclaimed'), null);
});

test('production render-package instances bypass runtime geometry preparation on the place route', async () => {
  const entity = {
    id: 'pilot_debris',
    type: 'fx',
    alive: true,
    radius: 12,
    data: {
      placeId: 'place_debris_chunk',
      placeScale: 1,
    },
  };
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);

  const geometry = new THREE.BoxGeometry(4, 2, 3);
  geometry.clone = () => {
    throw new Error('production package geometry must not be cloned at runtime');
  };
  const material = new THREE.MeshStandardMaterial({ color: 0x7a7168 });
  const tags = Object.freeze({ lod: 'lod0', tint: 'none', instance: true });
  let instances = 0;
  const record = {
    url: 'assets/ships/release/parts/places/place_debris_chunk.glb',
    assetId: 'place_debris_chunk',
    slot: 'place',
    bounds: { size: [4, 2, 3], center: [0, 0, 0] },
    primitives: [{
      key: 'debris:lod0',
      name: 'LOD0_Debris_Material_Hull',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags,
    }],
    markers: [],
    renderPackage: {
      assetId: 'pilot.debris_chunk',
      contentHash: '1'.repeat(64),
      createInstance() {
        instances++;
        const root = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'LOD0_Debris_Material_Hull';
        mesh.userData.spacefaceTags = tags;
        root.add(mesh);
        // planNodes is part of the loader's instance contract: the flat instance plan in
        // depth-first pre-order with the root at index 0. partsLibrary specialises by iterating
        // this instead of root.traverse(), which is what keeps per-instance recursive traversal at
        // zero, so a stub that omits it is not a faithful stand-in for a real package instance.
        return { root, planNodes: [root, mesh], dispose() { return true; } };
      },
    },
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_debris_chunk.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );

  assert.equal(swapped, true);
  assert.equal(instances, 1);
  const directMeshes = [];
  boundary.traverse((object) => {
    if (object.isMesh && object.userData?.spacefaceRenderPackageDirect === true) directMeshes.push(object);
    assert.notEqual(object.userData?.spacefaceStaticBatch, true);
  });
  assert.equal(directMeshes.length, 1);
  assert.strictEqual(directMeshes[0].geometry, geometry, 'package instance shares its immutable decoded buffer');
});

test('repeated package-backed ship roots promote only eligible rigid surfaces into scene pools', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const preparedPoolTargets = [];
  const residentPoolTargets = [];
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-test',
    bootstrapPlan: {},
    loadAuthoredPart: async (url) => {
      assert.match(url, /wholeships\/helios_span\.glb$/);
      return fixture.record;
    },
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        assert.equal(subject.parent, null, 'the exact pool target compiles before scene publication');
        assert.equal(subject.count, 0, 'no pool slot is submitted before exact program admission');
        preparedPoolTargets.push(subject);
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async (subject) => {
      if (subject?.isInstancedMesh) {
        assert.equal(subject.parent, null, 'the exact pool target remains unpublished through GPU residency');
        assert.equal(subject.count, 0, 'GPU residency precedes every visible pool slot');
        residentPoolTargets.push(subject);
      }
      return { skipped: false };
    },
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-hauler-a', 0, renderer, scene, options);
    const firstInstance = authoredPackageInstance(first);
    const firstEligible = firstInstance.nodes.get('eligible');
    assert.equal(firstEligible.isMesh, true, 'a unique package surface stays a direct mesh');
    assert.equal(firstEligible.visible, true);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'one package root creates no singleton GPU pool');

    const second = await admitPackageShip('package-hauler-b', 40, renderer, scene, options);
    const secondInstance = authoredPackageInstance(second);
    const secondEligible = secondInstance.nodes.get('eligible');
    syncAuthoredInstancePools(scene);
    const pools = scene.children.filter((object) => object.userData?.spacefaceInstancePool);

    assert.equal(pools.length, 1);
    assert.equal(pools[0].count, 2, 'one existing pool owns both repeated authored-root surfaces');
    assert.equal(preparedPoolTargets.length, 1);
    assert.strictEqual(preparedPoolTargets[0], pools[0], 'pipeline admission receives the exact live pool target');
    assert.equal(residentPoolTargets.length, 1);
    assert.strictEqual(residentPoolTargets[0], pools[0], 'GPU residency receives the exact live pool target');
    for (let index = 0; index < 2; index++) {
      const submittedMatrix = new THREE.Matrix4();
      pools[0].getMatrixAt(index, submittedMatrix);
      assert.notEqual(submittedMatrix.determinant(), 0,
        `production pool sync submits repeated authored root slot ${index}`);
    }
    assert.equal(firstInstance.nodes.get('eligible'), firstEligible,
      'promotion preserves the first package semantic-map object identity');
    assert.equal(firstInstance.planNodes.includes(firstEligible), true,
      'promotion preserves first planNodes indexing');
    assert.equal(secondInstance.nodes.get('eligible'), secondEligible);
    assert.equal(secondInstance.planNodes.includes(secondEligible), true);
    for (const proxy of [firstEligible, secondEligible]) {
      assert.equal(proxy.isMesh, false, 'only direct renderer submission is suppressed');
      assert.equal(proxy.visible, true, 'pool visibility retains the authored/LOD-visible proxy state');
      assert.equal(proxy.userData.spacefaceInstanceProxy, true);
      assert.strictEqual(proxy.geometry, fixture.geometry);
      assert.ok(proxy.material, 'proxy retains its final shared material for bounds and texture residency');
      assert.equal(proxy.userData.spacefaceInstancePoolKey, pools[0].userData.spacefaceInstancePoolKey);
    }

    for (const id of fixture.excludedIds) {
      assert.equal(firstInstance.nodes.get(id).isMesh, true, `${id} stays direct on the first root`);
      assert.equal(secondInstance.nodes.get(id).isMesh, true, `${id} stays direct on the repeated root`);
      assert.notEqual(firstInstance.nodes.get(id).userData.spacefaceInstanceProxy, true);
      assert.notEqual(secondInstance.nodes.get(id).userData.spacefaceInstanceProxy, true);
    }
    const secondary = secondInstance.nodes.get(fixture.secondaryId);
    secondary.visible = false;
    syncAuthoredInstancePools(scene);
    assert.equal(secondary.visible, false, 'the real Helios Span damage-secondary transition remains direct');
    assert.equal(secondary.isMesh, true);

    let retiredPoolDisposals = 0;
    pools[0].addEventListener('dispose', () => { retiredPoolDisposals++; });
    scene.remove(second);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'dropping below two package owners demotes the survivor and retires its pool');
    assert.equal(firstEligible.isMesh, true);
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true,
      'the surviving direct mesh becomes the next cross-root candidate');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0,
      'unique-owner collapse unregisters the pool dynamic-buffer owner');
    assert.equal(retiredPoolDisposals, 1,
      'empty-pool teardown disposes InstancedMesh-specific GPU state exactly once');
    scene.remove(first);

    const third = await admitPackageShip('package-hauler-c', 80, renderer, scene, options);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'same-key re-admission starts direct without reviving a dead singleton pool');
    const fourth = await admitPackageShip('package-hauler-d', 120, renderer, scene, options);
    syncAuthoredInstancePools(scene);
    const readmittedPools = scene.children.filter((object) => object.userData?.spacefaceInstancePool);
    assert.equal(readmittedPools.length, 1, 'same-key repetition creates one clean replacement pool');
    assert.notStrictEqual(readmittedPools[0], pools[0]);
    assert.equal(readmittedPools[0].count, 2);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1);
    scene.remove(third, fourth);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('package pool allocation failure leaves the accepted first surface direct and retryable', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-failure-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
  };
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-failure-a', 0, renderer, scene, options);
    const firstEligible = authoredPackageInstance(first).nodes.get('eligible');
    const descriptor = Object.getOwnPropertyDescriptor(fixture.geometry, 'uuid');
    let reads = 0;
    Object.defineProperty(fixture.geometry, 'uuid', {
      configurable: true,
      get() {
        reads++;
        if (reads === 3) throw new Error('injected second-slot allocation failure');
        return descriptor.value;
      },
    });
    const failed = await requestPackageShip('package-failure-b', 40, renderer, scene, options);
    Object.defineProperty(fixture.geometry, 'uuid', descriptor);

    assert.equal(failed.userData.authoredAssetState, 'unavailable');
    assert.equal(firstEligible.isMesh, true, 'failed repetition never suppresses the accepted direct mesh');
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'partial allocation rolls back its detached chunk');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);

    scene.remove(failed);
    const retry = await admitPackageShip('package-failure-c', 80, renderer, scene, options);
    syncAuthoredInstancePools(scene);
    const pool = scene.children.find((object) => object.userData?.spacefaceInstancePool);
    assert.ok(pool, 'the retained first candidate admits cleanly after the injected failure');
    assert.equal(pool.count, 2);
    scene.remove(first, retry);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
  }
});

test('package pool activation failure rolls back committed matrices and direct mesh identity', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  let exactTarget = null;
  let injected = false;
  let activationMatrixWrites = 0;
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-activation-failure-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async () => ({ skipped: false }),
    prepareAuthoredGpuResidency: async (subject) => {
      if (subject?.isInstancedMesh && !injected) {
        exactTarget = subject;
        injected = true;
        const setMatrixAt = subject.setMatrixAt.bind(subject);
        let failNext = true;
        subject.setMatrixAt = (...args) => {
          activationMatrixWrites++;
          if (failNext) {
            failNext = false;
            throw new Error('injected detached activation matrix commit failure');
          }
          return setMatrixAt(...args);
        };
      }
      return { skipped: false };
    },
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-activation-a', 0, renderer, scene, options);
    const firstEligible = authoredPackageInstance(first).nodes.get('eligible');
    const failed = await requestPackageShip('package-activation-b', 40, renderer, scene, options);

    assert.equal(failed.userData.authoredAssetState, 'unavailable');
    assert.ok(exactTarget);
    assert.equal(exactTarget.parent, null, 'failed activation never publishes its exact pool target');
    assert.ok(activationMatrixWrites >= 2,
      'the injected activation write fails once and the rollback rewrites the detached zero slot');
    assert.equal(firstEligible.isMesh, true, 'activation failure restores the accepted direct renderer identity');
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(firstEligible.userData.spacefaceInstancePoolChunk, undefined);
    assert.equal(firstEligible.userData.spacefaceInstancePoolSlot, undefined);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);

    const source = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
    const admissionBody = source.slice(
      source.indexOf('function activateRenderPackagePoolAdmission'),
      source.indexOf('function activatePackageSlotsTransaction'),
    );
    assert.equal((admissionBody.match(/commitInstanceChunkMatrix\(chunk\)/g) || []).length, 0,
      'no unguarded final commit remains after proxy transfer/publication');

    scene.remove(failed);
    const retry = await admitPackageShip('package-activation-c', 80, renderer, scene, options);
    syncAuthoredInstancePools(scene);
    assert.equal(scene.children.filter((object) => object.userData?.spacefaceInstancePool).length, 1,
      'the restored direct candidate remains retryable after activation failure');
    scene.remove(first, retry);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('removing one owner during package pool admission restores the live direct candidate', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  let exactTarget = null;
  let releasePoolPreparation;
  const poolPreparation = new Promise((resolve) => { releasePoolPreparation = resolve; });
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-pending-removal-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        exactTarget = subject;
        await poolPreparation;
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-pending-a', 0, renderer, scene, options);
    const firstEligible = authoredPackageInstance(first).nodes.get('eligible');
    const pending = startPackageShip('package-pending-b', 40, renderer, scene, options);
    for (let turn = 0; turn < 80 && !exactTarget; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(exactTarget, 'the second root reaches exact detached pool admission');
    assert.equal(exactTarget.parent, null);
    assert.equal(exactTarget.count, 0);
    let disposals = 0;
    exactTarget.addEventListener('dispose', () => { disposals++; });

    scene.remove(pending);
    assert.equal(firstEligible.isMesh, true);
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(firstEligible.userData.spacefaceInstancePoolChunk, undefined);
    assert.equal(firstEligible.userData.spacefaceInstancePoolSlot, undefined);
    assert.equal(exactTarget.parent, null);
    assert.equal(disposals, 1, 'pending unique-owner collapse retires the detached chunk');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);

    releasePoolPreparation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(firstEligible.isMesh, true, 'late preparation completion cannot re-promote the survivor');
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    scene.remove(first);
  } finally {
    releasePoolPreparation();
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

async function admitPackageShip(id, x, renderer, scene, options) {
  const boundary = await requestPackageShip(id, x, renderer, scene, options);
  assert.equal(boundary.userData.authoredAssetState, 'authored');
  return boundary;
}

async function requestPackageShip(id, x, renderer, scene, options) {
  const boundary = startPackageShip(id, x, renderer, scene, options);
  for (let turn = 0; turn < 80 && !['authored', 'unavailable'].includes(boundary.userData.authoredAssetState); turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return boundary;
}

function startPackageShip(id, x, renderer, scene, options) {
  const entity = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    factionId: 'faction_union',
    radius: 20,
    pos: { x, z: 0 },
    data: {
      defId: 'ship_mule',
      trafficRole: 'hauler',
      sectorId: 'sector_helios_prime',
    },
  };
  const fallback = new THREE.Group();
  const fallbackHull = new THREE.Group();
  fallbackHull.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshBasicMaterial()));
  fallback.add(fallbackHull);
  fallback.userData.hull = fallbackHull;
  const boundary = wrapShipWithAuthoredParts(entity, fallback, options);
  entity.mesh = boundary;
  boundary.position.x = x;
  scene.add(boundary);
  boundary.userData.requestAuthoredUpgrade(renderer, scene);
  return boundary;
}

function authoredPackageInstance(boundary) {
  let instance = null;
  boundary.traverse((object) => {
    if (!instance && object.userData?.renderPackageInstance) instance = object.userData.renderPackageInstance;
  });
  assert.ok(instance, 'admitted authored ship exposes its retained package instance');
  return instance;
}

function installAuthoredAdmissionRuntime(scene, options) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    ...(previousWindow || {}),
    SF: {
      state: {
        mode: 'flight',
        render: {
          scene,
          compileObjectPipelines: options.prepareAuthoredPipelines,
          prepareAuthoredGpuResidency: options.prepareAuthoredGpuResidency,
        },
        world: { currentSectorId: 'sector_helios_prime' },
      },
    },
  };
  return () => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  };
}

async function packageShipFixture() {
  const heliosMetadata = JSON.parse(await readFile(new URL(
    '../assets/ships/release/render-packages/helios-span/render-package.json', import.meta.url,
  ), 'utf8'));
  const realSecondary = heliosMetadata.runtime.primitives.find((primitive) => (
    primitive.name === 'LOD0_Gun_Assembly' && primitive.tags?.damageRole === 'secondary'
  ));
  assert.ok(realSecondary, 'the production Helios Span package exposes its damage-secondary gun assembly');
  const geometry = new THREE.BoxGeometry(4, 2, 3);
  const opaque = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.7, metalness: 0.3 });
  const entries = [{ id: 'eligible', tags: Object.freeze({ lod: 'lod0', tint: 'hull', instance: true }) }];
  const add = (id, tags = {}, configure = null) => entries.push({ id, tags: Object.freeze(tags), configure });
  add('transparent', {}, (mesh) => { mesh.material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }); });
  add('canopy', { canopy: true });
  add('drive', { drive: 'core' });
  add('nav', { damageRole: 'navLight' });
  add('sensor', { damageRole: 'sensor' });
  add('armor', { damageRole: 'armor' });
  add(realSecondary.name, realSecondary.tags);
  add('decal', { decal: true });
  add('layers', {}, (mesh) => { mesh.layers.set(2); });
  add('renderOrder', {}, (mesh) => { mesh.renderOrder = 3; });
  add('customDepth', {}, (mesh) => { mesh.customDepthMaterial = new THREE.MeshDepthMaterial(); });
  add('customDistance', {}, (mesh) => { mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial(); });
  add('morph', {}, (mesh) => { mesh.morphTargetInfluences = [0]; mesh.morphTargetDictionary = { pose: 0 }; });

  const template = new THREE.Group();
  template.name = 'PackageShipRoot';
  const sources = [];
  for (const entry of entries) {
    const mesh = new THREE.Mesh(geometry, opaque);
    mesh.name = entry.id;
    mesh.userData.spacefaceTags = entry.tags;
    if (entry.configure) entry.configure(mesh);
    template.add(mesh);
    sources.push(mesh);
  }
  const renderPackage = {
    assetId: 'sf.render.fixture.helios-span',
    contentHash: '2'.repeat(64),
    createInstance(instanceOptions = {}) {
      const planSources = [template, ...sources];
      const objects = new Array(planSources.length);
      for (let i = 0; i < planSources.length; i++) {
        const source = planSources[i];
        const parentIndex = i === 0 ? -1 : 0;
        const created = instanceOptions.createNode?.({ source, planIndex: i, parentIndex });
        const object = created == null ? source.clone(false) : created;
        objects[i] = object;
        if (parentIndex >= 0) objects[parentIndex].add(object);
      }
      return {
        root: objects[0],
        planNodes: objects,
        nodes: new Map(entries.map((entry, index) => [entry.id, objects[index + 1]])),
        anchors: new Map(),
        dynamicGroups: new Map(),
        dispose() { return true; },
      };
    },
  };
  return {
    geometry,
    secondaryId: realSecondary.name,
    excludedIds: entries.slice(1).map((entry) => entry.id),
    record: {
      url: 'assets/ships/release/parts/wholeships/helios_span.glb',
      assetId: 'SF_WHOLESHIP_HELIOS_SPAN',
      slot: 'hull',
      bounds: { min: [-2, -1, -1.5], max: [2, 1, 1.5], size: [4, 2, 3], center: [0, 0, 0] },
      primitives: entries.map((entry) => ({
        key: `helios-span:${entry.id}`,
        name: entry.id,
        geometry,
        material: sources[entries.indexOf(entry)].material,
        matrix: new THREE.Matrix4(),
        tags: entry.tags,
      })),
      markers: [],
      renderPackage,
    },
  };
}
