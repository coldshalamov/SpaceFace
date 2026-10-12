import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [] }); const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
  const entity = sim.spawn({ type: 'ship', team: 0, pos: { x: 10, z: 20 }, radius: 6,
    data: { defId: 'ship_hornet', fittings: ['Fusion Drive S'], weapons: [] } });
  state.playerId = entity.id;
  const scene = new THREE.Scene(); const renderer = {};
  state.render = { scene, renderer, admissionRunGeneration: 1, compileObjectPipelines: async () => ({ ready: true }) };
  const owner = Object.create(render);
  Object.assign(owner, { state, scene, renderer, _meshes: new Map(), _meshesVersion: 0,
    _frameMembrane: { toLocal: p => p }, _shadowPolicyOptions: () => ({}),
    _presentationWorld: { handleForEntityId: id => ({ id }), bindMesh: () => true, unbindMesh: () => true },
    _persistentSubmitLanes: { reserve() {}, release() {} } });
  const makeRoot = (defId = 'ship_hornet') => {
    const root = new THREE.Group();
    root.userData.authoredAssetState = 'authored';
    root.userData.authoredCompositionId = `GLTFKIT_${defId}_fixture`;
    root.userData.openingSubmissionPackage = { manifest: { defId } };
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    return root;
  };
  const initial = makeRoot(); scene.add(initial); owner._meshes.set(entity.id, initial);
  owner._bindPresentationMesh(entity, initial);
  const candidates = [];
  owner.vf = { build(snapshot) {
    assert.notEqual(snapshot, entity, 'refit builds from an owned snapshot');
    assert.notEqual(snapshot.data, entity.data); assert.equal(snapshot.deferAuthoredMotionRegistration, true);
    const candidate = makeRoot(snapshot.data.defId); candidates.push(candidate); return candidate;
  } };
  return { sim, state, entity, scene, owner, initial, candidates, makeRoot,
    async close() { disposeRendererOwnedResources(owner); await flush(); sim.dispose(); } };
}

test('same-definition refit retains the complete admitted player until exact GPU publication', async () => {
  const t = fixture(); const gate = deferred(); let admissionOptions;
  t.entity.data.fittings.push('Shield Booster S');
  t.state.render.compileObjectPipelines = (_root, options) => { admissionOptions = options; return gate.promise; };
  try {
    const pending = t.owner.rebuildShipMesh(t.entity.id); await flush();
    assert.equal(t.initial.userData.presentationShipDefId, 'ship_hornet');
    assert.equal(t.entity.mesh, t.initial); assert.equal(t.owner._meshes.get(t.entity.id), t.initial);
    assert.equal(t.initial.parent, t.scene); assert.equal(t.initial.visible, true);
    assert.equal(t.initial.userData.authoredAssetState, 'authored');
    assert.equal(t.initial.userData.resolvingMarker, undefined);
    assert.equal(t.candidates.length, 1); assert.equal(t.candidates[0].visible, false);
    assert.equal(admissionOptions.strict, true); assert.equal(admissionOptions.explicit, true);
    t.entity.pos.x = 70; t.entity.pos.z = 90;
    gate.resolve({ ready: true }); assert.equal((await pending).status, 'committed');
    assert.equal(t.entity.mesh, t.candidates[0]); assert.equal(t.entity.view.root, t.candidates[0]);
    assert.equal(t.candidates[0].visible, true); assert.equal(t.initial.parent, null);
    assert.equal(t.candidates[0].position.x, 70); assert.equal(t.candidates[0].position.z, 90);
    assert.equal(t.candidates[0].userData.presentationShipDefId, 'ship_hornet');
  } finally { await t.close(); }
});

test('a new hull definition follows initial admission and cannot inherit the old ready identity', async () => {
  const t = fixture();
  t.entity.data.defId = 'ship_kestrel';
  // Rebinding the retained graph must not relabel its actual authored definition.
  t.owner._bindPresentationMesh(t.entity, t.initial);
  assert.equal(t.initial.userData.presentationShipDefId, 'ship_hornet');
  t.owner.vf = { build(entity) {
    assert.equal(entity, t.entity);
    const selected = t.makeRoot(entity.data.defId);
    selected.userData.authoredAssetState = 'awaiting-authored-admission';
    t.candidates.push(selected); return selected;
  } };
  try {
    assert.equal(t.owner.rebuildShipMesh(t.entity.id), undefined);
    assert.equal(t.owner._appearanceReplacements?.size || 0, 0);
    assert.equal(t.entity.mesh, t.candidates[0]);
    assert.notEqual(t.owner._meshes.get(t.entity.id), t.initial,
      'an outgoing draw bridge cannot certify the selected definition as ready');
    assert.equal(t.entity.mesh.userData.presentationShipDefId, 'ship_kestrel');
    assert.equal(t.entity.mesh.userData.authoredAssetState, 'awaiting-authored-admission');
  } finally { await t.close(); }
});

test('partial GPU failure keeps the old graph and retries through the existing bounded owner', async () => {
  const t = fixture();
  t.state.render.compileObjectPipelines = async () => ({ partial: true, ready: false });
  try {
    assert.equal((await t.owner.rebuildShipMesh(t.entity.id)).status, 'retained'); await flush();
    assert.equal(t.entity.mesh, t.initial); assert.equal(t.initial.parent, t.scene);
    assert.equal(t.initial.userData.appearanceReplacementFailure.retryable, true);
    t.state.render.compileObjectPipelines = async () => ({ ready: true });
    assert.equal(t.owner._retryAppearanceReplacement(t.entity, t.initial, Infinity), true);
    const retry = t.owner._appearanceReplacements.get(t.entity.id).completion;
    assert.equal((await retry).status, 'committed');
    assert.equal(t.entity.mesh, t.candidates[1]); assert.equal(t.owner._appearanceGpuOwners.size, 0);
  } finally { await t.close(); }
});

test('superseded refits retain GPU ownership and retire each hidden candidate once', async () => {
  const t = fixture(); const gates = []; const detached = [];
  const build = t.owner.vf.build;
  t.owner.vf.build = (snapshot) => {
    const root = build(snapshot); root.userData.detachAuthoredMotion = () => detached.push(root); return root;
  };
  t.state.render.compileObjectPipelines = () => { const gate = deferred(); gates.push(gate); return gate.promise; };
  try {
    const first = t.owner.rebuildShipMesh(t.entity.id); await flush();
    t.entity.data.fittings.push('Shield Booster S');
    const second = t.owner.rebuildShipMesh(t.entity.id); await flush();
    assert.equal((await first).status, 'retained'); assert.equal(t.entity.mesh, t.initial);
    assert.equal(t.candidates.length, 1, 'the next candidate waits for raw GPU retirement');
    assert.equal(t.candidates[0].parent, t.scene); assert.equal(detached.length, 0);
    gates[0].resolve({ ready: true }); await flush();
    assert.equal(t.candidates.length, 2); assert.equal(t.candidates[0].parent, null);
    assert.deepEqual(detached, [t.candidates[0]]);
    gates[1].resolve({ ready: true }); assert.equal((await second).status, 'committed');
    assert.equal(t.entity.mesh, t.candidates[1]); assert.deepEqual(detached, [t.candidates[0]]);
  } finally { await t.close(); }
});

test('every paced motion-collection yield preserves the current root until an atomic reveal', async () => {
  const t = fixture(); const previousScheduler = globalThis.scheduler; const gates = []; let activated = 0;
  globalThis.scheduler = { yield() { const gate = deferred(); gates.push(gate); return gate.promise; } };
  const build = t.owner.vf.build;
  t.owner.vf.build = (snapshot) => {
    const root = build(snapshot);
    for (let i = 0; i < 270; i++) root.add(new THREE.Object3D());
    root.userData.activateAuthoredMotionRegistration = (live) => {
      assert.equal(live.mesh, root, 'activation requires the new current-root binding');
      assert.equal(t.owner._meshes.get(live.id), root); activated++; return true;
    };
    return root;
  };
  try {
    const pending = t.owner.rebuildShipMesh(t.entity.id); await flush();
    assert.equal(gates.length, 1);
    for (let i = 0; i < 2; i++) {
      assert.equal(t.entity.mesh, t.initial); assert.equal(t.initial.visible, true);
      assert.equal(t.candidates[0].visible, false); assert.equal(activated, 0);
      gates[i].resolve(); await flush();
    }
    assert.equal((await pending).status, 'committed'); assert.equal(activated, 1);
    assert.equal(t.entity.mesh, t.candidates[0]); assert.equal(t.entity.mesh.visible, true);
  } finally { globalThis.scheduler = previousScheduler; await t.close(); }
});

test('stale composition, definition, life, generation or cancellation cannot publish after a paced yield', async () => {
  for (const change of ['composition', 'definition', 'life', 'generation', 'cancel']) {
    const t = fixture(); const previousScheduler = globalThis.scheduler; const gate = deferred(); let yielded = false;
    globalThis.scheduler = { yield() { yielded = true; return gate.promise; } };
    const build = t.owner.vf.build;
    t.owner.vf.build = snapshot => {
      const root = build(snapshot); for (let i = 0; i < 128; i++) root.add(new THREE.Object3D()); return root;
    };
    try {
      const pending = t.owner.rebuildShipMesh(t.entity.id); await flush(); assert.equal(yielded, true);
      assert.equal(t.entity.mesh, t.initial);
      if (change === 'composition') t.entity.data.fittings.push('Shield Booster S');
      if (change === 'definition') t.entity.data.defId = 'ship_kestrel';
      if (change === 'life') t.entity.occupantGeneration++;
      if (change === 'generation') t.state.render.admissionRunGeneration++;
      if (change === 'cancel') t.owner._appearanceReplacements.get(t.entity.id).cancel('test-cancel');
      gate.resolve(); assert.equal((await pending).status, 'retained'); await flush();
      assert.equal(t.entity.mesh, t.initial); assert.equal(t.initial.parent, t.scene);
      assert.equal(t.candidates[0].parent, null); assert.equal(t.owner._appearanceGpuOwners.size, 0);
      if (change === 'composition' || change === 'definition') {
        assert.equal(t.initial.userData.appearanceReplacementFailure.retryable, false);
      }
    } finally { globalThis.scheduler = previousScheduler; await t.close(); }
  }
});

test('binding refusal and activation failure roll back without revealing a partial replacement', async () => {
  for (const fail of ['binding', 'activation']) {
    const t = fixture(); const build = t.owner.vf.build;
    t.owner.vf.build = snapshot => {
      const root = build(snapshot);
      if (fail === 'activation') root.userData.activateAuthoredMotionRegistration = () => { throw new Error('activation refused'); };
      return root;
    };
    if (fail === 'binding') t.owner._presentationWorld.bindMesh = (_handle, root) => root === t.initial;
    try {
      assert.equal((await t.owner.rebuildShipMesh(t.entity.id)).status, 'retained'); await flush();
      assert.equal(t.entity.mesh, t.initial); assert.equal(t.owner._meshes.get(t.entity.id), t.initial);
      assert.equal(t.initial.visible, true); assert.equal(t.initial.parent, t.scene);
      assert.equal(t.candidates[0].visible, false); assert.equal(t.candidates[0].parent, null);
    } finally { await t.close(); }
  }
});

test('renderer teardown cancels a suspended refit and releases its hidden GPU owner', async () => {
  const t = fixture(); const gate = deferred();
  t.state.render.compileObjectPipelines = () => gate.promise;
  try {
    const pending = t.owner.rebuildShipMesh(t.entity.id); await flush();
    disposeRendererOwnedResources(t.owner);
    assert.equal((await pending).status, 'retained'); await flush();
    assert.equal(t.owner._appearanceGpuOwners.size, 0); assert.equal(t.candidates[0].parent, null);
    gate.resolve({ ready: true }); await flush(); assert.equal(t.candidates[0].visible, false);
  } finally { await t.close(); }
});
