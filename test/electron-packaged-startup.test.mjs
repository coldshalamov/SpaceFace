#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  inspectPackagedStartup,
  resolvePackagedElectronLayout,
} from '../scripts/lib/electronPackagedStartup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('packaged flight observer ignores transition surfaces hidden with their closed screen', () => {
  const source = readFileSync(path.join(ROOT, 'scripts', 'check-electron-packaged-startup.mjs'), 'utf8');
  assert.match(source, /visibleTransition[\s\S]*getClientRects\(\)\.length > 0/,
    'transition blockers must be rendered, not merely retain an open class in a hidden screen');
  assert.match(source, /failureSnapshot[\s\S]*describe\('#hud'\)[\s\S]*describe\('\.sf-ng-warmup\.open'\)/,
    'a bounded package failure must retain the shipped DOM state needed for one diagnosis');
  assert.match(source, /spaceface\.electronPackageIdentity\.v1[\s\S]*executable[\s\S]*appArchive/,
    'package proof must bind the generated executable and app archive by content identity');
});

test('Windows unpacked package layout is exact and independent of the source entrypoint', () => {
  const existing = new Set([
    path.join(ROOT, 'dist', 'win-unpacked', 'SpaceFace.exe'),
    path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar'),
  ]);
  const layout = resolvePackagedElectronLayout({
    root: ROOT,
    platform: 'win32',
    exists: (candidate) => existing.has(candidate),
  });

  assert.equal(layout.executablePath, path.join(ROOT, 'dist', 'win-unpacked', 'SpaceFace.exe'));
  assert.equal(layout.resourcesPath, path.join(ROOT, 'dist', 'win-unpacked', 'resources'));
  assert.equal(layout.appArchivePath, path.join(layout.resourcesPath, 'app.asar'));
  assert.equal(layout.failures.length, 0);
});

test('packaged startup accepts only exact package identity and bundled route readiness', () => {
  const layout = {
    executablePath: path.join(ROOT, 'dist', 'win-unpacked', 'SpaceFace.exe'),
    resourcesPath: path.join(ROOT, 'dist', 'win-unpacked', 'resources'),
    appArchivePath: path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar'),
    failures: [],
  };
  const profile = path.join(ROOT, 'tmp', 'spaceface-electron-evidence', 'probe-packaged-ABC123');
  const rootUrl = 'http://127.0.0.1:43127/';
  const starting = {
    schema: 'spaceface.electronLaunch.v1',
    status: 'starting',
    isolatedEvidence: true,
    runtime: {
      packaged: true,
      executablePath: layout.executablePath,
      resourcesPath: layout.resourcesPath,
      userDataPath: profile,
      appPath: layout.appArchivePath,
    },
  };
  const assessment = inspectPackagedStartup({
    layout,
    rootUrl,
    userDataDir: profile,
    receipts: [
      starting,
      { status: 'server-ready', isolatedEvidence: true, port: 43127, requestedPort: 0 },
      { status: 'window-ready', port: 43127 },
    ],
    mainIdentity: {
      packaged: true,
      executablePath: layout.executablePath,
      resourcesPath: layout.resourcesPath,
      userDataPath: profile,
      appPath: layout.appArchivePath,
    },
    page: {
      title: 'SpaceFace',
      rootUrl,
      newGameVisibleBeforeLaunch: true,
      defaultRouteReady: true,
      assetFailureVisible: false,
      storageRoundTrip: true,
      hardErrorCount: 0,
      scriptPaths: [`${rootUrl}main.js`],
      userAgent: 'Mozilla/5.0 Electron/43.2.0 SpaceFace/0.1.0',
    },
  });

  assert.equal(assessment.pass, true, assessment.failures.join('; '));
});

test('packaged startup fails closed on source fallback or identity drift', () => {
  const executablePath = path.join(ROOT, 'dist', 'win-unpacked', 'SpaceFace.exe');
  const resourcesPath = path.join(ROOT, 'dist', 'win-unpacked', 'resources');
  const profile = path.join(ROOT, 'tmp', 'spaceface-electron-evidence', 'probe-packaged-ABC123');
  const rootUrl = 'http://127.0.0.1:43127/';
  const assessment = inspectPackagedStartup({
    layout: {
      executablePath,
      resourcesPath,
      appArchivePath: path.join(resourcesPath, 'app.asar'),
      failures: [],
    },
    rootUrl,
    userDataDir: profile,
    receipts: [{
      status: 'starting',
      isolatedEvidence: true,
      runtime: {
        packaged: false,
        executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
        resourcesPath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'resources'),
        userDataPath: profile,
      },
    }, { status: 'server-ready', isolatedEvidence: true, port: 43127, requestedPort: 0 }, { status: 'window-ready' }],
    mainIdentity: {
      packaged: false,
      executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
      resourcesPath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'resources'),
      userDataPath: profile,
      appPath: path.join(ROOT, 'package.json'),
    },
    page: {
      title: 'SpaceFace',
      rootUrl,
      newGameVisibleBeforeLaunch: true,
      defaultRouteReady: true,
      assetFailureVisible: false,
      storageRoundTrip: true,
      hardErrorCount: 0,
      scriptPaths: [`${rootUrl}src/main.js`],
      userAgent: 'Mozilla/5.0 Electron/43.2.0',
    },
  });

  assert.equal(assessment.pass, false);
  assert.match(assessment.failures.join('\n'), /app\.isPackaged|executable|resources|source entrypoint/i);
});
