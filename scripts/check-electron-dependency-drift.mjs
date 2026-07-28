#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PQ041_BASE_SHA = 'c8bc4089718c4ddc74a2d937a1cff44e6444c487';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const lockRoot = packageLock.packages && packageLock.packages[''];

const expectedDependencies = Object.freeze({
  '@dimforge/rapier3d-compat': '0.19.3',
  '@floating-ui/dom': '^1.8.0',
  three: '0.184.0',
});
const expectedDevDependencies = Object.freeze({
  '@gltf-transform/core': '^4.4.1',
  '@gltf-transform/extensions': '^4.4.1',
  '@gltf-transform/functions': '^4.4.1',
  electron: '43.2.0',
  'electron-builder': '^24.13.3',
  esbuild: '^0.28.1',
  'jpeg-js': '^0.4.4',
  'ktx2-encoder': '^0.5.3',
  meshoptimizer: '^1.2.0',
  playwright: '^1.61.1',
  pngjs: '^7.0.0',
});

assert.equal(packageLock.lockfileVersion, 3, 'PERF-07 requires the deterministic npm lockfile v3 graph');
assert.deepEqual(packageJson.dependencies, expectedDependencies, 'PERF-07 must not change production dependencies');
assert.deepEqual(packageJson.devDependencies, expectedDevDependencies,
  'PERF-07 may change only the admitted Electron development dependency');
assert.deepEqual(lockRoot?.dependencies, expectedDependencies, 'lockfile root production dependencies must match package.json');
assert.deepEqual(lockRoot?.devDependencies, expectedDevDependencies, 'lockfile root dev dependencies must match package.json');
assert.equal(packageJson.engines?.node, '>=22.12.0');
assert.equal(lockRoot?.engines?.node, '>=22.12.0');

const electronEntries = Object.entries(packageLock.packages || {}).filter(([key, value]) => {
  const normalized = String(key).replace(/\\/g, '/');
  return normalized.endsWith('/electron') && value && value.version;
});
assert.deepEqual(
  electronEntries.map(([key, value]) => ({ key: String(key).replace(/\\/g, '/'), version: value.version })),
  [{ key: 'node_modules/electron', version: '43.2.0' }],
  'the accepted graph must contain one Electron resolution on the supported target line',
);
assert.equal(packageLock.packages['node_modules/electron']?.engines?.node, '>= 22.12.0');
assert.equal(packageLock.packages['node_modules/electron-builder']?.version, '24.13.3');
assert.equal(packageLock.packages['node_modules/playwright']?.version, '1.61.1');
assert.equal(packageLock.packages['node_modules/three']?.version, '0.184.0');
assert.doesNotMatch(JSON.stringify(packageLock), /electron-(?:v)?31|"electron"\s*:\s*"\^?31\.|"version"\s*:\s*"31\.7\.7"/i,
  'the lockfile must not retain the unsupported Electron 31 line');

const packagedFiles = packageJson.build?.files || [];
assert.deepEqual(packagedFiles, [
  'build/web/**',
  'electron/main.cjs',
  'electron/preload.cjs',
  'scripts/lib/gameServer.cjs',
  'scripts/lib/electronLaunchProtocol.cjs',
  'package.json',
], 'the packaged shell must include only production Electron entry points and their shared main-process modules');

console.log(JSON.stringify({
  pass: true,
  baseSha: PQ041_BASE_SHA,
  electron: packageLock.packages['node_modules/electron'].version,
  electronBuilder: packageLock.packages['node_modules/electron-builder'].version,
  hostNode: packageJson.engines.node,
  packagedFiles,
}, null, 2));
