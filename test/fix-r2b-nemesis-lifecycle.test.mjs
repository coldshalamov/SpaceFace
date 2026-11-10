import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { boot } from '../scripts/nemesis/harness.mjs';
import { render, disposeRendererOwnedResources } from '../src/render/renderer.js';
import { createRenderEntityFrame } from '../src/render/renderEntityFrame.js';
import { createPersistentSubmitLanes } from '../src/render/persistentSubmitLanes.js';

function fixture(state, entity) {
  const mesh = new THREE.Group(), scene = new THREE.Scene();
  mesh.userData.authoredAssetState = 'authored';
  scene.add(mesh);
  const world = {handleForEntityId: id => ({id}), bindMesh: () => true, unbindMesh: () => true,
    alive: [1], slotGenerations: [1], meshRefs: [mesh], entityIds: [entity.id],
    flags: [0], entityRefs: [entity], dirtyMasks: [0], radii: [entity.radius], boundCount: 1,
    refreshVisibleEntity() {}, clearDirty() {}, poseHasDelta: () => false};
  state.render = {};
  const view = Object.assign(Object.create(render), {state, scene, _meshes: new Map([[entity.id, mesh]]),
    _frameMembrane: {toLocal: p => p, origin: {x: 0, z: 0}}, _presentationWorld: world,
    _presentationQueryOptions: {}, _presentationQueries: {query: () => ({visibleCount: 1,
      visibleSlots: [0], visibleGenerations: [1], hiddenCount: 0, candidateCount: 1, culledCount: 0})},
    _entityViewCullBounds: () => ({x: 0, z: 0, halfX: 10000, halfZ: 10000}),
    _hasCompletedPresentationPose: () => true, _syncShadowCasterPolicyChecked: () => null,
    _entityFrame: createRenderEntityFrame(), _persistentSubmitLanes: createPersistentSubmitLanes(),
    _entityViewDiagnostics: {}, _hlodDiagnostics: {}, viewport: {width: 1280, height: 720},
    _presentationFrameDt: 0});
  assert.equal(view._bindPresentationMesh(entity, mesh), true);
  return {view, mesh};
}

function hit(t, boss, dx = 12) {
  t.bus.emit('combat:damage', {targetId: boss.id, attackerId: t.state.playerId,
    hullDamage: 22, armorDamage: 0, before: {hullMax: 100, armorMax: 40},
    pos: {x: boss.pos.x + dx, z: boss.pos.z}});
}

test('returning nemesis scars bind and update through the production renderer, then release with the mesh', () => {
  const t = boot({seed: 4242});
  let shown;
  try {
    const first = t.start();
    hit(t, t.state.entities.get(first.bossId));
    t.escape();
    t.until(() => t.state.nemesis.active, 450);
    const boss = t.state.entities.get(t.state.nemesis.active.bossId);
    assert.notEqual(boss.id, first.bossId);
    shown = fixture(t.state, boss);
    const marks = shown.mesh.getObjectByName('LivingHull_HeatScorch');
    assert.ok(marks, 'binding the returned NPC must attach its retained scar marks');
    assert.equal(marks.count, 1);
    assert.equal(marks.parent.visible, true);
    const playerRoot = new THREE.Group();
    const player = t.state.entities.get(t.state.playerId);
    assert.equal(shown.view._bindPresentationMesh(player, playerRoot), true);
    assert.equal(marks.parent.parent, shown.mesh, 'binding the player cannot steal the rival overlay');
    t.advance(0.6);
    hit(t, boss, -12);
    shown.view.syncEntityViews(1);
    assert.equal(marks.count, 2, 'the ordinary frame sync presents a new hull wound');
    const root = marks.parent;
    let disposed = 0;
    marks.geometry.addEventListener('dispose', () => disposed++);
    shown.view._unbindPresentationMesh(boss.id, shown.mesh);
    assert.equal(root.parent, null, 'eviction detaches the rival overlay');
    assert.equal(disposed, 1, 'eviction disposes the overlay resources once');
    shown.view._bindPresentationMesh(boss, shown.mesh);
    const replacement = shown.mesh.getObjectByName('LivingHull_HeatScorch');
    assert.notEqual(replacement, marks, 're-entry creates a live controller after eviction');
    assert.equal(replacement.count, 2);
    const replacementRoot = replacement.parent;
    let replacementDisposed = 0;
    replacement.geometry.addEventListener('dispose', () => replacementDisposed++);
    disposeRendererOwnedResources(shown.view);
    assert.equal(replacementRoot.parent, null);
    assert.equal(replacementDisposed, 1, 'renderer retirement releases the current rival controller');
  } finally {
    if (shown) disposeRendererOwnedResources(shown.view);
    t.destroy();
  }
});
