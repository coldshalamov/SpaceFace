import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const callbackStart = rendererSource.indexOf('state.render.prepareOpeningGpuResources = async (options = {}) => {');
const residencyStart = rendererSource.indexOf('const softGpuOpening = !shouldAwaitOpeningGpuCook({', callbackStart);
const residencyEnd = rendererSource.indexOf('const residencyOutcome = result && (', residencyStart);
assert.ok(callbackStart >= 0 && residencyStart > callbackStart && residencyEnd > residencyStart,
  'the production opening GPU callback and residency phase exist');
const residencyBlock = rendererSource.slice(residencyStart, residencyEnd);

function runResidency({ required, softGpuOpening, residency, isActive = () => true }) {
  const timers = [];
  const calls = [];
  const env = {
    options: { required, isActive },
    state: { mode: 'loading', render: { gpu: { supported: true } } },
    renderer: { capabilities: { isWebGL2: true } },
    plan: { residencySubjects: [{ id: 1 }], textureRefs: [], roots: [], textures: [] },
    shouldAwaitOpeningGpuCook({ gpu, renderer: activeRenderer }) {
      assert.equal(gpu.supported, true);
      assert.equal(activeRenderer, this.renderer);
      return !softGpuOpening;
    },
    prepareStartupGpuResidency(_renderer, subjects, options) {
      calls.push({ subjects, options });
      return residency.promise;
    },
    createSlicedYield: () => async () => {},
    yieldToBrowser: async () => {},
    pacedFrameSpend: () => 0,
    PACED_FRAME_BUDGET_MS: 16,
    notePacedFrameSpend() {},
    recordAuthoredAdmissionBlockingSlice() {},
    assertOpeningActive: () => {
      if (!isActive()) throw new Error('opening GPU residency owner became inactive');
    },
    recordOpeningCookStep() {},
    openingStepStarted: 0,
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout() {},
  };
  const execute = new Function('env', `with (env) { return (async () => { ${residencyBlock}\nreturn result; })(); }`);
  return { promise: execute(env), timers, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

for (const softGpuOpening of [true, false]) test(`required admission bypasses the optional ${softGpuOpening ? '750 ms' : '5 second'} budget`, async () => {
  const upload = deferred();
  const run = runResidency({ required: true, softGpuOpening, residency: upload });
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].options.deadlineMs, undefined);
  assert.equal(run.calls[0].options.includeGeometry, true);
  assert.equal(typeof run.calls[0].options.beforeSubmit, 'function');
  assert.deepEqual(run.timers, [], 'required work does not schedule the optional budget timer');

  let settled = false;
  run.promise.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'valid uploads may take longer than the optional budget');
  upload.resolve({ skipped: false, textures: 1 });
  assert.deepEqual(await run.promise, { skipped: false, textures: 1 });
});

test('a genuine GPU upload failure retains its original error', async () => {
  const error = new Error('GL_OUT_OF_MEMORY during opening texture upload');
  const run = runResidency({ required: true, softGpuOpening: false,
    residency: { promise: Promise.reject(error) } });
  await assert.rejects(run.promise, observed => observed === error);
});

test('optional residency retains its 750 ms and 5 second loading budgets', async () => {
  for (const [softGpuOpening, budgetMs] of [[true, 750], [false, 5000]]) {
    const upload = deferred();
    const run = runResidency({ required: false, softGpuOpening, residency: upload });
    assert.equal(run.calls[0].options.deadlineMs, softGpuOpening ? budgetMs : undefined);
    assert.equal(run.timers.length, 1);
    assert.equal(run.timers[0].delay, budgetMs);
    run.timers[0].callback();
    assert.deepEqual(await run.promise, { skipped: true, reason: 'loading-budget', textures: 0 });
  }
});

test('cancellation blocks late residency publication and the callback rejects after upload settles', async () => {
  const upload = deferred();
  let active = true;
  const run = runResidency({ required: true, softGpuOpening: false, residency: upload,
    isActive: () => active });
  active = false;
  assert.throws(() => run.calls[0].options.beforeSubmit(), /owner became inactive/);
  upload.resolve({ skipped: false, textures: 1 });
  await assert.rejects(run.promise, /owner became inactive/);
});
