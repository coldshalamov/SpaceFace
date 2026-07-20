import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  allocateOpaqueBatchInstance,
  createOpaqueBatchPipelineAdmission,
  getOpaqueBatchWorldDiagnostics,
  markOpaqueBatchOwnerDirty,
  syncOpaqueBatchWorld,
} from '../src/render/batching/opaqueBatchWorld.js';

function derived(geometry, key) {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...(geometry.userData || {}),
    spacefaceBatchKey: key,
    spacefaceDerivedStaticBatch: true,
  };
  return geometry;
}

function ownerWithProxy(scene, x = 0) {
  const owner = new THREE.Group();
  const root = new THREE.Group();
  const proxy = new THREE.Object3D();
  owner.position.x = x;
  root.position.y = 0.5;
  root.add(proxy);
  owner.add(root);
  scene.add(owner);
  return { owner, proxy };
}

function frame(frameId, entries) {
  return {
    frameId,
    authored: entries.map(({ owner, renderDirty = false, visible = true, viewCulled = false }) => ({
      mesh: owner,
      renderDirty,
      visible,
      viewCulled,
    })),
  };
}

test('opaque batch pages retain exact pipelines, stable handles, dirty-only state, and exact cleanup', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ color: 0x667788 });
  material.userData.spacefaceBatchKey = 'probe:hull';
  const otherMaterial = new THREE.MeshStandardMaterial({ color: 0x334455 });
  otherMaterial.userData.spacefaceBatchKey = 'probe:armor';
  const a = ownerWithProxy(scene, -3);
  const b = ownerWithProxy(scene, 3);
  const armor = ownerWithProxy(scene, 9);
  let sourceDisposals = 0;
  const box = derived(new THREE.BoxGeometry(1, 1, 1), 'probe:box');
  box.addEventListener('dispose', () => sourceDisposals++);
  const sphere = derived(new THREE.SphereGeometry(0.7, 8, 6), 'probe:sphere');
  sphere.addEventListener('dispose', () => sourceDisposals++);
  const armorBox = derived(new THREE.BoxGeometry(1.5, 0.5, 0.5), 'probe:armor-box');
  armorBox.addEventListener('dispose', () => sourceDisposals++);

  const slotA = allocateOpaqueBatchInstance(scene, a.owner, a.proxy, box, material, {
    geometryKey: 'probe:box', label: 'Hull',
  });
  const slotB = allocateOpaqueBatchInstance(scene, b.owner, b.proxy, sphere, material, {
    geometryKey: 'probe:sphere', label: 'Hull',
  });
  const slotArmor = allocateOpaqueBatchInstance(scene, armor.owner, armor.proxy, armorBox, otherMaterial, {
    geometryKey: 'probe:armor-box', label: 'Armor',
  });

  assert.equal(sourceDisposals, 3, 'derived candidates are released after their data is copied into a page');
  assert.equal(slotA.page, slotB.page, 'heterogeneous geometry with one exact material/layout shares a page');
  assert.notEqual(slotA.geometryId, slotB.geometryId, 'heterogeneous geometry retains separate geometry handles');
  assert.notEqual(slotA.page, slotArmor.page, 'semantic materials are never flattened into one page');
  assert.equal(slotA.page.material, material);
  assert.equal(slotArmor.page.material, otherMaterial);
  assert.equal(slotA.page.frustumCulled, false);
  assert.equal(slotA.page.perObjectFrustumCulled, true);
  assert.equal(slotA.page.sortObjects, true);
  assert.equal(slotA.page.castShadow, true);
  assert.equal(slotA.page.receiveShadow, true);

  const firstFrame = frame(1, [a, b, armor]);
  const first = syncOpaqueBatchWorld(scene, { entityFrame: firstFrame, authoredRecords: firstFrame.authored });
  assert.deepEqual({
    pages: first.pages,
    pipelines: first.pipelines,
    geometries: first.geometrySlots,
    active: first.activeInstanceSlots,
    submitted: first.submittedInstanceSlots,
    uploads: first.matrixUploads,
  }, { pages: 2, pipelines: 2, geometries: 3, active: 3, submitted: 3, uploads: 3 });

  const stableFrame = frame(2, [a, b, armor]);
  const stable = syncOpaqueBatchWorld(scene, { entityFrame: stableFrame, authoredRecords: stableFrame.authored });
  assert.equal(stable.matrixUploads, 0, 'stable owners do not rewrite page matrices');
  assert.equal(stable.matrixReuses, 3);
  assert.equal(stable.ownersVisited, 0, 'stable frame classification skips owner traversal');

  a.proxy.visible = false;
  markOpaqueBatchOwnerDirty(a.owner);
  const damageFrame = frame(3, [a, b, armor]);
  const damaged = syncOpaqueBatchWorld(scene, { entityFrame: damageFrame, authoredRecords: damageFrame.authored });
  assert.equal(damaged.submittedInstanceSlots, 2, 'stable-owner damage visibility is explicitly propagated');
  assert.equal(slotA.page.getVisibleAt(slotA.instanceId), false);

  b.owner.position.x = 7;
  const movedFrame = frame(4, [a, { ...b, renderDirty: true }, armor]);
  const moved = syncOpaqueBatchWorld(scene, { entityFrame: movedFrame, authoredRecords: movedFrame.authored });
  assert.equal(moved.matrixUploads, 1, 'only the dirty owner uploads a replacement matrix');
  const submittedMatrix = new THREE.Matrix4();
  slotB.page.getMatrixAt(slotB.instanceId, submittedMatrix);
  assert.equal(submittedMatrix.elements[12], 7);

  const omissionFrame = frame(5, [a, b]);
  const omitted = syncOpaqueBatchWorld(scene, { entityFrame: omissionFrame, authoredRecords: omissionFrame.authored });
  assert.equal(omitted.submittedInstanceSlots, 1, 'an omitted owner is hidden without scanning stable owners');
  assert.equal(omitted.ownersVisited, 1);
  const fallback = syncOpaqueBatchWorld(scene);
  assert.equal(fallback.frameBounded, false);
  assert.equal(fallback.submittedInstanceSlots, 2, 'fallback sync preserves ownership when frame data is unavailable');

  const admission = createOpaqueBatchPipelineAdmission(scene, b.owner);
  assert.ok(admission?.isObject3D);
  assert.equal(admission.children.length, 1);
  assert.equal(admission.children[0].isBatchedMesh, true);
  assert.equal(admission.children[0].material, material);
  assert.ok(admission.children.every((subject) => subject?.isObject3D && !Array.isArray(subject)));
  let admissionDisposals = 0;
  for (const subject of admission.children) {
    const dispose = subject.dispose.bind(subject);
    subject.dispose = () => { admissionDisposals++; dispose(); };
  }
  admission.clear();
  assert.equal(admission.children.length, 0);
  assert.equal(admissionDisposals, 1);

  slotA.release();
  const replacementGeometry = derived(new THREE.BoxGeometry(1, 1, 1), 'probe:box');
  const c = ownerWithProxy(scene, 12);
  const slotC = allocateOpaqueBatchInstance(scene, c.owner, c.proxy, replacementGeometry, material, {
    geometryKey: 'probe:box', label: 'Hull',
  });
  assert.equal(slotC.instanceId, slotA.instanceId, 'the lowest freed instance handle is reused deterministically');
  assert.equal(slotC.geometryId, slotA.geometryId, 'the retained geometry handle is reused');

  let pageDisposals = 0;
  for (const page of new Set([slotB.page, slotArmor.page])) {
    const dispose = page.dispose.bind(page);
    page.dispose = () => { pageDisposals++; dispose(); };
  }
  slotB.release();
  slotC.release();
  slotArmor.release();
  const cleaned = getOpaqueBatchWorldDiagnostics(scene);
  assert.equal(cleaned.pages, 0);
  assert.equal(cleaned.pipelines, 0);
  assert.equal(cleaned.activeInstanceSlots, 0);
  assert.equal(pageDisposals, 2, 'the last owner reclaims each page and its combined GPU geometry');
  assert.equal(scene.children.filter((object) => object.userData?.spacefaceOpaqueBatchPage).length, 0);

  const churn = { peakPages: 0, disposals: 0 };
  for (let index = 0; index < 6; index++) {
    const entry = ownerWithProxy(scene, index * 2);
    const geometry = derived(new THREE.BoxGeometry(1, 1, 1), 'probe:churn');
    const slot = allocateOpaqueBatchInstance(scene, entry.owner, entry.proxy, geometry, material, {
      geometryKey: 'probe:churn', label: 'Churn',
    });
    const dispose = slot.page.dispose.bind(slot.page);
    slot.page.dispose = () => { churn.disposals++; dispose(); };
    const current = syncOpaqueBatchWorld(scene);
    churn.peakPages = Math.max(churn.peakPages, current.pages);
    slot.release();
  }
  assert.deepEqual(churn, { peakPages: 1, disposals: 6 });
  assert.equal(getOpaqueBatchWorldDiagnostics(scene).pages, 0);

  material.dispose();
  otherMaterial.dispose();
});
