import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import launchProtocol from './electronLaunchProtocol.cjs';

const {
  electronEvidenceProfileRoot,
  inspectElectronEvidenceProfilePath,
  isAllowedElectronListenerPort,
} = launchProtocol;

export const ELECTRON_ISOLATED_EVIDENCE_MODE = 'isolated-evidence';
export const PLAYER_ELECTRON_PORT = 41788;

export function buildIsolatedElectronEnv({
  baseEnv = process.env,
  userDataDir,
  port = 0,
} = {}) {
  if (!path.isAbsolute(String(userDataDir || ''))) {
    throw new Error('isolated Electron evidence requires an absolute user-data directory');
  }
  const profile = inspectElectronEvidenceProfilePath(userDataDir);
  if (!profile.pass) {
    throw new Error(`invalid isolated Electron evidence profile: ${profile.failures.join('; ')}`);
  }
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
    throw new Error('isolated Electron evidence port must be an integer in 0..65535');
  }
  if (parsedPort === PLAYER_ELECTRON_PORT) {
    throw new Error(`isolated Electron evidence cannot use the player port ${PLAYER_ELECTRON_PORT}`);
  }
  return {
    ...baseEnv,
    SPACEFACE_ELECTRON_TEST_MODE: ELECTRON_ISOLATED_EVIDENCE_MODE,
    SPACEFACE_ELECTRON_TEST_PORT: String(parsedPort),
    SPACEFACE_ELECTRON_TEST_USER_DATA: profile.resolved,
  };
}

export function assertIsolatedElectronRootUrl(actualUrl) {
  const url = new URL(actualUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/'
    || url.search !== '' || url.hash !== '' || url.username || url.password) {
    throw new Error(`isolated Electron root must be the clean IPv4 loopback root, got ${url.href}`);
  }
  if (!isAllowedElectronListenerPort({ isolatedEvidence: true, port: Number(url.port) })) {
    throw new Error(`isolated Electron root cannot use player port ${PLAYER_ELECTRON_PORT}, got ${url.port || 'missing'}`);
  }
  return url.href;
}

export function createIsolatedElectronLaunch({
  root,
  taskId = 'electron-evidence',
  timeout = 90_000,
  port = 0,
  baseEnv = process.env,
} = {}) {
  if (!path.isAbsolute(String(root || ''))) {
    throw new Error('isolated Electron launch requires an absolute repository root');
  }
  const safeTaskId = String(taskId || 'electron-evidence').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 64);
  const profileRoot = electronEvidenceProfileRoot(os.tmpdir());
  fs.mkdirSync(profileRoot, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(profileRoot, `probe-${safeTaskId}-`));
  const profile = inspectElectronEvidenceProfilePath(userDataDir);
  if (!profile.pass || path.dirname(profile.resolved) !== profileRoot) {
    throw new Error(`created Electron evidence profile escaped its root: ${profile.failures.join('; ')}`);
  }
  const env = buildIsolatedElectronEnv({ baseEnv, userDataDir, port });
  let cleaned = false;

  return {
    options: { args: ['.'], cwd: root, timeout, env },
    mode: ELECTRON_ISOLATED_EVIDENCE_MODE,
    requestedPort: port,
    userDataDir,
    cleanup({ runtimeClosed = false } = {}) {
      if (cleaned) return true;
      if (runtimeClosed !== true) {
        throw new Error('isolated Electron profile cleanup requires owned runtime shutdown proof');
      }
      const current = inspectElectronEvidenceProfilePath(userDataDir);
      if (!current.pass || path.dirname(current.resolved) !== profileRoot) {
        throw new Error(`refusing to delete an unowned Electron profile: ${current.failures.join('; ')}`);
      }
      fs.rmSync(userDataDir, { recursive: true, force: true });
      cleaned = true;
      return true;
    },
  };
}
