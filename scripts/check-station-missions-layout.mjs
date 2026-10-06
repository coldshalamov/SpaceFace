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
  // The navigation itself gets the same heavy allowance the flight wait below uses: on a
  // contended host the module-graph fetch that domcontentloaded waits on can exceed Playwright's
  // 30 s default even though nothing is wrong with the route.
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000, polling: 250 });
  // The main menu mounts a beat behind the SF ctx signal on a starved host — wait for the
  // container's computed visibility (Playwright's per-element visible check starves here)
  // before the in-page click, which carries no auto-wait.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, null, { timeout: 90_000, polling: 250 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'New Game');
    if (!button) throw new Error('New Game button not found');
    button.click();
  });
  await page.waitForSelector('[data-screen="newGame"] .sf-ng-route', { state: 'visible', timeout: 30_000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Launch');
    if (!button) throw new Error('Launch button not found');
    button.click();
  });
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
  // In-page click: Playwright's actionability pipeline stalls for tens of seconds on this
  // starved host even after the element reports visible/stable.
  await page.evaluate(() => {
    const tab = document.querySelector('[data-screen="station"] [data-nav="contracts"]');
    if (!tab) throw new Error('contracts nav tab not found');
    tab.click();
  });
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
      body: rect('#sx-panel'),
      title: rect('.sxb-berth'),
      board: rect('.sx-ct__board'),
      dossier: rect('.sx-ct__dossier'),
      active: rect('.sx-ct__active'),
      handoff: rect('.sxb-handoff:not([hidden])'),
      redundantAttention: !!document.querySelector('.sx-ct__attention'),
    };
  });

  // The kit panel (Frontend Task C §1.5): the posted jobs above the player's own missions down the
  // hang column, the dossier on the stage to their right filling the workspace.
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  assert.equal(layout.redundantAttention, false, 'redundant Missions attention banner must not render');
  for (const key of ['body', 'title', 'board', 'dossier', 'active']) {
    assert.ok(layout[key]?.width > 0 && layout[key]?.height > 0, `${key} must have visible geometry`);
  }
  assert.equal(overlaps(layout.title, layout.board), false, 'the station title block must not cover the posted jobs');
  assert.ok(layout.board.bottom <= layout.active.top + 1, 'posted jobs must sit above the player\'s own missions');
  assert.ok(layout.board.right <= layout.dossier.left + 1, 'the dossier must sit on the stage beside the posted jobs');
  assert.ok(layout.dossier.height >= layout.body.height * 0.45,
    `mission dossier must use the main workspace (${layout.dossier.height.toFixed(1)} / ${layout.body.height.toFixed(1)} px)`);
  assert.ok(layout.active.height >= 40, `Active Missions must remain readable (${layout.active.height.toFixed(1)}px)`);
  assert.ok(layout.active.bottom <= layout.body.bottom + 1, 'Active Missions must not clip below the workspace');
  await page.screenshot({ path: join(OUT, 'missions.png') });
  if (layout.handoff) {
    assert.equal(overlaps(layout.handoff, layout.board), false, 'First Dock Handoff must not cover mission offers');
    assert.equal(overlaps(layout.handoff, layout.dossier), false, 'First Dock Handoff must not cover the mission dossier');
    assert.equal(overlaps(layout.handoff, layout.active), false, 'First Dock Handoff must not cover Active Missions');
  }

  // Raw mouse move over the row's center — locator.hover() runs Playwright's actionability
  // pipeline, which stalls for tens of seconds on this starved host after reporting stable.
  const jobBox = await page.evaluate(() => {
    const el = document.querySelector('.sx-job[data-active-mid="layout_active_probe"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  assert.ok(jobBox, 'the probed active mission row should be mounted for the hover pass');
  await page.mouse.move(jobBox.x, jobBox.y);
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

  await page.evaluate(() => {
    const tab = document.querySelector('[data-screen="station"] [data-nav="shipworks"]');
    if (!tab) throw new Error('shipworks nav tab not found');
    tab.click();
  });
  // The dock host stands the hull on its jig (src/ui/orrery/hullSchematic.js): the hardpoints are
  // then its nodes and labels, and the old spatial pins stay mounted but hidden. Either surface counts.
  const HARDPOINT = '.orr-sw-jig.orr-hull--on .orr-sw-node[data-slot], .sx-hardpoint[data-spatial-slot]';
  // waitForSelector parks on the FIRST union match, which is one of the deliberately-hidden
  // legacy pins — poll computed style across the union so the jig's visible nodes count.
  await page.waitForFunction((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 4 && r.height > 4) return true;
    }
    return false;
  }, HARDPOINT, { timeout: 30_000, polling: 250 });
  // Raw mouse move over the first VISIBLE union match (the jig node) — locator().first() lands
  // on a deliberately-hidden legacy pin and locator.hover() runs the stalling actionability pass.
  const hpBox = await page.evaluate((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 4 && r.height > 4) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, index: [...document.querySelectorAll(sel)].indexOf(el) };
      }
    }
    return null;
  }, HARDPOINT);
  assert.ok(hpBox, 'a visible Shipworks hardpoint should mount for the hover pass');
  await page.mouse.move(hpBox.x, hpBox.y);
  const shipworks = await page.evaluate(async ({ selector, hoveredIndex }) => {
    const stage = document.querySelector('.sx-sw__stage')?.getBoundingClientRect();
    const initial = document.querySelectorAll(selector)[hoveredIndex];
    const stable = [];
    for (let i = 0; i < 80; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      stable.push(document.querySelectorAll(selector)[hoveredIndex] === initial);
    }
    const clipped = [...document.querySelectorAll('.sx-hardpoint__copy, .orr-sw-jig.orr-hull--on .orr-sw-node')].filter((node) => {
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return false; // hidden under the jig: not on the stage at all
      return !stage || box.left < stage.left - 1 || box.top < stage.top - 1
        || box.right > stage.right + 1 || box.bottom > stage.bottom + 1;
    }).map((node) => node.textContent.trim());
    return { stable, clipped };
  }, { selector: HARDPOINT, hoveredIndex: hpBox.index });
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
