#!/usr/bin/env node
// check-title-continue-runtime.mjs - browser smoke for title-screen Continue trust.
//
// Boots the canonical player URL with a seeded save index, verifies Continue is enabled with the
// latest-slot context visible on the title screen, and verifies the button emits the canonical
// game:load { slot:'latest' } intent without introducing query-route forks.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.clear();
      localStorage.setItem('sf.save.index', JSON.stringify({
        quick: {
          slot: 'quick',
          savedAt: '2026-06-27T12:00:00.000Z',
          playtimeS: 420,
          credits: 5000,
          sectorName: 'Helios Reach',
          shipName: 'ship_kestrel',
          version: 5,
        },
        3: {
          slot: '3',
          savedAt: '2026-06-27T13:15:00.000Z',
          playtimeS: 3660,
          credits: 12345,
          sectorName: 'Tethys Gate',
          shipName: 'ship_kestrel_runner',
          version: 5,
        },
      }));
    } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'title Continue probe must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');

  const report = await page.evaluate(() => {
    const text = (sel) => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
    const cont = [...document.querySelectorAll('[data-screen="mainMenu"] button')]
      .find((b) => (b.textContent || '').trim() === 'Continue');
    const summary = document.querySelector('[data-screen="mainMenu"] .sf-menu-save-summary');
    const rect = summary ? summary.getBoundingClientRect().toJSON() : null;
    return {
      summary: text('[data-screen="mainMenu"] .sf-menu-save-summary'),
      summaryHasSave: !!summary && summary.classList.contains('has-save'),
      summaryRect: rect,
      continueDisabled: cont ? cont.disabled : null,
      continueTitle: cont ? cont.title : '',
    };
  });

  assert.equal(report.summaryHasSave, true, 'title summary should render occupied-save styling');
  assert.equal(report.continueDisabled, false, 'Continue should be enabled when the save index has an occupied slot');
  assert(report.summaryRect && report.summaryRect.width > 20 && report.summaryRect.height > 10,
    'Continue summary should be visible on the title screen');
  assert.match(report.summary, /^Continue:/, 'summary should explicitly label what Continue will load');
  assert.match(report.summary, /Slot 3/, 'summary should pick the newest occupied slot');
  assert.match(report.summary, /Tethys Gate/, 'summary should show latest save sector context');
  assert.match(report.summary, /Kestrel Runner/, 'summary should show latest save ship context');
  assert.match(report.summary, /1h 1m played/, 'summary should show latest save playtime context');
  assert.match(report.summary, /12,345 CR/, 'summary should show latest save credit context');
  assert.match(report.continueTitle, /Load .*Slot 3/, 'Continue tooltip should match the resolved latest save');

  await page.evaluate(() => {
    const sf = window.SF;
    const originalEmit = sf.bus.emit.bind(sf.bus);
    window.__sfContinueProbe = [];
    sf.bus.emit = (name, payload) => {
      window.__sfContinueProbe.push({ name, payload });
      if (name === 'game:load') return true;
      return originalEmit(name, payload);
    };
  });

  assert.equal(await clickButton(page, 'Continue'), true, 'Continue button should be clickable');
  const emitted = await page.waitForFunction(() =>
    (window.__sfContinueProbe || []).some((e) => e.name === 'game:load'),
  null, { timeout: 5000 }).then(() => page.evaluate(() =>
    (window.__sfContinueProbe || []).find((e) => e.name === 'game:load')
  ));

  assert.equal(emitted.payload && emitted.payload.slot, 'latest',
    'Continue should emit the canonical latest-slot load intent');
  assert.deepEqual(issues.errorIssues(), [], 'title Continue runtime probe should not record page errors');

  console.log('Title Continue runtime OK: seeded save index -> visible latest-save summary -> canonical latest load intent.');
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function clickButton(page, label) {
  const button = page.getByRole('button', { name: label, exact: true }).first();
  if (await button.count() <= 0) return false;
  await button.click({ timeout: 10000 });
  return true;
}

async function startFreshServer() {
  const port = await findFreePort(8130);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for title Continue runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}
