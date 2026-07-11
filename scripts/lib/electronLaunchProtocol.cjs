const fs = require('fs');

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
  'port-conflict',
  'navigation-failed',
  'existing-instance',
  'startup-failed',
  'window-ready',
]);

module.exports = {
  appendLaunchReceipt,
  evaluateLaunchOutcome,
  formatLaunchOutcome,
  isAssetPreloadFailureMessage,
  parseLaunchReceipts,
  tailDiagnosticText,
};
