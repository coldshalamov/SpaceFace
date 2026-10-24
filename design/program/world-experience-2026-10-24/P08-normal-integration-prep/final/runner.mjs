#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeHundredHandAuthoringAssets } from './lib/materializeHundredHandAuthoringAssets.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// Keep preparation and all source-consuming tests in one CI leaf/check-out.
// check-ci-report splits package && chains across shards; do not move prepare there.
export const HUNDRED_HAND_TEST_FILES = Object.freeze([
  "test/hundred-hand-mile.test.mjs",
  "test/hundred-hand-mile-traffic.test.mjs",
  "test/hundred-hand-mile-command-flow.test.mjs",
  "test/hundred-hand-mile-narrative.test.mjs",
  "test/hundred-hand-mile-custody.test.mjs",
  "test/hundred-hand-mile-presentation-admission.test.mjs",
  "test/hundred-hand-mile-terminal-outcome.test.mjs",
  "test/hundred-hand-mile-current-optional-validation.test.mjs",
  "test/hundred-hand-current-public-entry.test.mjs",
  "test/hundred-hand-current-public-worker.test.mjs",
  "test/hundred-hand-mile-native-world.test.mjs",
  "test/hundred-hand-current-native-contract.test.mjs",
  "test/hundred-hand-current-far-lifecycle.test.mjs",
  "test/hundred-hand-mile-source-certificate.test.mjs",
  "test/hundred-hand-current-public-assets.test.mjs",
  "test/hundred-hand-mile-prerequisite-prompt.test.mjs",
  "test/hundred-hand-authoring-assets.test.mjs",
  "test/materialize-hundred-hand-runtime-asset.test.mjs",
  "test/authoritative-manifest.test.mjs"
]);
export async function runHundredHandGate({
  root = ROOT, prepare = materializeHundredHandAuthoringAssets,
  spawnChild = spawn, signals = process, reportError = error => console.error(error),
} = {}) {
  // Any missing source or mismatched identity throws before a test process exists.
  prepare(root);
  return await new Promise((resolve) => {
    let child;
    try {
      child = spawnChild(process.execPath, ['--test', '--test-concurrency=1', ...HUNDRED_HAND_TEST_FILES],
        { cwd: root, stdio: 'inherit', shell: false, detached: false });
    } catch (error) { reportError(error); resolve(1); return; }
    let finished = false, requestedSignal = null, killTimer = null;
    const signalNames = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const handlers = new Map();
    const killOnExit = () => { if (!finished) child.kill('SIGKILL'); };
    const finish = (code, signal, error) => {
      if (finished) return;
      finished = true;
      if (killTimer) clearTimeout(killTimer);
      for (const name of signalNames) signals.removeListener(name, handlers.get(name));
      signals.removeListener('exit', killOnExit);
      if (error) reportError(error);
      const finalSignal = requestedSignal || signal;
      resolve(error ? 1 : finalSignal ? 128 + (constants.signals[finalSignal] || 1)
        : Number.isInteger(code) && code >= 0 ? code : 1);
    };
    for (const name of signalNames) {
      const handler = () => {
        requestedSignal ||= name;
        child.kill(name);
        // Bounded cancellation cleanup, not a longer test execution budget.
        killTimer ||= setTimeout(() => child.kill('SIGKILL'), 5000);
        killTimer.unref?.();
      };
      handlers.set(name, handler);
      signals.on(name, handler);
    }
    signals.on('exit', killOnExit);
    child.once('error', error => finish(null, null, error));
    child.once('close', (code, signal) => finish(code, signal));
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runHundredHandGate(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
