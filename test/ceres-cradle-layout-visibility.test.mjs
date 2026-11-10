import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { ceresCradleKeeperVisible, createCeresCradleKeeperMask } from '../src/render/ceresCradleLayoutVisuals.js';

function cradle(id = 1) {
  return {id, occupantGeneration: 1, ...ceresWorkfleetHardwareSpec('cradle')};
}
function keeperRoot({material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1)} = {}) {
  const root = new THREE.Group();
  for (let lod = 0; lod < 3; lod++) for (const finish of ['Armor', 'BrushedMetal', 'Warning']) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `LOD${lod}_HOOK_CERES_DEPTH_KEEPER_${finish}`;
    mesh.userData.spacefaceTags = {lod: `lod${lod}`, instance: false};
    root.add(mesh);
  }
  const body = new THREE.Mesh(geometry, material);
  body.name = 'LOD0_Body'; root.add(body);
  return root;
}
const keepers = root => root.children.filter(node => node.name.includes('HOOK_CERES_DEPTH_KEEPER'));
const shown = root => keepers(root).filter(node => node.visible).map(node => node.name);

// These are CPU graph/publication proofs, not shipping WebGL capture.
test('keeper predicate has exactly two layouts and three LODs; unknown state never implies legacy', () => {
  for (const layout of [null, undefined, 'open-v1', 'pending', 'forged', {layout: 'keepers-v2'}]) {
    assert.equal(ceresCradleKeeperVisible(layout, 'lod0', 'lod0'), false);
  }
  for (const lod of ['lod0', 'lod1', 'lod2']) {
    assert.equal(ceresCradleKeeperVisible('keepers-v2', lod, lod), true);
    assert.equal(ceresCradleKeeperVisible('keepers-v2', lod, 'lod9'), false);
  }
});

test('mixed legacy/current instances share assets but only current shows the whole selected keeper LOD', () => {
  const material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const legacy = keeperRoot({material, geometry}), current = keeperRoot({material, geometry});
  const left = createCeresCradleKeeperMask(legacy, cradle(1));
  const right = createCeresCradleKeeperMask(current, cradle(2));
  assert.equal(left.valid, true); assert.equal(right.valid, true);
  assert.deepEqual(shown(legacy), []); assert.deepEqual(shown(current), []);
  for (const lod of ['lod0', 'lod1', 'lod2', 'lod2', 'lod0']) {
    assert.equal(left.apply('open-v1', lod), true);
    assert.equal(right.apply('keepers-v2', lod), true);
    assert.deepEqual(shown(legacy), []);
    assert.equal(shown(current).length, 3);
    assert.ok(shown(current).every(name => name.startsWith(lod.toUpperCase())));
    assert.equal(legacy.getObjectByName('LOD0_Body').visible, true);
    assert.equal(material.visible, true); assert.equal(material.opacity, 1);
  }
  left.dispose(); assert.equal(shown(current).length, 3);
  right.dispose(); assert.deepEqual(shown(current), []);
  assert.equal(right.apply('keepers-v2'), false);
});

for (const defect of ['missing', 'duplicate', 'pooled', 'wrong-lod', 'unsealed', 'unknown-finish']) {
  test(`malformed ${defect} bank withholds every keeper rather than drawing partial hardware`, () => {
    const root = keeperRoot(), mesh = root.children[0];
    if (defect === 'missing') root.remove(mesh);
    if (defect === 'duplicate') root.add(mesh.clone());
    if (defect === 'pooled') mesh.userData.spacefaceInstancePoolKey = 'foreign';
    if (defect === 'wrong-lod') mesh.userData.spacefaceTags.lod = 'lod2';
    if (defect === 'unsealed') mesh.userData.spacefaceTags.instance = true;
    if (defect === 'unknown-finish') mesh.name = 'LOD0_HOOK_CERES_DEPTH_KEEPER_Unknown';
    const mask = createCeresCradleKeeperMask(root, cradle());
    assert.equal(mask.valid, false); assert.equal(mask.apply('keepers-v2'), false);
    assert.deepEqual(shown(root), []);
  });
}

test('ordinary wrecks and Ceres siblings cannot acquire a cradle mask', () => {
  const root = keeperRoot(), entity = cradle();
  entity.data.worldRecordId = 'ordinary';
  assert.equal(createCeresCradleKeeperMask(root, entity), null);
  for (const role of ['breaker', 'cutterHead']) {
    assert.equal(createCeresCradleKeeperMask(root, ceresWorkfleetHardwareSpec(role)), null);
  }
});

import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import { reconcileCeresWorkfleetPresentation } from '../src/systems/ceresWorkfleet.js';
import { readCeresCradleLayout, bindCeresCradleLayout, canPublishCeresCradleLayout } from '../src/core/ceresWorkfleetLayoutAdmission.js';
import { machineryPresentationPlace, machineryHasEffectivePresentation, machineryNeedsReconciliation,
  markMachineryEffective, bindMachineryPresentation, recordCeresCradleAuthoredLayout } from '../src/core/machineryPresentation.js';
import { markPhysicsBodyNativeFailure, clearPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { buildAuthoredPlaceProp, upgradeAuthoredPlaceBoundaryForProbe, publishPreparedAuthoredBoundary,
  disposePreparedAuthoredBoundary } from '../src/render/partsLibrary.js';
import { render, runWebGlContextRestoreRebuild } from '../src/render/renderer.js';
import { ceresWorkfleetVisualRigs } from '../src/render/ceresWorkfleetVisuals.js';

const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const flush = async () => {for (let i = 0; i < 50; i++) await Promise.resolve();};
function oldRecord(layout) {
  return {pos: {x: 0, z: 0}, vel: {x: 0, z: 0}, rot: 0, angVel: 0,
    itinerary: {ceresWorkfleet: {slide: .25, ...(layout ? {cradleLayout: layout} : {})}}};
}
function packageRecord({malformed = false} = {}) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial();
  const descriptors = [];
  for (let lod = 0; lod < 3; lod++) for (const finish of ['Armor', 'BrushedMetal', 'Warning']) {
    descriptors.push({name: `LOD${lod}_HOOK_CERES_DEPTH_KEEPER_${finish}`, tags: {lod: `lod${lod}`, instance: false}});
  }
  if (malformed) descriptors.pop();
  descriptors.push({name: 'LOD0_Body', tags: {lod: 'lod0'}});
  return {url: `assets/ships/release/parts/${C.assets.cradle.file}`, assetId: C.assets.cradle.assetId, slot: 'place',
    bounds: {min: [-42.5, -5, -37.5], max: [42.5, 10, 37.5], size: [85, 15, 75], center: [0, 2.5, 0]},
    primitives: descriptors.map((d, i) => ({...d, key: `cradle:${i}`, geometry, material, matrix: new THREE.Matrix4()})),
    markers: [], renderPackage: {assetId: C.assets.cradle.assetId, contentHash: 'keeper-publication-cpu-fixture', createInstance() {
      const root = new THREE.Group();
      for (const d of descriptors) {const mesh = new THREE.Mesh(geometry, material); mesh.name = d.name; root.add(mesh);}
      for (const rig of ceresWorkfleetVisualRigs('cradle')) {
        const pivot = new THREE.Group(); pivot.name = rig.node; root.add(pivot);
      }
      return {root, planNodes: [root, ...root.children], dispose() {root.clear();}};
    }}};
}
function liveFixture({legacy = false, reconcile = true} = {}) {
  const sim = createSimulation({seed: 621, systems: []}), state = sim.state;
  state.mode = 'loading'; state.world.currentSectorId = C.sectorId;
  const entity = sim.spawn({...ceresWorkfleetHardwareSpec('cradle', legacy ? oldRecord() : null), pos: {x: 0, z: 0}, rot: 0});
  const scene = new THREE.Scene(), renderer = {};
  state.render = {scene, renderer, admissionRunGeneration: 1, compileObjectPipelines: async () => ({ready: true})};
  const owner = {state, registry: {get: () => null}};
  if (reconcile) reconcileCeresWorkfleetPresentation(owner);
  const view = Object.create(render);
  Object.assign(view, {state, scene, renderer, _meshes: new Map(), _meshesVersion: 0,
    _frameMembrane: {toLocal: p => p}, _shadowPolicyOptions: () => ({}),
    _presentationWorld: {handleForEntityId: id => ({id}), bindMesh: () => true, unbindMesh: () => true},
    _persistentSubmitLanes: {reserve() {}, release() {}}});
  const oldWindow = globalThis.window; globalThis.window = {SF: {state}};
  const boundary = buildAuthoredPlaceProp(entity, {releaseMode: true}), fallback = boundary.children[0];
  scene.add(boundary); view._meshes.set(entity.id, boundary); view._bindPresentationMesh(entity, boundary);
  const upgrade = (options = {}) => upgradeAuthoredPlaceBoundaryForProbe(boundary, fallback, entity, C.assets.cradle.file,
    renderer, scene, {releaseMode: true, loadAuthoredPart: async () => packageRecord(),
      prepareAuthoredPipelines: async () => ({ready: true}), ...options});
  return {sim, state, entity, boundary, fallback, view, owner, upgrade,
    reconcile() {reconcileCeresWorkfleetPresentation(owner);},
    sync(native) {const a = ensureActivityClassified(state); native.syncFromEntityLayers(a.physicsStatics, a.physicsDynamics, a.physicsStaticVersion);},
    close() {
      boundary.traverse(node => node.userData?.detachAuthoredMotion?.());
      globalThis.window = oldWindow; sim.dispose();
    }};
}
function graphKeepers(root) {const nodes = []; root.traverse(n => {if (n.isMesh && n.name.includes('HOOK_CERES_DEPTH_KEEPER')) nodes.push(n);}); return nodes;}
function visibleKeeperNames(root) {return graphKeepers(root).filter(n => n.visible).map(n => n.name);}

for (const legacy of [false, true]) test(`actual ${legacy ? 'legacy' : 'current'} cold publication completes before native/work admission`, async () => {
  const t = liveFixture({legacy}), native = await createSg02DynamicBodyOwner();
  try {
    assert.equal(readCeresCradleLayout(t.entity, t.state), legacy ? 'open-v1' : 'keepers-v2');
    assert.equal(t.entity.physicsBody, false); assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
    const gate = deferred(), pending = t.upgrade({prepareAuthoredPipelines: () => gate.promise});
    await flush(); t.reconcile(); t.sync(native);
    assert.equal(native.records.has(t.entity.id), false);
    assert.equal(machineryPresentationPlace(t.entity, t.state), null);
    gate.resolve({ready: true}); assert.equal(await pending, true);
    assert.equal(t.boundary.userData.authoredAssetState, 'authored');
    assert.equal(visibleKeeperNames(t.boundary).length, legacy ? 0 : 3);
    assert.equal(t.entity.physicsBody, false, 'visual recipe never creates the native body');
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
    t.reconcile(); t.sync(native);
    assert.equal(native.records.get(t.entity.id).colliders.length, legacy ? 9 : 11);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), true);
    for (const lod of ['lod0', 'lod1', 'lod2', 'lod2', 'lod0']) {
      t.boundary.userData.updateLod(lod);
      t.boundary.userData.updateCeresCradleLayout(t.entity, t.state);
      assert.equal(visibleKeeperNames(t.boundary).length, legacy ? 0 : 3);
      assert.ok(visibleKeeperNames(t.boundary).every(n => n.startsWith(lod.toUpperCase())));
    }
  } finally {native.dispose(); t.close();}
});

test('prepared legacy cannot publish until its native owner makes the pending one-shot decision', async () => {
  const t = liveFixture({legacy: true, reconcile: false});
  try {
    assert.equal(bindCeresCradleLayout(t.entity, t.state), 'open-v1');
    assert.equal(canPublishCeresCradleLayout(t.entity, t.state), false);
    assert.equal(await t.upgrade({deferBoundaryPublication: true}), true);
    assert.equal(t.boundary.userData.authoredAssetState, 'authored-prepared');
    assert.equal(publishPreparedAuthoredBoundary(t.boundary), false);
    assert.equal(t.boundary.userData.hull.visible, false);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
    t.reconcile(); assert.equal(publishPreparedAuthoredBoundary(t.boundary), true);
    assert.equal(t.boundary.userData.hull.visible, true);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
  } finally {t.close();}
});

test('ordinary hidden prepared root publishes on the existing pre-submit callback after a cold decision', async () => {
  const t = liveFixture({legacy: true, reconcile: false});
  try {
    assert.equal(await t.upgrade(), true);
    assert.equal(t.boundary.userData.authoredAssetState, 'authored-prepared');
    assert.equal(t.boundary.userData.hull.visible, false);
    t.reconcile();
    t.boundary.userData.updateCeresCradleLayout(t.entity, t.state);
    assert.equal(t.boundary.userData.authoredAssetState, 'authored');
    assert.equal(t.boundary.userData.hull.visible, true);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
  } finally {t.close();}
});

for (const mutation of ['life', 'same-id-object', 'forged-layout', 'replaced-data']) test(`prepared publication refuses ${mutation} and never borrows a sibling receipt`, async () => {
  const t = liveFixture();
  try {
    await t.upgrade({deferBoundaryPublication: true});
    if (mutation === 'life') t.entity.occupantGeneration++;
    if (mutation === 'same-id-object') t.state.entities.set(t.entity.id, {...t.entity});
    if (mutation === 'forged-layout') t.entity.data.ceresWorkfleetCradleLayout = 'open-v1';
    if (mutation === 'replaced-data') t.entity.data = {...t.entity.data};
    assert.equal(publishPreparedAuthoredBoundary(t.boundary), false);
    assert.equal(t.boundary.userData.hull.visible, false);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
  } finally {t.close();}
});

test('cancelling deferred preparation permanently retires its publisher and cached keeper bank', async () => {
  const t = liveFixture();
  try {
    await t.upgrade({deferBoundaryPublication: true});
    const root = t.boundary.userData.hull;
    assert.equal(await disposePreparedAuthoredBoundary(t.boundary), true);
    assert.equal(publishPreparedAuthoredBoundary(t.boundary), false);
    root.userData.updateLod('lod2');
    t.boundary.userData.updateCeresCradleLayout(t.entity, t.state);
    assert.equal(root.visible, false); assert.deepEqual(visibleKeeperNames(root), []);
    assert.equal(machineryPresentationPlace(t.entity, t.state), null);
  } finally {t.close();}
});

test('native failure preserves the visual recipe but never grants effective/work readiness', async () => {
  const t = liveFixture();
  try {
    await t.upgrade(); t.reconcile();
    const receipt = markPhysicsBodyNativeFailure(t.entity, t.owner);
    assert.equal(readCeresCradleLayout(t.entity, t.state), 'keepers-v2');
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
    assert.equal(visibleKeeperNames(t.boundary).length, 3);
    clearPhysicsBodyNativeFailure(t.entity, t.owner, receipt);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), true);
  } finally {t.close();}
});

test('bad keeper assets and failed pipeline admission stay coherently cold', async () => {
  for (const failure of ['missing-keeper', 'compile']) {
    const t = liveFixture(), native = await createSg02DynamicBodyOwner();
    try {
      const result = await t.upgrade({loadAuthoredPart: async () => packageRecord({malformed: failure === 'missing-keeper'}),
        prepareAuthoredPipelines: async () => {if (failure === 'compile') throw new Error('injected compile refusal'); return {ready: true};}});
      assert.equal(result, false); t.reconcile(); t.sync(native);
      assert.equal(t.entity.physicsBody, false); assert.equal(native.records.has(t.entity.id), false);
      assert.equal(machineryPresentationPlace(t.entity, t.state), null);
      assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
    } finally {native.dispose(); t.close();}
  }
});

import {createRenderEntityFrame} from '../src/render/renderEntityFrame.js';
import {createPersistentSubmitLanes} from '../src/render/persistentSubmitLanes.js';
function installCpuSubmitFrame(t, lod = 'lod2') {
  const world = t.view._presentationWorld;
  Object.assign(world, {alive: [1], slotGenerations: [1], meshRefs: [t.boundary], entityIds: [t.entity.id],
    flags: [0], entityRefs: [t.entity], dirtyMasks: [0], radii: [t.entity.radius], boundCount: 1,
    refreshVisibleEntity() {}, clearDirty() {}, poseHasDelta: () => false});
  t.boundary.userData.lod = {level: lod, resolve: () => lod};
  t.boundary.userData.updateLod(lod); t.boundary.userData._appliedLodLevel = lod;
  Object.assign(t.view, {_presentationQueryOptions: {},
    _presentationQueries: {query: () => ({visibleCount: 1, visibleSlots: [0], visibleGenerations: [1],
      hiddenCount: 0, candidateCount: 1, culledCount: 0, newlyVisibleCount: 0})},
    _entityViewCullBounds: () => ({x: 0, z: 0, halfX: 10000, halfZ: 10000, glassHalfX: 10000, glassHalfZ: 10000}),
    _hasCompletedPresentationPose: () => true, _entityFrame: createRenderEntityFrame(),
    _entityViewDiagnostics: {}, _hlodDiagnostics: {}, _persistentSubmitLanes: createPersistentSubmitLanes(),
    viewport: {width: 1280, height: 720}, _presentationFrameDt: 0});
  t.view._frameMembrane.origin = {x: 0, z: 0};
}

test('actual renderer submit runs keeper correctness on retained LOD2 even when authored motion sleeps', async () => {
  const t = liveFixture();
  try {
    await t.upgrade(); t.reconcile(); installCpuSubmitFrame(t);
    let lodCalls = 0, motionCalls = 0;
    const lod = t.boundary.userData.updateLod;
    t.boundary.userData.updateLod = level => {lodCalls++; lod(level);};
    t.boundary.userData.updateAuthoredMotion = () => {motionCalls++;};
    t.view.syncEntityViews(1);
    assert.equal(visibleKeeperNames(t.boundary).length, 3);
    assert.equal(lodCalls, 0); assert.equal(motionCalls, 0);
    // A stale life must be removed before this very submit, despite retained LOD.
    t.entity.occupantGeneration++;
    t.view.syncEntityViews(1);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
    assert.equal(t.boundary.userData.hull.visible, false);
    assert.equal(lodCalls, 0); assert.equal(motionCalls, 0);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
  } finally {t.close();}
});

for (const legacy of [false, true]) test(`context failure/rebind keeps ${legacy ? 'legacy' : 'current'} mask through all LODs`, async () => {
  const t = liveFixture({legacy}), native = await createSg02DynamicBodyOwner();
  try {
    await t.upgrade(); t.reconcile(); t.sync(native);
    const root = t.boundary.userData.hull, recovery = t.state.render.contextRecovery = {generation: 1};
    const gate = deferred();
    const pending = runWebGlContextRestoreRebuild(t.view, recovery, () => gate.promise);
    for (const lod of ['lod0', 'lod1', 'lod2']) {
      t.boundary.userData.updateLod(lod);
      t.boundary.userData.updateCeresCradleLayout(t.entity, t.state);
      assert.equal(root.visible, false);
      assert.equal(visibleKeeperNames(t.boundary).length, legacy ? 0 : 3);
    }
    t.reconcile(); t.sync(native);
    assert.equal(native.records.has(t.entity.id), false);
    gate.resolve({contextLost: true, reason: 'injected context loss'});
    assert.equal((await pending).ok, false);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
    assert.equal((await runWebGlContextRestoreRebuild(t.view, recovery, async () => ({ready: true}))).ok, true);
    assert.equal(t.view._bindPresentationMesh(t.entity, t.boundary), true);
    installCpuSubmitFrame(t); t.view.syncEntityViews(1); t.reconcile(); t.sync(native);
    assert.equal(root.visible, true);
    assert.equal(visibleKeeperNames(t.boundary).length, legacy ? 0 : 3);
    assert.equal(native.records.get(t.entity.id).colliders.length, legacy ? 9 : 11);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), true);
  } finally {native.dispose(); t.close();}
});

test('explicit renderer rebind can reuse a retained current graph for a new canonical legacy occupant', async () => {
  const t = liveFixture();
  try {
    await t.upgrade(); t.reconcile();
    const old = t.entity, root = t.boundary.userData.hull;
    old.alive = false;
    const next = {id: old.id, occupantGeneration: old.occupantGeneration + 1, ...ceresWorkfleetHardwareSpec('cradle', oldRecord())};
    t.state.entities.set(next.id, next); t.reconcile();
    t.boundary.userData.updateCeresCradleLayout(next, t.state);
    assert.equal(root.visible, false, 'ordinary callback cannot transfer an old owner');
    assert.equal(t.view._bindPresentationMesh(next, t.boundary), true);
    assert.equal(root.visible, true); assert.deepEqual(visibleKeeperNames(t.boundary), []);
    t.reconcile(); assert.equal(machineryHasEffectivePresentation(next, t.state), true);
    t.boundary.userData.updateCeresCradleLayout(old, t.state);
    assert.equal(root.visible, false, 'stale callback cannot reanimate the retired owner');
    t.boundary.userData.updateCeresCradleLayout(next, t.state);
    assert.equal(root.visible, true); assert.deepEqual(visibleKeeperNames(t.boundary), []);
  } finally {t.close();}
});

test('layout changes invalidate the effective presentation receipt before reconciliation', async () => {
  const t = liveFixture();
  try {
    await t.upgrade(); t.reconcile();
    assert.equal(machineryNeedsReconciliation(t.entity, t.state), false);
    const body = t.entity.physicsBody;
    t.entity.data.ceresWorkfleetCradleLayout = 'open-v1';
    t.entity.data.itinerary.ceresWorkfleet.cradleLayout = 'open-v1';
    assert.equal(t.entity.physicsBody, body, 'body identity alone is not sufficient');
    assert.equal(readCeresCradleLayout(t.entity, t.state), null);
    assert.equal(machineryNeedsReconciliation(t.entity, t.state), true);
    assert.equal(machineryHasEffectivePresentation(t.entity, t.state), false);
    t.boundary.userData.updateCeresCradleLayout(t.entity, t.state);
    assert.equal(t.boundary.userData.hull.visible, false);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
  } finally {t.close();}
});

test('headless presentation never treats a forged or cloned cradle recipe as native provenance', () => {
  for (const forged of ['saved-fields', 'cloned-data', 'reused-life']) {
    const sim = createSimulation({seed: 621, systems: []}), state = sim.state;
    const entity = sim.spawn(ceresWorkfleetHardwareSpec('cradle'));
    try {
      if (forged === 'saved-fields') entity.data = JSON.parse(JSON.stringify(entity.data));
      if (forged === 'cloned-data') entity.data = {...entity.data};
      if (forged === 'reused-life') {
        bindCeresCradleLayout(entity, state); entity.occupantGeneration++;
      }
      assert.equal(readCeresCradleLayout(entity, state), null);
      markMachineryEffective(entity, state, C.assets.cradle.id);
      assert.equal(machineryPresentationPlace(entity, state), null);
      assert.equal(machineryHasEffectivePresentation(entity, state), false);
    } finally {sim.dispose();}
  }
});

test('an already published boundary cannot report publication success after its native selection becomes stale', async () => {
  const t = liveFixture();
  try {
    await t.upgrade();
    assert.equal(publishPreparedAuthoredBoundary(t.boundary), true);
    t.entity.occupantGeneration++;
    assert.equal(publishPreparedAuthoredBoundary(t.boundary), false);
    assert.equal(t.boundary.userData.hull.visible, false);
    assert.deepEqual(visibleKeeperNames(t.boundary), []);
  } finally {t.close();}
});

import {authoredMotionRegistrySize} from '../src/render/authoredMotion.js';
test('malformed, compile-failed and cancelled keeper roots release their existing motion lifetime', async () => {
  for (const failure of ['malformed', 'compile', 'cancel']) {
    const t = liveFixture();
    try {
      // The constructor uses the existing entity-keyed motion registry; a failed
      // keeper guard must not leave that registration behind with no live root.
      const before = authoredMotionRegistrySize();
      await t.upgrade({deferBoundaryPublication: true,
        loadAuthoredPart: async () => packageRecord({malformed: failure === 'malformed'}),
        prepareAuthoredPipelines: async () => {if (failure === 'compile') throw new Error('injected cleanup check'); return {ready: true};}});
      if (failure === 'cancel') await disposePreparedAuthoredBoundary(t.boundary);
      assert.equal(authoredMotionRegistrySize(), before);
    } finally {t.close();}
  }
});

function sourceKeeperRoot(options) {
  const root = keeperRoot(options);
  for (const mesh of keepers(root)) {
    root.remove(mesh);
    mesh.name = `Place_${mesh.name}`;
    mesh.userData.keepSeparate = true;
    const anchor = new THREE.Object3D(); anchor.name = `${mesh.name}_Anchor`;
    anchor.add(mesh); root.add(anchor);
  }
  return root;
}

test('source anchors and package nodes share canonical keeper identity without changing sibling resources', () => {
  const material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const source = sourceKeeperRoot({material, geometry}), packaged = keeperRoot({material, geometry});
  const sourceMask = createCeresCradleKeeperMask(source, cradle(1));
  const packageMask = createCeresCradleKeeperMask(packaged, cradle(2));
  assert.equal(sourceMask.valid, true); assert.equal(packageMask.valid, true);
  for (const lod of ['lod0', 'lod1', 'lod2']) {
    assert.equal(sourceMask.apply('keepers-v2', lod), true);
    assert.equal(packageMask.apply('open-v1', lod), true);
    assert.equal(visibleKeeperNames(source).length, 3);
    assert.ok(visibleKeeperNames(source).every(n => n.startsWith(`Place_${lod.toUpperCase()}_`)));
    assert.deepEqual(visibleKeeperNames(packaged), []);
    assert.ok(source.children.filter(n => n.name.endsWith('_Anchor')).every(n => n.visible));
    assert.equal(source.getObjectByName('LOD0_Body').visible, true);
    assert.equal(material.visible, true); assert.equal(material.opacity, 1);
  }
});

for (const defect of ['extra-anchor-child', 'missing-anchor', 'unrecognized-anchor', 'missing-separation-tag',
  'canonical-alias-duplicate', 'pooled-anchor', 'pooled-slot-zero', 'native-instancing', 'unknown-prefix']) {
  test(`source ${defect} cannot weaken the sealed nine-mesh bank`, () => {
    const root = sourceKeeperRoot(), mesh = graphKeepers(root)[0], anchor = mesh.parent;
    if (defect === 'extra-anchor-child') anchor.add(new THREE.Object3D());
    if (defect === 'missing-anchor') {anchor.remove(mesh); root.remove(anchor); root.add(mesh);}
    if (defect === 'unrecognized-anchor') anchor.name = `Other_${anchor.name}`;
    if (defect === 'missing-separation-tag') delete mesh.userData.keepSeparate;
    if (defect === 'canonical-alias-duplicate') {
      root.remove(graphKeepers(root)[2].parent);
      const duplicate = mesh.clone(); duplicate.name = mesh.name.replace(/^Place_/, ''); root.add(duplicate);
      assert.equal(graphKeepers(root).length, 9, 'still nine leaves, but one canonical finish is repeated');
    }
    if (defect === 'pooled-anchor') anchor.userData.spacefaceInstancePoolKey = 'foreign';
    if (defect === 'pooled-slot-zero') mesh.userData.spacefaceInstancePoolSlot = 0;
    if (defect === 'native-instancing') {
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, 1);
      instanced.name = mesh.name; instanced.userData = mesh.userData; anchor.remove(mesh); anchor.add(instanced);
    }
    if (defect === 'unknown-prefix') mesh.name = `Other_${mesh.name}`;
    const mask = createCeresCradleKeeperMask(root, cradle());
    assert.equal(mask.valid, false); assert.equal(mask.apply('keepers-v2'), false);
    assert.deepEqual(visibleKeeperNames(root), []);
  });
}

for (const legacy of [false, true]) for (const deferredPublication of [false, true]) {
  test(`direct source ${legacy ? 'legacy' : 'current'} ${deferredPublication ? 'deferred' : 'initial'} publication preserves the real wrapper and all LODs`, async () => {
    const t = liveFixture({legacy}), native = await createSg02DynamicBodyOwner();
    try {
      const record = packageRecord(); delete record.renderPackage;
      record.markers = ceresWorkfleetVisualRigs('cradle').map(rig => ({name: rig.node,
        tags: {}, userData: {}, matrix: new THREE.Matrix4()}));
      assert.equal(await t.upgrade({deferBoundaryPublication: deferredPublication,
        loadAuthoredPart: async () => record}), true);
      if (deferredPublication) {
        assert.equal(t.boundary.userData.authoredAssetState, 'authored-prepared');
        assert.equal(t.boundary.userData.hull.visible, false);
        assert.equal(publishPreparedAuthoredBoundary(t.boundary), true);
      }
      assert.equal(t.boundary.userData.authoredAssetState, 'authored');
      assert.equal(graphKeepers(t.boundary).length, 9);
      for (const mesh of graphKeepers(t.boundary)) {
        assert.ok(mesh.name.startsWith('Place_LOD'));
        assert.equal(mesh.parent.name, `${mesh.name}_Anchor`);
        assert.equal(mesh.parent.children.length, 1);
        assert.equal(mesh.userData.keepSeparate, true);
        assert.equal(mesh.userData.spacefaceTags.instance, false);
      }
      for (const lod of ['lod0', 'lod1', 'lod2', 'lod2']) {
        installCpuSubmitFrame(t, lod); t.view.syncEntityViews(1);
        assert.equal(visibleKeeperNames(t.boundary).length, legacy ? 0 : 3);
        assert.ok(visibleKeeperNames(t.boundary).every(name => name.startsWith(`Place_${lod.toUpperCase()}_`)));
      }
      t.reconcile(); t.sync(native);
      assert.equal(native.records.get(t.entity.id).colliders.length, legacy ? 9 : 11);
      assert.equal(machineryHasEffectivePresentation(t.entity, t.state), true);
    } finally {native.dispose(); t.close();}
  });
}

import { ceresWorkfleetRigPose } from '../src/data/ceresWorkfleetArticulation.js';
test('actual retained LOD2 submission updates physical pad poses while decorative authored motion sleeps', async () => {
  const t = liveFixture();
  try {
    await t.upgrade(); t.reconcile(); installCpuSubmitFrame(t, 'lod2');
    let decorative = 0;
    t.boundary.userData.updateAuthoredMotion = () => {decorative++;};
    for (const accepted of [0, .25, .75, 1, 0]) {
      t.entity.data.ceresWorkfleetSlide = accepted;
      t.entity.data.ceresWorkfleetSlideTarget = 1 - accepted;
      t.view.syncEntityViews(1);
      for (const rig of ceresWorkfleetVisualRigs('cradle')) {
        const node = t.boundary.getObjectByName(rig.node), pose = ceresWorkfleetRigPose(rig, accepted);
        assert.deepEqual(node.position.toArray(), [pose.position.x, pose.position.y, pose.position.z]);
        assert.deepEqual(node.scale.toArray(), [pose.scale.x, pose.scale.y, pose.scale.z]);
      }
    }
    assert.equal(decorative, 0);
  } finally {t.close();}
});
