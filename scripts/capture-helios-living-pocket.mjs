#!/usr/bin/env node
// Capture Browser (and best-effort Electron) public-route stills of the living Helios pocket.
// Writes under .devshots/helios-living-pocket/ — evidence only, no gameplay mutation.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'helios-living-pocket');
const WIDTH = 1440;
const HEIGHT = 900;

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

async function driveToHeliosFlight(page) {
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 45_000 });
  // Prefer public New Game path if main menu is up; otherwise force flight setup.
  await page.evaluate(async () => {
    const SF = window.SF;
    const state = SF.state;
    if (state.mode === 'flight') return { already: true };
    // Click New Game if present.
    const btn = document.querySelector('[data-action="new-game"], #btn-new-game, button[data-id="newGame"]');
    if (btn) btn.click();
    // Also emit canonical intent if UI click path is unavailable.
    if (SF.bus && typeof SF.bus.emit === 'function') {
      SF.bus.emit('game:new', { seed: 47 });
    }
    if (typeof SF.startNewGame === 'function') {
      try { SF.startNewGame({ seed: 47 }); } catch (_) {}
    }
    return { mode: state.mode };
  });

  // Wait for flight mode (assets gate may take a few seconds).
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return s && s.mode === 'flight';
  }, null, { timeout: 90_000 });

  // Allow traffic + director a few seconds of sim time (real-time).
  await sleep(4000);

  // Target nearest ambient freighter for target-panel readability.
  const probe = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (!player) return { ok: false, reason: 'no-player' };
    const freighters = (state.traffic && state.traffic.freighters) || [];
    let best = null;
    let bestD = Infinity;
    for (const rec of freighters) {
      const e = state.entities.get(rec.id);
      if (!e || !e.alive) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) state.player.targetId = best.id;
    const named = [];
    for (const e of state.entityList || []) {
      if (e && e.alive && e.data && e.data.namedLaneContactId) {
        named.push({
          id: e.data.namedLaneContactId,
          callsign: e.data.callsign,
          role: e.data.trafficRole,
          gimmick: e.data.gimmick,
        });
      }
    }
    return {
      ok: true,
      freighterCount: freighters.length,
      targetId: state.player.targetId,
      targetDist: best ? Math.round(bestD) : null,
      named,
      sectorId: state.world && state.world.currentSectorId,
      heat: state.player.heat,
    };
  });
  return probe;
}

async function captureBrowser() {
  const ownedServer = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'Chrome or Edge required for browser capture');
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  const report = { route: 'browser', baseUrl: ownedServer.baseUrl, ok: false };
  try {
    await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const probe = await driveToHeliosFlight(page);
    report.probe = probe;
    const shot = path.join(OUT, 'browser-helios-pocket.png');
    await page.screenshot({ path: shot, type: 'png' });
    report.screenshot = path.relative(ROOT, shot).replace(/\\/g, '/');
    report.ok = !!(probe && probe.ok && probe.freighterCount >= 3);
  } finally {
    await browser.close().catch(() => {});
    await ownedServer.close().catch(() => {});
  }
  return report;
}

async function captureElectron() {
  // Best-effort: launch electron:dev against the same public entry if packaged, else note skip.
  const electronMain = path.join(ROOT, 'electron', 'main.cjs');
  if (!existsSync(electronMain)) {
    return { route: 'electron', ok: false, skipped: true, reason: 'no electron/main.cjs' };
  }
  // Prefer playwright-free evidence: run a short headed electron is heavy. Capture via CDP against
  // electron if ELECTRON_RUN_AS_NODE not set — use npm run electron only when available.
  const report = { route: 'electron', ok: false };
  try {
    // Lightweight: spawn electron with remote debugging, screenshot via CDP if it boots.
    const dbgPort = 9339;
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['electron', '.', `--remote-debugging-port=${dbgPort}`],
      {
        cwd: ROOT,
        env: { ...process.env, SPACEFACE_PORT: '41788' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let log = '';
    child.stdout.on('data', (d) => { log += d.toString(); });
    child.stderr.on('data', (d) => { log += d.toString(); });
    await sleep(8000);
    // Probe CDP
    let pageWs = null;
    for (let i = 0; i < 20 && !pageWs; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${dbgPort}/json/list`);
        const tabs = await r.json();
        const page = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) pageWs = page.webSocketDebuggerUrl;
      } catch (_) {}
      await sleep(400);
    }
    if (!pageWs) {
      report.skipped = true;
      report.reason = 'electron CDP unavailable';
      report.logTail = log.slice(-500);
      try { child.kill(); } catch (_) {}
      return report;
    }
    const { chromium } = await loadPlaywright();
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${dbgPort}`);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();
    const probe = await driveToHeliosFlight(page);
    report.probe = probe;
    const shot = path.join(OUT, 'electron-helios-pocket.png');
    await page.screenshot({ path: shot, type: 'png' });
    report.screenshot = path.relative(ROOT, shot).replace(/\\/g, '/');
    report.ok = !!(probe && probe.ok && probe.freighterCount >= 3);
    try { child.kill(); } catch (_) {}
    await browser.close().catch(() => {});
  } catch (err) {
    report.error = String(err && err.message || err);
  }
  return report;
}

await mkdir(OUT, { recursive: true });
const browserReport = await captureBrowser();
const electronReport = await captureElectron();
const evidence = {
  schema: 'spaceface.heliosLivingPocketCapture.v1',
  taskId: 'PROFESSIONAL-LIVING-HELIOS-POCKET-GROK-001',
  at: new Date().toISOString(),
  browser: browserReport,
  electron: electronReport,
};
await writeFile(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (!browserReport.ok) process.exitCode = 1;
