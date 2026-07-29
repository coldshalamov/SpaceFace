#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  electronEvidenceProfileRoot,
  inspectElectronEvidenceProfilePath,
  isAllowedElectronListenerPort,
  resolveElectronLaunchConfig,
} from '../scripts/lib/electronLaunchProtocol.cjs';
import {
  ELECTRON_ISOLATED_EVIDENCE_MODE,
  buildIsolatedElectronEnv,
  createIsolatedElectronLaunch,
} from '../scripts/lib/electronTestIsolation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

test('normal Electron launch ignores probe variables and preserves player defaults', () => {
  const config = resolveElectronLaunchConfig({
    SPACEFACE_ELECTRON_TEST_PORT: '43001',
    SPACEFACE_ELECTRON_TEST_USER_DATA: 'C:\\Temp\\should-not-apply',
  });

  assert.deepEqual(config, {
    isolatedEvidence: false,
    port: 41788,
    userDataDir: null,
    lockNamespace: 'player-default',
  });
});

test('explicit isolated-evidence mode selects a non-player port, profile, and lock namespace', () => {
  const profileRoot = electronEvidenceProfileRoot();
  mkdirSync(profileRoot, { recursive: true });
  const userDataDir = mkdtempSync(path.join(profileRoot, 'probe-contract-'));
  try {
    const env = buildIsolatedElectronEnv({ baseEnv: {}, userDataDir, port: 0 });
    const config = resolveElectronLaunchConfig(env);

    assert.equal(env.SPACEFACE_ELECTRON_TEST_MODE, ELECTRON_ISOLATED_EVIDENCE_MODE);
    assert.deepEqual(config, {
      isolatedEvidence: true,
      port: 0,
      userDataDir,
      lockNamespace: userDataDir,
    });
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('isolated-evidence mode rejects the player port and missing or relative profiles', () => {
  const mode = { SPACEFACE_ELECTRON_TEST_MODE: ELECTRON_ISOLATED_EVIDENCE_MODE };
  assert.throws(() => resolveElectronLaunchConfig(mode), /user-data/i);
  assert.throws(() => resolveElectronLaunchConfig({
    ...mode,
    SPACEFACE_ELECTRON_TEST_PORT: '0',
    SPACEFACE_ELECTRON_TEST_USER_DATA: 'relative/profile',
  }), /absolute/i);
  const profileRoot = electronEvidenceProfileRoot();
  mkdirSync(profileRoot, { recursive: true });
  const validProfile = mkdtempSync(path.join(profileRoot, 'probe-contract-'));
  try {
    assert.throws(() => resolveElectronLaunchConfig({
      ...mode,
      SPACEFACE_ELECTRON_TEST_PORT: '41788',
      SPACEFACE_ELECTRON_TEST_USER_DATA: validProfile,
    }), /41788|player/i);
  } finally {
    rmSync(validProfile, { recursive: true, force: true });
  }
});

test('evidence profiles are direct generated children of the dedicated temp root only', () => {
  const profileRoot = electronEvidenceProfileRoot();
  mkdirSync(profileRoot, { recursive: true });
  const valid = mkdtempSync(path.join(profileRoot, 'probe-contract-'));
  assert.equal(inspectElectronEvidenceProfilePath(valid).pass, true);

  const invalid = [
    profileRoot,
    path.join(os.tmpdir(), 'probe-contract-ABC123'),
    path.join(profileRoot, 'Default'),
    path.join(profileRoot, 'User Data'),
    path.join(profileRoot, 'probe-nested-ABC123', 'child'),
    path.join(profileRoot, 'probe-contract-ABC123', '..', '..', 'repo-sibling'),
    ROOT,
  ];
  for (const candidate of invalid) {
    assert.equal(inspectElectronEvidenceProfilePath(candidate).pass, false, candidate);
    assert.throws(() => resolveElectronLaunchConfig({
      SPACEFACE_ELECTRON_TEST_MODE: ELECTRON_ISOLATED_EVIDENCE_MODE,
      SPACEFACE_ELECTRON_TEST_PORT: '0',
      SPACEFACE_ELECTRON_TEST_USER_DATA: candidate,
    }), /profile|user-data|evidence root|direct child/i, candidate);
  }
  rmSync(valid, { recursive: true, force: true });
});

test('isolated listeners reject the player port and profile deletion requires shutdown proof', () => {
  assert.equal(isAllowedElectronListenerPort({ isolatedEvidence: false, port: 41788 }), true);
  assert.equal(isAllowedElectronListenerPort({ isolatedEvidence: true, port: 41788 }), false);
  assert.equal(isAllowedElectronListenerPort({ isolatedEvidence: true, port: 43001 }), true);

  const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'contract-cleanup' });
  assert.equal(path.dirname(launch.userDataDir), electronEvidenceProfileRoot());
  assert.equal(existsSync(launch.userDataDir), true);
  assert.throws(() => launch.cleanup(), /shutdown|closed|proof/i);
  assert.equal(existsSync(launch.userDataDir), true, 'failed cleanup authorization must preserve the profile');
  assert.equal(launch.cleanup({ runtimeClosed: true }), true);
  assert.equal(existsSync(launch.userDataDir), false);
});

test('desktop shell applies isolated userData before acquiring its single-instance lock', () => {
  const source = read('electron/main.cjs');
  const setPathAt = source.indexOf("app.setPath('userData'");
  const lockAt = source.indexOf('app.requestSingleInstanceLock(');
  assert.ok(setPathAt >= 0, 'isolated shell must apply a userData profile');
  assert.ok(lockAt > setPathAt, 'userData profile must be applied before the lock namespace is acquired');
  assert.match(source, /server\.address\(\)\.port|server\.address\(\)[\s\S]*\.port/,
    'port 0 must resolve to the actual listener port');
  assert.match(source, /ISOLATED_PORT_RETRY_LIMIT[\s\S]*server\.close/,
    'isolated shell must close and retry a forbidden resolved player port before window creation');
});

test('all release evidence Electron routes use the shared isolation helper', () => {
  const routes = [
    'scripts/check-m5-story-embodied-electron.mjs',
    'scripts/check-professional-travel-public-route-electron.mjs',
    'scripts/check-alpha-live-baseline-electron.mjs',
    'scripts/check-electron-new-game-launch.mjs',
    'scripts/lib/releaseSoakProbe.mjs',
  ];
  for (const route of routes) {
    const source = read(route);
    assert.match(source, /createIsolatedElectronLaunch/, `${route} must use the common isolated launcher`);
    assert.match(source, /assertIsolatedElectronRootUrl/, `${route} must reject the player listener port`);
    assert.match(source, /cleanup\(\{\s*runtimeClosed:/, `${route} must prove owned shutdown before deleting its profile`);
    if (route.includes('m5-story') || route.includes('electron-new-game')) {
      assert.doesNotMatch(source, /\bapp\.close\s*\(/, `${route} must use owned runtime cleanup`);
    }
  }
});
