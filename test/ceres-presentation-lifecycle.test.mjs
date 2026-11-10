import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { recordCeresWorkfleetAuthoredSource } from '../src/core/machineryPresentation.js';
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function fixture() {
  const sim = createSimulation({seed: 629, systems: []}), state = sim.state;
  state.mode = 'loading'; state.world.currentSectorId = C.sectorId;
  const entity = sim.spawn(ceresWorkfleetHardwareSpec('breaker'));
  const scene = new THREE.Scene(), renderer = {};
  state.render = {scene, renderer, admissionRunGeneration: 1, compileObjectPipelines: async () => ({ready: true})};
  const owner = Object.create(render);
  Object.assign(owner, {state, scene, renderer, _meshes: new Map(), _meshesVersion: 0,
    _frameMembrane: {toLocal: p => p}, _shadowPolicyOptions: () => ({}),
    _presentationWorld: {handleForEntityId: id => ({id}), bindMesh: () => true, unbindMesh: () => true},
    _persistentSubmitLanes: {reserve() {}, release() {}}});
  const root = () => {
    const m = new THREE.Group(); m.userData.authoredAssetState = 'authored';
    recordCeresWorkfleetAuthoredSource(m, C.assets.breaker); return m;
  };
  const initial = root(); scene.add(initial); owner._meshes.set(entity.id, initial);
  owner._bindPresentationMesh(entity, initial);
  return {sim, state, entity, scene, owner, initial, root,
    close() {disposeRendererOwnedResources(owner); sim.dispose();}};
}

test('Ceres replacement keeps raw GPU ownership through supersession and retires each candidate exactly once', async () => {
  const t = fixture(), gates = [], candidates = [], detached = [];
  t.owner.vf = {build(snapshot) {
    assert.notEqual(snapshot, t.entity); assert.equal(snapshot.deferAuthoredMotionRegistration, true);
    const root = t.root(); candidates.push(root);
    root.userData.detachAuthoredMotion = () => detached.push(root);
    return root;
  }};
  t.state.render.compileObjectPipelines = () => {const gate = deferred(); gates.push(gate); return gate.promise;};
  try {
    const first = t.owner.rebuildShipMesh(t.entity.id); await flush();
    assert.equal(gates.length, 1); assert.equal(candidates[0].visible, false);
    const second = t.owner.rebuildShipMesh(t.entity.id); await flush();
    assert.equal((await first).status, 'retained');
    assert.equal(t.entity.mesh, t.initial); assert.equal(candidates[0].parent, t.scene);
    assert.equal(detached.length, 0); assert.equal(candidates.length, 1, 'new build waits for raw GPU retirement');
    gates[0].resolve({ready: true}); await flush();
    assert.equal(candidates[0].parent, null); assert.deepEqual(detached, [candidates[0]]);
    assert.equal(candidates.length, 2); assert.equal(gates.length, 2);
    gates[1].resolve({ready: true}); assert.equal((await second).status, 'committed');
    assert.equal(t.entity.mesh, candidates[1]); assert.equal(candidates[1].parent, t.scene);
    assert.deepEqual(detached, [candidates[0]]);
  } finally {t.close();}
});

test('Ceres strict partial GPU receipt retains the last admitted body', async () => {
  const t = fixture(); t.owner.vf = {build: t.root};
  t.state.render.compileObjectPipelines = async () => ({partial: true, ready: false});
  try {
    assert.equal((await t.owner.rebuildShipMesh(t.entity.id)).status, 'retained');
    assert.equal(t.entity.mesh, t.initial); assert.equal(t.initial.parent, t.scene);
    await flush(); assert.equal(t.owner._appearanceGpuOwners.size, 0);
  } finally {t.close();}
});

test('Anvil and ordinary identities cannot enter the Ceres replacement lane', () => {
  const t = fixture(); let entered = 0;
  t.owner._rebuildCeresMachineryMesh = () => {entered++;};
  let builtEntity;
  t.owner.vf = {build: e => {builtEntity = e; return t.root();}};
  try {
    for (const identity of ['ordinary', 'anvil_cradle']) {
      t.entity.data.worldRecordId = identity;
      t.entity.data.itinerary = {kind: identity};
      assert.equal(t.owner.rebuildShipMesh(t.entity.id), undefined);
      assert.equal(builtEntity, t.entity, 'existing synchronous generic build remains unchanged');
    }
    assert.equal(entered, 0);
  } finally {t.close();}
});
