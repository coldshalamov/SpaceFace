import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { captureFlightPicturePair, observeGraphicsMessages, readFlightPictureSnapshot } from '../scripts/lib/flightPictureDiagnostics.mjs';

function fixture({ missing = false, progress = true, captureError = false } = {}) {
  let time = 0, snapshots = 0, captures = 0;
  const page = { evaluate: async fn => {
    if (fn.name === 'readFlightPictureSnapshot') {
      snapshots++;
      return missing ? { presentCount: 1 } : {
        presentCount: snapshots, firstPlayableFrameAt: 0, gpu: { software: true },
        dynResScale: 0.34, post: { effectiveSceneScale: 0.34 },
      };
    }
    return progress ? 2 : 1;
  } };
  return {
    page, options: {
      now: () => time, sleep: async ms => { time += ms; },
      capture: async () => { captures++; if (captureError) throw new Error('capture failed'); return 'actual.png'; },
      save: async () => 'report.json',
    }, counts: () => ({ snapshots, captures, time }),
  };
}

test('pair takes exactly two reports/screenshots, with two-second renderer-progress interval', async () => {
  const f = fixture();
  const { report } = await captureFlightPicturePair(f.page, f.options);
  assert.deepEqual(f.counts(), { snapshots: 2, captures: 2, time: 2000 });
  assert.equal(report.status, 'scale-unchanged-not-visual-acceptance');
  assert.equal(report.visualAcceptance, false);
});

test('missing post/GPU telemetry remains explicitly incomplete', async () => {
  const f = fixture({ missing: true });
  const { report } = await captureFlightPicturePair(f.page, f.options);
  assert.equal(report.status, 'telemetry-incomplete');
  assert.equal(f.counts().snapshots, 2);
});

test('no renderer progress stops at ten seconds, with no second getReport', async () => {
  const f = fixture({ progress: false });
  const { report } = await captureFlightPicturePair(f.page, f.options);
  assert.equal(report.status, 'observation-timeout');
  assert.equal(f.counts().time, 10000);
  assert.equal(f.counts().snapshots, 1);
  assert.equal(f.counts().captures, 1);
});

test('screenshot failure is saved and does not start more page operations', async () => {
  const f = fixture({ captureError: true });
  const { report } = await captureFlightPicturePair(f.page, f.options);
  assert.equal(report.status, 'observation-failed');
  assert.deepEqual(report.errors, ['capture failed']);
  assert.deepEqual(f.counts(), { snapshots: 1, captures: 1, time: 0 });
});

test('save failure reaches diagnostic-only catch, while original console gate still throws', async () => {
  const source = await readFile(new URL('../scripts/check-47a-live-cold-open.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  try {\n    const diagnostic = await captureFlightPicturePair');
  const end = source.indexOf('\n\n  console.log(`47-A live cold open OK', start);
  assert(start > 0 && end > start);
  const run = new Function('captureFlightPicturePair', 'page', 'graphicsObserver', 'console', 'assert', 'issues',
    `return (async () => { ${source.slice(start, end)} })();`);
  const original = new Error('original console gate');
  let warning = '';
  await assert.rejects(run(async () => { throw new Error('disk full'); }, {}, { snapshot: () => [] },
    { warn: s => { warning = s; }, log() {} },
    { deepEqual() { throw original; } }, { errorIssues: () => ['existing error'] }), e => e === original);
  assert.match(warning, /disk full/);
  assert(source.indexOf('assert.deepEqual(activeAttackers') < start);
});

test('actual snapshot calls getReport once and preserves zero/false telemetry', () => {
  let calls = 0;
  const previous = globalThis.window;
  globalThis.window = { SF: { state: { render: { presentCount: 3, dynResScale: 1,
    softwareRenderer: false, firstPlayableFrameAt: 0, gpu: { software: false } } } },
    __THREE_GAME_DIAGNOSTICS__: { getReport() { calls++; return { post: { effectiveSceneScale: 1,
      bloom: { contentWidth: 1280, contentHeight: 720, contentScale: 1, casSharpenActive: false, grain: 0 } } }; } } };
  try {
    const sample = readFlightPictureSnapshot();
    assert.equal(calls, 1);
    assert.equal(sample.softwareRenderer, false);
    assert.equal(sample.firstPlayableFrameAt, 0);
    assert.equal(sample.post.casSharpenActive, false);
    assert.equal(sample.post.contentWidth, 1280);
    assert.match(sample.presentCountMeaning, /not GPU completion/);
  } finally { globalThis.window = previous; }
});

test('graphics observer bounds retained messages and detaches without acceptance changes', () => {
  let listener, detached;
  const page = { on: (_, fn) => { listener = fn; }, off: (_, fn) => { detached = fn; } };
  const observer = observeGraphicsMessages(page);
  listener({ type: () => 'log', text: () => 'unrelated log' });
  for (let i = 0; i < 30; i++) listener({ type: () => 'warning', text: () => 'WebGL ' + 'x'.repeat(2000) });
  assert.equal(observer.snapshot().length, 24);
  assert.equal(observer.snapshot()[0].text.length, 1600);
  observer.dispose();
  assert.equal(detached, listener);
});

test('a wedged page request obeys remaining wall-clock deadline without another snapshot', async () => {
  let clockReads = 0, calls = 0;
  const { report } = await captureFlightPicturePair({ evaluate() { calls++; return new Promise(() => {}); } }, {
    now: () => clockReads++ === 0 ? 0 : 9999,
    save: async () => 'wedged.json',
  });
  assert.equal(report.status, 'observation-timeout');
  assert.equal(calls, 1);
  assert.equal(report.samples.length, 0);
});

test('missing dynamic scale cannot be classified as unchanged', async () => {
  const f = fixture();
  const evaluate = f.page.evaluate;
  f.page.evaluate = async fn => {
    const value = await evaluate(fn);
    if (fn.name === 'readFlightPictureSnapshot') value.dynResScale = null;
    return value;
  };
  const { report } = await captureFlightPicturePair(f.page, f.options);
  assert.equal(report.status, 'telemetry-incomplete');
  assert.equal(f.counts().snapshots, 2);
});

test('actual screenshot helper never dispatches after delayed mkdir exceeds pair deadline', async () => {
  const { captureStationHandoffScreenshot } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  let releaseDirectory, helperCompletion, screenshotCalls = 0, time = 0;
  const directory = new Promise(resolve => { releaseDirectory = resolve; });
  const page = {
    evaluate: async () => ({ presentCount: 1 }),
    screenshot: async () => { screenshotCalls++; },
  };
  const result = await captureFlightPicturePair(page, {
    now: () => time,
    capture: (actualPage, context, options) => {
      time = 9999;
      helperCompletion = captureStationHandoffScreenshot(actualPage, context, {
        ...options, prepareDirectory: () => directory,
      });
      return helperCompletion;
    },
    save: async () => 'delayed-directory.json',
  });
  assert.equal(result.report.status, 'observation-timeout');
  assert.equal(screenshotCalls, 0);
  releaseDirectory();
  await assert.rejects(helperCompletion, /deadline exceeded/);
  assert.equal(screenshotCalls, 0);
});
