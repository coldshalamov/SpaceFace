#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYTHON, withPythonNoBytecodeEnv } from './lib/pythonProcessEnv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROCESS_ENV = Object.freeze(withPythonNoBytecodeEnv());
const JOBS = Object.freeze([
  ['exporter contract', process.execPath, ['scripts/check-exporter.mjs']],
  ['two-file transaction', process.execPath, ['test/two-file-transaction.test.mjs']],
  ['part provenance', process.execPath, ['test/part-provenance.test.mjs']],
  ['source texture roles', process.execPath, ['test/source-texture-role-validation.test.mjs']],
  ['finalizer texture contract', process.execPath, ['test/finalizer-texture-contract.test.mjs']],
  ['part output containment', process.execPath, ['test/part-output-path-containment.test.mjs']],
  ['strict GLB container/storage', process.execPath, ['test/strict-glb-validation.test.mjs']],
  ['wrapper texture-role mode', PYTHON, ['test/export-texture-role-mode.test.py']],
  ['generic Blender authoring', process.execPath, ['test/generic-blender-authoring-contract.test.mjs']],
  ['engine drive surfaces', process.execPath, ['test/engine-drive-surface-validation.test.mjs']],
  ['Blender fixture evidence contract', process.execPath, ['test/blender-fixture-evidence-contract.test.mjs']],
  ['Python bytecode hygiene', process.execPath, ['test/python-bytecode-hygiene.test.mjs']],
  ['gate wiring', process.execPath, ['test/asset-pipeline-gate-wiring.test.mjs']],
  ['browser evidence metadata', process.execPath, ['test/authored-assets-probe-evidence.test.mjs']],
]);

for (const [label, command, args] of JOBS) {
  console.log(`\n[asset-pipeline] ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: PROCESS_ENV,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`[asset-pipeline] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[asset-pipeline] ${label} failed with exit ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log(`\nPASS asset-pipeline contract: ${JOBS.length} focused checks`);
