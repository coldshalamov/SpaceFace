import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { bindInstanceMotion, loadMotionBank } from '../src/render/authoredMotion.js';
import { render as renderSystem } from '../src/render/renderer.js';
import { createWorldObjectPicker } from '../src/render/worldObjectPicking.js';
import { readGlbJson, sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';

const ROLES = ['Armor', 'BrushedMetal', 'Hull', 'Livery', 'Mechanical', 'MechanicalDark', 'Warning'];

// Shipped hierarchies, semantic tags, identities and verified motion banks; small Three geometry
// and materials stand in for compressed GPU payloads. This checks submission ownership, not look
// or native GPU performance. No browser, WebGL context, or real GPU is created.
async function fixture({ compile = () => ({ pipelines: {}, gpuResidency: {} }) } = {}) {
  const scene = new THREE.Scene(), entities = new Map(), meshes = new Map(), records = [];
  for (const family of ['ashline-rig', 'ashline-dart']) {
    const manifest = JSON.parse(readFileSync(`assets/ships/release/render-packages/${family}/render-package.json`));
    const ref = manifest.runtime.motionBank;
    const bytes = new TextEncoder().encode(readFileSync(ref.uri, 'utf8').replace(/\r\n/g, '\n'));
    const loaded = await loadMotionBank(ref, async () => ({ ok: true, arrayBuffer: async () => bytes.slice().buffer }));
    const sourceId = loaded.bank.sourceAssetId;
    const url = `assets/ships/release/parts/wholeships/${family.replaceAll('-', '_')}.glb`;
    const json = readGlbJson(readFileSync(url));
    const tags = new Map(manifest.runtime.primitives.map(primitive => [primitive.name, primitive.tags]));
    for (let copy = 0; copy < 2; copy++) {
      const id = records.length + 1, root = new THREE.Group(), packageRoot = sceneFromGlbJson(json);
      const dart = family === 'ashline-dart', defId = dart ? 'ship_wasp' : 'ship_lancet';
      root.userData = {
        presentationEntityId: id, presentationEntityType: 'ship', presentationOccupantGeneration: 4,
        presentationShipDefId: defId, authoredAssetState: 'authored', authoredSlots: { hull: [url] },
      };
      root.position.x = (id - 1) * 100;
      const identity = { assetId: manifest.assetId, contentHash: manifest.contentHash };
      packageRoot.userData.spacefaceRenderPackage = identity;
      const cold = [], protectedLeaves = [], byName = new Map();
      packageRoot.traverse(node => {
        byName.set(node.name, node);
        if (!node.isMesh) return;
        node.geometry.dispose();
        node.geometry = new THREE.BoxGeometry(1, 1, 1);
        node.userData.spacefacePartUrl = url;
        node.userData.spacefaceTags = { ...tags.get(node.name) };
        node.visible = !node.userData.spacefaceTags.lod || node.userData.spacefaceTags.lod === 'lod0';
        if (node.userData.nonRender || node.userData.collision) node.visible = false;
        const roleIndex = ROLES.findIndex(role => node.name === `LOD0_MOTION_HULL_CORE_${role}`);
        // Distinct cold roles retain distinct uniforms; identical roles across ships may batch.
        if (roleIndex >= 0) {
          node.material.color.setRGB((roleIndex + 1) / 8, 0.3, 0.4);
          node.castShadow = true; node.receiveShadow = true;
          cold.push(node);
        } else if (node.visible) protectedLeaves.push(node);
      });
      root.add(packageRoot); scene.add(root); meshes.set(id, root);
      entities.set(id, { id, type: 'ship', alive: true, occupantGeneration: 4,
        data: { defId, ...(dart ? { lootTableId: 'wasp_swarmer' } : {}) } });
      scene.updateMatrixWorld(true);
      const motion = bindInstanceMotion(packageRoot, loaded, {
        sourceAssetId: sourceId, packageIdentity: identity, residencyOwner: root,
      });
      assert.ok(motion);
      root.userData.authoredMotionControllers = [motion];
      assert.equal(cold.length, 7);
      records.push({ id, root, packageRoot, identity, loaded, sourceId, motion, cold, protectedLeaves, byName });
    }
  }
  const state = { mode: 'flight', playerId: 'elsewhere', contextRestoreSeq: 0, entities,
    world: { enterSerial: 1, currentSectorId: 'test' },
    render: { firstPlayableFrameAt: 1, admissionRunGeneration: 1, compileObjectPipelines: compile } };
  const owner = Object.assign(Object.create(renderSystem), { state, scene, renderer: {},
    _meshes: meshes, _opaqueBatchSupported: true,
    _entityFrame: { shipAux: records.map(record => ({ mesh: record.root, visible: true, viewCulled: false })) } });
  return { owner, scene, state, records, dispose() {
    owner._rigidOpaqueBatchController?.dispose();
    for (const record of records) record.motion.dispose();
    scene.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
  } };
}

function batches(scene) { return scene.children.filter(node => node.userData?.spacefaceRigidOpaqueBatch); }

function instanceMatrixFor(scene, source) {
  const target = new THREE.Matrix4();
  for (const batch of batches(scene)) {
    for (let index = 0; index < batch.instanceCount; index++) {
      batch.getMatrixAt(index, target);
      if (target.elements.every((value, axis) => Math.abs(value - source.matrixWorld.elements[axis]) < 1e-5)) return target.clone();
    }
  }
  return null;
}

test('current Rig/Dart cold hull submissions enter existing batches and preserve public ship picking', async () => {
  const f = await fixture();
  try {
    f.owner._enableRigidOpaqueBatch(true);
    await f.owner._syncRigidOpaqueBatchProbe();
    const diag = f.owner.getRigidOpaqueBatchDiagnosticsForBench();
    assert.equal(diag.status, 'active', JSON.stringify(diag));
    assert.equal(diag.instances, 28);
    assert.equal(diag.batches, 7, '28 representative cold submissions become seven material/shadow batches');
    for (const record of f.records) {
      assert.ok(record.cold.every(leaf => leaf.visible && leaf.layers.mask === 0));
      assert.ok(record.protectedLeaves.every(leaf => leaf.layers.mask === 1), 'all protected roles stay direct');
      assert.ok(record.cold.every(leaf => leaf.castShadow && leaf.receiveShadow));
    }
    const record = f.records[0], point = record.cold[0].getWorldPosition(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 500);
    camera.position.copy(point).add(new THREE.Vector3(0, 0, 50)); camera.lookAt(point); camera.updateMatrixWorld(true);
    const picker = createWorldObjectPicker({ state: f.state, getCamera: () => camera,
      getMeshes: () => f.owner._meshes, getScene: () => f.scene, getViewport: () => ({ width: 800, height: 600 }) });
    const picked = picker.pick(400, 300);
    assert.equal(picked?.entity.id, record.id, 'the public picker returns the canonical live ship');
    assert.ok(record.root.getObjectById(picked.leaf.id), 'picking returns an authored leaf, not the scene batch');
  } finally { f.dispose(); }
});

test('current hull batches follow body and native motion poses without stable-frame matrix uploads', async () => {
  const f = await fixture();
  try {
    f.owner._enableRigidOpaqueBatch(true); await f.owner._syncRigidOpaqueBatchProbe();
    const record = f.records[0], source = record.cold[0];
    const before = source.matrixWorld.clone(), meshes = batches(f.scene);
    record.motion.handleEvent('ship:boostStart', {}, 0); record.motion.update(0.31);
    await f.owner._syncRigidOpaqueBatchProbe();
    assert.notDeepEqual(source.matrixWorld.elements, before.elements, 'the native motion writer changes the canonical pose');
    assert.ok(instanceMatrixFor(f.scene, source), 'the retained instance contains the current canonical world pose');
    record.root.position.x += 4;
    await f.owner._syncRigidOpaqueBatchProbe();
    assert.ok(instanceMatrixFor(f.scene, source), 'the same instance follows the whole ship body');
    const writes = f.owner.getRigidOpaqueBatchDiagnosticsForBench().matrixUpdates;
    await f.owner._syncRigidOpaqueBatchProbe();
    assert.deepEqual(batches(f.scene), meshes, 'stable sync retains batch allocations');
    assert.equal(f.owner.getRigidOpaqueBatchDiagnosticsForBench().matrixUpdates, writes);
    // Authored LOD visibility changes restore the exact source route before any replan.
    for (const leaf of record.cold) leaf.visible = false;
    const lod1 = record.byName.get('LOD1_MOTION_HULL_CORE_Hull'); lod1.visible = true;
    await f.owner._syncRigidOpaqueBatchProbe();
    assert.ok(record.cold.every(leaf => leaf.visible === false && leaf.layers.mask === 1));
    assert.equal(lod1.visible, true);
  } finally { f.dispose(); }
});

test('comparison restores legacy submission then readmits the same current hulls transactionally', async () => {
  const f = await fixture();
  try {
    f.owner._enableRigidOpaqueBatch(true); await f.owner._syncRigidOpaqueBatchProbe();
    const on = f.owner.getAshlineHullBatchDiagnosticsForBench();
    assert.equal(on.rigidOpaqueBatch.instances, 28);
    const off = await f.owner.setAshlineHullBatchForBench(false);
    assert.equal(off.previousEnabled, true); assert.equal(off.enabled, false);
    assert.ok(f.records.every(record => record.cold.every(leaf => leaf.layers.mask === 1)));
    assert.equal(off.rigidOpaqueBatch.instances, 0);
    const restored = await f.owner.setAshlineHullBatchForBench(true);
    assert.equal(restored.previousEnabled, false); assert.equal(restored.enabled, true);
    assert.equal(restored.rigidOpaqueBatch.instances, 28);
    assert.equal(on.rigidOpaqueBatch.instances, 28, 'retained diagnostic snapshots do not drift');
    await assert.rejects(f.owner.setAshlineHullBatchForBench('false'), /boolean/);
  } finally { f.dispose(); }
});

test('new worker-presented hulls stay direct while an unchanged resident cohort finishes preparation', async () => {
  let release, started;
  const wait = new Promise(resolve => { release = resolve; });
  const compiling = new Promise(resolve => { started = resolve; });
  let compileCalls = 0;
  const f = await fixture({ compile: async () => {
    compileCalls++; started(); await wait;
    return { pipelines: {}, gpuResidency: {} };
  } });
  try {
    const shown = f.owner._entityFrame.shipAux;
    f.owner._entityFrame.shipAux = shown.slice(0, 2);
    f.owner._enableRigidOpaqueBatch(true);
    const pending = f.owner._syncRigidOpaqueBatchProbe();
    await compiling;
    f.owner._entityFrame.shipAux = shown;
    const withArrivals = f.owner._syncRigidOpaqueBatchProbe();
    await Promise.resolve();
    assert.equal(compileCalls, 1, 'arrival does not start a duplicate compile plan');
    release(); await pending; await withArrivals;
    assert.equal(f.owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'active');
    assert.equal(f.owner.getRigidOpaqueBatchDiagnosticsForBench().instances, 14);
    assert.ok(f.records.slice(0, 2).every(record => record.cold.every(leaf => leaf.layers.mask === 0)));
    assert.ok(f.records.slice(2).every(record => record.cold.every(leaf => leaf.layers.mask === 1)),
      'newcomers retain their actual direct appearance until a normal subsequent replan');
  } finally { release(); f.dispose(); }
});

test('generation/context changes and compare rollback cannot publish a pending hull replacement', async () => {
  for (const invalidate of [f => { f.state.contextRestoreSeq++; }, f => { f.owner._rendererGeneration = 2; },
    f => { f.owner.scene = new THREE.Scene(); },
    f => { f.state.render.admissionRunGeneration++; }, f => { f.state.world.enterSerial++; },
    f => { f.state.entities.get(1).occupantGeneration++; }]) {
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const f = await fixture({ compile: async () => { await wait; return { pipelines: {}, gpuResidency: {} }; } });
    try {
      f.owner._enableRigidOpaqueBatch(true);
      const pending = f.owner._syncRigidOpaqueBatchProbe();
      assert.ok(f.records.every(record => record.cold.every(leaf => leaf.layers.mask === 1)));
      invalidate(f); release(); await pending;
      assert.ok(f.records.every(record => record.cold.every(leaf => leaf.layers.mask === 1)));
      assert.equal(batches(f.scene).length, 0);
    } finally { release(); f.dispose(); }
  }
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture({ compile: async () => { await wait; return { pipelines: {}, gpuResidency: {} }; } });
  try {
    f.owner._enableRigidOpaqueBatch(true); const pending = f.owner._syncRigidOpaqueBatchProbe();
    await f.owner.setAshlineHullBatchForBench(false); release(); await pending;
    assert.ok(f.records.every(record => record.cold.every(leaf => leaf.layers.mask === 1)));
    assert.equal(batches(f.scene).length, 0);
  } finally { release(); f.dispose(); }
});

test('a second Rig writer or live material override restores direct appearance', async () => {
  const f = await fixture(); let other;
  try {
    f.owner._enableRigidOpaqueBatch(true); await f.owner._syncRigidOpaqueBatchProbe();
    const record = f.records[0];
    other = bindInstanceMotion(record.packageRoot, record.loaded, { sourceAssetId: record.sourceId,
      packageIdentity: record.identity, residencyOwner: record.root });
    record.root.userData.authoredMotionControllers.push(other);
    await f.owner._syncRigidOpaqueBatchProbe();
    assert.ok(record.cold.every(leaf => leaf.layers.mask === 1), 'overlapping motion writers cannot remain retained');
    const peer = f.records[1]; peer.cold[0].material.emissiveIntensity = 3;
    await f.owner._syncRigidOpaqueBatchProbe();
    assert.equal(peer.cold[0].layers.mask, 1, 'live appearance mutation falls back to its canonical material');
  } finally { other?.dispose(); f.dispose(); }
});
