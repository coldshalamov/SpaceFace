import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  clearRigidOpaqueBatchWarmedKeys, isRigidOpaqueBatchProgramWarmed, noteRigidOpaqueBatchProgramWarmed,
  retainRigidOpaqueBatchSpecimenMaterial, retainedRigidOpaqueBatchSpecimenMaterialCount,
} from '../src/render/rigidOpaqueBatch.js';

test('warm-cache teardown disposes each owned specimen once and leaves live materials alone', () => {
  clearRigidOpaqueBatchWarmedKeys();
  const live = new THREE.MeshStandardMaterial();
  const specimen = live.clone();
  let liveDisposals = 0;
  let specimenDisposals = 0;
  live.addEventListener('dispose', () => { liveDisposals += 1; });
  specimen.addEventListener('dispose', () => { specimenDisposals += 1; });
  assert.equal(retainRigidOpaqueBatchSpecimenMaterial(specimen), true);
  assert.equal(retainRigidOpaqueBatchSpecimenMaterial(specimen), true);
  assert.equal(retainedRigidOpaqueBatchSpecimenMaterialCount(), 1);
  noteRigidOpaqueBatchProgramWarmed('shared-program');
  clearRigidOpaqueBatchWarmedKeys();
  assert.equal(specimenDisposals, 1, 'three releases only the retained material program reference');
  assert.equal(liveDisposals, 0, 'another material using the same program remains live');
  assert.equal(isRigidOpaqueBatchProgramWarmed('shared-program'), false);
  assert.equal(retainedRigidOpaqueBatchSpecimenMaterialCount(), 0);
  clearRigidOpaqueBatchWarmedKeys();
  assert.equal(specimenDisposals, 1, 'repeated teardown cannot release a reference twice');
  live.dispose();
});

test('one failed retained-material disposer does not leak the other owned references', () => {
  clearRigidOpaqueBatchWarmedKeys();
  const disposed = [];
  retainRigidOpaqueBatchSpecimenMaterial({ dispose() { disposed.push('first'); throw new Error('lost context'); } });
  retainRigidOpaqueBatchSpecimenMaterial({ dispose() { disposed.push('second'); } });
  assert.doesNotThrow(() => clearRigidOpaqueBatchWarmedKeys());
  assert.deepEqual(disposed.slice().sort(), ['first', 'second']);
  assert.equal(retainedRigidOpaqueBatchSpecimenMaterialCount(), 0);
  clearRigidOpaqueBatchWarmedKeys();
  assert.deepEqual(disposed.slice().sort(), ['first', 'second']);
});
