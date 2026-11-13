#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';

const require = createRequire(import.meta.url);
const {
  ELECTRON_STARTUP_TIMEOUT_MS,
  electronApplicationEnvironment,
  evaluateLaunchOutcome,
  formatLaunchOutcome,
  parseLaunchReceipts,
  probeSpaceFacePort,
  tailDiagnosticText,
} = require('./lib/electronLaunchProtocol.cjs');
const { resolvePlayerSaveDir } = require('./lib/playerSaveStore.cjs');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Outcomes where the printed sentence alone does not explain what happened — the only codes
// that earn the diagnostic-log tail.
const DIAGNOSTIC_TAIL_CODES = new Set([
  'exited-before-ready',
  'electron-exited',
  'still-starting',
]);
const launchRoot = path.join(os.tmpdir(), 'spaceface-launcher');
mkdirSync(launchRoot, { recursive: true });
const launchId = `${Date.now()}-${process.pid}`;
const receiptPath = path.join(launchRoot, `${launchId}.jsonl`);
const logPath = path.join(launchRoot, `${launchId}.log`);

let electronRuntime = null;
try {
  electronRuntime = provisionElectronRuntime({ root: ROOT });
} catch (error) {
  if (error && error.code === 'electron-package-missing') {
    const result = evaluateLaunchOutcome({ electronExists: false });
    console.error(formatLaunchOutcome(result, { logPath }));
  } else {
    console.error(`[electron-launcher] ${error && error.message ? error.message : error}`);
  }
  process.exitCode = Number.isInteger(error && error.exitCode) ? error.exitCode : 1;
}

if (electronRuntime) await launchElectron();

async function launchElectron() {
  const logFd = openSync(logPath, 'a');
  const env = electronApplicationEnvironment(process.env, {
    SPACEFACE_LAUNCH_RECEIPT: receiptPath,
    SPACEFACE_LAUNCH_LOG: logPath,
    SPACEFACE_PLAYER_STORE_DIR: resolvePlayerSaveDir(process.env),
  });
  let child;
  let spawnError = null;
  let exitCode = null;
  let exitSignal = null;
  try {
    child = spawn(electronRuntime.runtimePath, ['.'], {
      cwd: ROOT,
      detached: true,
      windowsHide: false,
      stdio: ['ignore', logFd, logFd],
      env,
    });
  } catch (error) {
    spawnError = error;
  } finally {
    closeSync(logFd);
  }

  if (child) {
    child.once('error', (error) => { spawnError = error; });
    child.once('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });
  }

  const deadline = Date.now() + ELECTRON_STARTUP_TIMEOUT_MS;
  let result;
  do {
    const parsed = readReceipts();
    result = evaluateLaunchOutcome({
      electronExists: true,
      receipts: parsed.receipts,
      exitCode,
      exitSignal,
      spawnError,
    });
    if (result.code !== 'waiting') break;
    await delay(100);
  } while (Date.now() < deadline);

  if (!result || result.code === 'waiting') {
    result = evaluateLaunchOutcome({
      electronExists: true,
      receipts: readReceipts().receipts,
      exitCode,
      exitSignal,
      spawnError,
      timedOut: true,
      childRunning: !!child && exitCode === null && exitSignal === null && !spawnError,
    });
  }

  child?.unref();

  // Lock contention confirms a first instance, and HTTP can only confirm its listener.
  // The first instance owns focusing the window once its paint and navigation are ready.
  if (result.pass && result.code === 'existing-instance') {
    const healthy = await existingInstanceIsServing(result.port || 41788);
    if (!healthy) {
      console.error('SpaceFace has another launch in progress. Wait for its window to open or close, then try again.');
      process.exitCode = 1;
      return;
    }
  }

  const message = result.code === 'startup-failed' && result.message
    ? `SpaceFace could not start: ${firstLine(result.message)}\nDiagnostic log: ${logPath}`
    : formatLaunchOutcome(result, { logPath });
  (result.pass ? console.log : console.error)(message);
  if (!result.pass) {
    // Codes whose message already names the cause (port conflict, package-invalid, navigation,
    // preload, spawn, missing runtime) need no raw log dump — certainly not a stack trace. Only
    // unexplained exits and timeouts earn the tail, with the frames stripped; the full log
    // keeps everything.
    const diagnosticTail = readDiagnosticTail();
    if (diagnosticTail && DIAGNOSTIC_TAIL_CODES.has(result.code)) {
      console.error(`\nLast Electron output:\n${withoutStackFrames(diagnosticTail)}`);
    }
  }
  process.exitCode = result.pass ? 0 : (result.pending ? 2 : 1);
}

function withoutStackFrames(text) {
  const lines = String(text || '').split(/\r?\n/);
  const cut = lines.findIndex((line) => /^\s+at\s/.test(line));
  return (cut === -1 ? lines.join('\n') : lines.slice(0, cut).join('\n')).trimEnd();
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/)[0].trim();
}

async function existingInstanceIsServing(port) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await probeSpaceFacePort(port)) return true;
    await delay(1500);
  }
  return false;
}

function readReceipts() {
  try { return parseLaunchReceipts(readFileSync(receiptPath, 'utf8')); }
  catch { return { receipts: [], malformedLineCount: 0 }; }
}

function readDiagnosticTail() {
  try { return tailDiagnosticText(readFileSync(logPath, 'utf8')); }
  catch { return ''; }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
