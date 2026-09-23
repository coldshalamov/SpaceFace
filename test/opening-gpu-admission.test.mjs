import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { openingProgramSubjectKey } from '../src/render/openingSubmissionPlan.js';
import {
  admitOpeningUnitsAcrossSlices,
  materialHasCompiledProgram,
  touchSubjectOnExactTarget,
  uniqueAdmissionUnits,
  withOnlySubjectsDrawable,
} from '../src/render/openingGpuAdmission.js';

test('family customProgramCacheKey values do not collapse distinct maps into one opening program', () => {
  const family = () => 'spaceface-common-rock-pbr';
  const mapA = new THREE.Texture();
  mapA.name = 'rock-albedo-a';
  const mapB = new THREE.Texture();
  mapB.name = 'rock-albedo-b';
  const a = new THREE.MeshStandardMaterial({ map: mapA });
  const b = new THREE.MeshStandardMaterial({ map: mapB });
  a.customProgramCacheKey = family;
  b.customProgramCacheKey = family;
  assert.notEqual(openingProgramSubjectKey(a), openingProgramSubjectKey(b));
});

test('unique admission units keep one subject per material and per geometry', () => {
  const shared = new THREE.MeshStandardMaterial();
  const geo = new THREE.BoxGeometry();
  const hull = new THREE.Mesh(geo, shared);
  const wing = new THREE.Mesh(geo, shared);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const units = uniqueAdmissionUnits([hull, wing, canopy]);
  assert.equal(units.materialCount, 2);
  assert.equal(units.geometryCount, 2);
  assert.equal(units.programSubjects.length, 2);
  assert.equal(units.geometrySubjects.length, 2);

  const ready = new Set([shared]);
  const skipped = uniqueAdmissionUnits([hull, wing, canopy], {
    skipReadyMaterial: (material) => ready.has(material),
  });
  assert.equal(skipped.programSubjects.length, 1);
  assert.equal(skipped.programSubjects[0], canopy);
  assert.equal(materialHasCompiledProgram(shared, () => ({ currentProgram: { id: 1 } })), true);
  assert.equal(materialHasCompiledProgram(shared, () => ({})), false);
});

test('opening GPU admission compiles and touches one unique subject per yield', async () => {
  const order = [];
  const a = { id: 'a', material: { uuid: 'ma' }, geometry: { uuid: 'ga' } };
  const b = { id: 'b', material: { uuid: 'mb' }, geometry: { uuid: 'gb' } };
  const result = await admitOpeningUnitsAcrossSlices({
    subjects: [a, b],
    compileOne: async (subject) => { order.push(`compile:${subject.id}`); },
    touchOne: (subject) => { order.push(`touch:${subject.id}`); },
    yieldToMain: async () => { order.push('yield'); },
  });
  assert.equal(result.subjects, 2);
  assert.deepEqual(order, ['compile:a', 'touch:a', 'yield', 'compile:b', 'touch:b']);
});

test('a readiness batch issues every compile before the drain, and every touch after it', async () => {
  // `renderer.compile()` under KHR_parallel_shader_compile only STARTS the driver link, so the
  // cohort must reach the driver before the first wait. Two orderings are load-bearing here:
  // no compile may wait on the one before it (that is the 25.8 s serialization this removes), and
  // no touch may run before the drain (a draw against an unlinked program pays the same stall).
  const order = [];
  const a = { id: 'a', material: { uuid: 'ma' }, geometry: { uuid: 'ga' } };
  const b = { id: 'b', material: { uuid: 'mb' }, geometry: { uuid: 'gb' } };
  let drained = false;
  const result = await admitOpeningUnitsAcrossSlices({
    subjects: [a, b],
    beginReadinessBatch: () => ({
      async drain() { order.push('drain'); drained = true; return { contextLost: false }; },
      close() { order.push('close'); },
    }),
    compileOne: (subject) => {
      order.push(`compile:${subject.id}`);
      return Promise.resolve(`compiled:${subject.id}`);
    },
    touchOne: (subject) => {
      assert.equal(drained, true, `touch:${subject.id} ran before the batch drained`);
      order.push(`touch:${subject.id}`);
    },
    yieldToMain: async () => { order.push('yield'); },
  });
  assert.equal(result.subjects, 2);
  assert.equal(result.batched, true);
  assert.deepEqual(order, [
    'compile:a', 'yield', 'compile:b',
    'drain', 'close',
    'touch:a', 'yield', 'touch:b',
  ]);
  assert.deepEqual(result.results.map((entry) => entry.compiled), ['compiled:a', 'compiled:b']);
});

test('a batch that throws mid-issue still closes, so no compile is left suspended', async () => {
  const order = [];
  const a = { id: 'a', material: { uuid: 'ma' }, geometry: { uuid: 'ga' } };
  await assert.rejects(
    admitOpeningUnitsAcrossSlices({
      subjects: [a],
      beginReadinessBatch: () => ({
        async drain() { throw new Error('drain failed'); },
        close() { order.push('close'); },
      }),
      compileOne: () => Promise.resolve(null),
      touchOne: () => { order.push('touch'); },
    }),
    /drain failed/,
  );
  assert.deepEqual(order, ['close'], 'close must run even when the drain throws');
});

test('exact-target touch hides other drawables and restores them', () => {
  const scene = new THREE.Scene();
  const keep = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(keep, other);
  const rendered = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render(targetScene) { rendered.push(targetScene); },
  };
  withOnlySubjectsDrawable(scene, [keep], () => {
    assert.equal(keep.visible, true);
    assert.equal(other.visible, false);
  });
  assert.equal(other.visible, true);
  const receipt = touchSubjectOnExactTarget(renderer, null, keep, {}, scene);
  assert.equal(receipt.skipped, false);
  assert.equal(rendered.length, 1);
  assert.equal(other.visible, true);
});

test('a grouped exact-target touch draws every member in one render and hides only the rest', () => {
  // The loading shell touched thousands of Crucible warm subjects one render each, and every
  // render first hid and restored the whole scene graph (~20 s of a launch). A group shares that
  // walk and the render call; each member must still be the drawable it would be alone.
  const scene = new THREE.Scene();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(a, b, other);
  const seen = [];
  const renderer = {
    autoClear: true,
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() { seen.push({ a: a.visible, b: b.visible, other: other.visible }); },
  };
  const receipt = touchSubjectOnExactTarget(renderer, null, [a, b], {}, scene);
  assert.equal(receipt.skipped, false);
  assert.equal(receipt.subjects, 2);
  assert.deepEqual(seen, [{ a: true, b: true, other: false }], 'one render, both members drawn, the rest hidden');
  assert.equal(other.visible, true, 'hidden drawables are restored');
  assert.equal(touchSubjectOnExactTarget(renderer, null, [], {}, scene).skipped, true);
});

test('a batched admission can touch in groups: same order, one yield per group', async () => {
  const order = [];
  const subjects = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id, material: { uuid: `m${id}` }, geometry: { uuid: `g${id}` },
  }));
  const result = await admitOpeningUnitsAcrossSlices({
    subjects,
    beginReadinessBatch: () => ({
      async drain() { order.push('drain'); return { contextLost: false }; },
      close() {},
    }),
    compileOne: (subject) => Promise.resolve(`compiled:${subject.id}`),
    touchOne: () => { throw new Error('touchOne must not run when touchMany is grouping'); },
    touchMany: (group) => { order.push(`touch:${group.map((s) => s.id).join('')}`); return group.length; },
    touchBatchSize: 2,
    yieldToMain: async () => { order.push('yield'); },
  });
  const touches = order.slice(order.indexOf('drain') + 1);
  assert.deepEqual(touches, ['touch:ab', 'yield', 'touch:cd', 'yield', 'touch:e']);
  assert.equal(result.touched, 5, 'every subject still gets a result row');
  assert.deepEqual(result.results.map((entry) => entry.compiled),
    ['compiled:a', 'compiled:b', 'compiled:c', 'compiled:d', 'compiled:e']);
  assert.ok(result.timing && Number.isFinite(result.timing.touchMs), 'the step reports where its time went');
});

test('opening compile primes shadows, bakes env cardinality, and slices exact-target touches', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const compileStart = renderer.indexOf('const compileOpeningSubmissionPlan = async');
  const compileEnd = renderer.indexOf('state.render.captureOpeningSubmissionPlan', compileStart);
  const postStart = renderer.indexOf('state.render.preparePostOpeningPipelines');
  const postEnd = renderer.indexOf('state.render.prepareOpeningGpuResources', postStart);
  assert.ok(compileStart >= 0 && compileEnd > compileStart);
  assert.ok(postStart >= 0 && postEnd > postStart);
  const compile = renderer.slice(compileStart, compileEnd);
  const post = renderer.slice(postStart, postEnd);
  assert.match(renderer, /this\._bakeEnv\(\);\s*this\._openingEnvFrozen = true/);
  assert.match(compile, /syncVisiblePointLightBudget/);
  assert.match(compile, /SF_OpeningShadowMapPrime/);
  assert.match(compile, /admitOpeningUnitsAcrossSlices/);
  assert.match(compile, /touchExactTargetSubject/);
  assert.doesNotMatch(post, /now - started >= 0/);
  assert.match(post, /lateCompileRoots\.length > 0/);
  assert.doesNotMatch(post, /pendingCount === 0 && lateEntities\.length > 0/);
});
