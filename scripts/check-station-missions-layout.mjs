// Live geometry contract for the station Missions screen.
// Proves that the shared operation identity, offer strip, dossier, and active rail each
// receive their own visible region on the normal station route.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'station-missions-layout');
mkdirSync(OUT, { recursive: true });

const server = await startServer();
const { chromium } = await loadPlaywright();
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* optional */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.waitForSelector('[data-screen="newGame"] .sf-ng-route', { state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.mode === 'flight' && player && player.alive !== false;
  }, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const state = window.SF.state;
    const station = state.entityList.find((entity) => entity?.type === 'station'
      && entity.data?.stationId && !entity.data.isGate);
    if (!station) throw new Error('No station entity found');
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"] .sx-app', { state: 'visible', timeout: 15_000 });
  await page.evaluate(() => {
    const state = window.SF.state;
    state.missions.active.push({
      id: 'layout_active_probe', status: 'active', type: 'cargo_delivery',
      title: 'Deliver test cargo', reward: 700, destStationId: 'station_layout_target',
      destinationName: 'Layout Target',
    });
    state.ui.trackedMissionId = 'layout_active_probe';
    window.SF.bus.emit('mission:updated', { missionId: 'layout_active_probe' });
  });
  await page.click('[data-nav="contracts"]');
  await page.waitForSelector('.sx-ct-row', { state: 'visible', timeout: 10_000 });

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box && {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height,
      };
    };
    return {
      body: rect('.sx-screen__body'),
      title: rect('.sx-screen__head'),
      board: rect('.sx-ct__board'),
      dossier: rect('.sx-ct__dossier'),
      active: rect('.sx-ct__active'),
      handoff: rect('.sx-handoff:not([hidden])'),
      redundantAttention: !!document.querySelector('.sx-ct__attention'),
    };
  });

  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert.equal(layout.redundantAttention, false, 'redundant Missions attention banner must not render');
  for (const key of ['body', 'title', 'board', 'dossier', 'active']) {
    assert.ok(layout[key]?.width > 0 && layout[key]?.height > 0, `${key} must have visible geometry`);
  }
  assert.equal(overlaps(layout.title, layout.board), false, 'shared Missions identity must not cover offer tickets');
  assert.ok(layout.board.bottom <= layout.dossier.top + 1, 'offer strip must sit above the mission dossier');
  assert.ok(layout.dossier.bottom <= layout.active.top + 1, 'mission dossier must sit above Active Missions');
  assert.ok(layout.dossier.height >= layout.body.height * 0.45,
    `mission dossier must use the main workspace (${layout.dossier.height.toFixed(1)} / ${layout.body.height.toFixed(1)} px)`);
  assert.ok(layout.active.height >= 64, `Active Missions must remain readable (${layout.active.height.toFixed(1)}px)`);
  assert.ok(layout.active.bottom <= layout.body.bottom + 1, 'Active Missions must not clip below the workspace');
  await page.screenshot({ path: join(OUT, 'missions.png') });
  if (layout.handoff) {
    assert.equal(overlaps(layout.handoff, layout.board), false, 'First Dock Handoff must not cover mission offers');
    assert.equal(overlaps(layout.handoff, layout.dossier), false, 'First Dock Handoff must not cover the mission dossier');
    assert.equal(overlaps(layout.handoff, layout.active), false, 'First Dock Handoff must not cover Active Missions');
  }

  const job = page.locator('.sx-job[data-active-mid="layout_active_probe"]');
  await job.hover();
  const missionHover = await page.evaluate(async () => {
    const initial = document.querySelector('.sx-job[data-active-mid="layout_active_probe"]');
    const samples = [];
    for (let i = 0; i < 80; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const current = document.querySelector('.sx-job[data-active-mid="layout_active_probe"]');
      const box = current?.getBoundingClientRect();
      samples.push({ sameNode: current === initial, left: box?.left, top: box?.top });
    }
    return samples;
  });
  assert.ok(missionHover.every((sample) => sample.sameNode), 'station refresh must not replace a hovered active mission');

  await page.click('[data-nav="shipworks"]');
  await page.waitForSelector('.sx-hardpoint[data-spatial-slot]', { state: 'visible', timeout: 30_000 });
  const hardpoint = page.locator('.sx-hardpoint[data-spatial-slot]').first();
  await hardpoint.hover();
  const shipworks = await page.evaluate(async () => {
    const stage = document.querySelector('.sx-sw__stage')?.getBoundingClientRect();
    const initial = document.querySelector('.sx-hardpoint[data-spatial-slot]');
    const stable = [];
    for (let i = 0; i < 80; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      stable.push(document.querySelector('.sx-hardpoint[data-spatial-slot]') === initial);
    }
    const clipped = [...document.querySelectorAll('.sx-hardpoint__copy')].filter((node) => {
      const box = node.getBoundingClientRect();
      return !stage || box.left < stage.left - 1 || box.top < stage.top - 1
        || box.right > stage.right + 1 || box.bottom > stage.bottom + 1;
    }).map((node) => node.textContent.trim());
    return { stable, clipped };
  });
  assert.ok(shipworks.stable.every(Boolean), 'station refresh must not replace hovered Shipworks hardpoints');
  assert.deepEqual(shipworks.clipped, [], `Shipworks callouts must stay inside the preview (${shipworks.clipped.join(', ')})`);
  await page.screenshot({ path: join(OUT, 'shipworks.png') });

  console.log('Station Missions layout OK:', JSON.stringify(layout));
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

async function startServer() {
  const port = await freePort();
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', resolve);
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
