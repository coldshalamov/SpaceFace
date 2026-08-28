import assert from 'node:assert/strict';
import test from 'node:test';

import { beginScenePipelineReadinessBatch } from '../src/render/bloom.js';

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

test('the batch restores the render target it opened with, whatever order waiters unwind in', async () => {
  const entry = { name: 'entry-target' };
  const targets = [];
  const renderer = {
    getRenderTarget: () => entry,
    setRenderTarget: (t) => { targets.push(t); },
  };
  const batch = beginScenePipelineReadinessBatch(renderer);
  try {
    // Two joined calls each captured a different "previous" target while suspended; their own
    // restores would otherwise leave the renderer pointed at a compile target.
    batch.join(liveGl, [fakeProgram('a', 0)], () => renderer.setRenderTarget({ name: 'stale-a' }));
    batch.join(liveGl, [fakeProgram('b', 0)], () => renderer.setRenderTarget({ name: 'stale-b' }));
    await batch.drain();
  } finally {
    batch.close();
  }
  assert.equal(targets[targets.length - 1], entry, 'the entry target is re-asserted last');
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
