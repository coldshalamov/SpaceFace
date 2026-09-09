import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inspectElectronRuntime,
  isNodeVersionAtLeast,
  provisionElectronRuntime,
} from '../scripts/lib/electronRuntimeProvisioning.mjs';

const require = createRequire(import.meta.url);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  evaluateLaunchOutcome,
  formatLaunchOutcome,
  isAssetPreloadFailureMessage,
  parseLaunchReceipts,
  resolveWebRoot,
  tailDiagnosticText,
} = require('../scripts/lib/electronLaunchProtocol.cjs');

const fakeProject = join(ROOT, 'project-source');
const fakeBundle = join(fakeProject, 'build', 'web');
assert.equal(resolveWebRoot({ packaged: false, projectRoot: fakeProject, bundleRoot: fakeBundle, exists: () => false }), fakeProject,
  'Electron dev must ignore stale/missing build output and serve the source route');
assert.equal(resolveWebRoot({ packaged: true, projectRoot: fakeProject, bundleRoot: fakeBundle, exists: () => true }), fakeBundle,
  'packaged Electron must serve the canonical bundled route');
assert.throws(
  () => resolveWebRoot({ packaged: true, projectRoot: fakeProject, bundleRoot: fakeBundle, exists: () => false }),
  (error) => error.code === 'SPACEFACE_PACKAGED_BUNDLE_MISSING' && /index\.html/.test(error.message),
  'an incomplete package must fail closed instead of serving source files',
);

const ready = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'window-ready', port: 41788 }],
});
assert.equal(ready.pass, true);
assert.equal(ready.code, 'launched');

const existing = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'existing-instance' }],
  exitCode: 0,
});
assert.equal(existing.pass, true, 'a second launch must focus and preserve the existing game');
assert.equal(existing.code, 'existing-instance');
assert.match(formatLaunchOutcome(existing), /already running/i);
assert.match(formatLaunchOutcome(existing), /not.*(closed|terminated|killed)/i);

const automationPort = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'port-conflict', owner: 'spaceface', port: 41788 }],
  exitCode: 1,
});
assert.equal(automationPort.pass, false);
assert.equal(automationPort.code, 'spaceface-port-conflict');
assert.match(formatLaunchOutcome(automationPort), /test|automation/i);
assert.match(formatLaunchOutcome(automationPort), /41788/);
assert.match(formatLaunchOutcome(automationPort), /not.*(closed|terminated|killed)/i);

const unrelatedPort = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'port-conflict', owner: 'other', port: 41788 }],
  exitCode: 1,
});
assert.equal(unrelatedPort.code, 'port-conflict');
assert.match(formatLaunchOutcome(unrelatedPort), /another program/i);

const assets = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'asset-preload-failed', message: 'authored preload timed out' }],
});
assert.equal(assets.code, 'asset-preload-failed');
assert.match(formatLaunchOutcome(assets), /asset/i);

const invalidPackage = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'package-invalid', code: 'SPACEFACE_PACKAGED_BUNDLE_MISSING', message: 'missing index.html' }],
  exitCode: 1,
});
assert.equal(invalidPackage.code, 'package-invalid');
assert.match(formatLaunchOutcome(invalidPackage), /incomplete/i);
assert.match(formatLaunchOutcome(invalidPackage), /did not fall back/i);

const navigation = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'navigation-failed', code: -102, message: 'ERR_CONNECTION_REFUSED' }],
});
assert.equal(navigation.code, 'navigation-failed');
assert.match(formatLaunchOutcome(navigation), /ERR_CONNECTION_REFUSED/);

const specificFailureWins = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [
    { status: 'navigation-failed', code: -102, message: 'ERR_CONNECTION_REFUSED' },
    { status: 'startup-failed', message: 'loadURL rejected' },
  ],
  exitCode: 1,
});
assert.equal(specificFailureWins.code, 'navigation-failed',
  'a later generic startup rejection must not hide the concrete navigation failure');

assert.equal(isAssetPreloadFailureMessage('[render] authored part library preload failed Error: timed out'), true);
assert.equal(isAssetPreloadFailureMessage('[SpaceFace] loaded game startup failed Error: authored ship assets not ready'), true);
assert.equal(isAssetPreloadFailureMessage('ordinary renderer warning'), false);

const missing = evaluateLaunchOutcome({ electronExists: false, receipts: [] });
assert.equal(missing.code, 'electron-missing');
assert.match(formatLaunchOutcome(missing), /npm install/i);

const pending = evaluateLaunchOutcome({
  electronExists: true,
  receipts: [{ status: 'server-ready', port: 41788 }],
  timedOut: true,
  childRunning: true,
});
assert.equal(pending.pass, false);
assert.equal(pending.pending, true);
assert.equal(pending.code, 'still-starting');
assert.match(formatLaunchOutcome(pending), /left running/i);

const parsed = parseLaunchReceipts([
  JSON.stringify({ status: 'starting' }),
  'not-json',
  JSON.stringify({ status: 'window-ready', port: 41788 }),
].join('\n'));
assert.equal(parsed.receipts.length, 2);
assert.equal(parsed.malformedLineCount, 1, 'malformed receipt lines remain visible diagnostics');

const tailed = tailDiagnosticText(['old detail', 'middle detail', 'actual final error'].join('\n'), 2, 200);
assert.doesNotMatch(tailed, /old detail/);
assert.match(tailed, /middle detail/);
assert.match(tailed, /actual final error/);

assert.equal(isNodeVersionAtLeast('22.12.0', '22.12.0'), true);
assert.equal(isNodeVersionAtLeast('24.0.0', '22.12.0'), true);
assert.equal(isNodeVersionAtLeast('22.11.9', '22.12.0'), false);

const installedPackage = join(ROOT, 'package.json');
let provisioned = false;
let provisionSpawn = null;
const provisionResult = provisionElectronRuntime({
  root: ROOT,
  nodeVersion: '22.12.0',
  inspect() {
    return {
      ready: provisioned,
      code: provisioned ? 'ready' : 'electron-runtime-missing',
      packageJsonPath: installedPackage,
      packageRoot: ROOT,
      packageVersion: '43.2.0',
      declaredVersion: '43.2.0',
      installScript: installedPackage,
      overrideDistPath: null,
      runtimePath: join(ROOT, 'electron.exe'),
      runtimeRelativePath: 'electron.exe',
      runtimeVersion: provisioned ? '43.2.0' : null,
      failures: provisioned ? [] : ['runtime missing'],
    };
  },
  spawnSyncImpl(executable, args, options) {
    provisionSpawn = { executable, args, options };
    provisioned = true;
    return { status: 0 };
  },
});
assert.equal(provisionResult.provisioned, true);
assert.equal(provisionSpawn.executable, process.execPath);
assert.deepEqual(provisionSpawn.args, [installedPackage]);
assert.equal(provisionSpawn.options.stdio, 'inherit');
assert.throws(
  () => provisionElectronRuntime({
    root: ROOT,
    nodeVersion: '22.12.0',
    inspect: () => ({
      ready: false,
      code: 'electron-runtime-missing',
      packageJsonPath: installedPackage,
      packageVersion: '43.2.0',
      declaredVersion: '43.2.0',
      installScript: installedPackage,
      overrideDistPath: null,
      failures: ['runtime missing'],
    }),
    spawnSyncImpl: () => ({ status: 7 }),
  }),
  (error) => error.code === 'electron-provision-failed' && error.exitCode === 7,
  'the launcher must preserve the explicit Electron installer exit code',
);

let stalePackageInstallerRan = false;
assert.throws(
  () => provisionElectronRuntime({
    root: ROOT,
    nodeVersion: '22.12.0',
    inspect: () => ({
      ready: false,
      code: 'electron-package-version-mismatch',
      packageJsonPath: installedPackage,
      packageVersion: '31.7.7',
      declaredVersion: '43.2.0',
      installScript: installedPackage,
      overrideDistPath: null,
      failures: ['installed package is stale'],
    }),
    spawnSyncImpl: () => {
      stalePackageInstallerRan = true;
      return { status: 0 };
    },
  }),
  (error) => error.code === 'electron-package-version-mismatch' && /npm install/i.test(error.message),
  'a stale Electron npm package must not silently launch or provision the wrong major',
);
assert.equal(stalePackageInstallerRan, false);

const installedRuntime = inspectElectronRuntime({ root: ROOT });
assert.equal(installedRuntime.packageVersion, '43.2.0');
assert.equal(installedRuntime.declaredVersion, '43.2.0');
assert.equal(installedRuntime.packageJsonPath.endsWith(join('electron', 'package.json')), true);

const batch = readFileSync(join(ROOT, 'SpaceFace-Desktop.bat'), 'utf8');
const launcher = readFileSync(join(ROOT, 'scripts/launch-electron.mjs'), 'utf8');
const main = readFileSync(join(ROOT, 'electron/main.cjs'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
assert.match(batch, /node scripts\\launch-electron\.mjs/);
assert.match(batch, /node_modules\\electron\\package\.json/);
assert.match(batch, /installed\.version===project\.devDependencies\.electron/,
  'the Windows launcher must refresh stale Electron package metadata before runtime provisioning');
assert.doesNotMatch(batch, /node_modules\\\.bin\\electron\.cmd/);
assert.doesNotMatch(batch, /npm run electron/);
assert.match(launcher, /provisionElectronRuntime/);
assert.match(launcher, /SPACEFACE_PLAYER_STORE_DIR/,
  'desktop launcher must hand the shared player save directory to Electron');
assert.doesNotMatch(launcher, /require\(['"]electron['"]\)/,
  'executable discovery must not execute Electron index.js and trigger a hidden download');
assert.equal(packageJson.scripts.electron, 'node scripts/launch-electron.mjs');
assert.equal(packageJson.engines.node, '>=22.12.0');
assert.match(main, /existing-instance/);
assert.match(main, /port-conflict/);
assert.match(main, /navigation-failed/);
assert.match(main, /window-ready/);
assert.match(main, /startup-failed/);
assert.match(main, /asset-preload-failed/);
assert.doesNotMatch(batch + main, /taskkill|Stop-Process|process\.kill/i,
  'the player launcher must never terminate ambient or existing game processes');
for (const requiredMainModule of [
  'scripts/lib/gameServer.cjs',
  'scripts/lib/electronLaunchProtocol.cjs',
  'scripts/lib/playerSaveStore.cjs',
  'scripts/lib/staticCachePolicy.cjs',
]) {
  assert(packageJson.build.files.includes(requiredMainModule),
    `packaged Electron must include main-process module ${requiredMainModule}`);
}
assert(packageJson.build.files.includes('electron/main.cjs'));
assert(packageJson.build.files.includes('electron/preload.cjs'));
assert.equal(packageJson.build.files.includes('electron/**'), false,
  'packaging must not include development-only Electron utilities');

console.log('PASS Electron launcher reliability: explicit provisioning, preserved process ownership, actionable diagnostics');
