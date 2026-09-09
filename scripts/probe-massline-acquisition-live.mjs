#!/usr/bin/env node
// PQ-004 normal-route acceptance: a fresh public New Game publishes a visible pre-latch receipt,
// and the shipped F control latches that exact target. No entities, routes, inputs, or game state
// are injected; page evaluation is read-only except for a passive tether:latched event recorder.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(tmpdir(), 'spaceface-evidence');
const SCREENSHOT = join(OUT_DIR, 'massline-acquisition-live.png');
const WIDTH = 1440;
const HEIGHT = 900;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
let report = null;

try {
  await mkdir(OUT_DIR, { recursive: true });
  server = process.env.SF_PROBE_URL
    ? { baseUrl: process.env.SF_PROBE_URL, child: null }
    : await startFreshServer();
  browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const pageIssues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'probe must boot the normal root route without debug query flags');
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus && window.SF.helpers), null, { timeout: 30_000 });

  await page.waitForSelector('[data-screen="mainMenu"]', { state: 'visible', timeout: 30_000 });
  await clickNamedButton(page, 'New Game');
  await page.waitForSelector('[data-screen="newGame"]', { state: 'visible', timeout: 20_000 });
  await clickNamedButton(page, 'Launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: 120_000 });
  await dismissTutorial(page);

  await page.evaluate(() => {
    window.__SF_PQ004_EVENTS__ = [];
    window.SF.bus.on('tether:latched', (payload = {}) => {
      const rendered = document.querySelector('#sf-ml2 .ml2-preview');
      window.__SF_PQ004_EVENTS__.push({
        type: 'tether:latched',
        payload: { ...payload },
        renderedReceiptId: rendered && rendered.getAttribute('data-receipt-id'),
        renderedTargetId: rendered && rendered.getAttribute('data-target-id'),
      });
    });
  });
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const selected = state && state.masslineAcquisition && state.masslineAcquisition.selected;
    const preview = document.querySelector('#sf-ml2 .ml2-preview');
    const line = document.querySelector('#sf-ml2 .ml2-preview-link');
    if (!selected || !preview || !line) return false;
    const style = getComputedStyle(preview);
    const lineStyle = getComputedStyle(line);
    const rect = preview.getBoundingClientRect();
    return style.display !== 'none' && lineStyle.display !== 'none' && rect.width > 0 && rect.height > 0;
  }, null, { timeout: 12_000 });

  const preview = await previewEvidence(page);
  assert.ok(preview.selectedId != null, 'preview must name one selected entity');
  assert.equal(preview.status, 'ready', 'starting-route candidate must explain that it is latchable');
  assert.match(preview.text, /\b(?:PICK|ORBIT|INTERCEPT|TOW|ROUTE)\b/, 'preview must name intent');
  assert.match(preview.text, /\d+%/, 'preview must expose confidence');
  assert.match(preview.text, /READY/, 'preview must expose status');
  assert.ok(preview.lineVisible, 'preview must draw the player-to-target line');
  await page.screenshot({ path: SCREENSHOT });

  await page.keyboard.press('KeyF');
  await page.waitForFunction((targetId) => {
    const state = window.SF && window.SF.state;
    return !!(state && state.player && state.player.tether && state.player.tether.active
      && state.player.tether.targetId === targetId);
  }, preview.selectedId, { timeout: 8_000 });
  const latch = await page.evaluate(() => {
    const state = window.SF.state;
    const event = (window.__SF_PQ004_EVENTS__ || []).find((entry) => entry.type === 'tether:latched');
    return {
      active: !!state.player.tether?.active,
      targetId: state.player.tether?.targetId,
      tick: state.tick,
      event: event && event.payload,
      renderedReceiptId: event && event.renderedReceiptId,
      renderedTargetId: event && event.renderedTargetId,
    };
  });
  assert.equal(latch.targetId, preview.selectedId, 'F must latch the exact previewed target');
  assert.equal(latch.event?.selectionReceiptId, latch.renderedReceiptId,
    'latch event must cite the receipt rendered when input fired');
  assert.equal(String(latch.event?.targetId), latch.renderedTargetId,
    'latch event target must match the target rendered when input fired');
  assert.equal(latch.event?.previewMatched, true, 'latch event must prove preview parity');
  assert.deepEqual(pageIssues.issues, [], 'normal route must have no page errors or app warnings');

  report = {
    schema: 'spaceface.masslineAcquisitionLiveProbe.v1',
    ok: true,
    route: server.baseUrl,
    viewport: { width: WIDTH, height: HEIGHT },
    stateInjection: false,
    fixtureInjection: false,
    preview,
    latch,
    screenshot: SCREENSHOT,
    pageIssues: summarizeIssues(pageIssues.issues),
    ignoredEnvironmentIssues: summarizeIssues(pageIssues.ignoredIssues),
  };
} catch (error) {
  report = {
    schema: 'spaceface.masslineAcquisitionLiveProbe.v1',
    ok: false,
    error: String(error && error.stack || error),
  };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}

console.log(JSON.stringify(report, null, 2));

async function previewEvidence(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const receipt = state.masslineAcquisition;
    const selected = receipt && receipt.selected;
    const preview = document.querySelector('#sf-ml2 .ml2-preview');
    const line = document.querySelector('#sf-ml2 .ml2-preview-link');
    return {
      receiptId: receipt && receipt.id,
      selectedId: selected && selected.targetId,
      targetType: selected && selected.targetType,
      context: selected && selected.context,
      intentLabel: selected && selected.intentLabel,
      confidence: selected && selected.confidence,
      status: selected && selected.status,
      text: String(preview && preview.textContent || '').trim(),
      ariaLabel: preview && preview.getAttribute('aria-label'),
      offscreen: !!(preview && preview.classList.contains('ml2-preview-offscreen')),
      lineVisible: !!(line && getComputedStyle(line).display !== 'none'),
    };
  });
}

async function clickNamedButton(page, label) {
  const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
  assert.equal(await button.count(), 1, `button must be uniquely available: ${label}`);
  await button.click();
}

async function dismissTutorial(page) {
  try {
    const begin = page.getByRole('button', { name: /begin/i });
    await begin.waitFor({ state: 'visible', timeout: 3_000 });
    await begin.click();
  } catch (_) {
    // Some first-hour paths skip the modal; flight readiness above remains authoritative.
  }
}

async function startFreshServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode != null) throw new Error(`server exited early (${child.exitCode}): ${stderr.slice(-1000)}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { child, baseUrl };
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill();
  throw new Error(`server failed to start: ${stderr.slice(-1000)}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}
