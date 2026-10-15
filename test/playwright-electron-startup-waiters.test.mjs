import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import {
  applyPlaywrightElectronPatch,
  patchPlaywrightElectronSource,
  PLAYWRIGHT_ELECTRON_PATCH_VERSION,
} from '../scripts/patch-playwright-electron.mjs';

const require = createRequire(import.meta.url);
const installedPackagePath = require.resolve('playwright-core/package.json');
const installedPackage = JSON.parse(readFileSync(installedPackagePath, 'utf8'));
const installedSource = readFileSync(path.join(path.dirname(installedPackagePath), 'lib', 'coreBundle.js'), 'utf8');
const HANDLERS = `        waitForXserverError.catch(() => {});
        chromeMatchPromise.catch(() => {});
        debuggerDisconnectPromise.catch(() => {});
`;
// Exercise the installed package's real launch/waitForLine code. Restoring this one patch
// seam gives the original comparison even after postinstall has repaired the local package.
const originalSource = installedSource.replace(HANDLERS, '');

const FAKE_CHILD_WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const source = workerData;
const waiterStart = source.indexOf('async function waitForLine(progress2, process2, regex) {');
const waiterEnd = source.indexOf('\nvar import_fs29', waiterStart);
const launchStart = source.indexOf('    Electron = class extends SdkObject {');
const launchEnd = source.indexOf('\n    };', launchStart) + '\n    };'.length;
if (waiterStart < 0 || waiterEnd < waiterStart || launchStart < 0 || launchEnd < launchStart) throw new Error('installed Electron source seams missing');
class ManualPromise extends Promise {
  constructor() {
    let fulfill, fail;
    super((resolve, reject) => { fulfill = resolve; fail = reject; });
    this.resolve = fulfill;
    this.reject = fail;
  }
  static get [Symbol.species]() { return Promise; }
}
const child = new EventEmitter();
child.stderr = new EventEmitter();
let killCount = 0;
const context = {
  SdkObject: class {}, RecentLogsCollector: class { log() {} }, ManualPromise,
  readline2: { createInterface: () => new EventEmitter() },
  eventsHelper: {
    addEventListener(emitter, event, listener) { emitter.on(event, listener); return { emitter, event, listener }; },
    removeEventListeners(list) { for (const { emitter, event, listener } of list) emitter.off(event, listener); },
  },
  import_os14: { default: { platform: () => 'win32' } },
  import_fs29: { default: { promises: { mkdtemp: async () => 'fake-artifacts' } } },
  ARTIFACTS_FOLDER3: 'fake-artifacts-', libPath: () => 'fake-loader.js',
  require: () => 'fake-electron.exe', envArrayToObject: () => ({}),
  process: { platform: 'win32', env: {} },
  launchProcess: async () => ({
    launchedProcess: child, gracefullyClose: async () => {},
    kill: () => { killCount++; return new Promise(() => {}); },
  }),
};
const Electron = vm.runInNewContext(source.slice(waiterStart, waiterEnd) + '\nlet Electron;\n' + source.slice(launchStart, launchEnd) + '\nElectron;', context);
let abort;
const aborted = new Promise((_, reject) => { abort = reject; });
const timeout = Object.assign(new Error('Timeout 240000ms exceeded.'), { name: 'TimeoutError' });
const progress = {
  metadata: { log: [] }, log() {},
  race: (value) => Promise.race([...(Array.isArray(value) ? value : [value]), aborted]),
};
const unhandled = [];
// Observation is confined to this disposable fake-child worker. Production installs no
// process-level rejection handler and leaves the normal Node failure policy untouched.
const observe = (error) => unhandled.push({ name: error.name, message: error.message, sameTimeout: error === timeout });
process.on('unhandledRejection', observe);
(async () => {
  const launch = new Electron({}).launch(progress, { args: ['.'], env: [], cwd: 'fake-root' });
  const rejected = launch.catch((error) => error);
  setImmediate(() => abort(timeout));
  const caught = await rejected;
  await new Promise((resolve) => setImmediate(resolve));
  process.off('unhandledRejection', observe);
  parentPort.postMessage({ caught: { name: caught.name, message: caught.message, sameTimeout: caught === timeout }, killCount, unhandled });
})().catch((error) => { throw error; });
`;

async function fakeLaunchTimeout(source) {
  const worker = new Worker(FAKE_CHILD_WORKER, { eval: true, workerData: source });
  try {
    return await new Promise((resolve, reject) => {
      let reported = false;
      worker.once('message', (result) => { reported = true; resolve(result); });
      worker.once('error', reject);
      worker.once('exit', (code) => { if (!reported) reject(new Error(`fake launch worker exited ${code} without a result`)); });
    });
  } finally {
    await worker.terminate();
  }
}

test('Electron timeout retains its rejection and exact-child kill without unhandled sibling waiters', async () => {
  assert.equal(installedPackage.version, PLAYWRIGHT_ELECTRON_PATCH_VERSION);
  const patched = patchPlaywrightElectronSource(originalSource, installedPackage.version);
  assert.equal(patched.changed, true);
  const original = await fakeLaunchTimeout(originalSource);
  const repaired = await fakeLaunchTimeout(patched.source);
  const expectedTimeout = { name: 'TimeoutError', message: 'Timeout 240000ms exceeded.', sameTimeout: true };
  assert.deepEqual(original.caught, expectedTimeout);
  assert.deepEqual(repaired.caught, expectedTimeout, 'the launch must still fail with its original timeout object');
  assert.equal(original.killCount, 1);
  assert.equal(repaired.killCount, 1, 'the timeout must still terminate its exact child');
  assert.deepEqual(original.unhandled, [expectedTimeout, expectedTimeout, expectedTimeout]);
  assert.deepEqual(repaired.unhandled, []);
});

test('dependency patch accepts exactly the known version and unique original or repaired seam', () => {
  const patched = patchPlaywrightElectronSource(originalSource, PLAYWRIGHT_ELECTRON_PATCH_VERSION);
  assert.deepEqual(patchPlaywrightElectronSource(patched.source, PLAYWRIGHT_ELECTRON_PATCH_VERSION), {
    source: patched.source, changed: false,
  });
  assert.throws(() => patchPlaywrightElectronSource(originalSource, '1.61.2'), /requires playwright-core 1\.61\.1/);
  assert.throws(() => patchPlaywrightElectronSource('changed layout', PLAYWRIGHT_ELECTRON_PATCH_VERSION), /Unknown.*layout/);
  assert.throws(() => patchPlaywrightElectronSource(originalSource + originalSource, PLAYWRIGHT_ELECTRON_PATCH_VERSION), /original=2/);
});

test('postinstall skips omitted development dependency and propagates other resolution errors', () => {
  const messages = [];
  const skipped = applyPlaywrightElectronPatch({
    resolvePackageJson() { throw Object.assign(new Error('not installed'), { code: 'MODULE_NOT_FOUND' }); },
    log: (message) => messages.push(message),
  });
  assert.deepEqual(skipped, { status: 'skipped', changed: false });
  assert.match(messages[0], /development dependency is not installed/);
  assert.throws(() => applyPlaywrightElectronPatch({ resolvePackageJson() { throw new Error('resolver failed'); } }), /resolver failed/);
});

test('postinstall writes only the known bundle and remains idempotent', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'spaceface-playwright-patch-'));
  try {
    const packageJsonPath = path.join(root, 'package.json');
    const bundlePath = path.join(root, 'lib', 'coreBundle.js');
    mkdirSync(path.dirname(bundlePath));
    writeFileSync(packageJsonPath, JSON.stringify({ name: 'playwright-core', version: PLAYWRIGHT_ELECTRON_PATCH_VERSION }));
    writeFileSync(bundlePath, originalSource);
    const options = { resolvePackageJson: () => packageJsonPath, log() {} };
    assert.equal(applyPlaywrightElectronPatch(options).status, 'patched');
    const repaired = readFileSync(bundlePath, 'utf8');
    assert.equal(applyPlaywrightElectronPatch(options).status, 'already-patched');
    assert.equal(readFileSync(bundlePath, 'utf8'), repaired);
    writeFileSync(bundlePath, 'unknown layout');
    assert.throws(() => applyPlaywrightElectronPatch(options), /Unknown.*layout/);
    assert.equal(readFileSync(bundlePath, 'utf8'), 'unknown layout', 'layout rejection must leave the package untouched');
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^spaceface-playwright-patch-/);
    rmSync(root, { recursive: true, force: true });
  }
});
