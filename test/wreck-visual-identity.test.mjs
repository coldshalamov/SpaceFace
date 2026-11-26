import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createVisualFactory, wreckPackagedFile } from '../src/render/visualFactory.js';
import {
  createOpeningStandInWarmSubject,
  materializeBoundaryResolvingMarker,
  setBoundaryStandInResolver,
} from '../src/render/visualOverrides.js';
import { createUnreadyDrawableGuard } from '../src/render/bloom.js';
import { preloadAuthoredPartLibrary, residentAuthoredRecordForFile } from '../src/render/partsLibrary.js';
import { syncResolvingMarker } from '../src/render/renderer.js';
import { createResidencyManager, stampGeometryGpuResident } from '../src/render/residencyManager.js';
import { hasUnresidentGeometry } from '../src/render/startupGpuResidency.js';

function build(data = {}) {
  return createVisualFactory().build({
    id: `wreck-${data.parentType || 'hull'}`,
    type: 'wreck',
    alive: true,
    radius: 8,
    data,
  });
}

function inspect(root) {
  const names = [];
  const materials = new Set();
  let spriteCount = 0;
  let meshCount = 0;
  root.traverse((object) => {
    if (object.name) names.push(object.name);
    if (object.isSprite) spriteCount++;
    if (object.isMesh) {
      meshCount++;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) if (material) materials.add(material);
    }
  });
  return { names, spriteCount, meshCount, materials: [...materials] };
}

test('ordinary wreck reads as named mechanical wreckage without a rock-like halo', () => {
  const root = build({ parentType: 'hull' });
  const result = inspect(root);

  assert.equal(root.userData.kind, 'wreck');
  assert.equal(root.userData.interactionKind, 'wreck');
  assert.equal(root.userData.visualLanguage, 'mechanical-wreckage');
  assert.equal(result.spriteCount, 0);
  // The wreck consolidates same-material pieces into per-material draw batches
  // (consolidateWreckDrawCalls), so the readable parts are the materials and the discrete
  // cut edge, not the pre-merge per-piece names. Identity, not draw-call shape, is the contract.
  assert.ok(result.meshCount >= 3, 'the consolidated wreck still draws its mechanical pieces');
  assert.ok(result.names.some((name) => /HullPlate/.test(name)),
    'the torn cut-edge plate stays discrete against the batches');
  const roles = new Set(result.materials.map((material) => material.userData?.spacefaceMaterialRole));
  assert.ok(roles.has('load-bearing-metal'), 'wreck keeps its structural spine material');
  assert.ok(roles.has('damaged-coated-hull'), 'wreck keeps its coated hull-plate material');
  assert.ok(roles.has('torn-exposed-metal'), 'wreck keeps its torn cut-edge material');
  assert.ok(result.materials.some((material) => material.map && material.normalMap && material.roughnessMap),
    'wreck surfaces need deterministic panel, normal, and roughness response');
  assert.ok(new Set(result.materials.map((material) => `${material.roughness}:${material.metalness}`)).size >= 3,
    'structure, coating, and torn edges must not share one clay response');
});

test('a pending packaged wreck arms a resolving marker against the commit fit frame', () => {
  const entity = { id: 'wreck-marker', type: 'wreck', alive: true, radius: 8,
    pos: { x: 0, z: 0 }, data: { parentType: 'hull' } };
  const root = createVisualFactory().build(entity);
  const ud = root.userData;

  // The hidden procedural substrate is authored-only while the packaged body is pending:
  // the boundary must arm the shared marker or it sits invisible on the glass for the
  // whole admission window (measured 3.4 s in the wild).
  assert.equal(ud.wantsBoundaryResolvingMarker, true);
  assert.equal(ud.boundaryResolvingMarkerEntity, entity);
  assert.equal(ud.boundaryResolvingStandInFile, wreckPackagedFile(entity));
  assert.equal(ud.boundaryResolvingStandInFit, 16,
    'the marker previews the commit fit (2*radius on the max axis), not the collider');
  assert.equal(ud.boundaryResolvingStandInRecenter, 'xyz',
    'fitPackagedGroupSteps recenters on all three axes — the marker previews the same frame');
  assert.equal(ud.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(ud.authoredPendingFallbackDrawn, false);

  const marker = materializeBoundaryResolvingMarker(root);
  assert.ok(marker && marker.isObject3D, 'the armed marker materializes a real drawable');
  assert.equal(marker.parent, root);
  assert.equal(ud.resolvingMarker, marker);
  assert.equal(ud.authoredResolvingMarker, true);
});

test('a Swarm wreck keeps drawing while its decoded body waits for GPU admission', async () => {
  const entity = {
    id: 620, type: 'wreck', alive: true, radius: 10, pos: { x: 0, z: 0 },
    data: { parentType: 'ship', wreckClass: 'battlefield', persistenceOwner: 'aftermathWrecks', runCohort: 'survival' },
  };
  const state = { mode: 'flight' };
  const factory = createVisualFactory();
  const scene = new THREE.Scene();
  const root = factory.build(entity);
  scene.add(root);
  const programs = new WeakMap();
  const draws = [];
  const residency = createResidencyManager({ hasUnresidentGeometry, requestRoots: async () => {} });
  const renderer = {
    properties: { get: (material) => programs.get(material) },
    renderBufferDirect(_camera, _scene, _geometry, _material, object) { draws.push(object); },
    __sfResidencyManager: residency,
    __sfPresentedPass: true,
  };
  createUnreadyDrawableGuard(renderer);
  const warmSubject = createOpeningStandInWarmSubject();
  const warmMarker = warmSubject.getObjectByName('AuthoredResolvingMarker_OpeningWarm');
  function admitDrawable(object) {
    stampGeometryGpuResident(object.geometry);
    programs.set(object.material, { currentProgram: { program: {}, isReady: () => true } });
  }
  admitDrawable(warmMarker);
  const geometry = new THREE.BoxGeometry(2, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x67564d });
  function presentedDraws(subject) {
    syncResolvingMarker(subject, state);
    residency.beginFrame();
    draws.length = 0;
    subject.traverseVisible((object) => {
      if (object.isMesh) renderer.renderBufferDirect(null, scene, object.geometry, object.material, object, null);
    });
    return draws.slice();
  }
  const file = wreckPackagedFile(entity);
  const load = async (url) => ({
    url,
    assetId: 'SWARM_DEBRIS_FIXTURE',
    bounds: { size: [2, 1, 1], center: [0, 0, 0] },
    primitives: [{ name: 'DebrisPlate', geometry, material, matrix: new THREE.Matrix4(), tags: {} }],
    residency: { state: 'resident' },
  });
  setBoundaryStandInResolver((_entity, requestedFile) => residentAuthoredRecordForFile(requestedFile, { renderer }));
  try {
    const [firstDraw] = presentedDraws(root);
    assert.ok(firstDraw?.material === warmMarker.material, 'the shared loading marker draws immediately');
    await preloadAuthoredPartLibrary(renderer, {
      releaseMode: true, libraryScope: 'wreck-fixture', bootstrapPlan: { place: [file] }, loadAuthoredPart: load,
    });
    assert.ok(residentAuthoredRecordForFile(file, { renderer }), 'the source finishes decoding before GPU admission');
    root.userData.admissionStandInRetryAt = 0;
    assert.ok(presentedDraws(root)[0] === firstDraw, 'the marker still draws after CPU decode');
    const nextWreck = factory.build(entity);
    const [nextDraw] = presentedDraws(nextWreck);
    assert.ok(nextDraw?.material === warmMarker.material, 'a new wreck also draws when only the source record is warm');
    assert.equal(await root.userData.requestAuthoredUpgrade(renderer, scene, {
      loadAuthoredPart: load,
      prepareAuthoredPipelines: async (packaged) => {
        packaged.traverse((object) => { if (object.isMesh) admitDrawable(object); });
      },
    }), true);
    assert.equal(root.userData.authoredVisualRoot, 'SWARM_DEBRIS_FIXTURE');
    assert.equal(firstDraw.parent, null, 'the exact packaged wreck replaces the marker at commit');
    assert.ok(presentedDraws(root).some((drawn) => drawn.geometry === geometry));
  } finally {
    setBoundaryStandInResolver(null);
    residency.dispose();
    warmSubject.userData.disposeOpeningWarm();
    geometry.dispose();
    material.dispose();
  }
});

test('unstable reactor wreck has a contained mechanical hazard core, not asteroid language', () => {
  const root = build({ parentType: 'reactor', unstableReactor: { dueAt: 20 } });
  const result = inspect(root);

  assert.equal(root.userData.interactionKind, 'unstable_reactor_wreck');
  assert.equal(root.userData.visualLanguage, 'mechanical-reactor-hazard');
  assert.equal(result.spriteCount, 0);
  assert.ok(result.names.some((name) => /ReactorCore/.test(name)));
  // Cage / ceramic / conduit / thermal hardware now ride material batches; assert the roles,
  // not the collapsed part names.
  const reactorRoles = new Set(result.materials.map((material) => material.userData?.spacefaceMaterialRole));
  assert.ok(reactorRoles.has('reactor-cage-metal'), 'reactor needs a contained mechanical cage');
  assert.ok(reactorRoles.has('reactor-service-conduit'), 'reactor needs service conduits, not only rings');
  assert.ok(result.materials.some((material) => material.userData?.spacefaceMaterialRole === 'reactor-ceramic'),
    'reactor needs a readable ceramic containment role');
  assert.ok(result.materials.some((material) => material.userData?.spacefaceMaterialRole === 'heat-affected-metal'),
    'reactor needs thermal hardware beyond a glowing ball');
  const effectiveMetalness = (role) => {
    const material = result.materials.find((entry) => entry.userData?.spacefaceMaterialRole === role);
    assert(material?.metalnessMap?.image?.data, `missing packed material role ${role}`);
    return material.metalness * (material.metalnessMap.image.data[2] / 255);
  };
  assert(effectiveMetalness('torn-exposed-metal') > 0.5, 'torn structural metal cannot shade like painted clay');
  assert(effectiveMetalness('heat-affected-metal') > 0.2, 'heat tint must not erase the underlying metal response');
  assert(effectiveMetalness('reactor-ceramic') < 0.02, 'ceramic must stay dielectric');
});
