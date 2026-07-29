#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtime = provisionElectronRuntime({ root: ROOT });
const probeSource = `
const identity = {
  electron: process.versions.electron || null,
  chromium: process.versions.chrome || null,
  node: process.versions.node || null,
  v8: process.versions.v8 || null,
  platform: process.platform,
  arch: process.arch,
  executablePath: process.execPath,
};
process.stdout.write(JSON.stringify(identity));
`;
const result = spawnSync(runtime.runtimePath, ['-e', probeSource], {
  cwd: ROOT,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  windowsHide: true,
});
if (result.error) throw result.error;
assert.equal(result.status, 0,
  `Electron runtime identity probe failed with ${result.status}: ${String(result.stderr || '').trim()}`);

let identity;
try { identity = JSON.parse(String(result.stdout || '').trim()); }
catch (error) {
  throw new Error(`Electron runtime identity probe returned invalid JSON: ${error.message}; stdout=${result.stdout}`);
}
assert.equal(identity.electron, '43.2.0');
assert.match(String(identity.chromium || ''), /^150\./);
assert.match(String(identity.node || ''), /^24\./);
assert.match(String(identity.v8 || ''), /^15\./);
assert.equal(path.resolve(identity.executablePath), path.resolve(runtime.runtimePath));

console.log(JSON.stringify({
  pass: true,
  provisionedNow: runtime.provisioned,
  packageVersion: runtime.packageVersion,
  runtimeVersion: runtime.runtimeVersion,
  ...identity,
}, null, 2));
