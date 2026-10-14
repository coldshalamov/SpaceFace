// Chromium for the harness: Playwright's bundled build first, then a system Chrome
// (CHROME_PATH, /opt/google/chrome/chrome, google-chrome/chromium on PATH). One-line install of
// the bundled build: `npx playwright install chromium`.
//
// Playwright's default SIGTERM and SIGHUP handlers call gracefullyCloseAll() and do not exit
// Node. A parent-session hangup therefore closes Chrome over CDP (page "close", then
// "disconnected" a few hundred milliseconds later, Chrome exit 0) while the harness keeps
// running. Chrome is already its own session via spawn detached; the handler is what reaches
// it. The harness turns those two handlers off and records the first signal without closing
// Chrome. A second SIGHUP or SIGTERM still exits so the process can be killed.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');

const GUARD = Symbol('playerTruthSessionSignalGuard');

/** How long to wait after a route error before reading close/disconnect/exit. The disconnect event trails the page close by a few milliseconds; snapshotting immediately records only "page closed". */
export const BROWSER_LOSS_SETTLE_MS = 500;

const CHROME_ENV_SIGNALS = new Set(['SIGKILL', 'SIGTERM', 'SIGHUP']);
const CHROME_CRASH_SIGNALS = new Set(['SIGSEGV', 'SIGABRT', 'SIGBUS']);
const CHROME_BASENAME = /^(chrome|chromium|chromium-browser|google-chrome|google-chrome-stable|Google Chrome|msedge|chrome-headless-shell|headless_shell)(\.exe)?$/i;
const CHROME_STDERR_RE = /FATAL|oom|killed|crash|SwiftShader|GL out|aw, snap/i;

export function systemChromeCandidates(env = process.env) {
  const onPath = (bin) => { try { return execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0] || null; } catch { return null; } };
  const windows = process.platform === 'win32' ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
    .filter(Boolean).flatMap(base => [path.join(base, 'Google/Chrome/Application/chrome.exe'),
      path.join(base, 'Microsoft/Edge/Application/msedge.exe')]) : [];
  const list = [env.CHROME_PATH, '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    env.HOME ? path.join(env.HOME, '.local/bin/google-chrome') : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    ...windows, onPath(process.platform === 'win32' ? 'chrome.exe' : 'google-chrome'), onPath('chromium')];
  return [...new Set(list.filter((p) => p && existsSync(p)))];
}

/** Force Playwright not to close Chrome on SIGHUP/SIGTERM. SIGINT still closes and exits. */
export function applyHarnessLaunchOptions(options = {}) {
  return {
    ...options,
    handleSIGINT: options.handleSIGINT !== false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  };
}

/** Restore only this headed Windows test page's window when minimized; never change its size or focus. */
export async function keepHeadedWindowNormal(page, {
  headed = false, platform = process.platform, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const noop = async () => {};
  if (!headed || platform !== 'win32' || page.isClosed()) return noop;
  let session;
  try { session = await page.context().newCDPSession(page); } catch { return noop; }
  let stopped = false; let timer = null; let detached = null;
  const stop = () => {
    stopped = true;
    if (timer !== null) { clearTimer(timer); timer = null; }
    page.off('close', onClose);
    // Detach also releases an outstanding request if Chrome closes mid-query.
    return detached ||= Promise.resolve().then(() => session.detach()).catch(() => {});
  };
  const onClose = () => { void stop(); };
  page.once('close', onClose);
  const check = async () => {
    if (stopped) return;
    try {
      // Omitting targetId uses this CDP session's page, never another Chrome window.
      const { windowId, bounds } = await session.send('Browser.getWindowForTarget');
      if (!stopped && bounds?.windowState === 'minimized') {
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      }
    } catch { await stop(); }
  };
  const schedule = () => {
    timer = setTimer(async () => {
      timer = null;
      await check();
      if (!stopped) schedule();
    }, 5000);
    timer?.unref?.();
  };
  if (page.isClosed()) await stop();
  else await check();
  // Self-scheduling after completion allows only one outstanding check.
  if (!stopped) schedule();
  return stop;
}

/**
 * Record SIGHUP and SIGTERM. The first does not exit and does not close Chrome.
 * The second guarded signal exits (129 for SIGHUP, 143 for SIGTERM). Idempotent per emitter.
 * Pass a fake emitter in tests. Do not call this at import time.
 */
export function installSessionSignalGuard(emitter) {
  if (!emitter || typeof emitter.on !== 'function') throw new Error('installSessionSignalGuard needs an event emitter');
  if (emitter[GUARD]) return emitter[GUARD];
  const state = { signals: [], exited: false };
  const on = (name) => {
    state.signals.push({ name, at: Date.now() });
    if (state.signals.length >= 2 && !state.exited) {
      state.exited = true;
      const code = name === 'SIGHUP' ? 129 : 143;
      if (typeof emitter.exit === 'function') emitter.exit(code);
    }
  };
  emitter.on('SIGHUP', () => on('SIGHUP'));
  emitter.on('SIGTERM', () => on('SIGTERM'));
  emitter[GUARD] = state;
  return state;
}

/** Signals recorded at or after sinceMs. `sinceMs` null returns every recorded signal. */
export function signalsSince(state, sinceMs) {
  if (!state || !Array.isArray(state.signals)) return [];
  return state.signals.filter((s) => sinceMs == null || s.at >= sinceMs);
}

export function isChromeExecutable(command) {
  const base = String(command || '').split(/[/\\]/).pop() || '';
  return CHROME_BASENAME.test(base);
}

function attachChromeChild(slot, child) {
  slot.child = child;
  if (child && child.stderr && typeof child.stderr.on === 'function') {
    child.stderr.on('data', (buf) => {
      // A failed candidate may still emit while the fallback browser is already running.
      if (slot.child !== child) return;
      slot.stderrTail = `${slot.stderrTail || ''}${buf}`.slice(-4000);
    });
  }
  if (child && typeof child.once === 'function') {
    child.once('exit', (code, signal) => {
      if (slot.child !== child) return;
      slot.exitCode = code;
      slot.signal = signal;
    });
  }
}

/** Wrap child_process.spawn until restore(). Playwright reads spawn through a live export getter, so the wrap sees its Chrome launch. */
export function withChromeSpawnCapture() {
  const slot = { child: null, stderrTail: '', exitCode: null, signal: null };
  const original = childProcess.spawn;
  function spawn(command, args, options) {
    const child = original.apply(this, arguments);
    if (!slot.child && isChromeExecutable(command)) attachChromeChild(slot, child);
    return child;
  }
  childProcess.spawn = spawn;
  slot.restore = () => { if (childProcess.spawn === spawn) childProcess.spawn = original; };
  return slot;
}

/** `pid (comm) state ppid pgrp session ...` — comm may contain spaces. */
export function parseProcStat(text, pid = null) {
  const src = String(text || '');
  const close = src.lastIndexOf(')');
  if (close < 0) return null;
  const rest = src.slice(close + 2).trim().split(/\s+/);
  if (rest.length < 4) return null;
  const fromName = src.match(/^\s*(\d+)\s+\(/);
  if (!fromName) return null;
  const parsedPid = Number(fromName[1]);
  if (pid != null && Number(pid) !== parsedPid) return null;
  const ids = { pid: parsedPid, ppid: Number(rest[1]), pgid: Number(rest[2]), sid: Number(rest[3]) };
  if (![ids.pid, ids.pgid, ids.sid].every((n) => Number.isSafeInteger(n) && n > 0)
    || !Number.isSafeInteger(ids.ppid) || ids.ppid < 0) return null;
  return ids;
}

export function readProcIds(pid, readFile = readFileSync) {
  return parseProcStat(readFile(`/proc/${pid}/stat`, 'utf8'), Number(pid));
}

/** True when Chrome is its own process-group leader and session leader, distinct from Node. */
export function chromeOwnsProcessGroup(chromeIds, nodeIds) {
  if (!chromeIds || !nodeIds) return false;
  if (![chromeIds.pid, chromeIds.pgid, chromeIds.sid, nodeIds.pgid].every((n) => Number.isSafeInteger(n) && n > 0)) return false;
  return chromeIds.pgid === chromeIds.pid && chromeIds.sid === chromeIds.pid && chromeIds.pgid !== nodeIds.pgid;
}

export function chromeStderrNotes(text) {
  return String(text || '').split('\n').map((line) => line.trim()).filter((line) => line && CHROME_STDERR_RE.test(line)).slice(-4);
}

/** A kernel oom-kill. "invoked oom-killer" is the caller, not the victim. Balloon "Out of puff" is not a kill. */
export function isKernelOomKillLine(line) {
  const text = String(line || '');
  if (/out of puff/i.test(text)) return false;
  if (/invoked oom-killer/i.test(text)) return false;
  return /Out of memory: Killed process\b/.test(text) || /\boom-kill:/.test(text);
}

/** dmesg -T stamp, milliseconds, or null when the line has no calendar time. */
export function dmesgStampMs(line) {
  const match = String(line || '').match(/^\[\s*([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}:\d{2}\s+\d{4})\s*\]/);
  if (!match) return null;
  const stamp = Date.parse(match[1]);
  return Number.isFinite(stamp) ? stamp : null;
}

/** Kill lines at or after sinceMs. Unstamped lines are dropped when sinceMs is set, so an old boot-relative line cannot count. */
export function parseKernelOomLines(text, sinceMs = null) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || !isKernelOomKillLine(line)) continue;
    if (sinceMs != null) {
      const stamp = dmesgStampMs(line);
      if (stamp == null || stamp < sinceMs) continue;
    }
    out.push(line);
  }
  return out;
}

export function readRecentKernelOom(sinceMs, exec = execFileSync) {
  try {
    const text = exec('dmesg', ['-T'], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
    return { lines: parseKernelOomLines(text, sinceMs), error: null };
  } catch (err) {
    return { lines: [], error: String(err && err.message || err).split('\n')[0].slice(0, 180) };
  }
}

/**
 * Decide whether a route error is the environment killing the browser.
 * A bare page close with the browser still connected, and a renderer crash with the browser
 * still connected, stay gameplay/route failures. Kernel OOM counts only when the page or
 * browser was actually lost, so a live page is not retried because some other process was killed.
 */
export function classifyBrowserLoss({
  notes = [],
  exitCode = null,
  signal = null,
  oom = [],
  browserConnected = null,
  signalsSeen = [],
  chromePid = null,
} = {}) {
  const text = (notes || []).map((n) => String(n));
  const closed = text.some((n) => /\bpage closed\b/i.test(n));
  const crashed = text.some((n) => /\bpage crashed\b/i.test(n));
  const noteDisconnected = text.some((n) => /browser disconnected|browser not connected/i.test(n));
  const disconnected = noteDisconnected || browserConnected === false;
  const chromeSignal = signal && CHROME_ENV_SIGNALS.has(signal) ? signal : null;
  const oomLines = (oom || []).map(String).filter(isKernelOomKillLine);
  const ownedOom = Number.isSafeInteger(chromePid) && chromePid > 0
    ? oomLines.filter(line => {
      const killed = line.match(/Killed process\s+(\d+)\b/) || line.match(/\bpid=(\d+)\b/);
      return killed && Number(killed[1]) === chromePid;
    }) : [];
  const harness = [];
  for (const entry of signalsSeen || []) {
    const name = typeof entry === 'string' ? entry : entry && entry.name;
    if (name === 'SIGHUP' || name === 'SIGTERM') harness.push(name);
  }
  const pageLost = closed || crashed || disconnected;
  let reason = null;
  if (chromeSignal) reason = `chrome signal ${chromeSignal}`;
  else if (ownedOom.length && pageLost) reason = 'kernel oom';
  // A native crash is a route failure unless an owned OOM proves the external loss.
  // An unrelated process kill or an unexplained disconnect does not establish that.
  else if (!CHROME_CRASH_SIGNALS.has(signal)) {
    if (harness.length && pageLost) reason = `harness received ${harness[0]}`;
    else if (disconnected && exitCode === 0) reason = 'browser disconnected';
  }
  return {
    environment: reason != null,
    reason,
    signal: signal || null,
    exitCode: exitCode == null ? null : exitCode,
    oom: oomLines,
  };
}

function describeChrome(slot) {
  const child = slot.child;
  const pid = child && child.pid ? child.pid : null;
  if (!pid) {
    return {
      child: child || null, pid: null, pgid: null, sid: null, ownGroup: null,
      stderrTail: () => slot.stderrTail || '',
      exitCode: () => (slot.exitCode == null ? null : slot.exitCode),
      signal: () => slot.signal || null,
    };
  }
  let ids = null;
  let nodeIds = null;
  try { ids = readProcIds(pid); } catch { ids = null; }
  try { nodeIds = readProcIds(process.pid); } catch { nodeIds = null; }
  const ownGroup = ids && nodeIds ? chromeOwnsProcessGroup(ids, nodeIds) : null;
  return {
    child, pid, pgid: ids && ids.pgid, sid: ids && ids.sid, ownGroup,
    stderrTail: () => slot.stderrTail || '',
    exitCode: () => {
      if (child.exitCode != null) return child.exitCode;
      return slot.exitCode == null ? null : slot.exitCode;
    },
    signal: () => child.signalCode || slot.signal || null,
  };
}

async function rejectSharedProcessGroup(browser, chrome) {
  if (chrome.ownGroup !== false) return chrome;
  await browser.close().catch(() => {});
  const err = new Error(`player-truth: chrome pid ${chrome.pid} is not its own session (pgid ${chrome.pgid} sid ${chrome.sid}). A parent exit could signal it. Refusing to drive.`);
  err.harnessError = true;
  throw err;
}

/** Launch Chromium; returns { browser, executable, chrome }. Chrome must be its own session when /proc can prove it. */
export async function launchChromium(chromium, options) {
  const launchOptions = applyHarnessLaunchOptions(options);
  const slot = withChromeSpawnCapture();
  try {
    try {
      const browser = await chromium.launch(launchOptions);
      const chrome = await rejectSharedProcessGroup(browser, describeChrome(slot));
      return { browser, executable: 'playwright-bundled', chrome };
    } catch (err) {
      if (err && err.harnessError) throw err;
      if (!/Executable doesn't exist|playwright install/i.test(String(err && err.message))) throw err;
    }
    for (const exe of systemChromeCandidates()) {
      slot.child = null;
      slot.stderrTail = '';
      slot.exitCode = null;
      slot.signal = null;
      try {
        const browser = await chromium.launch({ ...launchOptions, executablePath: exe });
        const chrome = await rejectSharedProcessGroup(browser, describeChrome(slot));
        return { browser, executable: exe, chrome };
      } catch (err) {
        if (err && err.harnessError) throw err;
      }
    }
    throw new Error('player-truth: no Chromium found. Run `npx playwright install chromium` or set CHROME_PATH=/path/to/chrome');
  } finally {
    slot.restore();
  }
}
