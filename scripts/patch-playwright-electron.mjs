#!/usr/bin/env node
// Repo-owned repair for the existing development-only Playwright 1.61.1 (Apache-2.0),
// outside the retail bundle. Upstream startup waiter ownership:
// https://github.com/microsoft/playwright/blob/v1.61.1/packages/playwright-core/src/server/electron/electron.ts
// Remove once upstream handles all startup sibling rejections; update the exact pin and
// fake-child timeout regression together. Never silently patch a different version/layout.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLAYWRIGHT_ELECTRON_PATCH_VERSION = '1.61.1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL_WAITERS = String.raw`        const nodeMatchPromise = waitForLine(progress2, launchedProcess, /^Debugger listening on (ws:\/\/.*)$/);
        const chromeMatchPromise = waitForLine(progress2, launchedProcess, /^DevTools listening on (ws:\/\/.*)$/);
        const debuggerDisconnectPromise = waitForLine(progress2, launchedProcess, /Waiting for the debugger to disconnect\.\.\./);
        try {
          const nodeMatch = await nodeMatchPromise;`;
// Mark concurrent siblings handled immediately without replacing the original promises the
// launch later awaits, so startup errors and the original timeout still reject the launch.
const PATCHED_WAITERS = ORIGINAL_WAITERS.replace('        try {', `        waitForXserverError.catch(() => {});
        chromeMatchPromise.catch(() => {});
        debuggerDisconnectPromise.catch(() => {});
        try {`);

function requirePatchVersion(version) {
  if (version !== PLAYWRIGHT_ELECTRON_PATCH_VERSION) {
    throw new Error(`Electron startup waiter patch requires playwright-core ${PLAYWRIGHT_ELECTRON_PATCH_VERSION}; found ${version}. Review the upstream fix before changing the pinned dependency.`);
  }
}

export function patchPlaywrightElectronSource(source, version) {
  requirePatchVersion(version);
  const originalCount = source.split(ORIGINAL_WAITERS).length - 1;
  const patchedCount = source.split(PATCHED_WAITERS).length - 1;
  if (originalCount === 0 && patchedCount === 1) return { source, changed: false };
  if (originalCount !== 1 || patchedCount !== 0) {
    throw new Error(`Unknown playwright-core ${version} Electron startup waiter layout (original=${originalCount}, patched=${patchedCount}). Reinstall the pinned dependency and review scripts/patch-playwright-electron.mjs; no file was changed.`);
  }
  return { source: source.replace(ORIGINAL_WAITERS, PATCHED_WAITERS), changed: true };
}

export function applyPlaywrightElectronPatch({
  root = ROOT,
  resolvePackageJson = () => {
    const playwrightPackage = createRequire(path.join(root, 'package.json')).resolve('playwright/package.json');
    return createRequire(playwrightPackage).resolve('playwright-core/package.json');
  },
  log = console.log,
} = {}) {
  let packageJsonPath;
  try {
    packageJsonPath = resolvePackageJson();
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    log('[playwright-electron-patch] skipped: development dependency is not installed');
    return { status: 'skipped', changed: false };
  }
  const packageInfo = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (packageInfo.name !== 'playwright-core') throw new Error(`Unexpected Playwright package: ${packageInfo.name}`);
  requirePatchVersion(packageInfo.version);
  const bundlePath = path.join(path.dirname(packageJsonPath), 'lib', 'coreBundle.js');
  const result = patchPlaywrightElectronSource(readFileSync(bundlePath, 'utf8'), packageInfo.version);
  if (result.changed) writeFileSync(bundlePath, result.source, 'utf8');
  const status = result.changed ? 'patched' : 'already-patched';
  log(`[playwright-electron-patch] ${status}: playwright-core ${packageInfo.version}`);
  return { status, changed: result.changed, bundlePath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    applyPlaywrightElectronPatch();
  } catch (error) {
    console.error(`[playwright-electron-patch] ${error?.message || error}`);
    process.exitCode = 1;
  }
}
