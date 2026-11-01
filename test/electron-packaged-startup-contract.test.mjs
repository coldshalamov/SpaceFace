import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { PNG } from 'pngjs';

import { resolvePackagedStartupReportPath } from '../scripts/lib/electronPackagedStartup.mjs';

test('packaged-startup report override stays inside the repository', () => {
  const root = path.resolve('C:/repo/spaceface');
  assert.equal(
    resolvePackagedStartupReportPath({ root }),
    path.join(root, '.devshots', 'electron-packaged-startup', 'report.json'),
  );
  assert.equal(
    resolvePackagedStartupReportPath({ root, requested: '.devshots/perf/electron/report.json' }),
    path.join(root, '.devshots', 'perf', 'electron', 'report.json'),
  );
  assert.throws(
    () => resolvePackagedStartupReportPath({ root, requested: '../outside.json' }),
    /inside the repository/i,
  );
  assert.throws(
    () => resolvePackagedStartupReportPath({ root, requested: '.devshots/perf/electron/report.txt' }),
    /\.json/i,
  );
});

test('packaged-startup observation rejects stale or missing Electron runtime identity', async () => {
  for (const identity of [
    { versions: { electron: '31.7.7' } },
    { versions: { electron: '43.1.0' } },
    { versions: {} },
    {},
  ]) {
    await assert.rejects(
      observePackagedRuntime(identity, { devDependencies: { electron: '43.2.0' } }),
      /packaged Electron runtime must match the candidate package\.json target/,
      `must reject runtime identity ${JSON.stringify(identity)}`,
    );
  }
});

test('packaged-startup observation rejects missing or non-exact source Electron pins', async () => {
  for (const electron of [undefined, null, '', '^43.2.0', 'latest', 43]) {
    await assert.rejects(
      observePackagedRuntime({ versions: { electron } }, { devDependencies: { electron } }),
      /packaged startup requires an exact Electron version/,
      `must reject source pin ${JSON.stringify(electron)}`,
    );
  }
  await assert.rejects(
    observePackagedRuntime({}, {}),
    /packaged startup requires an exact Electron version/,
  );
});

test('packaged-startup observation follows the source pin rather than a hard-coded version', async () => {
  for (const electron of ['43.2.0', '43.2.1']) {
    const identity = { versions: { electron } };
    const observed = await observePackagedRuntime(identity, { devDependencies: { electron } });
    assert.equal(observed, identity);
  }
});

test('public recovery CLI defaults off and accepts only the explicit packaged-route opt-in', () => {
  const parse = actualScriptFunction('parsePackagedStartupArgs');
  assert.deepEqual(parse([]), { publicRecovery: false, help: false });
  assert.deepEqual(parse(['--public-recovery']), { publicRecovery: true, help: false });
  assert.deepEqual(parse(['--help']), { publicRecovery: false, help: true });
  assert.throws(() => parse(['--public-recovery', '--public-recovery']), /duplicate argument/);
  assert.throws(() => parse(['--context-recovery']), /unknown argument/);
});

test('packaged public recovery receipt requires visible save/load, restored context, and full tail', () => {
  const assess = actualScriptFunction('assessPackagedPublicRecovery', ['assessPackagedMovementWitness']);
  const surface = { ready: true, sfDebugSurfaceAbsent: true, documentVisible: true };
  const movement = {
    inputDispatched: true,
    hud: { visible: true, response: true },
    canvas: { visible: true, minimumDistinctColors: 20, changed: true, changedPixels: 500 },
  };
  const complete = {
    enabled: true,
    save: { toast: 'Saved Quick', quick: { changed: true } },
    load: { toast: 'Loaded Quick', observationWindowMs: 300_000, flightSurface: surface },
    context: {
      extensionAvailable: true, lostEvent: true, restoredEvent: true, lostAfterRestore: false, recoveredToast: 'Graphics recovered.',
      flightSurface: surface,
    },
    movementAfterRestore: movement,
    tail: { durationMs: 120_000, flightSurface: surface, movement },
  };
  assert.deepEqual(assess(complete), { pass: true, failures: [] });

  const restoring = structuredClone(complete);
  restoring.load.toast = 'Restoring Quick';
  restoring.load.loadingObserved = true;
  assert.deepEqual(assess(restoring), { pass: true, failures: [] });
  restoring.load.flightSurface.ready = false;
  assert.match(assess(restoring).failures.join('\n'), /flight HUD\/canvas did not remain available after F9/,
    'the pending receipt alone is not a completed restore');
  restoring.load.flightSurface.ready = true;
  restoring.load.loadingObserved = false;
  assert.match(assess(restoring).failures.join('\n'), /loading transition was not observed/);

  const noDurableSave = structuredClone(complete);
  noDurableSave.save.quick.changed = false;
  assert.match(assess(noDurableSave).failures.join('\n'), /quick-save bytes did not change/);

  const noRestore = structuredClone(complete);
  noRestore.context.restoredEvent = false;
  assert.match(assess(noRestore).failures.join('\n'), /restore event was not observed/);

  const browserEventOnly = structuredClone(complete);
  delete browserEventOnly.context.recoveredToast;
  assert.match(assess(browserEventOnly).failures.join('\n'), /renderer recovery receipt was not observed/);

  const shortLoadWindow = structuredClone(complete);
  shortLoadWindow.load.observationWindowMs = 60_000;
  assert.deepEqual(assess(shortLoadWindow), { pass: true, failures: [] },
    'an actually completed public load passes even when the configured observation cap was shorter');

  const shortTail = structuredClone(complete);
  shortTail.tail.durationMs = 119_999;
  assert.match(assess(shortTail).failures.join('\n'), /shorter than 120 seconds/);

  const missingTailDuration = structuredClone(complete);
  delete missingTailDuration.tail.durationMs;
  assert.match(assess(missingTailDuration).failures.join('\n'), /duration was missing, invalid/);

  const invalidTailDuration = structuredClone(complete);
  invalidTailDuration.tail.durationMs = Number.NaN;
  assert.match(assess(invalidTailDuration).failures.join('\n'), /duration was missing, invalid/);

  const frozenCanvas = structuredClone(complete);
  frozenCanvas.movementAfterRestore.canvas.changed = false;
  frozenCanvas.movementAfterRestore.canvas.changedPixels = 0;
  frozenCanvas.tail.movement.canvas.minimumDistinctColors = 1;
  assert.match(assess(frozenCanvas).failures.join('\n'), /did not visibly change/);
  assert.match(assess(frozenCanvas).failures.join('\n'), /blank or unavailable/);
});

test('canvas witness detects world-pixel motion and rejects a flat canvas', () => {
  const summarize = actualScriptFunction('summarizePackagedCanvasChange', [], { PNG, assert });
  const before = new PNG({ width: 16, height: 16 });
  const after = new PNG({ width: 16, height: 16 });
  for (let pixel = 0; pixel < 16 * 16; pixel += 1) {
    const offset = pixel * 4;
    const value = pixel % 2 ? 72 : 144;
    before.data[offset] = value;
    before.data[offset + 1] = value;
    before.data[offset + 2] = value;
    before.data[offset + 3] = 255;
  }
  after.data.set(before.data);
  for (let pixel = 0; pixel < 64; pixel += 1) {
    const offset = pixel * 4;
    after.data[offset] = 220;
    after.data[offset + 1] = 96;
    after.data[offset + 2] = 48;
  }
  const moved = summarize(PNG.sync.write(before), PNG.sync.write(after));
  assert.equal(moved.changed, true);
  assert.ok(moved.changedPixels >= 32);
  assert.ok(moved.minimumDistinctColors >= 2);

  const flat = new PNG({ width: 16, height: 16 });
  flat.data.fill(0);
  const frozen = summarize(PNG.sync.write(flat), PNG.sync.write(flat));
  assert.equal(frozen.changed, false);
  assert.equal(frozen.minimumDistinctColors, 1);
});

test('packaged world cadence uses valid flight deltas and leaves functional recovery independent', () => {
  const summarize = actualScriptFunction('summarizePackagedWorldCadence');
  const start = {
    observedAtMonotonicMs: 5_000,
    mode: 'flight',
    tick: 100,
    simTime: 30,
    worldSubmittedFrames: 200,
    executedFrames: 220,
  };
  const end = {
    observedAtMonotonicMs: 125_000,
    mode: 'flight',
    tick: 7_300,
    simTime: 150,
    worldSubmittedFrames: 3_200,
    executedFrames: 3_720,
  };
  const measured = summarize(start, end);
  assert.equal(measured.status, 'measured');
  assert.equal(measured.elapsedMs, 120_000);
  assert.deepEqual(measured.deltas, {
    tick: 7_200,
    simTime: 120,
    worldSubmittedFrames: 3_000,
    executedFrames: 3_500,
  });
  assert.equal(measured.worldSubmissionHz, 25);
  assert.equal(measured.simTimePerWallSecond, 1);

  const missing = summarize(null, end);
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.reason, 'runtime-witness-sample-missing');
  const missingCounter = summarize(start, { ...end, worldSubmittedFrames: null });
  assert.equal(missingCounter.status, 'unavailable');
  assert.match(missingCounter.reason, /counter-missing-or-nonfinite/);
  const nonfiniteCounter = summarize(start, { ...end, simTime: Number.NaN });
  assert.equal(nonfiniteCounter.status, 'unavailable');
  assert.match(nonfiniteCounter.reason, /counter-missing-or-nonfinite/);
  const resetCounter = summarize(start, { ...end, tick: 99 });
  assert.equal(resetCounter.status, 'unavailable');
  assert.equal(resetCounter.reason, 'counter-reset:tick');
  const invalidWindow = summarize(start, { ...end, observedAtMonotonicMs: start.observedAtMonotonicMs });
  assert.equal(invalidWindow.status, 'unavailable');
  assert.equal(invalidWindow.reason, 'monotonic-window-invalid');
  const modeChange = summarize(start, { ...end, mode: 'menu' });
  assert.equal(modeChange.status, 'unavailable');
  assert.equal(modeChange.reason, 'flight-mode-not-stable');

  const assess = actualScriptFunction('assessPackagedPublicRecovery', ['assessPackagedMovementWitness']);
  const movement = {
    inputDispatched: true,
    hud: { visible: true, response: true },
    canvas: { visible: true, minimumDistinctColors: 20, changed: true, changedPixels: 500 },
  };
  const recovery = {
    enabled: true,
    save: { toast: 'Saved Quick', quick: { changed: true } },
    load: { toast: 'Loaded Quick', flightSurface: { ready: true, sfDebugSurfaceAbsent: true } },
    context: {
      extensionAvailable: true,
      lostEvent: true,
      restoredEvent: true,
      lostAfterRestore: false,
      recoveredToast: 'Graphics recovered.',
      flightSurface: { ready: true, sfDebugSurfaceAbsent: true },
    },
    movementAfterRestore: movement,
    tail: {
      durationMs: 120_000,
      flightSurface: { ready: true, sfDebugSurfaceAbsent: true, documentVisible: true },
      movement,
      cadence: missing,
    },
  };
  assert.deepEqual(assess(recovery), { pass: true, failures: [] },
    'missing cadence remains unavailable without changing functional recovery acceptance');
});

test('canvas-only capture hides DOM overlays and restores their exact opacity on success or failure', async () => {
  const original = { value: '0.82', priority: '' };
  let current = { ...original };
  const root = {
    style: {
      getPropertyValue: () => current.value,
      getPropertyPriority: () => current.priority,
      setProperty: (_name, value, priority) => { current = { value, priority }; },
      removeProperty: () => { current = { value: '', priority: '' }; },
    },
  };
  const document = { getElementById: (id) => id === 'ui-root' ? root : null };
  const capture = actualScriptFunction('captureCanvasOnly', [], { document });
  const makePage = (shouldFail) => ({
    evaluate: async (callback, argument) => callback(argument),
    locator: (selector) => {
      assert.equal(selector, '#gl-canvas');
      return { screenshot: async () => {
        assert.deepEqual(current, { value: '0', priority: 'important' });
        if (shouldFail) throw new Error('capture failed');
        return Buffer.from('canvas screenshot');
      } };
    },
  });

  assert.deepEqual(await capture(makePage(false), 'unused.png'), Buffer.from('canvas screenshot'));
  assert.deepEqual(current, original);
  await assert.rejects(capture(makePage(true), 'unused.png'), /capture failed/);
  assert.deepEqual(current, original);
});

test('bounded packaged movement input releases when keydown acknowledgement is delayed', async () => {
  const pulse = actualScriptFunction('runBoundedPackagedKeyPulse', [], { setTimeout, clearTimeout });
  let resolveDown;
  let releases = 0;
  const page = {
    keyboard: {
      down: () => new Promise((resolve) => { resolveDown = resolve; }),
      up: async () => { releases += 1; },
    },
    waitForTimeout: async () => {},
  };
  await assert.rejects(pulse(page, 'w', { holdCeilingMs: 20 }), /held-key ceiling/);
  assert.ok(releases >= 1, 'deadline dispatches a key release before keydown resolves');
  resolveDown();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(releases >= 2, 'late keydown acknowledgement triggers a second release');
});

function actualScriptFunction(name, dependencies = [], globals = {}) {
  const source = readFileSync(new URL('../scripts/check-electron-packaged-startup.mjs', import.meta.url), 'utf8');
  const declarationFor = (functionName) => {
    const exportedAsyncStart = source.indexOf(`export async function ${functionName}(`);
    const exportedStart = source.indexOf(`export function ${functionName}(`);
    const asyncStart = source.indexOf(`async function ${functionName}(`);
    const plainStart = source.indexOf(`function ${functionName}(`);
    const start = exportedAsyncStart >= 0 ? exportedAsyncStart
      : exportedStart >= 0 ? exportedStart
        : asyncStart >= 0 ? asyncStart : plainStart;
    assert.ok(start >= 0, `packaged-startup must declare ${functionName}`);
    const end = source.indexOf('\n}\n', start);
    assert.ok(end > start, `packaged-startup ${functionName} declaration must be complete`);
    return source.slice(start, end + 2).replace('export async function ', 'async function ')
      .replace('export function ', 'function ');
  };
  const declarations = [...dependencies, name].map(declarationFor).join('\n');
  const implementation = runInNewContext(`(() => { ${declarations}; return ${name}; })()`, globals);
  return (...args) => {
    const result = implementation(...args);
    return result && typeof result.then === 'function'
      ? Promise.resolve(result)
      : JSON.parse(JSON.stringify(result));
  };
}

async function observePackagedRuntime(identity, packageJson) {
  // Execute the actual observation/assertion boundary, not a duplicate validator.
  // Stub only main-process observation and source package reads; never launch Electron.
  const source = readFileSync(new URL('../scripts/check-electron-packaged-startup.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  mainIdentity = await app.evaluate(');
  const end = source.indexOf('  pageSnapshot = await page.evaluate(', start);
  assert.ok(start >= 0 && end > start, 'packaged runtime observation must precede page proof');
  const root = path.resolve('packaged-startup-contract-fixture');
  return runInNewContext(`(async () => {
    let mainIdentity;
    ${source.slice(start, end)}
    return mainIdentity;
  })()`, {
    assert,
    path,
    ROOT: root,
    app: { evaluate: async () => identity },
    readFileSync(filePath, encoding) {
      assert.equal(filePath, path.join(root, 'package.json'));
      assert.equal(encoding, 'utf8');
      return JSON.stringify(packageJson);
    },
  });
}
