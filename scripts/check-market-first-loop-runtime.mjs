#!/usr/bin/env node
// check-market-first-loop-runtime.mjs - browser smoke for first-session economy readability.
//
// Boots the canonical player URL, starts New Game through the UI, docks via the normal dock:docked
// event path, opens the station Market, and verifies the player can understand the first trade loop:
// credits/cargo context, station purpose, commodity purpose copy, live prices, actionable buy/sell
// labels, and a Best Trades row with current-run load/profit plus route actions. Test-only market
// intel is injected after live boot so the planner path is deterministic without changing content
// defaults or launch routes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 45000;
const DOCK_TIMEOUT_MS = 15000;
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
  assert.equal(new URL(page.url()).search, '', 'market first-loop probe must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');

  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game route rail');
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const station = state && state.entityList && state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return {
      stationId: station.data.stationId,
      label: station.data.name || station.data.stationName || station.data.stationId,
    };
  });

  await waitForVisible(page, '[data-screen="station"]', DOCK_TIMEOUT_MS, 'station hub after dock');

  const seededTrade = await page.evaluate((fallbackStationId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const stationId = state && state.ui && state.ui.dockedStationId || fallbackStationId;
    const markets = state && state.economy && state.economy.markets || {};
    const here = markets[stationId] || {};
    const cmdtyId = Object.keys(here).find((id) => here[id] && Number.isFinite(here[id].lastBuy) && here[id].lastBuy > 0);
    if (!cmdtyId) return null;
    const buyHere = here[cmdtyId].lastBuy;
    state.economy.marketIntel = state.economy.marketIntel || {};
    state.economy.marketIntel.__probe_trade_dest = {
      seenAtT: state.simTime || 0,
      snapshot: { [cmdtyId]: { sell: Math.ceil(buyHere * 1.7), demand: 100 } },
    };
    state.world.sectors = state.world.sectors || {};
    state.world.sectors.__probe_trade_sector = {
      id: '__probe_trade_sector',
      name: 'Probe Trade Sector',
      stations: [{ id: '__probe_trade_dest', name: 'Probe Buyer', type: 'trade_hub' }],
    };
    return { stationId, cmdtyId, buyHere };
  }, dockTarget.stationId);
  assert(seededTrade && seededTrade.cmdtyId, 'runtime probe should find a live commodity to seed Best Trades intel');

  await page.evaluate(() => {
    const marketTab = [...document.querySelectorAll('[data-screen="station"] [data-tab], [data-screen="station"] button')]
      .find((el) => /Market/i.test(el.textContent || '') || el.getAttribute('data-tab') === 'market');
    if (marketTab) marketTab.click();
  });
  await waitForVisible(page, '[data-screen="station"] .st-market', 10000, 'station market panel');
  await page.waitForTimeout(250);

  const report = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
    };
    const text = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    const market = document.querySelector('[data-screen="station"] .st-market');
    const rows = [...document.querySelectorAll('[data-screen="station"] .st-market .st-list [data-cmdty]')];
    const sampled = rows.slice(0, 5).map((row) => ({
      commodityId: row.getAttribute('data-cmdty'),
      name: text(row.querySelector('.c-name')),
      purpose: text(row.querySelector('.st-cmdty-purpose')),
      owned: text(row.querySelector('.st-owned')),
      buy: text(row.querySelector('.st-buy')),
      sell: text(row.querySelector('.st-sell')),
      buyTitle: row.querySelector('.st-buy-btn')?.getAttribute('aria-label') || row.querySelector('.st-buy-btn')?.title || '',
      sellTitle: row.querySelector('.st-sell-btn')?.getAttribute('aria-label') || row.querySelector('.st-sell-btn')?.title || '',
      buyDisabled: !!row.querySelector('.st-buy-btn')?.disabled,
      sellDisabled: !!row.querySelector('.st-sell-btn')?.disabled,
    }));
    const plannerRows = [...document.querySelectorAll('[data-screen="station"] .st-planner-row')]
      .map((row) => text(row));
    const plannerRunTexts = [...document.querySelectorAll('[data-screen="station"] .st-pl-run')]
      .map((row) => text(row));
    return {
      marketVisible: visible(market),
      stationText: text(document.querySelector('[data-screen="station"]')),
      purpose: text(document.querySelector('[data-screen="station"] .st-market-purpose')),
      credits: text(document.querySelector('[data-screen="station"] .st-credits')),
      cargo: text(document.querySelector('[data-screen="station"] .st-cargo')),
      searchVisible: visible(document.querySelector('[data-screen="station"] .sf-list-search input, [data-screen="station"] input[placeholder*="Search"]')),
      sortHeaders: [...document.querySelectorAll('[data-screen="station"] .st-row-head .sf-sort')].map((el) => text(el)),
      rowCount: rows.length,
      sampled,
      plannerVisible: visible(document.querySelector('[data-screen="station"] .st-market-planner')),
      plannerRows,
      plannerRunTexts,
      plannerEmpty: text(document.querySelector('[data-screen="station"] .st-planner-empty')),
      loadButtonText: text(document.querySelector('[data-screen="station"] .st-pl-load')),
      navButtonText: text(document.querySelector('[data-screen="station"] .st-pl-nav')),
    };
  });

  assert.equal(report.marketVisible, true, 'Market panel should be visible after docking');
  assert.match(report.purpose, /Market loop:/, 'Market should expose an explicit loop-purpose rail');
  assert.match(report.purpose, /credits|cargo|buy|sell|routes|trade|modules|fuel|repairs/i,
    'Market purpose copy should explain why trading matters');
  assert.match(report.credits, /\d/, 'Market header should show current credits');
  assert.match(report.cargo, /\d+\s*\/\s*\d+\s*u/i, 'Market header should show cargo used/capacity');
  assert.equal(report.searchVisible, true, 'Market should expose commodity search');
  for (const header of ['Commodity', 'Owned', 'Buy', 'Sell']) {
    assert(report.sortHeaders.some((label) => label.includes(header)), 'Market missing sortable header: ' + header);
  }
  assert(report.rowCount > 0, 'Market should show at least one traded commodity at the first dockable station');

  for (const row of report.sampled) {
    assert(row.name, 'Commodity row should show a name: ' + JSON.stringify(row));
    assert.match(row.purpose, /credits|cargo|profit|supply|demand|upgrade|mission|risk|sell|buy|feed/i,
      'Commodity row should explain the economic purpose: ' + JSON.stringify(row));
    assert.match(row.buy, /\d/, 'Commodity row should show a numeric buy price: ' + JSON.stringify(row));
    assert.match(row.sell, /\d/, 'Commodity row should show a numeric sell price: ' + JSON.stringify(row));
    assert.notEqual(row.buy, '0', 'Commodity buy price should not read as zero: ' + JSON.stringify(row));
    assert.notEqual(row.sell, '0', 'Commodity sell price should not read as zero: ' + JSON.stringify(row));
    assert.match(row.buyTitle + ' ' + row.sellTitle, /CR|cargo|credits|mission|hulls|modules|fuel|repairs/i,
      'Buy/sell controls should expose actionable trade consequences: ' + JSON.stringify(row));
  }

  assert.equal(report.plannerVisible, true, 'Best Trades planner should be visible in the Market panel');
  assert(report.plannerRows.length > 0, 'Seeded first-loop market intel should create a Best Trades row');
  assert(report.plannerRows.some((row) => /buy/i.test(row) && /sell/i.test(row) && /\+/.test(row)),
    'Best Trades row should show buy/sell spread and margin: ' + JSON.stringify(report.plannerRows));
  assert(report.plannerRunTexts.some((row) => /load\s+\d+/i.test(row) && /\+\d[\d,]*\s+CR/i.test(row)),
    'Best Trades row should show current-run load and expected profit: ' + JSON.stringify(report.plannerRunTexts));
  assert.equal(report.loadButtonText, 'Load & Nav', 'Best Trades row should expose a route-load action');
  assert.equal(report.navButtonText, 'Set Nav', 'Best Trades row should expose Set Nav');

  const navReport = await page.evaluate(() => {
    const btn = document.querySelector('[data-screen="station"] .st-pl-nav');
    if (!btn) return { clicked: false };
    btn.click();
    const sf = window.SF;
    const waypoint = sf.state && sf.state.nav && sf.state.nav.waypoint;
    const toastText = [...document.querySelectorAll('.toast, .sf-toast, [class*="toast"]')]
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' | ');
    return { clicked: true, waypoint, toastText };
  });

  assert.equal(navReport.clicked, true, 'Set Nav should be clickable');
  assert.equal(navReport.waypoint && navReport.waypoint.kind, 'trade', 'Set Nav should create a trade waypoint');
  assert.equal(navReport.waypoint && navReport.waypoint.stationId, '__probe_trade_dest', 'Set Nav should target the seeded buyer station');
  assert.match((navReport.waypoint && navReport.waypoint.label) || '', /Probe Buyer/, 'Trade waypoint should name the buyer station');

  const loadStart = await page.evaluate(() => {
    const btn = document.querySelector('[data-screen="station"] .st-pl-load');
    if (!btn) return { clicked: false };
    const sf = window.SF;
    const cmdtyId = btn.getAttribute('data-cmdty');
    const beforeQty = (sf.state.player.cargo.items[cmdtyId]) || 0;
    btn.click();
    return {
      clicked: true,
      cmdtyId,
      requestedQty: Number(btn.getAttribute('data-qty') || 0),
      beforeQty,
      confirmOpen: !!document.querySelector('#sf-confirm-root .sf-confirm'),
    };
  });
  assert.equal(loadStart.clicked, true, 'Load & Nav should be clickable');
  assert(loadStart.requestedQty > 0, 'Load & Nav should request a positive route load');
  if (loadStart.confirmOpen) {
    await page.locator('#sf-confirm-root .sf-confirm__ok').click({ timeout: 10000 });
  }
  await page.waitForFunction(({ cmdtyId, beforeQty }) => {
    const sf = window.SF;
    const afterQty = (sf.state.player.cargo.items[cmdtyId]) || 0;
    const waypoint = sf.state && sf.state.nav && sf.state.nav.waypoint;
    return afterQty > beforeQty && waypoint && waypoint.kind === 'trade' && waypoint.stationId === '__probe_trade_dest';
  }, { cmdtyId: loadStart.cmdtyId, beforeQty: loadStart.beforeQty }, { timeout: 5000 });
  const loadReport = await page.evaluate((cmdtyId) => {
    const sf = window.SF;
    const waypoint = sf.state && sf.state.nav && sf.state.nav.waypoint;
    const departureChips = [...document.querySelectorAll('[data-screen="station"] .st-departure-chip')].map((chip) => ({
      label: (chip.querySelector('b')?.textContent || '').trim(),
      text: (chip.querySelector('span')?.textContent || '').trim(),
      className: chip.className,
    }));
    return {
      afterQty: (sf.state.player.cargo.items[cmdtyId]) || 0,
      waypoint,
      departureChips,
    };
  }, loadStart.cmdtyId);
  assert(loadReport.afterQty > loadStart.beforeQty,
    'Load & Nav should buy cargo through the economy path: ' + JSON.stringify({ loadStart, loadReport }));
  assert.equal(loadReport.waypoint && loadReport.waypoint.commodityId, loadStart.cmdtyId,
    'Trade waypoint should retain the route commodity id');
  assert.equal(loadReport.waypoint && loadReport.waypoint.stationId, '__probe_trade_dest',
    'Load & Nav should keep nav on the seeded buyer station');
  assert(loadReport.departureChips.some((chip) => chip.label === 'Route' && /Probe Buyer/.test(chip.text) && /\d/.test(chip.text)),
    'Departure Check should summarize loaded trade route cargo: ' + JSON.stringify(loadReport.departureChips));

  const destinationPrep = await page.evaluate((cmdtyId) => {
    const sf = window.SF;
    const state = sf.state;
    const sourceStationId = state.ui && state.ui.dockedStationId;
    const sourceEntry = state.economy.markets[sourceStationId] && state.economy.markets[sourceStationId][cmdtyId];
    if (!sourceEntry) return { ok: false, reason: 'missing-source-market', sourceStationId, cmdtyId };
    state.economy.markets.__probe_trade_dest = state.economy.markets.__probe_trade_dest || {};
    state.economy.markets.__probe_trade_dest[cmdtyId] = {
      ...sourceEntry,
      role: 'consume',
      stock: Math.max(1, Math.floor((sourceEntry.baseEq || 100) * 0.38)),
      equilibrium: sourceEntry.equilibrium || sourceEntry.baseEq || 100,
      baseEq: sourceEntry.baseEq || 100,
      eventMods: [],
    };
    sf.bus.emit('dock:undocked', {});
    return {
      ok: true,
      sourceStationId,
      beforeQty: (state.player.cargo.items[cmdtyId]) || 0,
      beforeCredits: state.player.credits || 0,
    };
  }, loadStart.cmdtyId);
  assert.equal(destinationPrep.ok, true, 'Destination market prep should have a source market: ' + JSON.stringify(destinationPrep));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const stack = sf.state && sf.state.ui && sf.state.ui.screenStack || [];
    return sf.state && sf.state.ui && sf.state.ui.docked === false && !stack.includes('station');
  }, null, { timeout: 5000 });
  await page.evaluate(() => { window.SF.bus.emit('dock:docked', { stationId: '__probe_trade_dest' }); });
  await waitForVisible(page, '[data-screen="station"] .st-market-route', DOCK_TIMEOUT_MS, 'route destination callout');
  const destinationReport = await page.evaluate(() => {
    const text = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    const route = document.querySelector('[data-screen="station"] .st-market-route');
    const btn = route && route.querySelector('[data-act="route-sell"]');
    return {
      dockedStationId: window.SF.state.ui && window.SF.state.ui.dockedStationId,
      routeText: text(route),
      sellButtonText: text(btn),
      sellDisabled: !!(btn && btn.disabled),
    };
  });
  assert.equal(destinationReport.dockedStationId, '__probe_trade_dest',
    'Destination route probe should dock at the seeded buyer: ' + JSON.stringify(destinationReport));
  assert.match(destinationReport.routeText, /TRADE ROUTE DESTINATION/i,
    'Destination Market should identify route arrival: ' + JSON.stringify(destinationReport));
  assert.match(destinationReport.routeText, /Probe Buyer/i,
    'Destination Market should name the buyer station: ' + JSON.stringify(destinationReport));
  assert.equal(destinationReport.sellButtonText, 'Sell Route Cargo',
    'Destination Market should expose a route sell action: ' + JSON.stringify(destinationReport));
  assert.equal(destinationReport.sellDisabled, false,
    'Route sell action should be enabled while cargo is aboard: ' + JSON.stringify(destinationReport));

  await page.evaluate(() => {
    document.querySelector('[data-screen="station"] .st-market-route [data-act="route-sell"]').click();
  });
  await page.waitForFunction(({ cmdtyId, beforeQty, beforeCredits }) => {
    const sf = window.SF;
    const qty = (sf.state.player.cargo.items[cmdtyId]) || 0;
    const credits = sf.state.player.credits || 0;
    return qty < beforeQty && credits > beforeCredits;
  }, { cmdtyId: loadStart.cmdtyId, beforeQty: destinationPrep.beforeQty, beforeCredits: destinationPrep.beforeCredits }, { timeout: 5000 });
  const routeSellReport = await page.evaluate((cmdtyId) => ({
    afterQty: (window.SF.state.player.cargo.items[cmdtyId]) || 0,
    credits: window.SF.state.player.credits || 0,
  }), loadStart.cmdtyId);
  assert(routeSellReport.afterQty < destinationPrep.beforeQty,
    'Sell Route Cargo should unload the route commodity through the economy path: ' + JSON.stringify({ destinationPrep, routeSellReport }));
  assert.deepEqual(issues.errorIssues(), [], 'market first-loop runtime probe should not record page errors');

  console.log('Market first-loop runtime OK: New Game -> dock -> Market purpose/prices/Best Trades/Load & Nav/route sell are legible.');
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
  throw new Error('No free local port found for market first-loop runtime check');
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
