#!/usr/bin/env node
// Browser smoke for the Automation operations board. Boots the normal player route, opens the
// registered Automation screen through the live screen manager, clicks the board CTA, and captures
// a screenshot for visual review.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOT = '.devshots/perf/automation-board.jpg';
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Automation Board Runtime', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 45000 });

  const report = await page.evaluate(async () => {
    const sf = window.SF;
    const sm = sf.ctx && sf.ctx.screenManager;
    if (!sm) return { error: 'missing screen manager' };
    sm.pushScreen('automation');
    if (sm.syncVisibility) sm.syncVisibility();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const screen = document.getElementById('sf-automation');
    const board = screen && screen.querySelector('.au-command');
    const summary = screen && screen.querySelector('.au-summary');
    const cta = board && board.querySelector('button[data-act="switchTab"]');
    const ctaRef = cta ? cta.dataset.ref : null;
    const otherTab = screen && [...screen.querySelectorAll('.au-tab')]
      .find((tab) => tab.dataset.tab && tab.dataset.tab !== ctaRef);
    if (otherTab) otherTab.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const liveBoard = screen && screen.querySelector('.au-command');
    const liveCta = liveBoard && liveBoard.querySelector('button[data-act="switchTab"]');
    const initialTab = [...screen.querySelectorAll('.au-tab')]
      .find((tab) => tab.classList.contains('active'))?.dataset.tab || null;
    const liveCtaText = liveCta ? liveCta.textContent.trim() : null;
    const liveCtaRef = liveCta ? liveCta.dataset.ref : null;
    if (liveCta) liveCta.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const afterTab = [...screen.querySelectorAll('.au-tab')]
      .find((tab) => tab.classList.contains('active'))?.dataset.tab || null;
    const text = screen ? screen.textContent.replace(/\s+/g, ' ').trim() : '';
    const rect = screen ? screen.getBoundingClientRect() : null;
    return {
      top: sm.top && sm.top(),
      visible: !!(screen && rect && rect.width > 500 && rect.height > 350),
      boardVisible: !!board,
      summaryVisible: !!summary,
      initialTab,
      ctaText: liveCtaText,
      ctaRef: liveCtaRef,
      afterTab,
      text,
    };
  });

  assert.ok(!report.error, report.error || 'automation runtime error');
  assert.equal(report.top, 'automation', 'Automation screen should be the live top screen');
  assert.equal(report.visible, true, 'Automation screen should be visible');
  assert.equal(report.boardVisible, true, 'Operations Board should render');
  assert.equal(report.summaryVisible, true, 'Automation summary metrics should render');
  assert.ok(report.ctaRef, 'Operations Board CTA should declare a target tab');
  assert.ok(report.ctaText, 'Operations Board CTA should have a visible label');
  assert.notEqual(report.initialTab, report.ctaRef, 'Runtime probe should start from a different tab than the board target');
  assert.match(report.text, /Operations Board/, 'screen text should include the board heading');
  assert.match(report.text, /Deploy a mining drone|Stabilize distressed assets|Raise automation ceiling|route trader|Outpost Charter|Keep routes defended/,
    'board should show a concrete next action');
  assert.equal(report.afterTab, report.ctaRef, 'Operations Board CTA should switch to its recommended tab');
  assert.deepEqual(issues.errorIssues(), [], 'automation board runtime should not record page errors');

  mkdirSync(dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, type: 'jpeg', quality: 88 });
  console.log(`Automation board runtime OK: ${report.initialTab} -> ${report.afterTab}; screenshot ${SHOT}`);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8180);
  const url = `http://127.0.0.1:${port}/`;
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
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 120; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for automation board runtime check');
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
