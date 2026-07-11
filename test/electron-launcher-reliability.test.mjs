import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  evaluateLaunchOutcome,
  formatLaunchOutcome,
  isAssetPreloadFailureMessage,
  parseLaunchReceipts,
  tailDiagnosticText,
} = require('../scripts/lib/electronLaunchProtocol.cjs');

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

const batch = readFileSync(join(ROOT, 'SpaceFace-Desktop.bat'), 'utf8');
const main = readFileSync(join(ROOT, 'electron/main.cjs'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
assert.match(batch, /node scripts\\launch-electron\.mjs/);
assert.doesNotMatch(batch, /npm run electron/);
assert.match(main, /existing-instance/);
assert.match(main, /port-conflict/);
assert.match(main, /navigation-failed/);
assert.match(main, /window-ready/);
assert.match(main, /startup-failed/);
assert.match(main, /asset-preload-failed/);
assert.doesNotMatch(batch + main, /taskkill|Stop-Process|process\.kill/i,
  'the player launcher must never terminate ambient or existing game processes');
for (const requiredMainModule of ['scripts/lib/gameServer.cjs', 'scripts/lib/electronLaunchProtocol.cjs']) {
  assert(packageJson.build.files.includes(requiredMainModule),
    `packaged Electron must include main-process module ${requiredMainModule}`);
}

console.log('PASS Electron launcher reliability: explicit outcomes, preserved process ownership, actionable diagnostics');
