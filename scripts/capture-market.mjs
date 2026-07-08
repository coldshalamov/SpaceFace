#!/usr/bin/env node
// capture-market.mjs — screenshot harness for the rebuilt Market trade-intelligence scope.
//
// Boots the canonical game, starts New Game, docks, opens the Market tab, selects a commodity to
// populate the analysis stage, optionally injects an economy event to show the ripple/beam, and saves
// a screenshot to .devshots/market/. Used for the agy/grok visual-review loop.
//
// Run: node scripts/capture-market.mjs [view]
//   view: "rows" (default) | "stage" | "event" | "all"
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'market');
const VIEW = process.argv[2] || 'all';
mkdirSync(OUT_DIR, { recursive: true });

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await page.waitForSelector('[data-screen="mainMenu"]', { timeout: 15000 });
  await clickButton(page, 'New Game');
  await page.waitForSelector('[data-screen="newGame"] .sf-ng-route', { timeout: 10000 });
  await clickButton(page, 'Launch');
  await page.waitForFunction(() => {
    const sf = window.SF; const st = sf && sf.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive && p.hull > 0);
  }, null, { timeout: 90000 });

  // dock at the first non-gate station
  await page.evaluate(() => {
    const sf = window.SF; const state = sf.state;
    const station = state.entityList.find((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });

  // open market tab
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[data-screen="station"] [data-tab], [data-screen="station"] button')]
      .find((el) => /Market/i.test(el.textContent || '') || el.getAttribute('data-tab') === 'market');
    if (tab) tab.click();
  });
  await page.waitForSelector('[data-screen="station"] .st-market', { timeout: 10000 });

  // Seed representative data so the screenshots show the full scope: advance sim time so price
  // history accumulates, and inject a known sell route so the route beam + inspector populate.
  const seedCmdty = await page.evaluate(() => {
    const sf = window.SF; const state = sf.state;
    const stationId = state.ui && state.ui.dockedStationId;
    // advance ~12 economy ticks (60s) to build price history for sparklines/cones
    const econ = sf.registry && sf.registry.get && sf.registry.get('economy');
    for (let i = 0; i < 16; i++) { state.simTime += 5; if (econ && econ.econTick) econ.econTick(5, state); }
    // pick the cheapest commodity here as the demo route cargo (clearest margin)
    const markets = state.economy && state.economy.markets || {};
    const here = markets[stationId] || {};
    let pick = null, pickBuy = Infinity;
    for (const id in here) { const b = here[id] && here[id].lastBuy; if (b && b > 0 && b < pickBuy) { pickBuy = b; pick = id; } }
    if (pick) {
      state.economy.marketIntel = state.economy.marketIntel || {};
      state.economy.marketIntel.__cap_dest = {
        seenAtT: state.simTime || 0,
        snapshot: { [pick]: { sell: Math.ceil(pickBuy * 1.7), demand: 100 } },
      };
      state.world.sectors = state.world.sectors || {};
      state.world.sectors.__cap_sector = {
        id: '__cap_sector', name: 'Helios Rim',
        stations: [{ id: '__cap_dest', name: 'Rim Exchange', type: 'trade_hub' }],
      };
    }
    return pick;
  });
  await page.waitForTimeout(600); // let sparklines/effects settle

  // element-scoped capture helper: clips to the market panel bounds for a tight read
  async function shotMarket(name, selector) {
    const el = await page.$(selector);
    if (!el) { await page.screenshot({ path: join(OUT_DIR, name) }); return; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await el.screenshot({ path: join(OUT_DIR, name) });
  }

  if (VIEW === 'rows' || VIEW === 'all') {
    // scroll the row-head into the viewport, then clip-capture the sort header + first ~5 cards
    await page.evaluate(() => {
      const list = document.querySelector('[data-screen="station"] .st-list');
      if (list) list.scrollTop = 0;
      const head = document.querySelector('[data-screen="station"] .st-row-head');
      if (head) head.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => {
      const head = document.querySelector('[data-screen="station"] .st-row-head');
      const card = document.querySelector('[data-screen="station"] .st-list [data-cmdty]');
      if (!head || !card) return null;
      const hr = head.getBoundingClientRect();
      const cardH = card.getBoundingClientRect().height;
      return { x: Math.round(hr.left), y: Math.round(hr.top), w: Math.round(hr.width), h: Math.round(cardH * 5 + 24) };
    });
    if (box && box.w > 0 && box.h > 0) {
      await page.screenshot({ path: join(OUT_DIR, 'rows.png'), clip: { x: Math.max(0, box.x - 8), y: box.y, width: box.w + 16, height: Math.min(box.h, 540) } });
    }
    console.log('saved .devshots/market/rows.png');
  }

  if (VIEW === 'stage' || VIEW === 'all') {
    // select the commodity card that has the injected route, to populate the full analysis stage
    await page.evaluate((cid) => {
      const card = cid
        ? document.querySelector('[data-screen="station"] .st-list [data-cmdty="' + cid + '"]')
        : document.querySelector('[data-screen="station"] .st-list [data-cmdty]');
      if (card) card.click();
    }, seedCmdty);
    await page.waitForTimeout(1200); // stage effects + cone draw
    await shotMarket('stage.png', '[data-screen="station"] .st-market-stage');
    console.log('saved .devshots/market/stage.png');
  }

  if (VIEW === 'event' || VIEW === 'all') {
    // inject a shortage event on the selected commodity to trigger the ripple
    await page.evaluate((cid) => {
      const sf = window.SF; const state = sf.state;
      const stationId = state.ui && state.ui.dockedStationId;
      const cmdtyId = cid || (document.querySelector('[data-screen="station"] .st-list [data-cmdty]') || {}).getAttribute && document.querySelector('[data-screen="station"] .st-list [data-cmdty]').getAttribute('data-cmdty');
      if (!stationId || !cmdtyId) return;
      sf.bus.emit('economy:eventStarted', { type: 'shortage', stationId, commodityId: cmdtyId });
    }, seedCmdty);
    await page.waitForTimeout(450);
    await shotMarket('event.png', '[data-screen="station"] .st-market-stage');
    console.log('saved .devshots/market/event.png');
  }

  console.log('capture complete');
} catch (e) {
  console.error('capture failed:', e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

async function clickButton(page, text) {
  return await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === t);
    if (btn) { btn.click(); return true; } return false;
  }, text);
}

async function startFreshServer() {
  const port = await findFreePort(8210);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('Dev server exited before reachable');
    try { const r = await fetch(url); if (r.ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) {}
    await new Promise((res) => setTimeout(res, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const srv = createNetServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('No free local port found for market capture');
}
