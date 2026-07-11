#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  evaluateLaunchOutcome,
  formatLaunchOutcome,
  parseLaunchReceipts,
  tailDiagnosticText,
} = require('./lib/electronLaunchProtocol.cjs');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const electronExecutable = resolveElectronExecutable();
const launchRoot = path.join(os.tmpdir(), 'spaceface-launcher');
mkdirSync(launchRoot, { recursive: true });
const launchId = `${Date.now()}-${process.pid}`;
const receiptPath = path.join(launchRoot, `${launchId}.jsonl`);
const logPath = path.join(launchRoot, `${launchId}.log`);

if (!electronExecutable || !existsSync(electronExecutable)) {
  const result = evaluateLaunchOutcome({ electronExists: false });
  console.error(formatLaunchOutcome(result, { logPath }));
  process.exitCode = 1;
} else {
  await launchElectron();
}

async function launchElectron() {
  const logFd = openSync(logPath, 'a');
  let child;
  let spawnError = null;
  let exitCode = null;
  try {
    child = spawn(electronExecutable, ['.'], {
      cwd: ROOT,
      detached: true,
      windowsHide: false,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        SPACEFACE_LAUNCH_RECEIPT: receiptPath,
        SPACEFACE_LAUNCH_LOG: logPath,
      },
    });
  } catch (error) {
    spawnError = error;
  } finally {
    closeSync(logFd);
  }

  if (child) {
    child.once('error', (error) => { spawnError = error; });
    child.once('exit', (code) => { exitCode = code; });
  }

  const deadline = Date.now() + 45_000;
  let result;
  do {
    const parsed = readReceipts();
    result = evaluateLaunchOutcome({
      electronExists: true,
      receipts: parsed.receipts,
      exitCode,
      spawnError,
      childRunning: !!child && exitCode === null && !spawnError,
    });
    if (result.code !== 'waiting') break;
    await delay(100);
  } while (Date.now() < deadline);

  if (!result || result.code === 'waiting') {
    result = evaluateLaunchOutcome({
      electronExists: true,
      receipts: readReceipts().receipts,
      exitCode,
      spawnError,
      timedOut: true,
      childRunning: !!child && exitCode === null && !spawnError,
    });
  }

  child?.unref();
  const message = formatLaunchOutcome(result, { logPath });
  (result.pass ? console.log : console.error)(message);
  if (!result.pass) {
    const diagnosticTail = readDiagnosticTail();
    if (diagnosticTail) console.error(`\nLast Electron output:\n${diagnosticTail}`);
  }
  process.exitCode = result.pass ? 0 : (result.pending ? 2 : 1);
}

function readReceipts() {
  try { return parseLaunchReceipts(readFileSync(receiptPath, 'utf8')); }
  catch { return { receipts: [], malformedLineCount: 0 }; }
}

function readDiagnosticTail() {
  try { return tailDiagnosticText(readFileSync(logPath, 'utf8')); }
  catch { return ''; }
}

function resolveElectronExecutable() {
  try { return require('electron'); }
  catch { return null; }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
