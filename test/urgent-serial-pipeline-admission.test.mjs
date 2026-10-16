import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { openingCompileIssueKey } from '../src/render/renderer.js';
import { beginScenePipelineReadinessBatch, compileScenePipelinesForRenderTarget, scenePipelineReadinessBatchOpen } from '../src/render/bloom.js';
import { makeGpuQueuePacer } from '../src/render/gpuQueuePace.js';
import { collectUniqueCompileSubjects, compileSubjectsAcrossPresents,
  shouldSliceFlightAdmission, postTaskAtBackgroundPriorityBounded } from '../src/render/compilePresentSlice.js';
import { createPipelineAdmissionTracker, observePipelineAdmission } from '../src/render/pipelineReadiness.js';

// Execute the live renderer admission owner without initializing a GPU. The real selector,
// unique-subject collector, tracker, readiness batch and serial queue pacer retain their order.
// Only GPU submission/drain are modeled; this proves queue size, not hardware milliseconds.
const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const begin = source.indexOf('const compileForCurrentTarget = ');
const end = source.indexOf('\n    const recordAuthoredAdmissionBlockingSlice', begin);
assert.ok(begin > 0 && end > begin);
const body = source.slice(begin + 'const compileForCurrentTarget = '.length, end).trim().replace(/;$/, '');

function fixture({ parallel = false, active = () => true, rejectIndex = -1, mode = 'flight', stampDelayMs = 0, urgent = true } = {}) {
  const state = { mode, render: { firstPlayableFrameAt: 1 } };
  const root = new THREE.Group();
  root.visible = false;
  root.userData.pipelinesPending = true;
  for (let index = 0; index < 8; index++) {
    const material = new THREE.MeshStandardMaterial();
    material.defines = { FIXTURE_VARIANT: index };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.name = `variant-${index}`;
    root.add(mesh);
  }
  let queued = 0, peak = 0, target = null;
  const submissions = [], drains = [];
  const gl = { getExtension: () => parallel ? {} : null, isContextLost: () => false,
    finish() { drains.push(queued); queued = 0; } };
  const renderer = { getContext: () => gl, extensions: { get: () => parallel ? {} : null },
    getRenderTarget: () => target, setRenderTarget: (next) => { target = next; } };
  const fault = new Error('compile failed');
  renderer.domElement = { addEventListener() {}, removeEventListener() {} };
  renderer.properties = { get: () => ({ currentProgram: { isReady: () => true } }) };
  renderer.compileAsync = () => { throw new Error('owned readiness must handle compilation'); };
  renderer.compile = (subject) => {
    const materials = new Set();
    subject.traverse((node) => {
      if (!node.isMesh) return;
      if (submissions.length === rejectIndex) throw fault;
      submissions.push(node.name); queued++; peak = Math.max(peak, queued);
      materials.add(node.material);
    });
    return materials;
  };
  const compileSubjectColorAndDepth = async (subject) => {
    // Production stamps environment asynchronously before calling WebGLRenderer.compile.
    if (stampDelayMs) await new Promise((resolve) => setTimeout(resolve, stampDelayMs));
    else await Promise.resolve();
    return compileScenePipelinesForRenderTarget(renderer, null, subject, null, root);
  };
  const deps = { state, renderer, compileSubjectColorAndDepth, collectUniqueCompileSubjects,
    openingCompileIssueKey, shouldSliceFlightAdmission, beginScenePipelineReadinessBatch,
    compileSubjectsAcrossPresents, makeGpuQueuePacer, postTaskAtBackgroundPriorityBounded, observePipelineAdmission,
    admissionPaceYield: async () => {}, pacedFrameSpend: () => 0,
    PACED_FRAME_BUDGET_MS: 4, notePacedFrameSpend: () => {} };
  const compile = new Function(...Object.keys(deps), `return (${body});`).call(
    { _shadowSettingOn: false, _selectPostRoute: () => 'fixture' }, ...Object.values(deps));
  const tracker = createPipelineAdmissionTracker(compile);
  return { root, submissions, drains, fault, peak: () => peak,
    run: () => tracker.compile(root, { urgent, isActive: active }) };
}

test('urgent serial-driver authored root drains each variant instead of queuing a whole root', async () => {
  const h = fixture();
  await h.run();
  assert.equal(h.submissions.length, 8);
  assert.equal(h.peak(), 1, 'serial queue stays one compile subject deep, even for urgent single roots');
  assert.deepEqual(h.drains, Array(8).fill(1));
  assert.equal(h.root.visible, false, 'the existing pending owner retains visibility control');
  assert.equal(h.root.userData.pipelinesPending, true);
});

test('parallel driver retains the urgent whole-root route and does not force queue drains', async () => {
  const h = fixture({ parallel: true });
  await h.run();
  assert.equal(h.submissions.length, 8);
  assert.equal(h.peak(), 8);
  assert.deepEqual(h.drains, []);
});

test('retired urgent root does not submit GPU work', async () => {
  const h = fixture({ active: () => false });
  await h.run();
  assert.deepEqual(h.submissions, []);
  assert.deepEqual(h.drains, []);
});


test('serial drain follows delayed environment stamping and actual submission', async () => {
  const h = fixture({ stampDelayMs: 20 });
  await h.run();
  assert.equal(h.submissions.length, 8);
  assert.equal(h.peak(), 1);
  assert.deepEqual(h.drains, Array(8).fill(1), 'no empty early drains followed by unpaced late submissions');
});

test('loading preserves whole-root admission behind its existing gate', async () => {
  const h = fixture({ mode: 'loading' });
  await h.run();
  assert.equal(h.peak(), 8);
  assert.deepEqual(h.drains, []);
});

test('retirement between units stops the remaining submissions', async () => {
  let h;
  h = fixture({ active: () => h.submissions.length < 2 });
  await h.run();
  assert.equal(h.submissions.length, 2);
  assert.deepEqual(h.drains, [1, 1]);
  assert.equal(h.root.visible, false);
  assert.equal(h.root.userData.pipelinesPending, true);
});

test('compile rejection preserves its error and closes the shared readiness batch', async () => {
  const h = fixture({ rejectIndex: 2 });
  await assert.rejects(h.run(), (error) => error === h.fault);
  assert.equal(h.root.visible, false);
  assert.equal(h.root.userData.pipelinesPending, true);
  assert.equal(scenePipelineReadinessBatchOpen(), false);
  const next = fixture();
  await next.run();
  assert.deepEqual(next.drains, Array(8).fill(1));
});


test('parallel sliced admission issues all units before pooled readiness drains', async () => {
  const h = fixture({ parallel: true, urgent: false });
  await h.run();
  assert.equal(h.submissions.length, 8);
  assert.equal(h.peak(), 8);
  assert.deepEqual(h.drains, []);
  assert.equal(scenePipelineReadinessBatchOpen(), false);
});
