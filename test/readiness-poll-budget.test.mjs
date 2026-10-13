// The standalone shader-readiness poll must not query every pending program in one task.
//
// Each program.isReady() is a driver completion query (getProgramParameter) that can block on the command
// buffer. The poll walked the whole pending set per tick, so a cohort of 40 programs could hold one task for
// 40 queries (221 ms over five long animation frames in the 2026-10-13 loading profile). The poll now keeps a
// cursor and queries at most eight programs, or about 2 ms, per task, then reuses the existing 10 ms timer.
// Every program is still checked, invalid handles and context loss still end the wait, and the deadline
// still resolves it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { compileScenePipelinesForRenderTarget } from '../src/render/bloom.js';

function fakeRenderer({ count, isReady, contextLost = () => false }) {
  const programs = Array.from({ length: count }, (_, index) => ({
    program: { index },
    isReady: () => isReady(index),
  }));
  const materials = new Set(programs.map((program) => ({ program })));
  const byMaterial = new Map([...materials].map((material) => [material, { currentProgram: material.program }]));
  const listeners = new Map();
  return {
    programs,
    renderer: {
      domElement: {
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
      },
      compile: () => materials,
      compileAsync: () => Promise.resolve(),
      properties: { get: (material) => byMaterial.get(material) },
      extensions: { get: (name) => (name === 'KHR_parallel_shader_compile' ? {} : null) },
      getContext: () => ({ isContextLost: contextLost }),
      getRenderTarget: () => null,
      setRenderTarget() {},
      info: { programs: [] },
    },
    listeners,
  };
}

/** Run one poll to completion, recording how many programs were queried in each task. */
async function pollRun(options) {
  const fake = fakeRenderer(options.fake);
  const perTask = [];
  let current = 0;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...rest) => {
    if (ms === 10) { perTask.push(current); current = 0; return realSetTimeout(fn, 0, ...rest); }
    return realSetTimeout(fn, ms, ...rest);
  };
  const countingIsReady = options.fake.isReady;
  options.fake.isReady = (index) => { current += 1; return countingIsReady(index); };
  fake.programs.forEach((program, index) => { program.isReady = () => options.fake.isReady(index); });
  try {
    const result = await compileScenePipelinesForRenderTarget(
      fake.renderer, null, {}, {}, {}, { skipSharedBatch: true, ...(options.compile || {}) },
    );
    perTask.push(current);
    return { result, perTask, queried: perTask.reduce((sum, n) => sum + n, 0), fake };
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
}

test('forty ready programs are all checked, but no single task queries more than eight', async () => {
  const { result, perTask, queried } = await pollRun({ fake: { count: 40, isReady: () => true } });
  assert.equal(result.skipped, false);
  assert.equal(queried, 40, 'every program was queried exactly once');
  assert.ok(Math.max(...perTask) <= 8, `largest task queried ${Math.max(...perTask)}: ${perTask.join(',')}`);
  assert.ok(perTask.length >= 5, 'the work was spread across several tasks');
});

test('a program that becomes ready later is still found: the cursor wraps and re-checks pending ones', async () => {
  const readyAfter = new Map();
  const { queried, perTask } = await pollRun({
    fake: {
      count: 12,
      isReady: (index) => {
        const seen = (readyAfter.get(index) || 0) + 1;
        readyAfter.set(index, seen);
        return index !== 3 || seen >= 3; // program 3 is slow: ready on its third query
      },
    },
  });
  assert.equal(readyAfter.get(3), 3, 'the slow program was re-polled until it reported ready');
  assert.ok(queried >= 14);
  assert.ok(Math.max(...perTask) <= 8);
});

test('an invalid program handle ends the wait as a lost context, as before', async () => {
  const { result } = await pollRun({ fake: { count: 10, isReady: (index) => (index === 6 ? null : true) } });
  assert.equal(result.skipped, true);
  assert.equal(result.contextLost, true);
});

test('a link that never reports ready resolves at the readiness deadline instead of waiting forever', async () => {
  const { result, perTask } = await pollRun({
    fake: { count: 6, isReady: () => false },
    compile: { readinessTimeoutMs: 40 },
  });
  assert.equal(result.skipped, false, 'a timed-out wait still returns a normal admission result');
  assert.ok(perTask.length > 1, 'it polled repeatedly before giving up');
});
