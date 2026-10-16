import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { openingCompileIssueKey, render as renderSystem } from '../src/render/renderer.js';
import { beginScenePipelineReadinessBatch, compileScenePipelinesForRenderTarget, scenePipelineReadinessBatchOpen } from '../src/render/bloom.js';
import { makeGpuQueuePacer, makeGpuQueueSubmitter } from '../src/render/gpuQueuePace.js';
import { collectUniqueCompileSubjects, compileSubjectsAcrossPresents,
  shouldSliceFlightAdmission, postTaskAtBackgroundPriorityBounded } from '../src/render/compilePresentSlice.js';
import { createPipelineAdmissionTracker, createGpuResidencyAdmissionTracker, observePipelineAdmission } from '../src/render/pipelineReadiness.js';

// Execute the live renderer admission owner without initializing a GPU. The real selector,
// unique-subject collector, tracker, readiness batch and serial queue pacer retain their order.
// Only GPU submission/drain are modeled; this proves queue size, not hardware milliseconds.
import { prepareStartupGpuResidency, prepareStartupGeometryResidency } from '../src/render/startupGpuResidency.js';

const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const begin = source.indexOf('const compileForCurrentTarget = ');
const end = source.indexOf('\n    const recordAuthoredAdmissionBlockingSlice', begin);
assert.ok(begin > 0 && end > begin);
const body = source.slice(begin + 'const compileForCurrentTarget = '.length, end).trim().replace(/;$/, '');

function fixture({ parallel = false, active = () => true, rejectIndex = -1, mode = 'flight', stampDelayMs = 0, urgent = true, stampWait = null, forbidBatchJoin = false } = {}) {
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
  const submissions = [], uploads = [], geometrySubmissions = [], geometryCompiles = [], drains = [], events = [];
  const gl = { getExtension: () => parallel ? {} : null, isContextLost: () => false,
    finish() { events.push('drain'); drains.push(queued); queued = 0; } };
  const renderer = { getContext: () => gl, extensions: { get: () => parallel ? {} : null },
    getRenderTarget: () => target, setRenderTarget: (next) => { target = next; } };
  renderer.initTexture = (texture) => { uploads.push(texture.name); queued++; peak = Math.max(peak, queued); };
  const viewport = new THREE.Vector4(1, 2, 3, 4);
  const scissor = new THREE.Vector4(5, 6, 7, 8);
  Object.assign(renderer, {
    autoClear: true, xr: { enabled: true }, shadowMap: { autoUpdate: true, needsUpdate: true },
    getViewport: out => out.copy(viewport), setViewport: (x, y, z, w) => x && x.isVector4 ? viewport.copy(x) : viewport.set(x, y, z, w),
    getScissor: out => out.copy(scissor), setScissor: (x, y, z, w) => x && x.isVector4 ? scissor.copy(x) : scissor.set(x, y, z, w),
    getScissorTest: () => false, setScissorTest() {},
    render(scene) { events.push('geometry:draw'); geometrySubmissions.push(scene.name); queued++; peak = Math.max(peak, queued); },
  });
  const fault = new Error('compile failed');
  renderer.domElement = { addEventListener() {}, removeEventListener() {} };
  renderer.properties = { get: () => ({ currentProgram: { program: {}, isReady: () => true } }) };
  renderer.compileAsync = () => { throw new Error('owned readiness must handle compilation'); };
  renderer.compile = (subject) => {
    if (subject.name.startsWith('SF_StartupGeometryResidencyBatch:')) {
      events.push('geometry:compile'); geometryCompiles.push(subject.name);
    }
    const materials = new Set();
    subject.traverse((node) => {
      if (!node.isMesh) return;
      if (submissions.length === rejectIndex) throw fault;
      submissions.push(node.name); queued++; peak = Math.max(peak, queued);
      materials.add(node.material);
    });
    return materials;
  };
  const compileSubjectColorAndDepth = async (subject, route, compileOptions) => {
    // Production stamps environment asynchronously before calling WebGLRenderer.compile.
    if (stampWait) await stampWait();
    if (stampDelayMs) await new Promise((resolve) => setTimeout(resolve, stampDelayMs));
    else await Promise.resolve();
    return renderSystem._compilePostRoute.call({ renderer, state }, route, subject, null, root, compileOptions);
  };
  const openBatch = (owner) => {
    const batch = beginScenePipelineReadinessBatch(owner);
    // Fail at the real bloom join edge rather than leave its enclosing serial owner hung.
    if (forbidBatchJoin) batch.join = () => { throw new Error('serial reservation must not await its enclosing batch'); };
    return batch;
  };
  const deps = { state, renderer, compileSubjectColorAndDepth, collectUniqueCompileSubjects,
    openingCompileIssueKey, shouldSliceFlightAdmission, beginScenePipelineReadinessBatch: openBatch,
    compileSubjectsAcrossPresents, makeGpuQueuePacer, makeGpuQueueSubmitter, postTaskAtBackgroundPriorityBounded, observePipelineAdmission,
    admissionPaceYield: async () => {}, pacedFrameSpend: () => 0,
    PACED_FRAME_BUDGET_MS: 4, notePacedFrameSpend: () => {} };
  const compile = new Function(...Object.keys(deps), `return (${body});`).call(
    { _shadowSettingOn: false, _selectPostRoute: () => 'fixture' }, ...Object.values(deps));
  const tracker = createPipelineAdmissionTracker(compile);
  return { root, renderer, submissions, uploads, geometrySubmissions, geometryCompiles, events, drains, fault, peak: () => peak,
    run: () => tracker.compile(root, { urgent, isActive: active }) };
}


function residencyFixture(h) {
  return createGpuResidencyAdmissionTracker((subject) => prepareStartupGpuResidency(h.renderer, subject, {
    yieldToMain: async () => {}, includeGeometry: false,
  }));
}
function textureRoot(index) {
  const texture = new THREE.Texture();
  texture.name = `upload-${index}`;
  return new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
}

for (const count of [1, 8, 32]) {
  test(`${count} actual residency producers share a bounded submission queue`, async () => {
    const h = fixture();
    const tracker = residencyFixture(h);
    const operations = Array.from({ length: count }, (_, index) => tracker.prepare(textureRoot(index)));
    const results = await Promise.all(operations);
    assert.equal(results.every(result => result.textures === 1), true);
    assert.equal(h.uploads.length, count);
    assert.deepEqual(h.drains, Array(count).fill(1), 'each real upload owns submission through drain');
    assert.equal(h.peak(), 1);
    assert.equal(tracker.pendingCount, 0);
    console.log(JSON.stringify({ owner: 'residency', producers: count, peak: h.peak(), drains: h.drains }));
  });
}

test('per-unit compiled admission overlaps eight real texture residency producers', async () => {
  const h = fixture();
  const tracker = residencyFixture(h);
  const compile = h.run();
  const uploads = Array.from({ length: 8 }, (_, index) => tracker.prepare(textureRoot(index)));
  await Promise.all([compile, ...uploads]);
  assert.equal(h.submissions.length, 8);
  assert.equal(h.uploads.length, 8);
  assert.deepEqual(h.drains, Array(16).fill(1));
  assert.equal(h.peak(), 1, 'compile and upload producers share one serial submission owner');
  assert.equal(h.root.visible, false);
  assert.equal(h.root.userData.pipelinesPending, true);
  console.log(JSON.stringify({ owner: 'compile+residency', peak: h.peak(), drains: h.drains }));
});


test('geometry residency shares the same submit/drain reservation and restores state', async () => {
  const h = fixture();
  const entryTarget = { name: 'entry-target' };
  h.renderer.setRenderTarget(entryTarget);
  const tracker = residencyFixture(h);
  const compile = h.run();
  const uploads = Array.from({ length: 8 }, (_, index) => tracker.prepare(textureRoot(index)));
  const geometryRoot = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const geometry = prepareStartupGeometryResidency(h.renderer, geometryRoot, { yieldToMain: async () => {} });
  const results = await Promise.all([compile, geometry, ...uploads]);
  assert.equal(results[1].skipped, false);
  assert.equal(h.geometrySubmissions.length, 1);
  assert.equal(h.peak(), 1);
  assert.deepEqual(h.drains, Array(18).fill(1), 'the private program and proxy draw each drain separately');
  assert.equal(h.geometryCompiles.length, 1);
  const compileAt = h.events.indexOf('geometry:compile'), drawAt = h.events.indexOf('geometry:draw');
  assert.ok(drawAt > compileAt);
  assert.ok(h.events.slice(compileAt + 1, drawAt).includes('drain'), 'private program drains before its draw');
  assert.equal(h.renderer.getRenderTarget(), entryTarget);
  assert.equal(h.renderer.xr.enabled, true);
  assert.equal(h.renderer.shadowMap.autoUpdate, true);
  assert.equal(geometryRoot.geometry.userData.spacefaceGpuResident, true);
});

test('KHR texture residency producers remain overlapping and never force finish', async () => {
  const h = fixture({ parallel: true });
  const tracker = residencyFixture(h);
  await Promise.all(Array.from({ length: 8 }, (_, index) => tracker.prepare(textureRoot(index))));
  assert.equal(h.uploads.length, 8);
  assert.equal(h.peak(), 8);
  assert.deepEqual(h.drains, []);
});

test('residency owner retired while queued cannot upload after its earlier yield check', async () => {
  const h = fixture(); let release, active = true;
  const gate = new Promise(resolve => { release = resolve; });
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const held = submit(() => gate);
  const error = new Error('retired residency owner');
  const residency = prepareStartupGpuResidency(h.renderer, textureRoot(0), {
    yieldToMain: async () => {}, includeGeometry: false,
    beforeSubmit: () => { if (!active) throw error; },
  });
  const rejected = assert.rejects(residency, value => value === error);
  await Promise.resolve(); active = false; release();
  await Promise.all([held, rejected]);
  assert.deepEqual(h.uploads, []);
  await prepareStartupGpuResidency(h.renderer, textureRoot(1), { yieldToMain: async () => {}, includeGeometry: false });
  assert.deepEqual(h.uploads, ['upload-1']);
});

test('a texture deadline that expires in the queue still prevents submission', async () => {
  const h = fixture(); let release, now = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const held = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} })(() => gate);
  const residency = prepareStartupGpuResidency(h.renderer, textureRoot(0), {
    yieldToMain: async () => {}, includeGeometry: false, now: () => now, deadlineMs: 10,
  });
  await Promise.resolve(); now = 10; release(); await held;
  const result = await residency;
  assert.equal(result.partial, true);
  assert.equal(result.textures, 0);
  assert.deepEqual(h.uploads, []);
});

test('failed native texture upload preserves error and allows the next real residency producer', async () => {
  const h = fixture(), error = new Error('texture driver failure');
  const initTexture = h.renderer.initTexture;
  h.renderer.initTexture = () => { throw error; };
  await assert.rejects(prepareStartupGpuResidency(h.renderer, textureRoot(0), {
    yieldToMain: async () => {}, includeGeometry: false,
  }), value => value === error);
  h.renderer.initTexture = initTexture;
  await prepareStartupGpuResidency(h.renderer, textureRoot(1), { yieldToMain: async () => {}, includeGeometry: false });
  assert.deepEqual(h.uploads, ['upload-1']);
});


test('sliced root retirement during environment stamping reaches the actual post-route guard', async () => {
  let active = true, release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const h = fixture({ active: () => active, stampWait: () => { started(); return gate; } });
  const run = h.run();
  const rejected = assert.rejects(run, error => error.name === 'AbortError');
  await entered;
  active = false; release(); await rejected;
  assert.deepEqual(h.submissions, []);
  assert.equal(h.root.visible, false);
  assert.equal(h.root.userData.pipelinesPending, true);
});

test('failed geometry prefix restores target and releases the next real upload', async () => {
  const h = fixture(), error = new Error('geometry driver failure');
  const entryTarget = { name: 'entry-target' };
  h.renderer.setRenderTarget(entryTarget);
  const render = h.renderer.render;
  h.renderer.render = (scene, camera) => { render(scene, camera); throw error; };
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  await assert.rejects(prepareStartupGeometryResidency(h.renderer, root, { yieldToMain: async () => {} }), value => value === error);
  assert.equal(h.renderer.getRenderTarget(), entryTarget);
  assert.equal(h.renderer.xr.enabled, true);
  assert.notEqual(root.geometry.userData.spacefaceGpuResident, true);
  h.renderer.render = render;
  await prepareStartupGpuResidency(h.renderer, textureRoot(1), { yieldToMain: async () => {}, includeGeometry: false });
  assert.deepEqual(h.drains, [1, 1, 1], 'program, failed draw prefix, then next texture each drain');
  assert.deepEqual(h.uploads, ['upload-1']);
});

test('texture and geometry residency report a lost context without stamping uploads', async () => {
  const h = fixture();
  h.renderer.getContext().isContextLost = () => true;
  const options = { yieldToMain: async () => {} };
  const texture = await prepareStartupGpuResidency(h.renderer, textureRoot(1), { ...options, includeGeometry: false });
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const geometry = await prepareStartupGeometryResidency(h.renderer, root, options);
  assert.equal(texture.contextLost, true);
  assert.equal(geometry.contextLost, true);
  assert.deepEqual(h.uploads, []);
  assert.deepEqual(h.geometrySubmissions, []);
  assert.notEqual(root.geometry.userData.spacefaceGpuResident, true);
  h.renderer.getContext().isContextLost = () => false;
  await prepareStartupGpuResidency(h.renderer, textureRoot(2), { ...options, includeGeometry: false });
  assert.deepEqual(h.uploads, ['upload-2']);
});


test('an ordinary serial admission cannot join its enclosing batch if KHR appears during stamping', async () => {
  const h = fixture({ urgent: false, forbidBatchJoin: true, stampWait: async () => {
    h.renderer.extensions.get = () => ({});
    h.renderer.getContext().getExtension = () => ({});
  } });
  await h.run();
  assert.equal(h.submissions.length, 8);
  assert.deepEqual(h.drains, Array(8).fill(1));
  assert.equal(scenePipelineReadinessBatchOpen(), false);
});


test('geometry private-program failure drains its prefix and releases the next texture producer', async () => {
  const h = fixture(), error = new Error('private program driver failure');
  const target = { name: 'presented' }; h.renderer.setRenderTarget(target);
  const compile = h.renderer.compile;
  h.renderer.compile = (scene) => { compile(scene); throw error; };
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  await assert.rejects(prepareStartupGeometryResidency(h.renderer, root, { yieldToMain: async () => {} }), value => value === error);
  assert.deepEqual(h.geometrySubmissions, []);
  assert.equal(h.renderer.getRenderTarget(), target);
  assert.equal(h.renderer.xr.enabled, true);
  assert.notEqual(root.geometry.userData.spacefaceGpuResident, true);
  await prepareStartupGpuResidency(h.renderer, textureRoot(1), { yieldToMain: async () => {}, includeGeometry: false });
  assert.deepEqual(h.drains, [1, 1]);
});

test('geometry retirement during the private-program drain refuses its later draw', async () => {
  const h = fixture(); let active = true, release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const run = prepareStartupGeometryResidency(h.renderer, root, {
    yieldToMain: async () => {}, isActive: () => active,
    paceQueue: async () => { h.renderer.getContext().finish(); entered(); await gate; },
  });
  const rejected = assert.rejects(run, /Residency program was not ready/);
  await started;
  const next = prepareStartupGpuResidency(h.renderer, textureRoot(1), { yieldToMain: async () => {}, includeGeometry: false });
  active = false; release(); await Promise.all([rejected, next]);
  assert.deepEqual(h.geometrySubmissions, []);
  assert.notEqual(root.geometry.userData.spacefaceGpuResident, true);
  assert.deepEqual(h.drains, [1, 1]);
  assert.deepEqual(h.uploads, ['upload-1']);
});

test('geometry private warm-up never joins an enclosing batch when KHR appears inside compile', async () => {
  const h = fixture(), batch = beginScenePipelineReadinessBatch(h.renderer);
  batch.join = () => { throw new Error('private geometry program joined its enclosing batch'); };
  const compile = h.renderer.compile;
  h.renderer.compile = (scene) => {
    const materials = compile(scene);
    h.renderer.extensions.get = () => ({});
    h.renderer.getContext().getExtension = () => ({});
    return materials;
  };
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  try {
    const result = await prepareStartupGeometryResidency(h.renderer, root, { yieldToMain: async () => {} });
    assert.equal(result.skipped, false);
    assert.equal(h.geometryCompiles.length, 1);
    assert.equal(h.geometrySubmissions.length, 1);
    assert.deepEqual(h.drains, [1, 1]);
    assert.equal(h.peak(), 1);
  } finally { batch.close(); }
  assert.equal(scenePipelineReadinessBatchOpen(), false);
});

test('concurrent residency producers recheck a shared texture stamp after waiting', async () => {
  const h = fixture(), root = textureRoot(1);
  const results = await Promise.all(Array.from({ length: 8 }, () => prepareStartupGpuResidency(h.renderer, root, {
    yieldToMain: async () => {}, includeGeometry: false,
  })));
  assert.deepEqual(h.uploads, ['upload-1']);
  assert.equal(results.reduce((sum, result) => sum + result.residentTextures, 0), 7);
  assert.equal(h.drains.reduce((sum, queued) => sum + queued, 0), 1);
  assert.equal(h.peak(), 1);
});

for (const parallel of [false, true]) {
  test(`serial admission drains its own renderer under a foreign ${parallel ? 'KHR' : 'serial'} readiness batch`, async () => {
    const foreign = fixture({ parallel }), h = fixture();
    const batch = beginScenePipelineReadinessBatch(foreign.renderer);
    try {
      await h.run();
      assert.deepEqual(h.drains, Array(8).fill(1), 'drains follow the current renderer, not the global batch creator');
      assert.equal(h.peak(), 1);
      assert.deepEqual(foreign.drains, []);
    } finally { batch.close(); }
    assert.equal(scenePipelineReadinessBatchOpen(), false);
  });
}
