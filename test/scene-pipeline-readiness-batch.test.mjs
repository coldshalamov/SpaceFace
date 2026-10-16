import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginScenePipelineReadinessBatch,
  compilePipelinesContextSafe,
  programWrapperDead,
  retireScenePipelineReadinessPrograms,
} from '../src/render/bloom.js';

// A stand-in for three's WebGLProgram readiness handle. `isReady()` reports the driver's
// COMPLETION_STATUS_KHR; it becomes true after `ticks` polls.
function fakeProgram(name, ticks) {
  let polled = 0;
  return {
    name,
    program: { name },
    polls: () => polled,
    isReady() { polled += 1; return polled > ticks; },
  };
}

const liveGl = { isContextLost: () => false, isProgram: () => true };

test('a batch settles every waiter only after the whole cohort has linked', async () => {
  const slow = fakeProgram('slow', 3);
  const quick = fakeProgram('quick', 0);
  const settled = [];
  const batch = beginScenePipelineReadinessBatch(null);
  try {
    assert.equal(batch.join(liveGl, [quick], (r) => settled.push(['quick', r])), true);
    assert.equal(batch.join(liveGl, [slow], (r) => settled.push(['slow', r])), true);
    assert.deepEqual(settled, [], 'nobody settles while the cohort is still linking');
    const result = await batch.drain();
    assert.equal(result.contextLost, false);
    assert.equal(result.programs, 0, 'the cohort drained rather than timing out');
  } finally {
    batch.close();
  }
  // The quick program is NOT released early: waiting for the cohort is what makes joining safe.
  assert.deepEqual(settled.map(([who]) => who), ['quick', 'slow']);
  assert.deepEqual(settled.map(([, r]) => r.contextLost), [false, false]);
  assert.equal(slow.polls() > 1, true, 'the slow program was actually polled to completion');
});

test('a compile arriving after the drain begins runs its own wait instead of joining', async () => {
  const batch = beginScenePipelineReadinessBatch(null);
  try {
    await batch.drain();
    assert.equal(
      batch.join(liveGl, [fakeProgram('late', 0)], () => {}),
      false,
      'a closed batch must refuse late joiners so they cannot be settled without linking',
    );
  } finally {
    batch.close();
  }
});

test('close settles anyone still suspended so a throw cannot strand the startup gate', async () => {
  const settled = [];
  const batch = beginScenePipelineReadinessBatch(null);
  batch.join(liveGl, [fakeProgram('never', 1e9)], (r) => settled.push(r));
  assert.deepEqual(settled, []);
  batch.close();
  assert.equal(settled.length, 1, 'close must settle suspended compiles rather than hang them');
});

test('the entry render target survives the waiters unwinding a microtask later', async () => {
  // The real waiter is `finish`, which only RESOLVES the suspended compile. The continuation that
  // restores that call's captured target runs in a later microtask, and each call captured what the
  // one before it had set — so a restore performed inside settleAll would be ordered first and lose.
  const entry = { name: 'entry-target' };
  const compileTarget = { name: 'compile-target' };
  let current = entry;
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (t) => { current = t; },
  };
  const batch = beginScenePipelineReadinessBatch(renderer);
  const issued = [];
  try {
    for (let i = 0; i < 3; i++) {
      // Mirror compileScenePipelinesForRenderTarget: capture, set the compile target, then restore
      // in a finally that runs only once the batch settles this call.
      const captured = renderer.getRenderTarget();
      renderer.setRenderTarget(compileTarget);
      issued.push(new Promise((resolve) => {
        batch.join(liveGl, [fakeProgram(`p${i}`, 0)], resolve);
      }).finally(() => { renderer.setRenderTarget(captured); }));
    }
    await batch.drain();
    await Promise.all(issued);
  } finally {
    batch.close();
    await Promise.allSettled(issued);
    batch.restoreEntryTarget();
  }
  assert.equal(current, entry, 'the renderer must be left exactly where the batch found it');
});

test('nested opens share one cohort and only the outermost close retires it', async () => {
  const outer = beginScenePipelineReadinessBatch(null);
  const inner = beginScenePipelineReadinessBatch(null);
  assert.equal(inner, outer, 'a nested open joins the live batch rather than starting a rival one');
  const settled = [];
  outer.join(liveGl, [fakeProgram('x', 0)], (r) => settled.push(r));
  inner.close();
  assert.deepEqual(settled, [], 'the inner close must not settle the outer cohort');
  await outer.drain();
  outer.close();
  assert.equal(settled.length, 1);
});

function fakeCanvas() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type) { for (const fn of listeners.get(type) || []) fn(); },
  };
}

test('the readiness poll never makes a synchronous isProgram round trip on every beat', async () => {
  // 2026-09-13 launch profile: gl.isProgram() per pending program per poll was ~9 s of main thread
  // while New Game loaded. Readiness is still polled every beat; handle validity is not.
  let isProgramCalls = 0;
  const gl = { isContextLost: () => false, isProgram: () => { isProgramCalls += 1; return true; } };
  const linking = fakeProgram('linking', 5);
  const batch = beginScenePipelineReadinessBatch(null);
  try {
    batch.join(gl, [linking], () => {});
    const result = await batch.drain();
    assert.equal(result.programs, 0, 'the cohort drained rather than timing out');
  } finally {
    batch.close();
  }
  assert.equal(linking.polls() > 5, true, 'COMPLETION_STATUS readiness is still polled to completion');
  assert.equal(isProgramCalls, 0, 'a sub-second link must not issue any synchronous isProgram call');
});

test('long links never issue a synchronous isProgram round trip (#169)', async () => {
  // Each isProgram() waits for the GPU process to drain every queued link: on the quiet VM a single
  // in-flight recheck blocked 0.1-3.4 s behind streamed admission. COMPLETION_STATUS is the only poll.
  let isProgramCalls = 0;
  const gl = { isContextLost: () => false, isProgram: () => { isProgramCalls += 1; return true; } };
  const readyAt = Date.now() + 1400;
  const programs = Array.from({ length: 100 }, (_, i) => ({
    program: { name: `p${i}` },
    isReady: () => Date.now() >= readyAt,
  }));
  const batch = beginScenePipelineReadinessBatch(null);
  try {
    batch.join(gl, programs, () => {});
    const result = await batch.drain();
    assert.equal(result.contextLost, false);
    assert.equal(result.programs, 0, 'the cohort drained rather than timing out');
  } finally {
    batch.close();
  }
  assert.equal(isProgramCalls, 0, `isProgram calls: ${isProgramCalls}`);
});

test('a handle WebGL rejects (COMPLETION_STATUS answers null) settles the cohort as invalidated at once', async () => {
  let isProgramCalls = 0;
  const gl = { isContextLost: () => false, isProgram: () => { isProgramCalls += 1; return false; } };
  const alive = fakeProgram('alive', 1e9);
  // three's WebGLProgram.isReady() caches getProgramParameter's null for a handle the context does not own.
  const orphaned = { name: 'orphaned', program: { name: 'orphaned' }, isReady: () => null };
  const settled = [];
  const batch = beginScenePipelineReadinessBatch(null);
  const started = Date.now();
  let result;
  try {
    batch.join(gl, [alive], (r) => settled.push(r));
    batch.join(gl, [orphaned], (r) => settled.push(r));
    result = await batch.drain();
  } finally {
    batch.close();
  }
  assert.equal(result.contextLost, true);
  assert.deepEqual(settled.map((r) => r.contextLost), [true, true]);
  assert.match(settled[0].reason, /invalidated/);
  assert.equal(Date.now() - started < 500, true, 'seen on the first poll, not after a native recheck delay');
  assert.equal(isProgramCalls, 0);
});

test('a context lost and restored between two polls still settles the cohort as lost', async () => {
  const canvas = fakeCanvas();
  const gl = { canvas, isContextLost: () => false, isProgram: () => true };
  const settled = [];
  const batch = beginScenePipelineReadinessBatch(null);
  let result;
  try {
    batch.join(gl, [fakeProgram('stale-after-restore', 1e9)], (r) => settled.push(r));
    // Lost, and already restored by the next poll: isContextLost() alone would miss it.
    canvas.fire('webglcontextlost');
    result = await batch.drain();
  } finally {
    batch.close();
  }
  assert.equal(result.contextLost, true);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].contextLost, true);
});

test('a program released while it links settles the cohort instead of polling a dead handle', async () => {
  const released = fakeProgram('released', 1e9);
  const settled = [];
  const batch = beginScenePipelineReadinessBatch(null);
  let result;
  try {
    batch.join(liveGl, [released], (r) => settled.push(r));
    released.program = undefined; // what three's WebGLProgram.destroy() does to the handle
    result = await batch.drain();
  } finally {
    batch.close();
  }
  assert.equal(result.contextLost, true);
  assert.equal(settled[0].reason, 'WebGL program invalidated during shader compilation');
  assert.equal(released.polls(), 0, 'a cleared native handle is never queried for readiness');
});

test('loss-time retirement rejects a never-polled cache wrapper on post-restore reenrollment', async () => {
  const canvas = fakeCanvas();
  let nativeValidityQueries = 0;
  const gl = { canvas, isContextLost: () => false,
    isProgram() { nativeValidityQueries += 1; throw new Error('no synchronous validity query'); } };
  let staleQueries = 0;
  const stale = { program: { name: 'pre-loss-native-handle' },
    isReady() { staleQueries += 1; return null; } };
  const renderer = { info: { programs: [stale] } };
  // No readiness helper has seen this GL or wrapper yet. Three still owns the old
  // cache during loss, then replaces that cache before a late admission resumes.
  retireScenePipelineReadinessPrograms(renderer);
  canvas.fire('webglcontextlost');
  const settled = [];
  const oldBatch = beginScenePipelineReadinessBatch(null);
  let oldResult;
  try {
    oldBatch.join(gl, [stale], result => settled.push(result));
    oldResult = await oldBatch.drain();
  } finally { oldBatch.close(); }

  const fresh = fakeProgram('post-restore-native-handle', 0);
  renderer.info.programs = [fresh];
  const freshBatch = beginScenePipelineReadinessBatch(null);
  let freshResult;
  try {
    freshBatch.join(gl, renderer.info.programs, () => {});
    freshResult = await freshBatch.drain();
  } finally { freshBatch.close(); }

  assert.equal(oldResult.contextLost, true);
  assert.deepEqual(settled.map(result => result.contextLost), [true]);
  assert.equal(staleQueries, 0, 'retired native handles must be rejected before isReady can warn');
  assert.equal(programWrapperDead(gl, stale), true, 'the draw guard also rejects the intact retired wrapper');
  assert.equal(freshResult.contextLost, false);
  assert.equal(fresh.polls(), 1, 'new cache wrappers keep the normal readiness contract');
  assert.equal(nativeValidityQueries, 0, 'retirement never polls native isProgram');
});

test('a batch refuses a foreign GL and its standalone fallback cancels the wrong-context wrapper', async () => {
  const glA = { isContextLost: () => false };
  let glBProgramQueries = 0;
  const glB = {
    isContextLost: () => false,
    isProgram: () => { glBProgramQueries += 1; return false; },
  };
  let foreignReadinessQueries = 0;
  const foreign = {
    program: { name: 'owned-by-gl-a' },
    isReady() { foreignReadinessQueries += 1; return false; },
  };
  assert.equal(programWrapperDead(glA, foreign), false, 'remember the wrapper owner without a GL query');

  const batch = beginScenePipelineReadinessBatch(null);
  const batchSettled = [];
  try {
    assert.equal(batch.join(glA, [fakeProgram('gl-a-program', 0)], (r) => batchSettled.push(r)), true);
    assert.equal(batch.join(glB, [foreign], () => {}), false, 'a cohort cannot mix WebGL contexts');

    const renderer = {
      domElement: fakeCanvas(),
      compile: () => new Set([{}]),
      extensions: { get: () => ({}) },
      getContext: () => glB,
      properties: { get: () => ({ currentProgram: foreign }) },
    };
    const fallback = await compilePipelinesContextSafe(renderer, {}, {}, {}, { readinessTimeoutMs: 50 });
    assert.equal(fallback.contextLost, true);
    assert.equal(fallback.reason, 'WebGL program invalidated during shader compilation');
    assert.equal(foreignReadinessQueries, 0, 'a mismatched wrapper is cancelled before isReady()');
    assert.equal(glBProgramQueries, 0, 'context ownership is decided from provenance, without isProgram()');

    const drained = await batch.drain();
    assert.equal(drained.contextLost, false, 'the rejected foreign join does not poison the original cohort');
    assert.deepEqual(batchSettled.map((r) => r.contextLost), [false]);
  } finally {
    batch.close();
  }
});
