// Live temporal contract for the station UI.
// Unlike a screenshot check, this holds the pointer still across repeated animation frames and
// detects node replacement, hover loss, geometry drift, style oscillation, and mutation sources.
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'station-temporal-stability');
const FRAMES = 120;
const TABS = [
  ['market', '.sx-mkt', '.sx-mkt-row:not(.is-active)'],
  ['shipworks', '.sx-sw', '.sx-hardpoint[data-spatial-slot]'],
  ['industry', '.sx-ind', '.sx-ind-row:not(.is-active)'],
  ['contracts', '.sx-ct', '.sx-ct-row:not(.is-active)'],
  ['factions', '.sx-fac', '.sx-fac-row:not(.is-active)'],
  ['bar', '.sx-bar', '.sx-bar-row:not(.is-active)'],
];
const TAB_FILTER = String(process.env.SF_STABILITY_TAB || '').trim();

mkdirSync(OUT, { recursive: true });
const server = await startServer();
const { chromium } = await loadPlaywright();
let browser;
const failures = [];

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* optional */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const state = window.SF.state;
    // This probe owns station DOM timing, not authored flight-asset readiness. Seed the minimum
    // ordinary player inventory needed by Shipworks and enter through the real dock event.
    state.player.credits = 10_000;
    state.player.ownedShips = [{ defId: 'ship_kestrel', name: 'Kestrel', fittings: [] }];
    state.player.activeShipIndex = 0;
    const playerShip = {
      id: 9_900_001, type: 'ship', alive: true,
      hull: 40, hullMax: 100, armorHp: 0, armorMax: 0,
    };
    state.playerId = playerShip.id;
    state.entities.set(playerShip.id, playerShip);
    state.entityList.push(playerShip);
    state.fuel = state.fuel || {};
    state.fuel.current = 20;
    state.fuel.max = 100;
    window.SF.bus.emit('dock:docked', { stationId: 'station_helios' });
  });
  await page.waitForSelector('[data-screen="station"] .sx-app', { state: 'visible', timeout: 15_000 });

  const report = { tabs: {}, global: {} };
  for (const [tab, rootSelector, hoverSelector] of TABS.filter(([tab]) => !TAB_FILTER || tab === TAB_FILTER)) {
    await page.click(`[data-nav="${tab}"]`);
    await page.waitForSelector(rootSelector, { state: 'visible', timeout: tab === 'shipworks' ? 30_000 : 10_000 });
    if (tab === 'shipworks') {
      await page.waitForFunction(() => document.querySelector('.sx-sw__canvas')?.dataset.previewReady === 'true',
        null, { timeout: 12_000 });
    }
    await page.waitForTimeout(tab === 'shipworks' ? 900 : 420);
    const locator = page.locator(hoverSelector).first();
    if (await locator.count()) {
      await locator.hover();
      await page.waitForTimeout(240);
      report.tabs[tab] = await sampleFrames(page, hoverSelector, FRAMES);
      checkStable(report.tabs[tab], `${tab} stationary hover`);
      check(report.tabs[tab].mutations.screenChildList === 0,
        `${tab} rebuilt its active screen ${report.tabs[tab].mutations.screenChildList} times while idle`);
    } else {
      report.tabs[tab] = { skipped: `No target matched ${hoverSelector}` };
    }
  }

  await page.mouse.move(3, 3);
  await page.waitForTimeout(240);
  report.global.idle = await sampleFrames(page, '.sx-screen__body > :first-child', FRAMES, { requireHover: false });
  check(report.global.idle.mutations.screenChildList === 0,
    `the active station screen rebuilt ${report.global.idle.mutations.screenChildList} times while idle`);

  const hold = page.locator('[data-hold]').first();
  if (await hold.count()) {
    await hold.hover();
    await page.waitForTimeout(240);
    report.global.hold = await sampleFrames(page, '[data-hold]', FRAMES);
    checkStable(report.global.hold, 'Hold readout stationary hover');
  }

  const handoff = page.locator('.sx-handoff:not([hidden]) .sx-hstep').first();
  if (await handoff.count()) {
    await handoff.hover();
    await page.waitForTimeout(240);
    report.global.handoff = await sampleFrames(page, '.sx-handoff:not([hidden]) .sx-hstep', FRAMES);
    checkStable(report.global.handoff, 'First Dock Handoff stationary hover');
  }

  // Departure Check entries are shortcuts, not inert warnings. Services execute immediately;
  // stateful/complex checks open their owning station surface.
  report.global.departureActions = {};
  const openDeparture = async () => {
    await page.click('[data-act="undock"]');
    await page.waitForSelector('.sx-pop--dep:not([hidden])', { state: 'visible', timeout: 3_000 });
  };
  await openDeparture();
  const hullBefore = await page.evaluate(() => window.SF.state.entities.get(window.SF.state.playerId)?.hull || 0);
  await page.locator('.sx-pop--dep .sx-depchip').filter({ hasText: /hull|repair/i }).first().click();
  await page.waitForFunction((before) => window.SF.state.entities.get(window.SF.state.playerId)?.hull > before,
    hullBefore, { timeout: 3_000 });
  report.global.departureActions.repair = true;

  await openDeparture();
  const fuelBefore = await page.evaluate(() => window.SF.state.fuel.current);
  await page.locator('.sx-pop--dep .sx-depchip').filter({ hasText: /fuel|refuel/i }).first().click();
  await page.waitForFunction((before) => window.SF.state.fuel.current > before, fuelBefore, { timeout: 3_000 });
  report.global.departureActions.refuel = true;

  await openDeparture();
  await page.locator('.sx-pop--dep .sx-depchip').filter({ hasText: /route|track|mission/i }).first().click();
  await page.waitForFunction(() => document.querySelector('.sx-app')?.dataset.operation === 'contracts',
    null, { timeout: 3_000 });
  report.global.departureActions.route = 'contracts';

  await openDeparture();
  await page.locator('.sx-pop--dep .sx-depchip').filter({ hasText: /hold|cargo/i }).first().click();
  await page.waitForSelector('.sx-pop--hold:not([hidden])', { state: 'visible', timeout: 3_000 });
  report.global.departureActions.hold = 'manifest';

  report.global.runningAnimations = await page.evaluate(() => [...document.querySelectorAll('.sx-app *')]
    .flatMap((node) => node.getAnimations().map((animation) => ({
      node: node.className && typeof node.className === 'string' ? node.className : node.tagName,
      name: animation.animationName || animation.effect?.getKeyframes?.()[0]?.easing || 'anonymous',
      iterations: animation.effect?.getTiming?.().iterations,
      duration: animation.effect?.getTiming?.().duration,
    })))
    .filter((entry) => entry.iterations === Infinity));
  check(!report.global.runningAnimations.some((entry) => /attention|commit-pulse/i.test(entry.name)),
    `station attention state still pulses indefinitely (${JSON.stringify(report.global.runningAnimations)})`);

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Station temporal report:', JSON.stringify(report));
  assert.deepEqual(failures, [], `Station temporal failures:\n- ${failures.join('\n- ')}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function checkStable(sample, label) {
  check(sample.sameNodeFrames === sample.frames, `${label} replaced the hovered element`);
  check(sample.hoverFrames === sample.frames, `${label} repeatedly lost :hover`);
  check(sample.hitFrames === sample.frames, `${label} moved out from under the stationary pointer`);
  check(sample.maxGeometryDrift <= 0.5, `${label} moved ${sample.maxGeometryDrift.toFixed(2)}px`);
  check(sample.styleStates.length === 1, `${label} oscillated through ${sample.styleStates.length} visual states`);
}

async function sampleFrames(page, selector, frames, { requireHover = true } = {}) {
  return page.evaluate(async ({ selector: sel, frames: count, requireHover: hoverExpected }) => {
    const initial = document.querySelector(sel);
    if (!initial) throw new Error(`Missing temporal target: ${sel}`);
    const initialRect = initial.getBoundingClientRect();
    const point = { x: initialRect.left + initialRect.width / 2, y: initialRect.top + initialRect.height / 2 };
    const mutations = { screenChildList: 0, readoutsChildList: 0, handoffChildList: 0, dockAttributes: 0, other: 0, details: [] };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (mutations.details.length < 40) mutations.details.push({
          type: record.type,
          attribute: record.attributeName || '',
          node: node?.className && typeof node.className === 'string' ? node.className : node?.tagName || '',
        });
        if (record.type === 'childList' && node?.closest('.sx-screen__body')) mutations.screenChildList += 1;
        else if (record.type === 'childList' && node?.closest('.sx-readouts')) mutations.readoutsChildList += 1;
        else if (record.type === 'childList' && node?.closest('.sx-handoff')) mutations.handoffChildList += 1;
        else if (record.type === 'attributes' && node?.closest('.sx-dock')) mutations.dockAttributes += 1;
        else mutations.other += 1;
      }
    });
    observer.observe(document.querySelector('.sx-app'), {
      subtree: true, childList: true, attributes: true, characterData: true,
    });
    let sameNodeFrames = 0;
    let hoverFrames = 0;
    let hitFrames = 0;
    let maxGeometryDrift = 0;
    const styleStates = new Set();
    const geometryStates = new Set();
    const previewStates = new Set();
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const current = document.querySelector(sel);
      if (current === initial) sameNodeFrames += 1;
      if (!hoverExpected || initial.matches(':hover')) hoverFrames += 1;
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hoverExpected || hit === initial || initial.contains(hit)) hitFrames += 1;
      const rect = initial.getBoundingClientRect();
      geometryStates.add([rect.left, rect.top, rect.width, rect.height].map((value) => value.toFixed(2)).join('|'));
      maxGeometryDrift = Math.max(maxGeometryDrift,
        Math.abs(rect.left - initialRect.left), Math.abs(rect.top - initialRect.top),
        Math.abs(rect.width - initialRect.width), Math.abs(rect.height - initialRect.height));
      const style = getComputedStyle(initial);
      const preview = document.querySelector('.sx-sw__canvas');
      if (preview) previewStates.add([
        preview.dataset.previewReady || '', preview.dataset.previewAssetState || '',
        preview.dataset.previewReveal || '', document.querySelector('.sx-sw__stage')?.className || '',
      ].join('|'));
      styleStates.add([style.opacity, style.visibility, style.transform, style.filter,
        style.backgroundColor, style.borderColor, style.boxShadow].join('|'));
    }
    observer.disconnect();
    return {
      frames: count, sameNodeFrames, hoverFrames, hitFrames,
      maxGeometryDrift, geometryStates: [...geometryStates], styleStates: [...styleStates],
      previewStates: [...previewStates], mutations,
    };
  }, { selector, frames, requireHover });
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
