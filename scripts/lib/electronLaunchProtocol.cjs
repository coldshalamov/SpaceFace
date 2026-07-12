const fs = require('fs');
const os = require('os');
const path = require('path');

const PLAYER_ELECTRON_PORT = 41788;
const ELECTRON_ISOLATED_EVIDENCE_MODE = 'isolated-evidence';
const ELECTRON_EVIDENCE_PROFILE_DIR = 'spaceface-electron-evidence';
const EVIDENCE_PROFILE_NAME = /^probe-[a-z0-9][a-z0-9_-]{0,63}-[a-z0-9]{6}$/i;

function electronEvidenceProfileRoot(tmpDir = os.tmpdir()) {
  return path.resolve(tmpDir, ELECTRON_EVIDENCE_PROFILE_DIR);
}

function inspectElectronEvidenceProfilePath(candidate, { tmpDir = os.tmpdir() } = {}) {
  const root = electronEvidenceProfileRoot(tmpDir);
  const failures = [];
  const raw = String(candidate || '').trim();
  if (!raw) failures.push('profile path is missing');
  if (raw && !path.isAbsolute(raw)) failures.push('profile path must be absolute');
  const resolved = raw ? path.resolve(raw) : '';
  const basename = resolved ? path.basename(resolved) : '';
  if (resolved === root) failures.push('profile cannot be the evidence root itself');
  if (resolved && path.dirname(resolved) !== root) failures.push('profile must be a direct child of the evidence root');
  if (basename && !EVIDENCE_PROFILE_NAME.test(basename)) failures.push('profile name is not creator-issued');

  if (resolved && failures.length === 0) {
    try {
      const rootStat = fs.lstatSync(root);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        failures.push('evidence profile root must be a real directory');
      }
      const stat = fs.lstatSync(resolved);
      if (!stat.isDirectory()) failures.push('profile path must be a directory');
      if (stat.isSymbolicLink()) failures.push('profile path cannot be a symlink or junction');
      const realRoot = fs.realpathSync.native(root);
      const realProfile = fs.realpathSync.native(resolved);
      const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
      if (normalize(realRoot) !== normalize(root)) failures.push('evidence profile root cannot redirect elsewhere');
      if (normalize(path.dirname(realProfile)) !== normalize(realRoot)) {
        failures.push('resolved profile must remain a direct evidence-root child');
      }
    } catch (error) {
      failures.push(`profile path must exist as a real directory: ${error.message}`);
    }
  }

  return { pass: failures.length === 0, root, resolved, basename, failures };
}

function isAllowedElectronListenerPort({ isolatedEvidence = false, port } = {}) {
  const value = Number(port);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) return false;
  return isolatedEvidence ? value !== PLAYER_ELECTRON_PORT : value === PLAYER_ELECTRON_PORT;
}

function resolveElectronLaunchConfig(env = process.env) {
  if (!env || env.SPACEFACE_ELECTRON_TEST_MODE !== ELECTRON_ISOLATED_EVIDENCE_MODE) {
    return {
      isolatedEvidence: false,
      port: PLAYER_ELECTRON_PORT,
      userDataDir: null,
      lockNamespace: 'player-default',
    };
  }

  const profile = inspectElectronEvidenceProfilePath(env.SPACEFACE_ELECTRON_TEST_USER_DATA);
  if (!profile.pass) {
    throw new Error(`invalid isolated Electron evidence user-data profile: ${profile.failures.join('; ')}`);
  }

  const rawPort = String(env.SPACEFACE_ELECTRON_TEST_PORT ?? '0').trim();
  if (!/^\d+$/.test(rawPort)) throw new Error('isolated Electron evidence port must be an integer');
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('isolated Electron evidence port must be within 0..65535');
  }
  if (port === PLAYER_ELECTRON_PORT) {
    throw new Error(`isolated Electron evidence cannot use player port ${PLAYER_ELECTRON_PORT}`);
  }

  const resolvedUserDataDir = profile.resolved;
  return {
    isolatedEvidence: true,
    port,
    userDataDir: resolvedUserDataDir,
    lockNamespace: resolvedUserDataDir,
  };
}

function resolveWebRoot({ packaged, projectRoot, bundleRoot, exists = fs.existsSync } = {}) {
  const project = path.resolve(String(projectRoot || '.'));
  const bundle = path.resolve(String(bundleRoot || path.join(project, 'build', 'web')));
  if (!packaged) return project;
  const entry = path.join(bundle, 'index.html');
  if (!exists(entry)) {
    const error = new Error(`Packaged web bundle is incomplete: missing ${entry}`);
    error.code = 'SPACEFACE_PACKAGED_BUNDLE_MISSING';
    error.entry = entry;
    throw error;
  }
  return bundle;
}

function appendLaunchReceipt(filePath, status, details = {}) {
  if (!filePath) return false;
  try {
    fs.appendFileSync(filePath, `${JSON.stringify({
      schema: 'spaceface.electronLaunch.v1',
      status,
      at: new Date().toISOString(),
      ...details,
    })}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function parseLaunchReceipts(text) {
  const receipts = [];
  let malformedLineCount = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && typeof value.status === 'string') receipts.push(value);
      else malformedLineCount += 1;
    } catch {
      malformedLineCount += 1;
    }
  }
  return { receipts, malformedLineCount };
}

function evaluateLaunchOutcome({
  electronExists = true,
  receipts = [],
  exitCode = null,
  spawnError = null,
  timedOut = false,
  childRunning = false,
} = {}) {
  if (!electronExists) return outcome(false, 'electron-missing');
  if (spawnError) return outcome(false, 'spawn-failed', { message: spawnError.message || String(spawnError) });

  const last = pickTerminalReceipt(receipts);
  if (last) {
    if (last.status === 'window-ready') return outcome(true, 'launched', last);
    if (last.status === 'existing-instance') return outcome(true, 'existing-instance', last);
    if (last.status === 'asset-preload-failed') return outcome(false, 'asset-preload-failed', last);
    if (last.status === 'package-invalid') return outcome(false, 'package-invalid', last);
    if (last.status === 'navigation-failed') return outcome(false, 'navigation-failed', last);
    if (last.status === 'port-conflict') {
      return outcome(false, last.owner === 'spaceface' ? 'spaceface-port-conflict' : 'port-conflict', last);
    }
    return outcome(false, 'startup-failed', last);
  }

  if (timedOut && childRunning) return outcome(false, 'still-starting', { pending: true });
  if (exitCode !== null) {
    return outcome(false, exitCode === 0 ? 'exited-before-ready' : 'electron-exited', { exitCode });
  }
  return outcome(false, 'waiting');
}

function pickTerminalReceipt(receipts) {
  const reversed = [...receipts].reverse();
  for (const status of TERMINAL_PRIORITY) {
    const receipt = reversed.find((entry) => entry && entry.status === status);
    if (receipt) return receipt;
  }
  return null;
}

function isAssetPreloadFailureMessage(message) {
  const text = String(message || '');
  return /authored.*(?:preload|asset).*(?:failed|timed out)|loaded game startup failed.*authored|game assets failed/i.test(text);
}

function tailDiagnosticText(text, maxLines = 24, maxChars = 8000) {
  const lines = String(text || '').trimEnd().split(/\r?\n/);
  let tail = lines.slice(-Math.max(1, maxLines)).join('\n');
  if (tail.length > maxChars) tail = tail.slice(-maxChars);
  return tail;
}

function formatLaunchOutcome(result, { logPath = '' } = {}) {
  const detail = result.message ? ` (${result.message})` : '';
  const log = logPath ? `\nDiagnostic log: ${logPath}` : '';
  switch (result.code) {
    case 'launched':
      return `SpaceFace is ready on the stable desktop save route.${log}`;
    case 'existing-instance':
      return 'SpaceFace is already running. The existing window was focused; it was not closed or terminated.';
    case 'spaceface-port-conflict':
      return `Port ${result.port || 41788} is owned by another SpaceFace test or automation run. No process was closed or terminated. Let that run finish, then retry.${log}`;
    case 'port-conflict':
      return `Port ${result.port || 41788} is owned by another program. No process was closed or terminated. Close that program normally or change its port, then retry.${log}`;
    case 'asset-preload-failed':
      return `SpaceFace opened, but authored game assets failed to preload${detail}. The asset failure is preserved in the diagnostic log.${log}`;
    case 'package-invalid':
      return `The packaged SpaceFace build is incomplete${detail}. Rebuild the desktop package; the app did not fall back to source files.${log}`;
    case 'navigation-failed':
      return `Electron could not load the SpaceFace game route${detail}. Retry once; if it repeats, inspect the diagnostic log.${log}`;
    case 'electron-missing':
      return 'The local Electron runtime is missing. Run npm install in the SpaceFace folder, then retry.';
    case 'spawn-failed':
      return `Windows could not start Electron${detail}.${log}`;
    case 'still-starting':
      return `SpaceFace did not publish window readiness in time. The app was left running and no process was terminated.${log}`;
    case 'exited-before-ready':
      return `Electron exited before publishing window readiness.${log}`;
    case 'electron-exited':
      return `Electron exited with code ${result.exitCode ?? 'unknown'} before the game window was ready.${log}`;
    default:
      return `SpaceFace startup has not produced a conclusive result.${log}`;
  }
}

function outcome(pass, code, details = {}) {
  return { pass, pending: false, ...details, code };
}

const TERMINAL_PRIORITY = Object.freeze([
  'asset-preload-failed',
  'package-invalid',
  'port-conflict',
  'navigation-failed',
  'existing-instance',
  'startup-failed',
  'window-ready',
]);

module.exports = {
  appendLaunchReceipt,
  electronEvidenceProfileRoot,
  evaluateLaunchOutcome,
  formatLaunchOutcome,
  inspectElectronEvidenceProfilePath,
  isAllowedElectronListenerPort,
  isAssetPreloadFailureMessage,
  parseLaunchReceipts,
  resolveElectronLaunchConfig,
  resolveWebRoot,
  tailDiagnosticText,
};
