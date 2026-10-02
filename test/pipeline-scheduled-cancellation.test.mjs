import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('scheduled pipeline cancellations remain consumer rejections without global page-error events', () => {
  // An isolated process observes Node's actual unhandled-rejection turn without the test runner
  // intercepting it first. These are real queued admissions, not a helper-only rejection fixture.
  const source = `
    import assert from 'node:assert/strict';
    import { createPipelineAdmissionTracker } from ${JSON.stringify(new URL('../src/render/pipelineReadiness.js', import.meta.url).href)};
    import { POST_PROCESS_ROUTE, render as renderSystem } from ${JSON.stringify(new URL('../src/render/renderer.js', import.meta.url).href)};
    const unhandled = [];
    process.on('unhandledRejection', (error) => unhandled.push(error));
    const diagnostics = [];
    console.warn = (_message, error) => diagnostics.push(error);
    const turns = async () => {
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
    };
    const rejected = (promise) => promise.then(() => null, (error) => error);
    function resumedTracker(compileBatch) {
      const scheduled = [];
      let held = true;
      const tracker = createPipelineAdmissionTracker(compileBatch, {
        deferAutoFlush: () => held,
        scheduleResume: (callback) => scheduled.push(callback),
        resumeBatchSize: 2,
      });
      return {
        tracker,
        release() {
          tracker.resumeAutoFlush();
          held = false;
          assert.equal(scheduled.length, 1);
          scheduled.shift()();
        },
        releaseImmediately() {
          held = false;
          return tracker.resumeAutoFlush();
        },
      };
    }

    // A queued owner departs before the scheduled batch; a healthy neighbor still compiles.
    const compiled = [];
    const queued = resumedTracker((subjects) => {
      compiled.push(...subjects);
      return 'compiled';
    });
    let active = true;
    const departed = queued.tracker.compile('departed', { isActive: () => active });
    const visible = queued.tracker.compile('visible');
    active = false;
    queued.release();
    assert.equal(await visible, 'compiled');
    await turns();
    const queuedError = await rejected(departed);
    assert.equal(queuedError.name, 'AbortError');
    assert.deepEqual(compiled, ['visible']);
    assert.equal(queued.tracker.pendingCount, 0);

    // Native post-route compilation finishes after its renderer generation retires.
    let resolveCompile;
    let started;
    const compileStarted = new Promise((resolve) => { started = resolve; });
    const renderer = {
      getRenderTarget: () => null,
      setRenderTarget() {},
      compileAsync() {
        started();
        return new Promise((resolve) => { resolveCompile = resolve; });
      },
      info: { programs: [] },
    };
    const owner = Object.assign(Object.create(renderSystem), {
      state: { render: { admissionRunGeneration: 3 } }, renderer, bloom: null, _renderGraph: null,
    });
    const native = resumedTracker(([subject]) => owner._compilePostRoute(
      POST_PROCESS_ROUTE.NATIVE, subject, {}, {},
    ));
    const staleNative = native.tracker.compile({ name: 'native-subject' });
    native.release();
    await compileStarted;
    owner.state.render.admissionRunGeneration += 1;
    resolveCompile('late-native');
    await turns();
    const nativeError = await rejected(staleNative);
    assert.equal(nativeError.name, 'AbortError');
    assert.match(nativeError.message, /post-route compile owner became inactive/);
    assert.equal(native.tracker.pendingCount, 0);
    assert.deepEqual(unhandled.map((error) => error.message), [],
      'queued cancellation and retired native compilation must have no unhandled-rejection turn');

    // Real compile failures still reject with the original error and produce a diagnostic.
    const compileError = new Error('driver compile failed');
    const broken = resumedTracker(() => { throw compileError; });
    const failed = broken.tracker.compile('broken');
    const resumed = broken.releaseImmediately();
    await turns();
    assert.strictEqual(await rejected(failed), compileError);
    assert.strictEqual(await rejected(resumed), compileError,
      'resumeAutoFlush preserves its original rejecting result');
    assert.equal(broken.tracker.pendingCount, 0);

    const afterPresentError = new Error('after-present compile failed');
    const afterPresent = resumedTracker(() => { throw afterPresentError; });
    const afterPresentConsumer = afterPresent.tracker.compile('after-present');
    const flushed = afterPresent.tracker.flushOneAfterPresent();
    await turns();
    assert.strictEqual(await rejected(afterPresentConsumer), afterPresentError);
    assert.strictEqual(await rejected(flushed), afterPresentError,
      'flushOneAfterPresent preserves its original rejecting result');
    assert.deepEqual(diagnostics, [compileError, afterPresentError],
      'each real batch failure is reported once and cancellation is silent');
    assert.deepEqual(unhandled.map((error) => error.message), [],
      'no scheduled completion leaks an unhandled rejection before its owner observes it');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8', timeout: 45000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
