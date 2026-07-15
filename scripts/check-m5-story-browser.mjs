#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCREENSHOT = resolve(ROOT, '.devshots/alpha/m5-story/default-browser.png');
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.goto(`${server.baseUrl}?debug=flight`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.eventTrace, null, {
    timeout: 30000,
  });
  await page.evaluate(() => {
    window.SF.eventTrace.clear();
    window.SF.bus.emit('game:new', { name: 'M5 Story Browser Check', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90000 });

  const initial = await page.evaluate(() => {
    const story = window.SF.state.story || {};
    const sidecar = story.campaign47a || {};
    return {
      mode: window.SF.state.mode,
      beatIndex: story.beatIndex,
      sidecarSchemaVersion: sidecar.schemaVersion,
      sidecarObservedBeatIndex: sidecar.observedBeatIndex,
      sidecarOwnsBeatIndex: Object.prototype.hasOwnProperty.call(sidecar, 'beatIndex'),
      sidecarOwnsEnding: Object.prototype.hasOwnProperty.call(sidecar, 'endingId'),
    };
  });

  assert.equal(initial.mode, 'flight', 'default browser route should enter flight');
  assert.equal(initial.beatIndex, 0, 'new game should begin at canonical B0');
  assert.equal(initial.sidecarSchemaVersion, 2, 'live missions newGame should create sidecar v2');
  assert.equal(initial.sidecarObservedBeatIndex, 0, 'sidecar should observe B0');
  assert.equal(initial.sidecarOwnsBeatIndex, false, 'sidecar must not own beatIndex');
  assert.equal(initial.sidecarOwnsEnding, false, 'sidecar must not own ending choice');

  await page.evaluate(() => window.SF.bus.emit('dock:docked', { stationId: 'station_helios' }));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.SF.state.story.beatIndex), 0, 'dock-before-mine must not advance B0');

  await page.evaluate(() => window.SF.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, source: 'm5-browser-check',
  }));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.SF.state.story.beatIndex), 0, 'mine alone must not advance B0');

  await page.evaluate(() => window.SF.bus.emit('dock:docked', { stationId: 'station_helios' }));
  await page.waitForFunction(() => window.SF.state.story.beatIndex === 1, null, { timeout: 5000 });

  const report = await page.evaluate(() => {
    const story = window.SF.state.story;
    const sidecar = story.campaign47a;
    const trace = window.SF.eventTrace.snapshot();
    const advances = trace.filter((r) => r.type === 'story:beatAdvanced'
      && r.payload && r.payload.fromIndex === 0 && r.payload.toIndex === 1);
    const rewards = trace.filter((r) => r.type === 'economy:grantCredits'
      && r.payload && r.payload.reason === 'story:cold_start');
    return {
      routeMode: window.SF.state.mode,
      canonicalBeatIndex: story.beatIndex,
      canonicalBranch: story.branch,
      sidecarSchemaVersion: sidecar && sidecar.schemaVersion,
      sidecarObservedBeatIndex: sidecar && sidecar.observedBeatIndex,
      sidecarBeat0Steps: sidecar && sidecar.stepProgress && sidecar.stepProgress['0']
        ? sidecar.stepProgress['0'].completed.slice()
        : [],
      sidecarOwnsBeatIndex: !!(sidecar && Object.prototype.hasOwnProperty.call(sidecar, 'beatIndex')),
      sidecarOwnsEnding: !!(sidecar && Object.prototype.hasOwnProperty.call(sidecar, 'endingId')),
      beatAdvanceCount: advances.length,
      coldStartRewardCount: rewards.length,
      traceCount: trace.length,
    };
  });

  assert.equal(report.routeMode, 'flight', 'B0 completion should leave default route playable');
  assert.equal(report.canonicalBeatIndex, 1, 'mine→dock should advance canonical story to B1');
  assert.deepEqual(report.sidecarBeat0Steps, ['mine', 'dock'], 'browser sidecar should retain ordered B0 receipts');
  assert.equal(report.sidecarObservedBeatIndex, 1, 'sidecar should observe canonical B1 after advance');
  assert.equal(report.sidecarOwnsBeatIndex, false, 'sidecar must remain non-owning after advance');
  assert.equal(report.sidecarOwnsEnding, false, 'sidecar must remain non-owning after advance');
  assert.equal(report.beatAdvanceCount, 1, 'B0 should emit exactly one canonical beat advance');
  assert.equal(report.coldStartRewardCount, 1, 'B0 should emit exactly one canonical reward');
  assert.deepEqual(issues.errorIssues(), [], 'M5 browser route should have no page errors');

  await mkdir(dirname(SCREENSHOT), { recursive: true });
  await page.screenshot({ path: SCREENSHOT, fullPage: false });
  console.log('M5 story default-browser PASS');
  console.log(JSON.stringify({ ...report, route: server.baseUrl, screenshot: SCREENSHOT }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8580);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) throw new Error(`M5 server exited early\n${output}`);
    if (await reachable(baseUrl)) return { baseUrl, kill: () => child.kill() };
    await new Promise((done) => setTimeout(done, 250));
  }
  child.kill();
  throw new Error(`M5 server was not reachable\n${output}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port for M5 browser check');
}

function isPortFree(port) {
  return new Promise((done) => {
    const server = createNetServer();
    server.once('error', () => done(false));
    server.once('listening', () => server.close(() => done(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
