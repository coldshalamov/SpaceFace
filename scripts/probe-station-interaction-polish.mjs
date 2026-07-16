// Live-browser acceptance probe for station interaction polish.
// Exercises the real game route and writes screenshots + metrics to .devshots/station-polish/.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROFILE = String(process.env.SF_PROBE_PROFILE || 'latest').replace(/[^a-z0-9@._-]/gi, '');
const OUT = join(ROOT, '.devshots', 'station-polish', PROFILE);
const TRANSITION_TRACE_MS = Math.max(0, Number(process.env.SF_TRACE_TRANSITION_MS) || 0);
mkdirSync(OUT, { recursive: true });

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 70; attempt++) {
    try {
      const response = await fetch(baseUrl);
      if (response.status) return { child, baseUrl };
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('server start timeout');
}

function rectSummary(rect) {
  if (!rect) return null;
  const x = Number.isFinite(rect.x) ? rect.x : rect.left;
  const y = Number.isFinite(rect.y) ? rect.y : rect.top;
  const width = Number.isFinite(rect.width) ? rect.width : Math.max(0, rect.right - rect.left);
  const height = Number.isFinite(rect.height) ? rect.height : Math.max(0, rect.bottom - rect.top);
  const right = Number.isFinite(rect.right) ? rect.right : x + width;
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : y + height;
  return {
    x: Number(x.toFixed(2)), y: Number(y.toFixed(2)),
    width: Number(width.toFixed(2)), height: Number(height.toFixed(2)),
    right: Number(right.toFixed(2)), bottom: Number(bottom.toFixed(2)),
  };
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

let server = null;
let browser = null;
const failures = [];
const report = {};

function requireProbe(condition, message) {
  if (!condition) failures.push(message);
}

try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: process.env.SF_PROBE_HEADED !== '1',
    args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const pageErrors = [];
  const previewConsole = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error)));
  page.on('console', (message) => {
    if (/shipPreviewMount|partsLibrary|authored/i.test(message.text())) {
      previewConsole.push({ type: message.type(), text: message.text() });
    }
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* optional */ }
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Station Polish Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false);
  }, null, { timeout: 120000 });
  await page.evaluate(() => {
    const state = window.SF.state;
    const station = state.entityList.find((entity) => entity && entity.type === 'station'
      && entity.data && entity.data.stationId && !entity.data.isGate);
    if (!station) throw new Error('No station entity found');
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.click('[data-nav="shipworks"]');
  await page.waitForSelector('.sx-sw__canvas[data-preview-ready="true"]', { timeout: 30000 });
  await page.waitForSelector('[data-spatial-slot]', { timeout: 15000 });
  await page.waitForFunction(() => {
    const state = document.querySelector('.sx-sw__canvas')?.dataset.previewAssetState;
    return state && state !== 'loading';
  }, null, { timeout: 30000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, '01-shipworks.png') });

  // A selected hardpoint may change its reticle, but the projected button anchor cannot move.
  const hardpointBefore = await page.locator('[data-spatial-slot]').first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });
  report.hardpointHitStack = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).slice(0, 8)
    .map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.className && typeof node.className === 'string' ? `.${node.className.trim().replace(/\s+/g, '.')}` : ''}`),
  { x: hardpointBefore.cx, y: hardpointBefore.cy });
  requireProbe(report.hardpointHitStack.some((entry) => entry.includes('sx-hardpoint')),
    `Hardpoint is not present in its hit-test stack (${report.hardpointHitStack.join(' > ')})`);
  await page.locator('[data-spatial-slot]').first().evaluate((node) => node.click());
  await page.waitForSelector('.sx-sw__chooser.is-open', { timeout: 5000 });
  await page.waitForTimeout(240);
  const hardpointAfter = await page.locator('[data-spatial-slot].is-selected').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });
  const anchorShift = Math.hypot(hardpointAfter.cx - hardpointBefore.cx, hardpointAfter.cy - hardpointBefore.cy);
  report.hardpoint = { before: rectSummary(hardpointBefore), after: rectSummary(hardpointAfter), anchorShiftPx: Number(anchorShift.toFixed(3)) };
  requireProbe(anchorShift <= 1, `Selected hardpoint shifted ${anchorShift.toFixed(2)}px`);
  await page.screenshot({ path: join(OUT, '02-hardpoint-focused.png') });
  await page.locator('.sx-chooser__scrim').evaluate((node) => node.click());
  await page.waitForFunction(() => !document.querySelector('.sx-sw__chooser.is-open'));
  await page.waitForTimeout(240);

  // Horizontal trackpad motion must orbit the whole ship, which moves its projected nodes.
  const orbitBefore = await page.locator('[data-spatial-slot]').first().boundingBox();
  await page.locator('.sx-sw__canvas').dispatchEvent('wheel', { deltaX: 180, deltaY: 0, deltaMode: 0 });
  await page.waitForTimeout(120);
  const orbitAfter = await page.locator('[data-spatial-slot]').first().boundingBox();
  const orbitShift = orbitBefore && orbitAfter
    ? Math.hypot((orbitAfter.x - orbitBefore.x), (orbitAfter.y - orbitBefore.y)) : 0;
  report.trackpadOrbit = { before: rectSummary(orbitBefore), after: rectSummary(orbitAfter), projectedNodeShiftPx: Number(orbitShift.toFixed(2)) };
  requireProbe(orbitShift >= 2, `Horizontal wheel did not visibly orbit the ship (${orbitShift.toFixed(2)}px node movement)`);

  // Buy Ship is a styled carousel: no native scrollbar, taller role-specific entries.
  await page.click('[data-mode="buy"]');
  await page.waitForSelector('[data-buy="ship_leviathan"]');
  await page.waitForTimeout(200);
  const rail = await page.evaluate(() => {
    const list = document.querySelector('.sx-sw__list');
    const rows = [...document.querySelectorAll('.sx-sw-row[data-buy]')];
    const style = getComputedStyle(list);
    const names = rows.map((row) => row.querySelector('.sx-sw-row__name')?.textContent?.trim());
    const silhouettes = rows.map((row) => row.querySelector('.sx-shipmark')?.innerHTML || '');
    const firstRect = rows[0] && rows[0].getBoundingClientRect();
    return {
      modeLabel: document.querySelector('[data-mode="buy"]')?.textContent?.trim(),
      oldLabelCount: [...document.querySelectorAll('button')].filter((button) => /buy hull/i.test(button.textContent || '')).length,
      scrollbarWidth: style.scrollbarWidth,
      webkitScrollbarDisplay: getComputedStyle(list, '::-webkit-scrollbar').display,
      rowHeight: firstRect ? firstRect.height : 0,
      shipCount: rows.length,
      uniqueSilhouettes: new Set(silhouettes).size,
      names,
      hasProgressTrack: !!document.querySelector('.sx-sw__railtrack i'),
      hasPagingControls: document.querySelectorAll('[data-rail-step]').length === 2,
    };
  });
  report.buyShipRail = rail;
  requireProbe(rail.modeLabel === 'Buy Ship', `Expected Buy Ship label, got ${rail.modeLabel}`);
  requireProbe(rail.oldLabelCount === 0, 'Buy Hull copy remains in the live controls');
  requireProbe(rail.scrollbarWidth === 'none' || rail.webkitScrollbarDisplay === 'none', 'Native horizontal scrollbar is still visible');
  requireProbe(rail.rowHeight >= 70, `Ship controls are still too thin (${rail.rowHeight}px)`);
  requireProbe(rail.shipCount > 1 && rail.uniqueSilhouettes === rail.shipCount,
    `Ship silhouettes are not unique (${rail.uniqueSilhouettes}/${rail.shipCount})`);
  requireProbe(rail.hasProgressTrack && rail.hasPagingControls, 'Custom carousel controls are incomplete');
  await page.screenshot({ path: join(OUT, '03-buy-ship-carousel.png') });

  // Leviathan must be framed without requiring pointer input to reveal it.
  await page.evaluate(() => document.querySelector('[data-buy="ship_leviathan"]')?.click());
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.sx-sw__canvas');
    return canvas && canvas.dataset.previewDefId === 'ship_leviathan' && canvas.dataset.previewReady === 'true';
  }, null, { timeout: 30000 });
  if (TRANSITION_TRACE_MS > 0) {
    const startedAt = Date.now();
    let lastSignature = '';
    let captureIndex = 0;
    report.leviathanTransition = [];
    while (Date.now() - startedAt < TRANSITION_TRACE_MS) {
      const sample = await page.evaluate(() => {
        const canvas = document.querySelector('.sx-sw__canvas');
        const visible = typeof canvas?.__sfPreviewDiagnostics === 'function'
          ? canvas.__sfPreviewDiagnostics().filter((entry) => entry.displayed && entry.inCurrent)
          : [];
        return {
          assetState: canvas?.dataset.previewAssetState || 'missing',
          meshCount: visible.length,
          geometrySignature: visible.map((entry) => `${entry.type}:${entry.geometry}:${entry.geometryRadius}`).join('|'),
        };
      });
      const signature = `${sample.assetState}:${sample.meshCount}:${sample.geometrySignature}`;
      if (signature !== lastSignature) {
        sample.elapsedMs = Date.now() - startedAt;
        report.leviathanTransition.push(sample);
        await page.screenshot({ path: join(OUT, `04-transition-${String(captureIndex++).padStart(2, '0')}-${sample.assetState}.png`) });
        lastSignature = signature;
      }
      if (sample.assetState === 'authored' || /fallback-after-error|unavailable/.test(sample.assetState)) break;
      await page.waitForTimeout(100);
    }
    report.previewConsole = previewConsole;
    requireProbe(
      report.leviathanTransition.length === 1,
      `Leviathan changed visual roots before input (${report.leviathanTransition.map((entry) => entry.assetState).join(' -> ')})`,
    );
  }
  await page.waitForTimeout(850);
  report.leviathan = await page.evaluate(() => {
    const canvas = document.querySelector('.sx-sw__canvas');
    return {
      defId: canvas?.dataset.previewDefId,
      ready: canvas?.dataset.previewReady,
      assetState: canvas?.dataset.previewAssetState,
      width: canvas?.width,
      height: canvas?.height,
      cssWidth: canvas?.clientWidth,
      cssHeight: canvas?.clientHeight,
      visibleMeshes: typeof canvas?.__sfPreviewDiagnostics === 'function'
        ? canvas.__sfPreviewDiagnostics().filter((entry) => entry.displayed) : [],
    };
  });
  requireProbe(report.leviathan.defId === 'ship_leviathan' && report.leviathan.ready === 'true', 'Leviathan did not render before input');
  requireProbe(report.leviathan.width >= report.leviathan.cssWidth * 1.9, 'Leviathan canvas is not DPR-aware');
  await page.screenshot({ path: join(OUT, '04-leviathan-before-input.png') });
  await page.locator('.sx-sw__canvas').dispatchEvent('wheel', { deltaX: 180, deltaY: 0, deltaMode: 0 });
  await page.waitForTimeout(140);
  report.leviathan.afterInputAssetState = await page.locator('.sx-sw__canvas').getAttribute('data-preview-asset-state');
  await page.screenshot({ path: join(OUT, '04b-leviathan-after-input.png') });

  // The help button must be circular and correctly centered.
  const help = await page.evaluate(() => {
    const button = document.querySelector('.sx-context-help');
    const rect = button?.getBoundingClientRect();
    const style = button && getComputedStyle(button);
    if (!rect || !style) return null;
    return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height }, borderRadius: style.borderRadius,
      display: style.display, placeItems: style.placeItems };
  });
  report.help = help && { rect: rectSummary(help.rect), borderRadius: help.borderRadius, display: help.display, placeItems: help.placeItems };
  requireProbe(help && Math.abs(help.rect.width - help.rect.height) <= 1, 'Help control is not circular');

  // Exercise the real Market loop. The handoff must carry Sell + owned-only context, and the real
  // economy receipt must land in Comms rather than over the next transaction control.
  await page.click('[data-nav="market"]');
  await page.waitForSelector('.sx-mkt__trade');
  // Market selection must be a readable commodity browser, not a field of anonymous overlapping
  // hover targets. It also needs to remain DOM-stable across the station's periodic refresh cadence
  // so a pointer target cannot disappear and re-enter under the cursor (visible grow/shrink flicker).
  report.marketBrowser = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.sx-mkt__list [data-cmdty]')];
    const labels = rows.map((row) => row.querySelector('.sx-mkt-row__name'));
    const rects = rows.map((row) => row.getBoundingClientRect());
    const overlaps = [];
    let overlapPoint = null;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (area > Math.min(a.width * a.height, b.width * b.height) * 0.1) {
          overlaps.push([i, j]);
          if (!overlapPoint) overlapPoint = {
            x: (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2,
            y: (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2,
          };
        }
      }
    }
    window.__sfMarketProbeTarget = rows[0] || null;
    return {
      count: rows.length,
      hasSearch: !!document.querySelector('[data-market-search]'),
      hasFilters: !!document.querySelector('[data-market-filter]'),
      anonymousCircles: rows.filter((row) => {
        const style = getComputedStyle(row);
        const rect = row.getBoundingClientRect();
        return rect.width <= 40 && style.borderRadius === '50%';
      }).length,
      hiddenLabels: labels.filter((label) => label && Number(getComputedStyle(label).opacity) < 0.9).length,
      overlapPairs: overlaps.length,
      overlapPoint,
      minWidth: rects.length ? Math.min(...rects.map((rect) => rect.width)) : 0,
    };
  });
  if (report.marketBrowser.overlapPoint) {
    await page.mouse.move(report.marketBrowser.overlapPoint.x, report.marketBrowser.overlapPoint.y);
    report.marketBrowser.hoverTrace = await page.evaluate(async () => {
      const samples = [];
      for (let i = 0; i < 60; i++) {
        const hovered = document.querySelector('.sx-mkt-row:hover');
        samples.push({
          id: hovered?.getAttribute('data-cmdty') || null,
          width: hovered ? Number(hovered.getBoundingClientRect().width.toFixed(2)) : 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const transitions = samples.reduce((count, sample, index) =>
        count + (index > 0 && sample.id !== samples[index - 1].id ? 1 : 0), 0);
      return { samples, transitions, uniqueTargets: [...new Set(samples.map((sample) => sample.id))] };
    });
  }
  await page.waitForTimeout(1250);
  report.marketBrowser.targetStable = await page.evaluate(() => {
    const current = document.querySelector('.sx-mkt__list [data-cmdty]');
    return !!current && current === window.__sfMarketProbeTarget;
  });
  requireProbe(report.marketBrowser.hasSearch, 'Market has no direct commodity search');
  requireProbe(report.marketBrowser.hasFilters, 'Market has no commodity family filters');
  requireProbe(report.marketBrowser.anonymousCircles === 0,
    `Market exposes ${report.marketBrowser.anonymousCircles} anonymous circular commodity targets`);
  requireProbe(report.marketBrowser.hiddenLabels === 0,
    `Market hides ${report.marketBrowser.hiddenLabels} commodity names until hover`);
  requireProbe(report.marketBrowser.overlapPairs === 0,
    `Market has ${report.marketBrowser.overlapPairs} materially overlapping commodity targets`);
  requireProbe(report.marketBrowser.minWidth >= 140,
    `Market commodity targets are only ${report.marketBrowser.minWidth}px wide`);
  requireProbe(report.marketBrowser.targetStable, 'Market replaces the pointer target during periodic refresh');
  await page.locator('[data-market-search]').fill('Luxury Goods');
  await page.waitForFunction(() => {
    const names = [...document.querySelectorAll('.sx-mkt__list [data-cmdty] .sx-mkt-row__name')]
      .map((node) => node.textContent?.trim());
    return names.length === 1 && names[0] === 'Luxury Goods';
  });
  report.marketBrowser.searchResultNames = await page.locator('.sx-mkt__list [data-cmdty] .sx-mkt-row__name').allTextContents();
  requireProbe(report.marketBrowser.searchResultNames.length === 1
    && report.marketBrowser.searchResultNames[0].trim() === 'Luxury Goods',
  `Market search returned ${report.marketBrowser.searchResultNames.join(', ') || 'nothing'} for Luxury Goods`);
  await page.locator('[data-market-search]').fill('');
  await page.locator('[data-market-filter="raw"]').click();
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('.sx-mkt__list [data-cmdty]')];
    return cards.length > 0 && cards.every((card) => card.getAttribute('data-family') === 'raw');
  });
  report.marketBrowser.rawFilterCount = await page.locator('.sx-mkt__list [data-cmdty][data-family="raw"]').count();
  requireProbe(report.marketBrowser.rawFilterCount > 0, 'Raw-material filter returned no commodities');
  await page.locator('[data-market-filter="all"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.sx-mkt__list [data-cmdty]').length > 1);
  const creditsBeforeTrade = await page.evaluate(() => Number(window.SF.state.player?.credits || 0));
  await page.locator('.sx-mkt__trade [data-mode="buy"]').click();
  await page.locator('.sx-mkt__trade [data-go]').click();
  await page.waitForFunction(() => /BOUGHT/i.test(document.querySelector('.sx-receipt__title')?.textContent || ''));
  const sellHandoff = page.locator('[data-handoff-mode="sell"]:visible').first();
  requireProbe(await sellHandoff.count() > 0, 'Sell what you hauled handoff is not available after buying cargo');
  if (await sellHandoff.count() > 0) await sellHandoff.click();
  else await page.evaluate(() => window.SF.bus.emit('station:navigate', { destination: 'market', options: { tradeMode: 'sell' } }));
  await page.waitForFunction(() => document.querySelector('.sx-mkt__trade [data-mode="sell"]')?.classList.contains('is-on'));
  const ownedSellRows = await page.locator('[data-cmdty]').count();
  requireProbe(ownedSellRows === 1, `Owned-only Sell mode exposed ${ownedSellRows} commodities after buying one`);
  await page.locator('.sx-mkt__trade [data-q="max"]').click();
  await page.locator('.sx-mkt__trade [data-go]').click();
  await page.waitForFunction(() => /SOLD/i.test(document.querySelector('.sx-receipt__title')?.textContent || ''));
  await page.waitForSelector('.sx-receipt.is-live');
  await page.waitForTimeout(120);
  const comms = await page.evaluate(() => {
    const receipt = document.querySelector('.sx-receipt:not([hidden])');
    const action = [...document.querySelectorAll('.sx-mkt__trade button')]
      .find((button) => /confirm|buy|sell/i.test(button.textContent || '') && button.offsetParent !== null);
    const channel = document.querySelector('.sx-comms');
    const rr = receipt?.getBoundingClientRect();
    const ar = action?.getBoundingClientRect();
    const cr = channel?.getBoundingClientRect();
    return {
      receipt: rr && { left: rr.left, top: rr.top, right: rr.right, bottom: rr.bottom,
        width: rr.width, height: rr.height },
      action: ar && { left: ar.left, top: ar.top, right: ar.right, bottom: ar.bottom,
        width: ar.width, height: ar.height },
      channel: cr && { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom,
        width: cr.width, height: cr.height },
    };
  });
  report.comms = {
    receipt: rectSummary(comms.receipt), action: rectSummary(comms.action), channel: rectSummary(comms.channel),
    overlapsAction: overlaps(comms.receipt, comms.action),
    creditsBeforeTrade,
    creditsAfterTrade: await page.evaluate(() => Number(window.SF.state.player?.credits || 0)),
  };
  requireProbe(comms.receipt && comms.action && !overlaps(comms.receipt, comms.action), 'Comms receipt overlaps the Market action');
  requireProbe(comms.channel && comms.channel.top < 180, 'Comms is not in the top-right information lane');
  await page.screenshot({ path: join(OUT, '05-market-comms-receipt.png') });

  report.pageErrors = pageErrors;
  requireProbe(pageErrors.length === 0, `Page emitted ${pageErrors.length} error(s)`);
  report.failures = failures;
  report.ok = failures.length === 0;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  report.fatal = String(error && error.stack || error);
  report.failures = failures;
  report.ok = false;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(report.fatal);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* cleanup best effort */ }
  try { if (server && server.child) server.child.kill(); } catch { /* cleanup best effort */ }
}
