#!/usr/bin/env node
/**
 * Live-game probe for the bow retro pair (playerRetroVolume).
 * Reproduces the reported defect: brake while moving -> accelerate -> the two
 * retro blobs must stay bolted to the hull while they spool down, never shed
 * behind the ship. Writes screenshots to .devshots/retro-jets/.
 *
 *   node scripts/probe-retro-jets.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'retro-jets');

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function freePort(start) {
  for (let p = start; p < start + 60; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('no free port');
}

async function waitForSimTicks(page, ticks) {
  const start = await page.evaluate(() => window.SF && window.SF.state ? window.SF.state.tick : 0);
  await page.waitForFunction(
    ({ startTick, tickCount }) => window.SF && window.SF.state && window.SF.state.tick >= startTick + tickCount,
    { startTick: start, tickCount: ticks },
    { timeout: 30000 },
  );
}

async function resetPlayer(page, vel) {
  await page.evaluate(({ vel }) => {
    const sf = window.SF;
    const state = sf.state;
    const p = state.entities.get(state.playerId);
    if (!p) return;
    state.settings.controls.flightMode = 'assisted';
    Object.assign(state.input, {
      moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false, fireGroup: null,
    });
    p.rot = 0; p.prevRot = 0; p.angVel = 0; p.bank = 0; p.prevBank = 0; p.bankVel = 0;
    p.vel.x = vel.x; p.vel.y = 0; p.vel.z = vel.z;
    if (p.pos) { p.pos.x = 0; p.pos.y = 0; p.pos.z = 0; }
    if (p.prevPos) { p.prevPos.x = 0; p.prevPos.y = 0; p.prevPos.z = 0; }
    if (p.physicsBody) p.physicsBody.revision = (p.physicsBody.revision || 0) + 1;
    if (p.data && p.data.propulsionRuntime) p.data.propulsionRuntime = null;
    const input = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('input') : null;
    if (input && input._keys) {
      for (const key of Object.keys(input._keys)) input._keys[key] = false;
      input._m0 = false; input._m1 = false; input._m2 = false;
    }
  }, { vel });
  await waitForSimTicks(page, 6);
}

async function shot(page, name) {
  const box = await page.locator('#gl-canvas').boundingBox();
  const clip = box
    ? { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) }
    : undefined;
  const buf = await page.screenshot({ type: 'png', clip });
  await writeFile(join(OUT, name), buf);
  console.log(`wrote ${name}`);
}

const port = await freePort(8240);
const baseUrl = `http://127.0.0.1:${port}/`;
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
child.stdout.on('data', (c) => { serverOut = (serverOut + c).slice(-4000); });
child.stderr.on('data', (c) => { serverOut = (serverOut + c).slice(-4000); });

const { chromium } = await loadPlaywright();
const executablePath = findBrowser();
const browser = await chromium.launch({
  headless: true,
  executablePath: executablePath || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling'],
});

try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(baseUrl).then((r) => r.ok).catch(() => false)) break;
    if (child.exitCode != null) throw new Error(`server died: ${serverOut}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const url = new URL(baseUrl);
  url.searchParams.set('debug', 'flight');
  await page.goto(String(url), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Retro Probe' }));
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    if (!state || state.mode !== 'flight' || !state.playerId) return false;
    const player = state.entities && state.entities.get(state.playerId);
    return !!(player && (player.mesh || (player.view && player.view.root)));
  }, null, { timeout: 70000 });
  await page.waitForTimeout(400);
  // Dismiss the begin/tutorial modal if present.
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (/begin|launch|launch ship|depart/i.test(b.textContent || '')) { b.click(); break; }
    }
  }).catch(() => {});
  await page.waitForTimeout(300);

  await mkdir(OUT, { recursive: true });

  // --- Sequence matching the report -------------------------------------
  // 1. Accelerate: get the hull moving fast forward.
  await resetPlayer(page, { x: 0, z: 0 });
  await page.keyboard.down('KeyW');
  await waitForSimTicks(page, 80);

  // 2. Stop accelerating: assisted come-to-rest lights the bow retros while the hull still moves.
  await page.keyboard.up('KeyW');
  await waitForSimTicks(page, 14);
  await shot(page, '01-retro-brake.png');

  // 3. Hit the accelerator: the reported bug shed two blobs at the release point.
  await page.keyboard.down('KeyW');
  await waitForSimTicks(page, 5);
  await shot(page, '02-retro-release-early.png');
  await waitForSimTicks(page, 16);
  await shot(page, '03-retro-release-late.png');
  await waitForSimTicks(page, 30);
  await shot(page, '04-retro-gone.png');

  const summary = await page.evaluate(() => {
    const sf = window.SF;
    const vfxRef = sf && sf.render && sf.render.vfx;
    const volume = vfxRef && vfxRef._energy && vfxRef._energy.retroVolume;
    return {
      tick: sf.state.tick,
      retroLive: volume && volume._liveCount,
      retroSpool: volume && volume.spool,
      retroVisible: volume && volume.group && volume.group.visible,
    };
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
  child.kill();
}
