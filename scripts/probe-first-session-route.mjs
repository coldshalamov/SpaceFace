#!/usr/bin/env node
// probe-first-session-route.mjs - runtime first-session trust probe.
//
// Starts the normal dev server, opens the canonical root URL (no debug/prod/query route), walks the
// actual New Game UI, verifies the first-15-minutes rail is visible before Launch, then launches a
// fresh game and waits for the authored default path to enter flight. This is a probe only: it does
// not change video quality, assets, gameplay defaults, or launcher behavior.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = parseArgs(process.argv.slice(2));
const WIDTH = Number(argv.width || 1280);
const HEIGHT = Number(argv.height || 800);
const TIMEOUT_MS = Number(argv.timeout || argv.timeoutMs || argv['timeout-ms'] || 90000);
const OUT = argv.out || '.devshots/first-session-route.json';
const STRICT = !!argv.strict;
const HEADED = !!(argv.headed || argv.headful || argv.headless === 'false');
const URL_ARG = argv.url ? String(argv.url) : '';

const report = {
  schema: 'spaceface.firstSessionRoute.v1',
  generatedAt: new Date().toISOString(),
  runner: {
    width: WIDTH,
    height: HEIGHT,
    timeoutMs: TIMEOUT_MS,
    strict: STRICT,
    headless: !HEADED,
    urlProvided: !!URL_ARG,
  },
  routePolicy: {
    canonicalRootUrl: true,
    queryString: '',
    playerFacingDefaultPath: true,
    qualityOverridesApplied: false,
    debugGameplayFork: false,
  },
  checks: [],
  pageIssues: [],
  finalState: null,
  pass: false,
};

let server = null;
let browser = null;
try {
  server = URL_ARG ? null : await startFreshServer();
  const baseUrl = URL_ARG || server.baseUrl;
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: !HEADED,
    executablePath: argv.executablePath ? String(argv.executablePath) : findChromeOrNull(),
    args: [
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      `--window-size=${WIDTH},${HEIGHT}`,
    ],
  });

  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  wireIssueCollection(page, report.pageIssues);

  await step('load canonical root', async () => {
    const url = new URL(baseUrl);
    assert.equal(url.search, '', 'first-session probe must load the canonical root URL without query flags');
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForFunction(() => !!window.SF && !!document.getElementById('ui-root'), null, { timeout: TIMEOUT_MS });
    const pageUrl = new URL(page.url());
    report.routePolicy.queryString = pageUrl.search;
    assert.equal(pageUrl.search, '', 'game page must remain on the default route without debug/prod query flags');
  });

  await step('dismiss intro through player input if present', async () => {
    const splash = page.locator('#cinematic-splash');
    if (await splash.count()) {
      await splash.click({ timeout: 5000 });
      await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 10000 }).catch(() => {});
    }
  });

  await step('open New Game from main menu', async () => {
    await clickButton(page, 'New Game', TIMEOUT_MS);
    await page.waitForSelector('.sf-ng-route', { state: 'visible', timeout: TIMEOUT_MS });
  });

  await step('verify first-15-minutes rail copy', async () => {
    const text = await page.locator('.sf-ng-route').innerText({ timeout: 5000 });
    for (const phrase of ['First 15 minutes', 'Follow the anomaly', 'Mine the marked rock', 'Dock at Helios', 'Take one job']) {
      assert.match(text, new RegExp(escapeRegExp(phrase), 'i'), `route rail missing: ${phrase}`);
    }
    assert.match(text, /Mission Board and Bar contracts auto-track/i, 'route rail must bridge launch into tracked mission work');
  });

  await step('launch through default New Game button', async () => {
    await clickButton(page, 'Launch', 10000);
    await page.waitForFunction(() => {
      const sf = window.SF;
      const st = sf && sf.state;
      return !!(st && st.mode === 'flight' && st.playerId && st.entities && st.entities.get(st.playerId));
    }, null, { timeout: TIMEOUT_MS });
  });

  await step('verify playable first-session state', async () => {
    report.finalState = await page.evaluate(() => {
      const st = window.SF && window.SF.state;
      const wp = st && st.nav && st.nav.waypoint;
      const player = st && st.entities && st.entities.get(st.playerId);
      return {
        mode: st && st.mode,
        playerId: st && st.playerId,
        playerAlive: !!(player && player.alive !== false),
        entityCount: st && st.entityList && st.entityList.length,
        currentSectorId: st && st.world && st.world.currentSectorId,
        screenStack: st && st.ui && Array.isArray(st.ui.screenStack) ? st.ui.screenStack.slice() : [],
        waypoint: wp ? {
          kind: wp.kind || null,
          label: wp.label || null,
          reason: wp.reason || null,
          sectorId: wp.sectorId || null,
          hasPosition: !!wp.pos,
        } : null,
      };
    });
    assert.equal(report.finalState.mode, 'flight', 'New Game launch must enter flight');
    assert.ok(report.finalState.playerAlive, 'player ship must be alive after launch');
    assert.ok(report.finalState.entityCount > 0, 'default first session must spawn live entities');
    assert.equal(report.finalState.screenStack.length, 0, 'flight should not be hidden behind a modal after launch');
    assert.ok(report.finalState.waypoint, 'first session should expose nav guidance after launch');
  });

  if (STRICT) {
    const serious = report.pageIssues.filter((issue) => issue.type === 'pageerror' || issue.type === 'requestfailed');
    assert.equal(serious.length, 0, 'strict first-session probe found page/runtime failures: ' + JSON.stringify(serious.slice(0, 5)));
  }

  report.pass = report.checks.every((check) => check.pass) && (!STRICT || !report.pageIssues.some((issue) => issue.type === 'pageerror' || issue.type === 'requestfailed'));
} catch (err) {
  report.pass = false;
  report.error = err && err.stack ? err.stack : String(err);
  if (!report.checks.length || report.checks[report.checks.length - 1].pass !== false) {
    report.checks.push({ name: 'unhandled probe failure', pass: false, error: err && err.message ? err.message : String(err) });
  }
  if (STRICT) process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server && server.kill) server.kill(); } catch (_) {}
  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log(`[first-session-route] report: ${OUT}`);
  console.log(`[first-session-route] summary: ${report.pass ? 'PASS' : 'FAIL'}`);
  if (STRICT && !report.pass) process.exitCode = 1;
}

async function step(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    report.checks.push({ name, pass: true, ms: Date.now() - startedAt });
  } catch (err) {
    report.checks.push({ name, pass: false, ms: Date.now() - startedAt, error: err && err.message ? err.message : String(err) });
    throw err;
  }
}

async function clickButton(page, label, timeout) {
  const selector = `button:text-is("${label}")`;
  try {
    await page.locator(selector).first().click({ timeout });
    return;
  } catch (_) {
    await page.locator('button').filter({ hasText: new RegExp('^' + escapeRegExp(label) + '$') }).first().click({ timeout });
  }
}

function wireIssueCollection(page, issues) {
  page.on('pageerror', (err) => issues.push({ type: 'pageerror', text: err && err.message ? err.message : String(err) }));
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') issues.push({ type: 'console.error', text: msg.text() });
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure && req.failure();
    const url = req.url();
    if (/^data:/.test(url)) return;
    issues.push({ type: 'requestfailed', url, text: failure && failure.errorText || 'request failed' });
  });
}

async function startFreshServer() {
  const port = await findFreePort(Number(argv.port || 8123));
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) },
  });
  child.stdout.on('data', (chunk) => { if (argv.verbose) process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { if (argv.verbose) process.stderr.write(chunk); });
  child.on('exit', (code) => {
    if (code !== null && code !== 0 && !child.killed) {
      report.pageIssues.push({ type: 'server-exit', text: 'server exited with code ' + code });
    }
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForHttp(baseUrl, 10000);
  return { baseUrl, kill: () => child.kill() };
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch (_) {}
      if (Date.now() > deadline) return reject(new Error('server did not respond at ' + url));
      setTimeout(attempt, 150);
    };
    attempt();
  });
}

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = createNetServer();
      server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') tryPort(port + 1);
        else reject(err);
      });
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

function findChromeOrNull() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || undefined;
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const eq = arg.indexOf('=');
    if (eq > 2) { out[arg.slice(2, eq)] = arg.slice(eq + 1); continue; }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
