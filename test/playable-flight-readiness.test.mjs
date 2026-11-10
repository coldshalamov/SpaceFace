import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { holdOpeningPresentationUntilPaint } from '../src/render/pipelineReadiness.js';

// Exercise the actual readiness helper without launching its top-level browser runner.
const source = readFileSync(new URL('../scripts/check-game-playable.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function playableStartupSnapshot() {');
const end = source.indexOf('async function exerciseSaveScreen(', start);
assert.ok(start >= 0 && end > start);

function fixture() {
  const state = { mode: 'flight', tick: 20, simTime: 130, timeScale: 1,
    world: {}, render: { admissionRunGeneration: 1, worldSubmittedFrames: 0 } };
  const window = { SF: { state } };
  const { waitForRunningFlight } = new Function('window', `${source.slice(start, end)}
    return { waitForRunningFlight };`)(window);
  const effects = createTimeEffects(state);
  let timer;
  holdOpeningPresentationUntilPaint(state, effects, assert.fail, {
    now: () => 0, visibilityTarget: null, lifecyclePort: null,
    schedule(callback) { timer = callback; return 1; }, cancel() { timer = null; },
  });
  let poll, refuse, timeoutMs;
  const page = {
    async evaluate(callback) { return callback(); },
    waitForFunction(callback, arg, options) {
      timeoutMs = options.timeout;
      return new Promise((resolve, reject) => {
        refuse = reject;
        poll = () => { const ready = callback(arg); if (ready) resolve(true); return ready; };
      });
    },
  };
  return { state, effects,
    start: () => waitForRunningFlight(page),
    poll: () => poll(),
    refuse: error => refuse(error),
    timeoutMs: () => timeoutMs,
    close() { state.render.cancelOpeningPresentationHold?.(); timer = null; },
  };
}

test('flight mode waits for the real first-picture hold and an advancing simulation', async () => {
  const f = fixture();
  try {
    const pending = f.start();
    await Promise.resolve();
    assert.equal(f.timeoutMs(), 30000);
    assert.equal(f.state.mode, 'flight');
    assert.equal(f.state.timeScale, 0, 'the real first-picture owner deliberately freezes flight');
    assert.equal(f.poll(), false, 'a visible flight descriptor cannot authorize the thrust probe');
    assert.equal(f.state.render.releaseOpeningPresentationHold(), false, 'no world frame has submitted');

    f.state.render.worldSubmittedFrames++;
    assert.equal(f.state.render.releaseOpeningPresentationHold(), true);
    assert.equal(f.state.timeScale, 1);
    assert.equal(f.poll(), false, 'paint alone is not an advancing simulation');
    f.state.tick++;
    assert.equal(f.poll(), false, 'a changed tick without simulation time is insufficient');
    f.state.simTime += 1 / 60;
    assert.equal(f.poll(), true);
    await pending;
  } finally { f.close(); }
});

test('a separate pause remains a failure to resume after the first world paint', async () => {
  const f = fixture();
  try {
    f.effects.set('runtime:pause', { scale: 0 });
    const pending = f.start();
    await Promise.resolve();
    f.state.render.worldSubmittedFrames++;
    f.state.render.releaseOpeningPresentationHold();
    f.state.tick++;
    f.state.simTime += 1 / 60;
    assert.equal(f.poll(), false, 'paint cannot clear a different pause owner');
    f.effects.clear('runtime:pause');
    assert.equal(f.poll(), true);
    await pending;
  } finally { f.close(); }
});

test('a refused first picture retains the timeout and bounded startup diagnostics', async () => {
  const f = fixture();
  try {
    f.state.render.openingSubmissionPreSubmitValidation = {
      ok: false, reason: 'unprepared-opening-program-binding',
      missingProgramBindings: Array.from({ length: 20 }, (_, i) => `${i}:${'x'.repeat(500)}`),
    };
    const pending = f.start();
    await Promise.resolve();
    const failure = Object.assign(new Error('Timeout 30000ms exceeded'), { name: 'TimeoutError' });
    f.refuse(failure);
    await assert.rejects(pending, error => {
      assert.equal(error, failure, 'the original refusal remains the failure');
      const diagnostics = JSON.parse(error.message.split('flight simulation did not resume: ')[1]);
      assert.equal(diagnostics.current.tick, 20);
      assert.equal(diagnostics.current.timeScale, 0);
      assert.equal(diagnostics.current.firstPictureHold, true);
      assert.equal(diagnostics.current.preSubmitReason, 'unprepared-opening-program-binding');
      assert.equal(diagnostics.current.missingProgramBindings.length, 6);
      assert.ok(diagnostics.current.missingProgramBindings.every(value => value.length <= 240));
      return true;
    });
  } finally { f.close(); }
});
