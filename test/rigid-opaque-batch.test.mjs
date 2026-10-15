import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ShaderChunk } from 'three';

import {
  createRetainedRigidOpaqueBatchController,
  RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES,
} from '../src/render/rigidOpaqueBatch.js';
import { installIllustratedSurface } from '../src/render/illustratedSurface.js';
import { attachRetroMounts } from '../src/render/thruster/retroMounts.js';
import { render as renderSystem } from '../src/render/renderer.js';
import {
  collectOpeningSubmissionLeaves,
  combineOpeningProducerCensuses,
  createOpeningProducerCensus,
  createOpeningSubmissionPlan,
} from '../src/render/openingSubmissionPlan.js';
import { acceptClearanceMesh, clearanceNeighborhoodRaw } from '../src/render/clearanceQuery.js';
import {
  collectPresentedBodyLeaves,
  createWorldObjectPicker,
} from '../src/render/worldObjectPicking.js';
import {
  isPlayerTruthInstrumentation,
  measurePlayerTruthBodyOcclusion,
  playerTruthOpaqueBounds,
} from '../src/testing/playerTruth/reader.js';

function makeRoot() {
  const root = new THREE.Group();
  const materialA = new THREE.MeshStandardMaterial({ color: 0x345678, roughness: 0.42, metalness: 0.18 });
  installIllustratedSurface(materialA);
  const materialB = materialA.clone();
  materialB.onBeforeCompile = materialA.onBeforeCompile;
  materialB.customProgramCacheKey = materialA.customProgramCacheKey;
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialA);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialB);
  a.position.x = -2;
  b.position.x = 2;
  root.add(a, b);
  root.updateMatrixWorld(true);
  return { root, a, b };
}

function verifiedSourcePackage(root, contentHash = 'a'.repeat(64)) {
  root.userData.flightRenderPackage = {
    schema: 'spaceface.flightRenderPackage.v1',
    assetId: 'test-retained-source',
    contentHash,
    contentHashVerified: true,
  };
}

function strictOpeningPlan(root) {
  const census = combineOpeningProducerCensuses([
    createOpeningProducerCensus(root, { includeOffscreen: true }),
  ]);
  return createOpeningSubmissionPlan({
    candidates: [{ root, role: 'retained-rigid-opaque-batch' }],
    includeOffscreen: true,
    globalProgramKeys: census.globalProgramKeys,
    openingProgramKeys: census.openingProgramKeys,
    requiredContentHashes: census.requiredContentHashes,
    producerCensus: census,
    producerResourceIdentitySets: census.resourceIdentitySets,
  });
}

function makeDefaultKestrelOwner(compile) {
  const scene = new THREE.Scene(), { root, a, b } = makeRoot();
  a.name = 'LOD0_MechanicalDark'; b.name = 'LOD0_MOTION_KESTREL_IRIS_0_MechanicalDark';
  b.userData.spacefaceTags = { motionGroup: true };
  root.userData.authoredAssetState = 'authored';
  verifiedSourcePackage(root);
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 10, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } };
  const state = { mode: 'loading', playerId: 1, entities: new Map([[1, player]]),
    world: { enterSerial: 1, currentSectorId: 'test' }, contextRestoreSeq: 0,
    render: { admissionRunGeneration: 1, compileObjectPipelines: compile } };
  const owner = Object.assign(Object.create(renderSystem), { scene, state, cam: { obj: camera },
    _opaqueBatchSupported: true, _meshes: new Map([[1, root]]), _authoredInstanceSyncOptions: {},
    _entityFrame: { authored: [] }, _shadowSettingOn: false });
  owner._enableRigidOpaqueBatch(true);
  return { owner, state, scene, root, a, b, dispose() {
    owner._rigidOpaqueBatchController?.dispose();
    a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
  } };
}

test('default renderer submission joins strict loading preparation before first-picture capture', async () => {
  let finish, compileOptions;
  const fixture = makeDefaultKestrelOwner((batch, options) => {
    assert.equal(batch.isBatchedMesh, true); compileOptions = options;
    assert.equal(batch.userData.openingSubmissionPackage?.contentHashVerified, true,
      'the producer publishes the derived package before pipeline preparation');
    return new Promise(resolve => { finish = resolve; });
  });
  const { owner, scene, a, b } = fixture;
  const hotIris = new THREE.Mesh(new THREE.BoxGeometry(), a.material);
  hotIris.name = 'Retro_Iris_Port'; fixture.root.add(hotIris);
  const npc = new THREE.Mesh(new THREE.BoxGeometry(), a.material);
  npc.name = a.name; scene.add(npc);
  owner._meshes.set(2, npc); fixture.state.entities.set(2, { id: 2, data: { defId: 'ship_kestrel' } });
  scene.updateMatrixWorld(true);
  try {
    owner._syncAuthoredInstanceSubmission(100);
    const completion = owner._syncRigidOpaqueBatchProbe();
    await Promise.resolve();
    assert.equal(typeof completion?.then, 'function', 'the real renderer returns its pending controller preparation');
    assert.equal(compileOptions.openingRequired, true);
    assert.equal(compileOptions.strict, true); assert.equal(compileOptions.explicit, true);
    assert.equal(compileOptions.joinOutstanding, true); assert.equal(compileOptions.isActive(), true);
    const waitSet = owner._openingFirstPictureUpgradePromises();
    assert.ok(waitSet.includes(completion), 'the existing bounded opening settle joins that exact promise');
    assert.equal(a.layers.mask, 1); assert.equal(b.layers.mask, 1);
    finish({ pipelines: {}, gpuResidency: {} });
    await Promise.all(waitSet);
    assert.equal(owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'active');
    assert.equal(owner.getRigidOpaqueBatchDiagnosticsForBench().instances, 2);
    assert.equal(a.layers.mask, 0); assert.equal(b.layers.mask, 0);
    assert.equal(hotIris.layers.mask, 1, 'the player hot iris stays on its live direct material');
    assert.equal(npc.layers.mask, 1, 'an identically named NPC source is outside the player cohort');
    const batch = scene.children.find(child => child.isBatchedMesh);
    const roots = owner._collectOpeningDerivedPoolRoots();
    assert.ok(roots.includes(batch), 'the real scene-owned copy enters the exact opening root census');
    assert.deepEqual(collectOpeningSubmissionLeaves(batch), [batch]);
    assert.equal(createOpeningProducerCensus(batch, { includeOffscreen: true }).drawLeafIds.length, 1);
    const openingPlan = strictOpeningPlan(batch);
    assert.equal(openingPlan.roots[0].productionBoundary.contentHashVerified, true,
      'the retained copy carries its own verified producer boundary');
    assert.equal(openingPlan.complete, true,
      'the actual scene batch passes the strict opening plan, beyond its draw census');
    fixture.state.entities.get(1).data.defId = 'ship_other';
    await owner._syncRigidOpaqueBatchProbe();
    assert.equal(a.layers.mask, 1); assert.equal(b.layers.mask, 1);
  } finally { fixture.dispose(); hotIris.geometry.dispose(); npc.geometry.dispose(); }
});

test('retained batch package identity binds source content, selection, lane, geometry and material semantics', async () => {
  async function identity(change = () => {}) {
    const fixture = makeRoot();
    const { root, a, b } = fixture;
    verifiedSourcePackage(root);
    const extra = new THREE.Mesh(a.geometry.clone(), a.material);
    root.add(extra);
    const scene = new THREE.Scene();
    scene.add(root);
    const selected = new Set([a, b]);
    change({ ...fixture, extra, selected });
    scene.updateMatrixWorld(true);
    const controller = createRetainedRigidOpaqueBatchController({
      scene, selectSource: source => selected.has(source), prepare: () => ({ ready: true }),
    });
    try {
      await controller.sync(root);
      const batch = scene.children.find(child => child.isBatchedMesh);
      assert.ok(batch);
      const plan = strictOpeningPlan(batch);
      assert.equal(plan.complete, true);
      assert.equal(plan.roots[0].productionBoundary.contentHashVerified, true);
      return plan.roots[0].productionBoundary.contentHash;
    } finally {
      controller.dispose();
      a.geometry.dispose(); b.geometry.dispose(); extra.geometry.dispose();
      a.material.dispose(); b.material.dispose();
    }
  }

  const original = await identity();
  assert.equal(await identity(), original, 'equivalent source recipes have the same derived identity');
  const variants = [
    ({ root }) => verifiedSourcePackage(root, 'b'.repeat(64)),
    ({ a, b, extra, selected }) => { selected.delete(b); selected.add(extra); extra.position.copy(a.position); },
    ({ a, b }) => { a.castShadow = true; b.castShadow = true; },
    ({ a }) => { a.geometry.getAttribute('position').setX(0, 4); a.geometry.getAttribute('position').needsUpdate = true; },
    ({ a, b }) => { a.material.roughness = 0.7; b.material.roughness = 0.7; },
  ];
  for (const change of variants) assert.notEqual(await identity(change), original);
});

test('retained copies cannot turn missing or unverified source provenance into a strict opening pass', async () => {
  for (const provenance of ['missing', 'unverified', 'verified-sibling-only']) {
    const { root, a, b } = makeRoot();
    if (provenance === 'unverified') {
      root.userData.flightRenderPackage = {
        assetId: 'unverified-source', contentHash: 'unverified-digest', contentHashVerified: false,
      };
    } else if (provenance === 'verified-sibling-only') {
      verifiedSourcePackage(a);
    }
    const scene = new THREE.Scene();
    scene.add(root);
    scene.updateMatrixWorld(true);
    const controller = createRetainedRigidOpaqueBatchController({ scene, prepare: () => ({ ready: true }) });
    try {
      await controller.sync(root);
      const batch = scene.children.find(child => child.isBatchedMesh);
      assert.ok(batch, 'direct batching remains available without inventing provenance');
      assert.equal(batch.userData.openingSubmissionPackage, undefined);
      const plan = strictOpeningPlan(batch);
      assert.equal(plan.complete, false);
      assert.equal(plan.roots[0].productionBoundary.contentHashVerified, false);
      assert.ok(plan.blockingReasons.some(reason => reason.reason === 'missing-or-unverified-blocking-content-hash'));
    } finally {
      controller.dispose();
      a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
    }
  }
});

test('default renderer never suppresses sources after skipped or rejected preparation', async () => {
  for (const outcome of ['skipped', 'partial', 'rejected', 'missing']) {
    const fixture = makeDefaultKestrelOwner(outcome === 'missing' ? undefined : () => {
      if (outcome === 'rejected') return Promise.reject(new Error('driver failure'));
      return outcome === 'skipped' ? { skipped: true, reason: 'unavailable' }
        : { pipelines: {}, gpuResidency: { partial: true } };
    });
    try {
      await fixture.owner._syncRigidOpaqueBatchProbe();
      assert.notEqual(fixture.owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'active');
      assert.equal(fixture.a.layers.mask, 1); assert.equal(fixture.b.layers.mask, 1);
      assert.equal(fixture.scene.children.some(child => child.isBatchedMesh), false);
    } finally { fixture.dispose(); }
  }
});

test('default renderer preparation cannot activate across a replaced run or context', async () => {
  for (const replacement of ['run', 'world', 'context']) {
    let finish, isActive;
    const fixture = makeDefaultKestrelOwner((_batch, options) => {
      isActive = options.isActive; return new Promise(resolve => { finish = resolve; });
    });
    try {
      const pending = fixture.owner._syncRigidOpaqueBatchProbe(); await Promise.resolve();
      if (replacement === 'run') fixture.state.render.admissionRunGeneration += 1;
      else if (replacement === 'world') fixture.state.world = { ...fixture.state.world };
      else fixture.state.contextRestoreSeq += 1;
      assert.equal(isActive(), false);
      finish({ pipelines: {}, gpuResidency: {} }); await pending;
      assert.equal(fixture.a.layers.mask, 1); assert.equal(fixture.b.layers.mask, 1);
      assert.equal(fixture.scene.children.some(child => child.isBatchedMesh), false);
    } finally { fixture.dispose(); }
  }
});

test('retained rigid batches wait for residency before suppressing direct source draws', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  let resolvePreparation;
  const preparation = new Promise((resolve) => { resolvePreparation = resolve; });
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: async (batches, context) => {
      assert.equal(batches.length, 1);
      assert.equal(context.isActive(), true);
      await preparation;
      return { ready: true };
    },
  });

  const pending = controller.sync([root]);
  assert.equal(a.visible, true, 'source remains drawable while pipeline/residency is pending');
  assert.equal(b.visible, true, 'source remains drawable while pipeline/residency is pending');
  assert.equal(controller.getDiagnostics().status, 'preparing');

  resolvePreparation();
  const result = await pending;
  assert.equal(result.status, 'active');
  assert.equal(a.visible, true, 'semantic source visibility stays canonical while the direct layer is suppressed');
  assert.equal(b.visible, true, 'semantic source visibility stays canonical while the direct layer is suppressed');
  assert.equal(a.layers.mask, 0, 'the active retained copy suppresses direct source submission');
  assert.equal(b.layers.mask, 0, 'the active retained copy suppresses direct source submission');
  assert.equal(result.batches, 1);
  assert.equal(result.instances, 2);
  assert.equal(result.potentialDrawReduction, 1);
  const batch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(batch);
  assert.equal(batch.material.onBeforeCompile, materialOnBeforeCompile(a.material));
  assert.equal(batch.material.customProgramCacheKey(), a.material.customProgramCacheKey());
  assert.equal(batch.material.color.getHex(), a.material.color.getHex(),
    'a non-vertex-colored retained batch keeps the shared material albedo');
  assert.equal(batch.castShadow, false);
  assert.equal(batch.receiveShadow, false);

  controller.dispose();
  assert.equal(a.visible, true, 'dispose restores source visibility');
  assert.equal(b.visible, true, 'dispose restores source visibility');
  assert.equal(a.layers.mask, 1, 'dispose restores the authored source layer');
  assert.equal(b.layers.mask, 1, 'dispose restores the authored source layer');
  assert.equal(scene.children.includes(batch), false);
  a.geometry.dispose();
  b.geometry.dispose();
  a.material.dispose();
  b.material.dispose();
});

test('active non-vertex material color changes invalidate the retained copy', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });

  const result = await controller.sync(root);
  assert.equal(result.status, 'active');
  a.material.color.setHex(0xe0a040);
  const afterMutation = await controller.sync(root);
  assert.equal(afterMutation.status, 'idle',
    'a changed source albedo must not leave a stale shared batch material active');
  assert.equal(a.layers.mask, 1);
  assert.equal(b.layers.mask, 1);

  controller.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  a.material.dispose();
  b.material.dispose();
});

test('actual retro heat changes retire stale retained material copies before the next draw', async () => {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  attachRetroMounts(root, { data: { defId: 'ship_kestrel' } });
  scene.updateMatrixWorld(true);
  const iris = root.getObjectByName('Retro_Iris_Port');
  const geometry = iris.geometry, material = iris.material;
  const controller = createRetainedRigidOpaqueBatchController({ scene, prepare: () => ({ ready: true }) });
  assert.equal((await controller.sync(root)).status, 'active');
  const initialVersion = material.version;
  material.emissiveIntensity += 1;
  assert.equal(material.version, initialVersion, 'live heat is a uniform change, not a shader recompile');
  const after = await controller.sync(root);
  assert.equal(after.status, 'active', 'unchanged retro materials can retain their batching');
  assert.equal(after.instances, 8, 'the two now-mutable iris sources stay direct');
  assert.equal(iris.layers.mask, 1, 'the authored source returns to the normal draw path');
  assert.equal(iris.geometry, geometry); assert.equal(iris.material, material);
  assert.equal(material.emissiveIntensity, 1.1, 'rollback preserves the live owner value');
  assert.equal(scene.children.filter(node => node.isBatchedMesh).length, 4);
  material.emissiveIntensity += 1;
  const next = await controller.sync(root);
  assert.equal(next.activations, after.activations, 'another heat tick never re-admits the mutable iris');
  assert.equal(iris.layers.mask, 1);
  controller.dispose();
});

test('live uniform component and texture-transform changes retire the retained copy', async () => {
  for (const mutate of [material => { material.emissive.r = 0.8; },
    material => { material.roughness = 0.7; }, material => { material.normalScale.x = 2; },
    material => { material.map.offset.x = 0.5; }]) {
    const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: 0.4 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), material), b = new THREE.Mesh(new THREE.BoxGeometry(), material);
    root.add(a,b); scene.updateMatrixWorld(true);
    const controller = createRetainedRigidOpaqueBatchController({ scene, prepare: () => ({ ready: true }) });
    assert.equal((await controller.sync(root)).status, 'active');
    mutate(material);
    assert.equal((await controller.sync(root)).status, 'idle');
    assert.equal(a.layers.mask,1); assert.equal(b.layers.mask,1);
    controller.dispose(); a.geometry.dispose(); b.geometry.dispose(); material.map.dispose(); material.dispose();
  }
});

test('uniform mutation while residency awaits cannot commit a stale retained material', async () => {
  const scene = new THREE.Scene(), { root, a, b } = makeRoot(); scene.add(root); scene.updateMatrixWorld(true);
  let finish;
  const controller = createRetainedRigidOpaqueBatchController({ scene,
    prepare: () => new Promise(resolve => { finish = resolve; }) });
  const pending = controller.sync(root); await Promise.resolve();
  a.material.emissiveIntensity = 3;
  finish({ ready: true });
  const after = await pending;
  assert.equal(after.status, 'idle'); assert.equal(after.lastReason, 'source-state-changed-before-commit');
  assert.equal(a.layers.mask,1); assert.equal(b.layers.mask,1);
  controller.dispose(); a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
});

test('an exact source selector narrows the cohort and remains binding during residency and activation', async () => {
  for (const retireDuringPrepare of [false, true]) {
    const scene = new THREE.Scene(), { root, a, b } = makeRoot(); scene.add(root);
    const unrelated = new THREE.Mesh(a.geometry,a.material); root.add(unrelated); scene.updateMatrixWorld(true);
    let selected = true, finish;
    const controller = createRetainedRigidOpaqueBatchController({ scene,
      selectSource: source => selected && source !== unrelated,
      prepare: () => new Promise(resolve => { finish = resolve; }) });
    const pending = controller.sync(root); await Promise.resolve();
    if (retireDuringPrepare) selected = false;
    finish({ ready: true });
    const ready = await pending;
    if (retireDuringPrepare) assert.equal(ready.status,'idle');
    else {
      assert.equal(ready.status,'active'); assert.equal(ready.instances,2);
      assert.equal(unrelated.layers.mask,1,'unselected leaves retain their ordinary draws');
      selected = false;
      assert.equal((await controller.sync(root)).status,'idle');
    }
    assert.equal(a.layers.mask,1); assert.equal(b.layers.mask,1); assert.equal(unrelated.layers.mask,1);
    controller.dispose(); a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
  }
});

test('qualified rigid pivots publish the current pose at activation and track it until qualification retires', async () => {
  const scene = new THREE.Scene(), { root, a, b } = makeRoot(), pivot = new THREE.Group();
  pivot.userData.spacefaceTags = { motionGroup: true };
  a.userData.spacefaceTags = { motionGroup: true }; b.userData.spacefaceTags = { motionGroup: true };
  pivot.add(a, b); root.add(pivot); scene.add(root); scene.updateMatrixWorld(true);
  const originalGeometry = a.geometry, originalMaterial = a.material;
  let qualified = true, finish;
  const controller = createRetainedRigidOpaqueBatchController({ scene,
    isTransformOnlySource: source => qualified && (source === a || source === b),
    prepare: () => new Promise(resolve => { finish = resolve; }) });
  const pending = controller.sync(root); await Promise.resolve();
  pivot.position.set(8, 2, -4); pivot.rotation.y = 0.7; scene.updateMatrixWorld(true);
  finish({ ready: true });
  assert.equal((await pending).status, 'active');
  const batch = scene.children.find(child => child.isBatchedMesh), matrix = new THREE.Matrix4();
  batch.getMatrixAt(0, matrix);
  assert.ok(matrix.elements.every((value, index) => Math.abs(value - a.matrixWorld.elements[index]) < 1e-6),
    'the first retained draw uses the pose after preparation, not the old admission pose');
  pivot.rotation.y = 1.2; pivot.position.x = 12; scene.updateMatrixWorld(true);
  const moved = await controller.sync(root); batch.getMatrixAt(0, matrix);
  assert.equal(moved.status, 'active');
  assert.ok(matrix.elements.every((value, index) => Math.abs(value - a.matrixWorld.elements[index]) < 1e-6));
  assert.equal(a.parent, pivot); assert.equal(a.geometry, originalGeometry); assert.equal(a.material, originalMaterial);
  qualified = false;
  assert.equal((await controller.sync(root)).status, 'idle');
  assert.equal(a.layers.mask, 1); assert.equal(b.layers.mask, 1); assert.equal(a.parent, pivot);
  controller.dispose(); a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
});

test('qualified rigid pivots restore direct draws when fan ownership or unsafe transforms appear', async () => {
  for (const change of ['preparing-fan', 'active-mirrored', 'active-singular']) {
    const scene = new THREE.Scene(), { root, a, b } = makeRoot(), pivot = new THREE.Group();
    pivot.userData.spacefaceTags = { motionGroup: true };
    pivot.add(a, b); root.add(pivot); scene.add(root); scene.updateMatrixWorld(true);
    let finish;
    const controller = createRetainedRigidOpaqueBatchController({ scene, isTransformOnlySource: () => true,
      prepare: () => new Promise(resolve => { finish = resolve; }) });
    const pending = controller.sync(root); await Promise.resolve();
    if (change === 'preparing-fan') pivot.userData.spacefaceTags.fan = true;
    finish({ ready: true });
    const prepared = await pending;
    if (change === 'preparing-fan') assert.equal(prepared.status, 'idle');
    else {
      assert.equal(prepared.status, 'active');
      pivot.scale.x = change === 'active-mirrored' ? -1 : 0; scene.updateMatrixWorld(true);
      assert.equal((await controller.sync(root)).status, 'idle');
    }
    assert.equal(a.layers.mask, 1); assert.equal(b.layers.mask, 1);
    assert.equal(scene.children.some(child => child.isBatchedMesh), false);
    controller.dispose(); a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
  }
});

test('illustrated retained batches keep local hull data while Three applies the batch pose', async () => {
  // The illustration hook samples sfHullPosition in object-local coordinates. Three's
  // BatchedMesh chunks must apply the per-instance matrix to positions, normals, world position,
  // and shadows around that local sample; a custom hook that multiplied modelMatrix directly
  // would silently drop the retained instance pose.
  assert.match(ShaderChunk.project_vertex, /#ifdef USE_BATCHING[\s\S]*batchingMatrix \* mvPosition/);
  assert.match(ShaderChunk.worldpos_vertex, /#ifdef USE_BATCHING[\s\S]*batchingMatrix \* worldPosition/);
  assert.match(ShaderChunk.defaultnormal_vertex, /#ifdef USE_BATCHING[\s\S]*mat3 bm = mat3\( batchingMatrix \)/);

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const materialA = new THREE.MeshStandardMaterial({ color: 0x345678, roughness: 0.42 });
  installIllustratedSurface(materialA);
  const materialB = materialA.clone();
  materialB.onBeforeCompile = materialA.onBeforeCompile;
  materialB.customProgramCacheKey = materialA.customProgramCacheKey;
  const meshes = [];
  for (const [material, x] of [[materialA, -2], [materialB, 2]]) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const position = geometry.getAttribute('position');
    geometry.setAttribute('sfHullPosition', position.clone());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = x;
    root.add(mesh);
    meshes.push(mesh);
  }
  scene.add(root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });

  const result = await controller.sync([root]);
  assert.equal(result.status, 'active');
  const batch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(batch);
  const retainedHull = batch.geometry.getAttribute('sfHullPosition');
  assert.ok(retainedHull, 'the custom local hull attribute survives BatchedMesh geometry packing');
  assert.ok(retainedHull.count >= meshes[0].geometry.getAttribute('sfHullPosition').count);
  assert.equal(meshes[0].layers.mask, 0);
  assert.equal(meshes[1].layers.mask, 0);

  // Exercise the exact shared hook contract with the minimum Three shader needles it requires.
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: [
      '#include <common>',
      '#include <envmap_physical_pars_fragment>',
      '#include <color_fragment>',
      '#include <normal_fragment_maps>',
      '#include <lights_physical_fragment>',
      '#include <lights_fragment_end>',
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
    ].join('\n'),
  };
  materialA.onBeforeCompile(shader, {});
  assert.match(shader.vertexShader, /attribute vec3 sfHullPosition/);
  assert.match(shader.vertexShader, /vSfHullPosition = sfHullPosition/);
  assert.match(shader.fragmentShader, /vSfHullPosition/);
  assert.match(shader.fragmentShader, /sfRockSurface/);

  controller.dispose();
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test('root removal restores only departed sources and retains the surviving batch', async () => {
  const scene = new THREE.Scene();
  const first = makeRoot();
  const second = makeRoot();
  verifiedSourcePackage(first.root);
  const departedHash = 'b'.repeat(64);
  verifiedSourcePackage(second.root, departedHash);
  scene.add(first.root, second.root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });

  await controller.sync([first.root, second.root]);
  const batch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(batch);
  const originalHash = batch.userData.openingSubmissionPackage.contentHash;
  assert.ok(JSON.stringify(batch.userData.openingSubmissionPackage.manifest).includes(departedHash));
  assert.equal(first.a.layers.mask, 0);
  assert.equal(second.a.layers.mask, 0);
  const activations = controller.getDiagnostics().activations;

  scene.remove(second.root);
  await controller.sync([first.root]);
  const diagnostics = controller.getDiagnostics();
  assert.equal(scene.children.includes(batch), true, 'the surviving cohort keeps its retained batch');
  assert.equal(diagnostics.status, 'active');
  assert.equal(diagnostics.activations, activations, 'a removal does not recompile the surviving cohort');
  assert.equal(diagnostics.rollbacks, 0, 'a removal does not roll back the surviving cohort');
  assert.equal(diagnostics.instances, 2);
  assert.equal(first.a.layers.mask, 0);
  assert.equal(first.b.layers.mask, 0);
  assert.equal(second.a.layers.mask, 1, 'the departed source returns to its authored layer');
  assert.equal(second.b.layers.mask, 1);
  assert.equal(strictOpeningPlan(batch).complete, true);
  assert.notEqual(batch.userData.openingSubmissionPackage.contentHash, originalHash,
    'the retained producer republishes its changed source selection');
  assert.equal(JSON.stringify(batch.userData.openingSubmissionPackage.manifest).includes(departedHash), false,
    'the surviving package no longer claims departed source content');

  controller.dispose();
  for (const { a, b } of [first, second]) {
    a.geometry.dispose();
    b.geometry.dispose();
    a.material.dispose();
    b.material.dispose();
  }
});

test('new roots stay direct until a quiet membership window triggers one full replan', async () => {
  const scene = new THREE.Scene();
  const first = makeRoot();
  const second = makeRoot();
  scene.add(first.root, second.root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });

  await controller.sync([first.root]);
  const originalBatch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(originalBatch);
  const initial = controller.getDiagnostics();
  assert.equal(initial.activations, 1);

  for (let i = 0; i < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES - 1; i++) {
    await controller.sync([first.root, second.root]);
    assert.equal(second.a.layers.mask, 1, 'new roots remain on the direct path while streaming settles');
    assert.equal(second.b.layers.mask, 1);
    assert.equal(scene.children.includes(originalBatch), true);
    assert.equal(controller.getDiagnostics().activations, 1);
  }

  const rebuilt = await controller.sync([first.root, second.root]);
  const diagnostics = controller.getDiagnostics();
  assert.equal(rebuilt.status, 'active');
  assert.equal(diagnostics.status, 'active');
  assert.equal(diagnostics.rollbacks, 1, 'one quiet rebuild replaces the retained cohort');
  assert.equal(diagnostics.activations, 2);
  assert.equal(diagnostics.instances, 4);
  assert.equal(first.a.layers.mask, 0);
  assert.equal(first.b.layers.mask, 0);
  assert.equal(second.a.layers.mask, 0, 'the settled root enters only after residency preparation');
  assert.equal(second.b.layers.mask, 0);
  assert.equal(scene.children.includes(originalBatch), false);

  controller.dispose();
  for (const { a, b } of [first, second]) {
    a.geometry.dispose();
    b.geometry.dispose();
    a.material.dispose();
    b.material.dispose();
  }
});

test('active retained sources remain readable to clearance, picking, and opaque ownership readers', async () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.userData.kind = 'station';
  root.userData.authoredAssetState = 'authored';
  root.userData.sfBoundEntityId = 901;
  root.position.y = 20;
  const source = new THREE.Mesh(
    new THREE.BoxGeometry(48, 16, 48),
    new THREE.MeshBasicMaterial({ color: 0x8796aa }),
  );
  const peer = new THREE.Mesh(source.geometry, source.material);
  peer.position.x = 48;
  root.add(source, peer);
  scene.add(root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });

  await controller.sync(root);
  const batch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(batch);
  assert.equal(source.visible, true);
  assert.equal(source.isMesh, true);
  assert.equal(source.layers.mask, 0, 'only direct renderer submission is suppressed');
  assert.equal(peer.layers.mask, 0);
  assert.equal(new THREE.Layers().test(source.layers), false,
    'the default camera layer no longer submits the source directly');
  assert.equal(acceptClearanceMesh(source), true, 'camera roof traversal still accepts the authored source');

  const pickedLeaves = [];
  collectPresentedBodyLeaves(root, pickedLeaves);
  assert.ok(pickedLeaves.includes(source), 'world picking still sees the canonical source leaf');
  assert.ok(pickedLeaves.includes(peer), 'world picking still sees every canonical source leaf');

  const box = {
    minX: -24, minY: 12, minZ: -24,
    maxX: 72, maxY: 28, maxZ: 24,
  };
  const roof = clearanceNeighborhoodRaw(root, box, 0, 0);
  assert.equal(roof.failed, false);
  assert.equal(roof.empty, false, 'camera roof traversal still sees opaque authored triangles');
  assert.ok(Number.isFinite(roof.raw));

  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 500);
  camera.position.set(0, 20, 100);
  camera.lookAt(0, 20, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const opaqueBounds = playerTruthOpaqueBounds(THREE, root, camera, 800, 600);
  assert.ok(opaqueBounds, 'player-truth still gets canonical opaque bounds');
  const player = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial({ color: 0xddeeff }),
  );
  player.position.set(0, 20, 0);
  scene.add(player);
  scene.updateMatrixWorld(true);
  const maskLayers = [];
  const renderer = {
    info: { autoReset: true, render: { calls: 0, triangles: 0 } },
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => null,
    getClearColor: (target) => target.set(0x000000),
    getClearAlpha: () => 1,
    setClearColor() {},
    setRenderTarget() {},
  };
  const silhouette = new Uint8Array(4);
  const ownership = new Uint8Array(4);
  const maskReceipt = measurePlayerTruthBodyOcclusion({
    THREE, renderer, scene, camera, playerMesh: player,
    bodies: [{ id: 901, mesh: root }], playerBox: [0, 0, 800, 600],
    vw: 800, vh: 600, width: 1, height: 1,
    silhouette, ownership,
    draw(buffer) {
      maskLayers.push(source.layers.mask);
      if (buffer === silhouette) buffer.fill(255);
    },
  });
  assert.equal(maskReceipt.extraDraws, 2, 'opaque ownership still performs both native mask draws');
  assert.deepEqual(maskLayers, [1, 1], 'ownership masks temporarily include layer-suppressed sources');
  assert.equal(source.layers.mask, 0, 'ownership mask restores the active suppression layer');
  const pickState = { entities: new Map([[901, { id: 901, type: 'station', alive: true }]]) };
  const picker = createWorldObjectPicker({
    state: pickState,
    getCamera: () => camera,
    getMeshes: () => new Map([[901, root]]),
    getScene: () => scene,
    getViewport: () => ({ width: 800, height: 600 }),
  });
  const picked = picker.pick(400, 300);
  assert.equal(picked?.entity?.id, 901, 'screen picking still returns the authored owner');
  assert.ok(picked?.leaf === source || picked?.leaf === peer);
  assert.equal(isPlayerTruthInstrumentation(batch), true,
    'the retained copy is excluded from unowned opaque ownership masks');

  controller.dispose();
  assert.equal(source.visible, true);
  assert.equal(source.layers.mask, 1, 'dispose restores the authored layer mask');
  assert.equal(peer.layers.mask, 1);
  source.geometry.dispose();
  source.material.dispose();
  player.geometry.dispose();
  player.material.dispose();
});

function materialOnBeforeCompile(material) {
  return material.onBeforeCompile;
}

test('retained batches update translated matrices and roll back on reparent or geometry mutation', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });
  await controller.sync(root);
  const batch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(batch);
  const before = new THREE.Matrix4();
  batch.getMatrixAt(0, before);

  root.position.x += 7;
  root.updateMatrixWorld(true);
  await controller.sync(root);
  const after = new THREE.Matrix4();
  batch.getMatrixAt(0, after);
  assert.equal(after.elements[12] - before.elements[12], 7);
  assert.equal(controller.getDiagnostics().status, 'active');

  const replacementParent = new THREE.Group();
  scene.add(replacementParent);
  replacementParent.add(a);
  await controller.sync(root);
  assert.equal(a.visible, true, 'reparent restores direct fallback visibility');
  assert.equal(controller.getDiagnostics().status, 'idle');
  assert.equal(scene.children.includes(batch), false);

  // Rebuild from the intact sibling, then mutate its geometry in place. The mutation invalidates
  // the retained copy and forces a fresh admission before either source is suppressed again.
  replacementParent.remove(a);
  root.add(a);
  root.updateMatrixWorld(true);
  await controller.sync(root);
  assert.equal(controller.getDiagnostics().status, 'active');
  b.geometry.getAttribute('position').setX(0, 4);
  b.geometry.getAttribute('position').needsUpdate = true;
  await controller.sync(root);
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(a.layers.mask, 0);
  assert.equal(b.layers.mask, 0);
  assert.equal(controller.getDiagnostics().status, 'active');

  controller.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  a.material.dispose();
  b.material.dispose();
});

test('late child mounts under an admitted parent invalidate the retained copy', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  const shell = new THREE.Group();
  root.remove(a, b);
  shell.add(a, b);
  root.add(shell);
  scene.add(root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ ready: true }),
  });
  await controller.sync(root);
  const batch = scene.children.find((child) => child.userData?.spacefaceRigidOpaqueBatch);
  assert.ok(batch);
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(a.layers.mask, 0);
  assert.equal(b.layers.mask, 0);

  const late = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x778899 }));
  shell.add(late);
  await controller.sync(root);
  const diagnostics = controller.getDiagnostics();
  assert.equal(diagnostics.status, 'active', 'the changed root is replanned in the same sync');
  assert.equal(diagnostics.rollbacks, 1, 'the stale retained copy is retired before replanning');
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(a.layers.mask, 0);
  assert.equal(b.layers.mask, 0);
  assert.equal(late.visible, true, 'newly mounted unsupported geometry remains direct');
  assert.equal(scene.children.includes(batch), false);
  controller.dispose();
  for (const object of [a, b, late]) {
    object.geometry.dispose();
    object.material.dispose();
  }
});

test('late child mounts while residency is pending never hide a stale retained plan', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: async () => {
      await wait;
      return { ready: true };
    },
  });
  const pending = controller.sync(root);
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x778899 })));
  release();
  const result = await pending;
  assert.equal(result.status, 'idle');
  assert.equal(result.lastReason, 'source-topology-changed-before-commit');
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(scene.children.some((child) => child.userData?.spacefaceRigidOpaqueBatch), false);
  controller.dispose();
  root.traverse((object) => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
});

test('incomplete residency preparation never suppresses source draws', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => ({ skipped: true, reason: 'not-resident' }),
  });
  const result = await controller.sync(root);
  assert.equal(result.status, 'idle');
  assert.equal(result.lastReason, 'preparation-incomplete');
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(scene.children.some((child) => child.userData?.spacefaceRigidOpaqueBatch), false);
  controller.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  a.material.dispose();
  b.material.dispose();
});

test('rejected residency preparation retries once after a quiet window and can activate', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  let attempts = 0;
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient residency failure');
      return { ready: true };
    },
  });
  try {
    const failed = await controller.sync(root);
    assert.equal(failed.lastReason, 'preparation-failed');
    for (let frame = 1; frame < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES; frame += 1) {
      await controller.sync(root);
      assert.equal(attempts, 1, 'failure does not retry on each frame');
      assert.equal(a.layers.mask, 1);
      assert.equal(b.layers.mask, 1);
    }
    const recovered = await controller.sync(root);
    assert.equal(attempts, 2);
    assert.equal(recovered.status, 'active');
    assert.equal(recovered.hiddenSources, 2);
    assert.equal(a.layers.mask, 0);
    assert.equal(b.layers.mask, 0);
  } finally {
    controller.dispose();
    for (const source of [a, b]) { source.geometry.dispose(); source.material.dispose(); }
  }
});

test('permanent preparation rejection parks an unchanged cohort after one retry', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  let attempts = 0;
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => { attempts += 1; throw new Error('permanent residency failure'); },
  });
  try {
    await controller.sync(root);
    for (let frame = 0; frame < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES * 5; frame += 1) {
      await controller.sync(root);
    }
    assert.equal(attempts, 2, 'a persistent failure cannot start a preparation loop');
    assert.equal(controller.getDiagnostics().lastReason, 'preparation-failed');
    assert.equal(a.layers.mask, 1);
    assert.equal(b.layers.mask, 1);
    assert.equal(scene.children.some((child) => child.userData?.spacefaceRigidOpaqueBatch), false);
  } finally {
    controller.dispose();
    for (const source of [a, b]) { source.geometry.dispose(); source.material.dispose(); }
  }
});

test('departure and disposal cancel rejected preparation retries and ignore late rejections', async () => {
  for (const stop of ['departure', 'dispose']) {
    const scene = new THREE.Scene();
    const { root, a, b } = makeRoot();
    scene.add(root);
    scene.updateMatrixWorld(true);
    let attempts = 0, rejectPending;
    const controller = createRetainedRigidOpaqueBatchController({
      scene,
      prepare: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('first rejection');
        return new Promise((resolve, reject) => { rejectPending = reject; });
      },
    });
    try {
      await controller.sync(root);
      for (let frame = 1; frame < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES; frame += 1) {
        await controller.sync(root);
      }
      const retry = controller.sync(root);
      await Promise.resolve();
      assert.equal(attempts, 2);
      if (stop === 'dispose') controller.dispose();
      else await controller.sync([]);
      const stopped = controller.getDiagnostics();
      rejectPending(new Error('late rejected retry'));
      await retry;
      for (let frame = 0; frame < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES * 2; frame += 1) {
        await controller.sync(stop === 'dispose' ? root : []);
      }
      assert.equal(attempts, 2, `${stop} cancels further work`);
      assert.equal(controller.getDiagnostics().status, stopped.status);
      assert.equal(controller.getDiagnostics().lastReason, stopped.lastReason);
      assert.equal(a.layers.mask, 1);
      assert.equal(b.layers.mask, 1);
      assert.equal(scene.children.some((child) => child.userData?.spacefaceRigidOpaqueBatch), false);
    } finally {
      controller.dispose();
      for (const source of [a, b]) { source.geometry.dispose(); source.material.dispose(); }
    }
  }
});

test('unsupported BatchedMesh capability leaves the direct path untouched', async () => {
  const scene = new THREE.Scene();
  const { root, a, b } = makeRoot();
  scene.add(root);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    supported: false,
    prepare: () => ({ ready: true }),
  });
  const result = await controller.sync(root);
  assert.equal(result.status, 'disabled');
  assert.equal(result.lastReason, 'unsupported-batched-mesh-capability');
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(scene.children.some((child) => child.userData?.spacefaceRigidOpaqueBatch), false);
  controller.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  a.material.dispose();
  b.material.dispose();
});
