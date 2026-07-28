#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inspectElectronRuntime,
  isNodeVersionAtLeast,
  MINIMUM_ELECTRON_HOST_NODE,
} from './lib/electronRuntimeProvisioning.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const electronMain = read('electron/main.cjs');
const launcher = read('scripts/launch-electron.mjs');
const batch = read('SpaceFace-Desktop.bat');
const workflow = read('.github/workflows/check.yml');

assert.equal(isNodeVersionAtLeast(process.versions.node, MINIMUM_ELECTRON_HOST_NODE), true,
  `Electron 43 tooling requires Node ${MINIMUM_ELECTRON_HOST_NODE} or newer`);
assert.equal(packageJson.engines?.node, '>=22.12.0');
assert.match(workflow, /node-version:\s*['"]22['"]/,
  'CI must run the supported Electron host-Node line');
assert.equal(packageJson.devDependencies?.electron, '43.2.0');
assert.equal(packageJson.devDependencies?.['electron-builder'], '^24.13.3');
assert.deepEqual(packageJson.build?.win, {
  target: 'nsis',
  artifactName: 'SpaceFace-Setup-${version}.${ext}',
});
assert.deepEqual(packageJson.build?.mac, { target: 'dmg' });
assert.deepEqual(packageJson.build?.linux, { target: 'AppImage' });
for (const relative of [
  'electron/main.cjs',
  'electron/preload.cjs',
  'scripts/lib/gameServer.cjs',
  'scripts/lib/electronLaunchProtocol.cjs',
]) {
  assert.equal(existsSync(path.join(ROOT, relative)), true, `packaged Electron file is missing: ${relative}`);
}

assert.match(launcher, /provisionElectronRuntime\(\{ root: ROOT \}\)/,
  'the source launcher must explicitly provision the selected Electron runtime');
assert.doesNotMatch(launcher, /require\(['"]electron['"]\)/,
  'the source launcher must not execute Electron index.js during discovery');
assert.match(batch, /node_modules\\electron\\package\.json/,
  'the Windows launcher must distinguish package installation from deferred runtime provisioning');
assert.doesNotMatch(batch, /node_modules\\\.bin\\electron\.cmd/);

for (const preference of [
  /contextIsolation:\s*true/,
  /nodeIntegration:\s*false/,
  /sandbox:\s*true/,
  /webSecurity:\s*true/,
  /allowRunningInsecureContent:\s*false/,
  /experimentalFeatures:\s*false/,
]) {
  assert.match(electronMain, preference);
}
assert.match(electronMain, /setWindowOpenHandler/);
assert.match(electronMain, /will-navigate/);
assert.match(electronMain, /setPermissionCheckHandler/);
assert.match(electronMain, /setPermissionRequestHandler/);
assert.match(electronMain, /permission !== 'pointerLock'/);
assert.match(electronMain, /webContents !== win\.webContents/);
assert.match(electronMain, /console-message', \(_event, details\)/,
  'Electron 43 console messages must consume the details object');
assert.doesNotMatch(electronMain, /console-message', \(_event, _level, message\)/);

const runtime = inspectElectronRuntime({ root: ROOT });
assert.equal(runtime.packageVersion, '43.2.0', 'installed Electron package metadata must match the lockfile target');

console.log(JSON.stringify({
  pass: true,
  hostNode: process.versions.node,
  electronPackage: runtime.packageVersion,
  runtimeProvisioned: runtime.ready,
  targets: {
    win: packageJson.build.win.target,
    mac: packageJson.build.mac.target,
    linux: packageJson.build.linux.target,
  },
}, null, 2));
