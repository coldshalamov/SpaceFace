import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { openingCompileIssueKey } from '../src/render/runtime/openingAdmissionPlanning.js';
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

test('real batched owner restores staged roots before another pending link issues', async () => {
  const homesBegin = source.indexOf('function captureObjectHome(');
  const homesEnd = source.indexOf('export async function compileGraphNormalSubjects(', homesBegin);
  const homeFns = new Function('isRetiredRigidOpaqueBatch', `${source.slice(homesBegin, homesEnd)}; return { captureObjectHome, restoreObjectHome };`)(() => false);
  const scene = new THREE.Scene(), roots = [0, 1, 2].map(() => new THREE.Group());
  const programs = roots.map(() => ({ program: {}, ready: false, isReady() { return this.ready; } }));
  const materials = roots.map(() => new THREE.MeshStandardMaterial());
  roots.forEach((root, index) => { root.name = `root-${index}`; root.add(new THREE.Mesh(new THREE.BoxGeometry(), materials[index])); scene.add(root); });
  const records = new Map(materials.map(material => [material, {}]));
  let target = 'home'; const seen = [];
  const renderer = { domElement: { addEventListener() {}, removeEventListener() {} },
    properties: { get: material => records.get(material) }, getContext: () => ({ isContextLost: () => false }),
    extensions: { get: () => ({}) }, info: { programs: [] }, getRenderTarget: () => target,
    setRenderTarget: value => { target = value; }, compileAsync() { throw new Error('unexpected fallback'); },
    compile(subject) {
      seen.push({ target, homes: roots.map(root => root.parent === scene), label: state.perfRuntime.tier1.admissionSubject });
      const used = new Set();
      subject.traverse(node => { if (!node.isMesh) return; const index = materials.indexOf(node.material);
        renderer.properties.get(node.material).currentProgram = programs[index]; used.add(node.material); });
      return used;
    } };
  const state = { mode: 'loading', render: {}, perfRuntime: { tier1: { admissionSubject: 'baseline' } } };
  const deps = { state, renderer, THREE, ...homeFns, shouldSliceFlightAdmission, makeGpuQueuePacer,
    admissionSubjectLabel: root => root.name,
    compileSubjectColorAndDepth: (subject, _route, options) => compileScenePipelinesForRenderTarget(renderer, 'target', subject, null, scene, options) };
  const compile = new Function(...Object.keys(deps), `return (${body});`).call(
    { _shadowDepthEnabled: () => false, _selectPostRoute: () => 'fixture' }, ...Object.values(deps));
  const tracker = createPipelineAdmissionTracker(compile, { maxSettlingLinks: 2 });
  const ambient = tracker.compile(roots[1]);
  const first = tracker.compileExplicit(roots[0]);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(seen.length, 1);
  assert.deepEqual(roots.map(root => root.parent === scene), [true, true, true]);
  assert.equal(target, 'home');
  assert.equal(state.perfRuntime.tier1.admissionSubject, 'baseline');
  const second = tracker.compileExplicit(roots[2]);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(seen.length, 2, 'second issue precedes first batch link completion');
  assert.deepEqual(seen[1].homes, [true, true, true]);
  assert.equal(seen[0].label, 'root-0,root-1'); assert.equal(seen[1].label, 'root-2');
  assert.equal(target, 'home');
  programs[2].ready = true;
  await second;
  assert.equal(state.perfRuntime.tier1.admissionSubject, 'baseline', 'early settlement cannot restore an older label');
  programs[0].ready = true; programs[1].ready = true;
  await Promise.all([ambient, first]);
  assert.equal(state.perfRuntime.tier1.admissionSubject, 'baseline', 'late settlement cannot resurrect a prior issue label');
  roots.forEach(root => root.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); }));
});

function fixture({ parallel = false, active = () => true, rejectIndex = -1, mode = 'flight', stampDelayMs = 0, stampGate = null, urgent = true, split = false, pendingLinks = false } = {}) {
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
  let linked = !pendingLinks;
  const program = { program: {}, isReady: () => linked };
  renderer.properties = { get: () => ({ currentProgram: program }) };
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
  const compileSubjectColorAndDepth = async (subject, _route, options) => {
    // Production stamps environment asynchronously before calling WebGLRenderer.compile.
    if (stampGate) await stampGate(subject);
    else if (stampDelayMs) await new Promise((resolve) => setTimeout(resolve, stampDelayMs));
    else await Promise.resolve();
    return compileScenePipelinesForRenderTarget(renderer, null, subject, null, root, options);
  };
  const deps = { state, renderer, compileSubjectColorAndDepth, collectUniqueCompileSubjects,
    openingCompileIssueKey, shouldSliceFlightAdmission, beginScenePipelineReadinessBatch,
    compileSubjectsAcrossPresents, makeGpuQueuePacer, postTaskAtBackgroundPriorityBounded, observePipelineAdmission,
    admissionPaceYield: async () => {}, pacedFrameSpend: () => 0,
    PACED_FRAME_BUDGET_MS: 4, notePacedFrameSpend: () => {} };
  const compile = new Function(...Object.keys(deps), `return (${body});`).call(
    { _shadowSettingOn: false, _shadowDepthEnabled: () => false, _selectPostRoute: () => 'fixture' }, ...Object.values(deps));
  const tracker = createPipelineAdmissionTracker(compile, { maxSettlingLinks: split ? 2 : 1 });
  return { root, tracker, submissions, drains, fault, peak: () => peak, releaseLinks: () => { linked = true; },
    run: () => tracker.compile(root, { urgent, isActive: active }) };
}

test('sliced issue waits for delayed environment stamps before releasing its reservation', { timeout: 10_000 }, async () => {
  const stamps = [];
  const h = fixture({ parallel: true, stampGate: () => new Promise(resolve => stamps.push(resolve)),
    urgent: false, split: true, pendingLinks: true });
  const other = h.root.clone();
  const first = h.tracker.compileExplicit(h.root);
  const second = h.tracker.compileExplicit(other);
  while (stamps.length < 8) await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.submissions.length, 0);
  stamps.slice(0, 7).forEach(resolve => resolve());
  while (h.submissions.length < 7) await new Promise(resolve => setImmediate(resolve));
  assert.equal(stamps.length, 8, 'the next owner cannot stamp while one first-owner issue is pending');
  stamps[7]();
  while (stamps.length < 16) await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.submissions.length, 8, 'all first-owner compiles issued before the next owner');
  stamps.slice(8).forEach(resolve => resolve());
  while (h.submissions.length < 16) await new Promise(resolve => setImmediate(resolve));
  h.releaseLinks();
  await Promise.all([first, second]);
});

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

for (const explicitMiddle of [false, true]) {
  test(`queued deadline links preserve FIFO ahead of flushed ambient links (${explicitMiddle ? 'explicit' : 'urgent'} middle)`, async () => {
    let releaseActive;
    const activeGate = new Promise(resolve => { releaseActive = resolve; });
    const order = [];
    let active = 0, maxActive = 0;
    const tracker = createPipelineAdmissionTracker(async subjects => {
      active++; maxActive = Math.max(maxActive, active);
      const label = subjects[0].name;
      order.push(label);
      try { if (label === 'active') await activeGate; return { ok: true }; }
      finally { active--; }
    }, { deferAutoFlush: () => true });
    const started = tracker.compile({ name: 'active' }, { urgent: true });
    await Promise.resolve();
    const ambient1 = tracker.compile({ name: 'ambient-first' });
    tracker.flushOneAfterPresent();
    const first = tracker.compile({ name: 'urgent-first' }, { urgent: true });
    const ambient2 = tracker.compile({ name: 'ambient-second' });
    tracker.flushOneAfterPresent();
    const middle = explicitMiddle
      ? tracker.compileExplicit({ name: 'deadline-middle' })
      : tracker.compile({ name: 'deadline-middle' }, { urgent: true });
    const last = tracker.compile({ name: 'urgent-last' }, { urgent: true });
    assert.deepEqual(order, ['active'], 'queued work must not preempt the active renderer-target owner');
    releaseActive();
    await Promise.all([started, ambient1, ambient2, first, middle, last]);
    assert.deepEqual(order, ['active', 'urgent-first', 'deadline-middle', 'urgent-last', 'ambient-first', 'ambient-second']);
    assert.equal(maxActive, 1, 'priority changes ordering, never compile concurrency');
  });
}

test('urgent priority does not release untouched ambient first-flight holds', async () => {
  const order = [];
  const tracker = createPipelineAdmissionTracker(async subjects => {
    order.push(subjects[0].name); return { ok: true };
  }, { deferAutoFlush: () => true });
  const ambient = tracker.compile({ name: 'held-ambient' });
  await tracker.compile({ name: 'readable-body' }, { urgent: true });
  assert.deepEqual(order, ['readable-body']);
  assert.equal(tracker.queuedCount, 1);
  tracker.flushOneAfterPresent();
  await ambient;
  assert.deepEqual(order, ['readable-body', 'held-ambient']);
});
