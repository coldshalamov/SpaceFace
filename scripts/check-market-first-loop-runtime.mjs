#!/usr/bin/env node
// check-market-first-loop-runtime.mjs — browser smoke for first-session economy readability.
//
// DESIGN TRUTH (src/ui/station/screens/market.js): the Market is an instrument, not a table — a
// commodity list with live price + trend, a central price chart, a BUY/SELL console, and a Trade
// Routes panel that shows the best known runs (profit) with one-click "Set Course". First-loop bar:
// a new player can read prices, actually trade (credits move), and plot a profitable route.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MARKET_CAPTURE = process.env.SF_MARKET_CAPTURE || '';
const START_TIMEOUT_MS = 90000;
const DOCK_TIMEOUT_MS = 15000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
let issues = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  issues = collectPageIssues(page, { includeWarnings: true });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'market first-loop probe must use the canonical root URL with no query flags');
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game rail');
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId };
  });
  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock after dock');

  // Open Market so its live market initialises (onShow emits economy:marketOpened), then seed a
  // known higher-priced buyer elsewhere so the Trade Routes panel has a profitable run to show.
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="market"]');
  await waitForVisible(page, '[data-screen="station"] .sx-mkt', 8000, 'Market instrument');
  const seeded = await page.evaluate(() => {
    const state = window.SF.state;
    const stationId = state.ui.dockedStationId;
    const here = (state.economy.markets && state.economy.markets[stationId]) || {};
    const cmdtyId = Object.keys(here).find((id) => here[id] && Number.isFinite(here[id].lastBuy) && here[id].lastBuy > 0)
      || Object.keys(here)[0];
    if (!cmdtyId) return null;
    const buyHere = here[cmdtyId].lastBuy || here[cmdtyId].buy || 50;
    state.economy.marketIntel = state.economy.marketIntel || {};
    state.economy.marketIntel.__probe_trade_dest = {
      seenAtT: state.simTime || 0,
      snapshot: { [cmdtyId]: { sell: Math.ceil(buyHere * 1.8), demand: 100 } },
    };
    state.world = state.world || {};
    state.world.sectors = state.world.sectors || {};
    state.world.sectors.__probe_trade_sector = {
      id: '__probe_trade_sector', name: 'Probe Trade Sector',
      stations: [{ id: '__probe_trade_dest', name: 'Probe Buyer', type: 'trade_hub' }],
    };
    return { stationId, cmdtyId, buyHere };
  });
  assert.ok(seeded && seeded.cmdtyId, 'probe should find a live commodity to seed route intel');

  // re-render market so routes pick up the seeded intel
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="factions"]');
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="market"]');
  await page.waitForTimeout(200);

  // ---- readability: list rows with prices + trend, a price chart, stats ----
  const readable = await page.evaluate(() => {
    const text = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    const rows = [...document.querySelectorAll('[data-screen="station"] .sx-mkt-row[data-cmdty]')];
    return {
      rowCount: rows.length,
      sampled: rows.slice(0, 5).map((r) => ({
        id: r.getAttribute('data-cmdty'),
        name: text(r.querySelector('.sx-mkt-row__name')),
        price: text(r.querySelector('.sx-mkt-row__price')),
        trend: text(r.querySelector('.sx-mkt-row__tr')),
      })),
      chart: !!document.querySelector('[data-screen="station"] .sx-mkt-chart'),
      stats: [...document.querySelectorAll('[data-screen="station"] .sx-mkt-stats .sx-stat__k')].map((k) => text(k)),
      // The docked credit readout lives in the fascia purse. `.sx-credits__v` was a SUPERSEDED
      // design: no JavaScript in src/ ever emitted that markup, so this assertion had been reading
      // an element that does not exist and reporting the game broken. Verified live in the station
      // lab -- `.sxb-purse__value` reads "12,453" under a "Credits" label while `.sx-credits` is
      // absent from the DOM entirely.
      credits: text(document.querySelector('[data-screen="station"] .sxb-purse__value')),
    };
  });
  assert.ok(readable.rowCount > 0, 'Market should list at least one traded commodity at the first dockable station');
  for (const row of readable.sampled) {
    assert.ok(row.name, 'commodity row should show a name: ' + JSON.stringify(row));
    assert.match(row.price, /\d/, 'commodity row should show a numeric price: ' + JSON.stringify(row));
    assert.notEqual(row.price.replace(/[^\d]/g, ''), '0', 'commodity price should not read as zero: ' + JSON.stringify(row));
    assert.match(row.trend, /%/, 'commodity row should show a trend %: ' + JSON.stringify(row));
  }
  assert.equal(readable.chart, true, 'Market should render a price chart for the selected commodity');
  for (const stat of ['Buy', 'Sell', 'Demand']) {
    assert.ok(readable.stats.some((s) => new RegExp(stat, 'i').test(s)), 'Market stats should include ' + stat + ': ' + JSON.stringify(readable.stats));
  }
  assert.match(readable.credits, /\d/, 'the docked view should show current credits');

  // ---- trade: a real BUY moves credits (the loop actually works) ----
  const c0 = await page.evaluate(() => window.SF.state.player.credits);
  await domClick(page, '[data-screen="station"] .sx-mkt-row');
  await page.waitForTimeout(200);
  await domClick(page, '[data-screen="station"] .sx-trade__go[data-go]');
  await page.waitForFunction((prev) => window.SF.state.player.credits !== prev, c0, { timeout: 6000 })
    .catch(() => { throw new Error('a Market BUY should move the player\'s credits (trade must actually execute)'); });
  const c1 = await page.evaluate(() => window.SF.state.player.credits);
  assert.ok(c1 < c0, 'buying should spend credits: ' + c0 + ' -> ' + c1);

  // ---- cargo handoff: the common "sell what I hauled" action must open the same Market in
  // sell mode and focus its list on what is actually in the hold, even when Market is already open.
  await domClick(page, '[data-screen="station"] .sxb-hstep[data-handoff="market"][data-handoff-mode="sell"]');
  await page.waitForFunction(() => {
    const active = document.querySelector('[data-screen="station"] .sx-seg__btn.is-on');
    return active && active.getAttribute('data-mode') === 'sell';
  }, null, { timeout: 5000 });
  const sellHandoff = await page.evaluate(() => {
    const state = window.SF.state;
    const rows = [...document.querySelectorAll('[data-screen="station"] .sx-mkt-row[data-cmdty]')]
      .map((row) => row.getAttribute('data-cmdty'));
    const selected = document.querySelector('[data-screen="station"] .sx-mkt-row.is-active');
    const selectedId = selected && selected.getAttribute('data-cmdty');
    return {
      rows,
      rowHeld: rows.map((id) => Number(state.player.cargo.items[id] || 0)),
      selectedId,
      held: selectedId && Number(state.player.cargo.items[selectedId] || 0),
      mode: document.querySelector('[data-screen="station"] .sx-seg__btn.is-on')?.getAttribute('data-mode'),
    };
  });
  assert.equal(sellHandoff.mode, 'sell', 'cargo handoff should open the sell console');
  assert.ok(sellHandoff.rows.length > 0, 'cargo handoff should retain sellable cargo rows');
  assert.ok(sellHandoff.rowHeld.every((qty) => qty > 0),
    'cargo handoff should focus an item that is actually in the player hold: ' + JSON.stringify(sellHandoff));
  assert.ok(sellHandoff.held > 0, 'cargo handoff should select a hauled item ready to sell: ' + JSON.stringify(sellHandoff));
  if (MARKET_CAPTURE) {
    const file = join(ROOT, MARKET_CAPTURE);
    await mkdir(dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'png' });
    console.log('Market screenshot:', file);
  }

  // ---- routes: best-run panel shows a profitable run + Set Course plots a trade waypoint ----
  const routes = await page.evaluate(() => {
    const text = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('[data-screen="station"] .sx-mkt__routes');
    const rows = [...document.querySelectorAll('[data-screen="station"] .sx-route-row')];
    return {
      panel: !!panel,
      rows: rows.map((r) => ({
        text: text(r),
        profit: text(r.querySelector('.sx-route-row__s')),
        hasCourse: !!r.querySelector('[data-course]'),
        dest: (r.querySelector('[data-course]') || {}).getAttribute && r.querySelector('[data-course]').getAttribute('data-dest'),
      })),
    };
  });
  assert.equal(routes.panel, true, 'Market should show a Trade Routes panel');
  assert.ok(routes.rows.length > 0, 'seeded route intel should produce at least one trade route');
  assert.ok(routes.rows.some((r) => /\+\d/.test(r.profit)), 'a trade route should disclose expected profit: ' + JSON.stringify(routes.rows));
  assert.ok(routes.rows.every((r) => r.hasCourse), 'each trade route should expose a Set Course action: ' + JSON.stringify(routes.rows));

  const probeRow = routes.rows.find((r) => r.dest === '__probe_trade_dest');
  assert.ok(probeRow, 'the seeded buyer should appear as a route destination: ' + JSON.stringify(routes.rows));
  const nav = await page.evaluate(() => {
    const btn = document.querySelector('[data-screen="station"] .sx-route-row [data-course][data-dest="__probe_trade_dest"]');
    if (!btn) return { clicked: false };
    btn.click();
    const wp = window.SF.state.nav && window.SF.state.nav.waypoint;
    return { clicked: true, waypoint: wp };
  });
  assert.equal(nav.clicked, true, 'Set Course should be clickable');
  assert.equal(nav.waypoint && nav.waypoint.kind, 'trade', 'Set Course should plot a trade waypoint');
  assert.equal(nav.waypoint && nav.waypoint.stationId, '__probe_trade_dest', 'Set Course should target the seeded buyer station');

  assert.deepEqual(issues.errorIssues(), [], 'market first-loop probe should not record page errors');
  console.log('Market first loop OK: readable prices + chart -> BUY moves credits -> Trade Routes profit + Set Course plots a trade waypoint');
  console.log('Dock target:', dockTarget.stationId, 'commodity:', seeded.cmdtyId);
} catch (err) {
  if (typeof issues !== 'undefined' && issues) console.error('Captured page issues during run:', issues.issues);
  throw err;
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function domClick(page, selector) {
  const ok = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }, selector);
  assert.equal(ok, true, 'probe should be able to click: ' + selector);
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => { throw new Error('Timed out waiting for ' + label + ': ' + err.message); });
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const exact = [...document.querySelectorAll('button')].find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')].find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8390);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for the market first-loop runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try { const res = await fetch(url, { method: 'GET' }); return !!res.ok; } catch (_) { return false; }
}
