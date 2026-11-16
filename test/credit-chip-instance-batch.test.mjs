// PERF-HOT-03 item 1 — credit chips draw from one instanced batch per part.
//
// Every Swarm kill drops a four-part credit chip and nothing removes it until it is scooped or
// the round-clear sweep runs. Fourteen chips on the field is 56 submissions; the batch draws any
// number of chips in four. These tests use the real factory build (the exact geometry, materials,
// scale and spin a live chip gets), a real Scene and the pool's own sync, and prove:
//   * four calls regardless of chip count, with the same geometry/material objects the factory
//     handed each chip;
//   * the drawn matrices are the leaves' own world matrices, so the chip's tumble, bob and intake
//     pose still come from pickupMotionPresentation — unchanged;
//   * a chip that stops submitting (scooped, swept) draws directly again in the same frame;
//   * a hidden chip (a latch, or the round-clear sweep's visible=false) submits no instance and
//     keeps its direct leaves, so the batch never paints a body the direct path skipped;
//   * a hidden chip stays pickable/hoverable on the pooled-leaf contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { createPickupMotionTracker } from '../src/render/pickupMotionPresentation.js';
import { collectPresentedBodyLeaves } from '../src/render/worldObjectPicking.js';
import {
  CREDIT_CHIP_PART_NAMES,
  createCreditChipBatch,
  creditChipPartLeaves,
} from '../src/render/creditChipBatch.js';

function chipEntity(id) {
  return {
    id, type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 },
    data: { kind: 'credit_chip', credits: 100, wallet: 'run' },
  };
}

function buildChip(factory, scene, id, x, z) {
  const entity = chipEntity(id);
  const root = factory.build(entity);
  root.position.set(x, 0, z);
  scene.add(root);
  return { entity, root };
}

function batchMeshes(pool) {
  return pool.buckets.filter(Boolean).map((bucket) => bucket.mesh).filter(Boolean);
}

function matrixAt(mesh, index) {
  const out = new THREE.Matrix4();
  mesh.getMatrixAt(index, out);
  return out;
}

test('four instanced calls draw every chip with the factory geometry and the leaf world matrices', () => {
  const scene = new THREE.Scene();
  const factory = createVisualFactory();
  const tracker = createPickupMotionTracker();
  const pool = createCreditChipBatch(scene);
  const chips = [];
  for (let i = 0; i < 14; i++) chips.push(buildChip(factory, scene, 900 + i, i * 4, -i * 3));
  // Pose them through the real presentation pass so the matrices are not the identity.
  for (const chip of chips) tracker.updatePickupMotion(chip.entity, chip.root, 3.5, 0.016, null, {});

  const stats = pool.sync(chips.map((chip) => chip.root));
  assert.equal(stats.chips, 14);
  assert.equal(stats.instances, 14 * CREDIT_CHIP_PART_NAMES.length);
  assert.equal(stats.drawCalls, 4, 'four calls for fourteen chips');
  const meshes = batchMeshes(pool);
  assert.equal(meshes.length, 4);
  for (const mesh of meshes) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.equal(mesh.count, 14);
    assert.equal(mesh.visible, true);
    assert.ok(Math.max(mesh.geometry.attributes.position.count, 1) > 0);
  }
  // Same geometry/material objects the per-entity build handed the leaves — a shared-cache draw,
  // not a re-mesh of the token.
  const firstLeaves = creditChipPartLeaves(chips[0].root);
  for (let p = 0; p < CREDIT_CHIP_PART_NAMES.length; p++) {
    assert.equal(pool.buckets[p].geometry, firstLeaves[p].geometry);
    assert.equal(pool.buckets[p].material, firstLeaves[p].material);
    assert.equal(pool.buckets[p].mesh.name, `SF_CreditChipInstances_${CREDIT_CHIP_PART_NAMES[p]}`);
  }
  // The drawn matrices are the leaves' solved world matrices: same position, same spin, same bob.
  for (let c = 0; c < chips.length; c++) {
    const leaves = creditChipPartLeaves(chips[c].root);
    for (let p = 0; p < CREDIT_CHIP_PART_NAMES.length; p++) {
      leaves[p].updateWorldMatrix(true, false);
      const drawn = matrixAt(pool.buckets[p].mesh, c);
      const expected = leaves[p].matrixWorld.elements;
      for (let k = 0; k < 16; k++) {
        // The instance buffer stores float32; the comparison is against the float64 solve.
        assert.ok(Math.abs(drawn.elements[k] - expected[k]) < 1e-4, `chip ${c} part ${p} element ${k}`);
      }
    }
  }
  // The direct leaves are hidden only because the batch draws them.
  for (const chip of chips) {
    const leaves = creditChipPartLeaves(chip.root);
    for (const leaf of leaves) {
      assert.equal(leaf.visible, false, 'the batch owns this leaf this frame');
      assert.equal(leaf.userData.poolLeafVisible, true);
    }
  }
  pool.dispose();
  invalidateVisualFactoryCaches();
});

test('a chip that stops submitting draws directly again the same frame', () => {
  const scene = new THREE.Scene();
  const factory = createVisualFactory();
  const pool = createCreditChipBatch(scene);
  const kept = buildChip(factory, scene, 910, 0, 0);
  const scooped = buildChip(factory, scene, 911, 6, 0);

  pool.sync([kept.root, scooped.root]);
  assert.equal(pool.stats.chips, 2);
  const scoopedLeaves = creditChipPartLeaves(scooped.root);
  assert.ok(scoopedLeaves.every((leaf) => leaf.visible === false));

  // The scoop removes the entity's mesh from the renderer's list; the next pass sees only one.
  scene.remove(scooped.root);
  const stats = pool.sync([kept.root]);
  assert.equal(stats.chips, 1);
  assert.equal(batchMeshes(pool)[0].count, 1, 'the batch shrinks to what it covers');
  for (const leaf of scoopedLeaves) {
    assert.equal(leaf.visible, true, 'a chip the batch no longer draws is restored before the frame draws');
    assert.equal(leaf.userData.asteroidInstanceAdopted, undefined, 'and leaves the pooled-leaf contract');
    assert.equal(leaf.userData.poolLeafVisible, undefined);
  }
  // Nothing submitted at all: every batch goes to zero and every leaf draws directly.
  const empty = pool.sync([]);
  assert.equal(empty.chips, 0);
  assert.ok(batchMeshes(pool).every((mesh) => mesh.count === 0 && mesh.visible === false));
  assert.ok(creditChipPartLeaves(kept.root).every((leaf) => leaf.visible === true));
  pool.dispose();
  invalidateVisualFactoryCaches();
});

test('a hidden chip submits no instance, keeps drawing directly, and stays pickable', () => {
  const scene = new THREE.Scene();
  const factory = createVisualFactory();
  const pool = createCreditChipBatch(scene);
  const lit = buildChip(factory, scene, 920, 0, 0);
  const dark = buildChip(factory, scene, 921, 8, 0);

  dark.root.visible = false;
  const stats = pool.sync([lit.root, dark.root]);
  assert.equal(stats.chips, 1, 'only the drawable chip is submitted');
  assert.equal(batchMeshes(pool)[0].count, 1);
  // A chip outside the batch keeps every part visible and off the pooled-leaf contract, so it
  // draws directly the moment its root is shown again (a latch release, a re-entry).
  const darkLeaves = creditChipPartLeaves(dark.root);
  assert.equal(darkLeaves.every((leaf) => leaf.visible === true), true);
  // A batch-drawn chip stays pickable: the pooled-leaf contract carries its would-draw state,
  // which is exactly what worldObjectPicking.js and objectHoverFeedback.js read.
  const litLeaves = collectPresentedBodyLeaves(lit.root);
  assert.equal(litLeaves.length, CREDIT_CHIP_PART_NAMES.length,
    'every part of a batch-drawn chip is still a presented body leaf');
  for (const leaf of litLeaves) assert.equal(leaf.userData.asteroidInstanceAdopted, true);

  pool.dispose();
  for (const leaf of creditChipPartLeaves(lit.root)) assert.equal(leaf.visible, true, 'dispose restores');
  invalidateVisualFactoryCaches();
});

test('the batch grows past its initial capacity and keeps every chip', () => {
  const scene = new THREE.Scene();
  const factory = createVisualFactory();
  const pool = createCreditChipBatch(scene);
  const chips = [];
  for (let i = 0; i < 70; i++) chips.push(buildChip(factory, scene, 2000 + i, i * 2, 0));
  const stats = pool.sync(chips.map((chip) => chip.root));
  assert.equal(stats.chips, 70);
  assert.ok(stats.capacity >= 70);
  for (const mesh of batchMeshes(pool)) assert.equal(mesh.count, 70);
  assert.equal(stats.drawCalls, 4, 'still four calls at seventy chips');
  pool.dispose();
  invalidateVisualFactoryCaches();
});

test('the warm hook publishes the four empty part batches before any chip exists', () => {
  const scene = new THREE.Scene();
  const factory = createVisualFactory();
  const created = [];
  const pool = createCreditChipBatch(scene, { onMeshCreated: (mesh) => created.push(mesh) });
  const seed = buildChip(factory, scene, 930, 0, 0);
  assert.equal(pool.warm(seed.root), true);
  assert.equal(created.length, 4, 'each part batch asks the admission latch to link its program');
  assert.ok(created.every((mesh) => mesh.userData.creditChipInstances === true));
  assert.ok(batchMeshes(pool).every((mesh) => mesh.count === 0 && mesh.visible === false));
  assert.equal(pool.warm({ traverse() {} }), false, 'a non-chip root warms nothing');
  pool.dispose();
  invalidateVisualFactoryCaches();
});
