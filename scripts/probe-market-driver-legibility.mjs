// Browser-level acceptance probe for Phase A Market price-driver legibility.
// Exercises the normal player route, docks at the first live station, stages one contradictory
// legacy quote, then verifies canonical pricing, causal-driver geometry, keyboard continuity, and
// responsive layout at the two desktop/DPR profiles used for station visual acceptance.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROFILE = String(process.env.SF_PROBE_PROFILE || 'latest').replace(/[^a-z0-9@._-]/gi, '');
const OUT = join(ROOT, '.devshots', 'market-driver-legibility', PROFILE);
const VIEWPORTS = [
  { id: '1366x768-dpr1', width: 1366, height: 768, deviceScaleFactor: 1 },
  { id: '1920x1080-dpr2', width: 1920, height: 1080, deviceScaleFactor: 2 },
];
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
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(baseUrl);
      if (response.status) return { child, baseUrl };
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error('server start timeout');
}

function containsRect(container, child, tolerance = 1.5) {
  if (!container || !child) return false;
  return child.left >= container.left - tolerance
    && child.right <= container.right + tolerance
    && child.top >= container.top - tolerance
    && child.bottom <= container.bottom + tolerance;
}

function overlaps(a, b, tolerance = 1.5) {
  if (!a || !b) return false;
  return a.left < b.right - tolerance && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
}

async function bootToMarket(page, baseUrl) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* optional */ }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Market Driver Probe', seed: 47 });
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
  await page.waitForSelector('.sx-mkt__list [data-cmdty].is-active', { timeout: 15000 });
}

async function runProfile(browser, baseUrl, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  const failures = [];
  const requireProbe = (condition, message) => { if (!condition) failures.push(message); };
  const result = { viewport, pageErrors, failures };

  try {
    await bootToMarket(page, baseUrl);

    // Deliberately contradict the removed legacy field. The visible quote must continue to use the
    // canonical economy cache (lastBuy), never entry.buy. Re-open the current operation through the
    // station's public navigation event so the real onShow/render path consumes the staged state.
    result.stagedQuote = await page.evaluate(() => {
      const state = window.SF.state;
      const stationId = state.ui && state.ui.dockedStationId;
      const active = document.querySelector('.sx-mkt__list [data-cmdty].is-active');
      const commodityId = active && active.getAttribute('data-cmdty');
      const entry = stationId && commodityId
        && state.economy && state.economy.markets && state.economy.markets[stationId]
        && state.economy.markets[stationId][commodityId];
      if (!entry) throw new Error('Active market entry is unavailable');
      // Let Market perform its normal onShow refresh first, then stage the contradiction. The
      // station's regular refresh cadence must subsequently render lastBuy without needing a
      // probe-only production hook.
      window.SF.bus.emit('station:navigate', { destination: 'market' });
      entry.buy = 17;
      entry.lastBuy = 7337;
      entry.lastSell = Math.min(7336, Math.max(1, Number(entry.lastSell) || 1));
      return { stationId, commodityId, legacyBuy: entry.buy, canonicalLastBuy: entry.lastBuy };
    });
    await page.waitForFunction(({ commodityId, canonicalLastBuy }) => {
      const row = document.querySelector(`[data-cmdty="${commodityId}"] .sx-mkt-row__price`);
      const rendered = Number(String(row && row.textContent || '').replace(/[^0-9]/g, ''));
      return rendered === canonicalLastBuy;
    }, result.stagedQuote, { timeout: 5000 });

    result.quote = await page.evaluate(({ commodityId }) => {
      const row = document.querySelector(`[data-cmdty="${commodityId}"]`);
      const price = row && row.querySelector('.sx-mkt-row__price');
      return {
        renderedText: String(price && price.textContent || '').replace(/\s+/g, ' ').trim(),
        renderedValue: Number(String(price && price.textContent || '').replace(/[^0-9]/g, '')),
        active: !!(row && row.classList.contains('is-active')),
      };
    }, result.stagedQuote);
    requireProbe(result.quote.renderedValue === result.stagedQuote.canonicalLastBuy,
      `Displayed buy quote ${result.quote.renderedValue} did not use canonical lastBuy ${result.stagedQuote.canonicalLastBuy}`);
    requireProbe(result.quote.renderedValue !== result.stagedQuote.legacyBuy,
      `Displayed buy quote regressed to contradictory legacy entry.buy ${result.stagedQuote.legacyBuy}`);

    result.driverGeometry = await page.evaluate(() => {
      const rect = (node) => {
        const r = node && node.getBoundingClientRect();
        return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          width: r.width, height: r.height };
      };
      const rail = document.querySelector('.sx-mkt-browser__rail');
      const railRect = rect(rail);
      const rowData = [...document.querySelectorAll('.sx-mkt__list [data-cmdty]')].map((row) => {
        const rowRect = rect(row);
        const group = row.querySelector('.sx-mkt-row__drivers');
        const groupRect = rect(group);
        const segments = [...(group ? group.children : [])].map((segment) => ({
          text: String(segment.textContent || '').trim(),
          rect: rect(segment),
          fontSize: Number.parseFloat(getComputedStyle(segment).fontSize) || 0,
          visible: !!segment.offsetParent,
        }));
        const intersectsRail = !!(rowRect && railRect && rowRect.right > railRect.left && rowRect.left < railRect.right);
        return {
          commodityId: row.getAttribute('data-cmdty'), rowRect, groupRect, segments,
          titlePresent: row.hasAttribute('title'),
          intersectsRail,
          groupContained: !!(rowRect && groupRect
            && groupRect.left >= rowRect.left - 1.5 && groupRect.right <= rowRect.right + 1.5
            && groupRect.top >= rowRect.top - 1.5 && groupRect.bottom <= rowRect.bottom + 1.5),
          segmentsContained: segments.every((segment) => segment.rect && groupRect
            && segment.rect.left >= groupRect.left - 1.5 && segment.rect.right <= groupRect.right + 1.5
            && segment.rect.top >= groupRect.top - 1.5 && segment.rect.bottom <= groupRect.bottom + 1.5),
        };
      });
      const ribbon = document.querySelector('.sx-mkt-driver-ribbon');
      const ribbonRect = rect(ribbon);
      const ribbonSegments = [...document.querySelectorAll('.sx-mkt-driver-ribbon > span')].map((segment) => ({
        text: String(segment.textContent || '').replace(/\s+/g, ' ').trim(),
        rect: rect(segment),
        primaryFontSize: Number.parseFloat(getComputedStyle(segment.querySelector('b')).fontSize) || 0,
        secondaryFontSize: Number.parseFloat(getComputedStyle(segment.querySelector('i')).fontSize) || 0,
        visible: !!segment.offsetParent,
      }));
      const stage = rect(document.querySelector('.sx-mkt__stage'));
      const head = rect(document.querySelector('.sx-mkt-head'));
      const scope = rect(document.querySelector('.sx-mkt-scope'));
      const tradeConsole = rect(document.querySelector('.sx-mkt__trade'));
      return { railRect, rowData, ribbonRect, ribbonSegments, stage, head, scope, tradeConsole };
    });

    const rows = result.driverGeometry.rowData;
    requireProbe(rows.length > 1, `Market exposed too few commodities for keyboard browsing (${rows.length})`);
    requireProbe(rows.every((row) => row.segments.length === 4),
      `Not every commodity has four causal segments (${rows.map((row) => `${row.commodityId}:${row.segments.length}`).join(', ')})`);
    requireProbe(rows.every((row) => !row.titlePresent),
      `Commodity tabs still expose native title tooltips (${rows.filter((row) => row.titlePresent).map((row) => row.commodityId).join(', ')})`);
    requireProbe(rows.filter((row) => row.intersectsRail).every((row) => row.groupContained && row.segmentsContained
      && row.segments.every((segment) => segment.visible && segment.rect.width >= 36
        && segment.rect.height >= 8.5 && segment.fontSize >= 9)),
    'One or more visible commodity causal segments are clipped or collapsed');
    requireProbe(result.driverGeometry.ribbonSegments.length === 4,
      `Selected quote ribbon has ${result.driverGeometry.ribbonSegments.length} segments instead of four`);
    requireProbe(result.driverGeometry.ribbonSegments.every((segment) => segment.visible
      && containsRect(result.driverGeometry.ribbonRect, segment.rect)
      && segment.rect.width >= 55 && segment.rect.height >= 24
      && segment.primaryFontSize >= 10.5 && segment.secondaryFontSize >= 9.5),
    'Selected quote ribbon contains a clipped or collapsed driver segment');
    requireProbe(containsRect(result.driverGeometry.stage, result.driverGeometry.ribbonRect),
      'Selected quote ribbon escapes the Market instrument bounds');
    requireProbe(!overlaps(result.driverGeometry.head, result.driverGeometry.ribbonRect)
      && !overlaps(result.driverGeometry.ribbonRect, result.driverGeometry.scope),
    'Selected quote driver ribbon overlaps the price heading or chart scope');
    requireProbe(!overlaps(result.driverGeometry.ribbonRect, result.driverGeometry.tradeConsole),
      'Selected quote driver ribbon is covered by the transaction console');

    const activeBefore = await page.locator('.sx-mkt__list [data-cmdty].is-active').getAttribute('data-cmdty');
    await page.locator(`.sx-mkt__list [data-cmdty="${activeBefore}"]`).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((previousId) => {
      const active = document.querySelector('.sx-mkt__list [data-cmdty].is-active');
      return !!(active && active.getAttribute('data-cmdty') !== previousId
        && document.activeElement === active && active.getAttribute('aria-selected') === 'true');
    }, activeBefore, { timeout: 5000 });
    result.keyboard = await page.evaluate((previousId) => {
      const active = document.querySelector('.sx-mkt__list [data-cmdty].is-active');
      const stage = document.querySelector('.sx-mkt__stage');
      const describedBy = stage?.getAttribute('aria-describedby') || '';
      const labelledBy = stage?.getAttribute('aria-labelledby') || '';
      const explanation = describedBy ? document.getElementById(describedBy) : null;
      return {
        previousId,
        selectedId: active && active.getAttribute('data-cmdty'),
        focusedId: document.activeElement && document.activeElement.getAttribute('data-cmdty'),
        ariaSelected: active && active.getAttribute('aria-selected'),
        describedBy,
        labelledBy,
        explanation: String(explanation && explanation.textContent || '').replace(/\s+/g, ' ').trim(),
        rowExplanation: String(active && active.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
        nativeTitle: active && active.getAttribute('title'),
        describedNodeCount: describedBy ? document.querySelectorAll(`#${CSS.escape(describedBy)}`).length : 0,
        labelledNodeCount: labelledBy ? document.querySelectorAll(`#${CSS.escape(labelledBy)}`).length : 0,
      };
    }, activeBefore);
    requireProbe(result.keyboard.selectedId && result.keyboard.selectedId !== activeBefore,
      `ArrowRight did not change Market selection from ${activeBefore}`);
    requireProbe(result.keyboard.focusedId === result.keyboard.selectedId && result.keyboard.ariaSelected === 'true',
      `ArrowRight lost roving focus/selection continuity (${JSON.stringify(result.keyboard)})`);
    requireProbe(result.keyboard.describedNodeCount === 1 && result.keyboard.explanation.length >= 40,
      `aria-describedby does not resolve to one nonempty driver explanation (${JSON.stringify(result.keyboard)})`);
    requireProbe(result.keyboard.rowExplanation.endsWith(result.keyboard.explanation),
      'The selected commodity tab lost or truncated its full causal explanation after keyboard rerender');
    requireProbe(result.keyboard.labelledBy === `sx-market-tab-${result.keyboard.selectedId}`
      && result.keyboard.labelledNodeCount === 1,
      `The Market tabpanel is not labelled by its selected commodity (${JSON.stringify(result.keyboard)})`);
    requireProbe(result.keyboard.nativeTitle == null,
      'Commodity tabs must not spawn a native wall-of-prose title tooltip');

    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(420);
    await page.screenshot({ path: join(OUT, `market-calm-drivers-${viewport.id}.png`) });

    // Drive Helios through the real factions and sectorSim owners into a stacked war + blockade,
    // then ask the live economy owner to rebuild demand. This proves that the causal UI is not four
    // static placeholders and that it does not silently discard the second persistent cause.
    result.warDemand = await page.evaluate(() => {
      const state = window.SF.state;
      const stationId = state.ui && state.ui.dockedStationId;
      const factions = window.SF.registry && window.SF.registry.get('factions');
      const economy = window.SF.registry && window.SF.registry.get('economy');
      const sectorSim = window.SF.registry && window.SF.registry.get('sectorSim');
      const pairKey = 'faction_reach:faction_scn';
      const sectorId = 'sector_helios_prime';
      const warCommodityId = 'cmdty_weapons';
      const stackedCommodityId = 'cmdty_medical';
      const market = stationId && state.economy && state.economy.markets
        && state.economy.markets[stationId];
      const weaponEntry = market && market[warCommodityId];
      const medicalEntry = market && market[stackedCommodityId];
      if (!factions || typeof factions.addOffscreenTension !== 'function') {
        throw new Error('Live factions conflict owner is unavailable');
      }
      if (!economy || typeof economy.refreshStationDemand !== 'function' || !weaponEntry || !medicalEntry) {
        throw new Error('Live economy demand owner or required Market listings are unavailable');
      }
      if (!sectorSim || typeof sectorSim.injectImpulse !== 'function') {
        throw new Error('Live sectorSim field owner is unavailable');
      }
      factions.addOffscreenTension(pairKey, -100, 'market-driver-probe-reset');
      economy.refreshStationDemand(stationId);
      const calm = {
        conflictState: state.conflicts && state.conflicts[pairKey] && state.conflicts[pairKey].state,
        weapons: { buy: weaponEntry.lastBuy, multiplier: weaponEntry.demandMult },
        medical: { buy: medicalEntry.lastBuy, multiplier: medicalEntry.demandMult },
      };
      factions.addOffscreenTension(pairKey, 100, 'market-driver-probe-war');
      economy.refreshStationDemand(stationId);
      const war = {
        conflictState: state.conflicts && state.conflicts[pairKey] && state.conflicts[pairKey].state,
        weapons: { buy: weaponEntry.lastBuy, multiplier: weaponEntry.demandMult,
          driverIds: (weaponEntry.demandDrivers || []).map((driver) => driver.id) },
        medical: { buy: medicalEntry.lastBuy, multiplier: medicalEntry.demandMult,
          driverIds: (medicalEntry.demandDrivers || []).map((driver) => driver.id) },
      };
      // Use the shipped event-to-field boundary and normal coarse day receipt. elapsed:0 advances no
      // clock, but sectorSim still consumes the queued deterministic infrastructure-loss impulse.
      window.SF.bus.emit('sectorsim:impulse', {
        kind: 'infrastructure_loss', sectorId, danger: 0.18, pricePressure: 0.60,
      });
      window.SF.bus.emit('day:tick', { elapsed: 0 });
      economy.refreshStationDemand(stationId);
      const node = state.sectorSim && state.sectorSim.field && state.sectorSim.field.nodes
        && state.sectorSim.field.nodes[sectorId];
      const stacked = { buy: medicalEntry.lastBuy, multiplier: medicalEntry.demandMult,
        conflictState: state.conflicts && state.conflicts[pairKey] && state.conflicts[pairKey].state,
        pricePressure: node && node.pricePressure,
        priceDriver: node && node.driver && node.driver.pricePressure,
        driverIds: (medicalEntry.demandDrivers || []).map((driver) => driver.id),
        restrictedControl: { buy: weaponEntry.lastBuy, multiplier: weaponEntry.demandMult,
          driverIds: (weaponEntry.demandDrivers || []).map((driver) => driver.id) } };
      window.SF.bus.emit('station:navigate', { destination: 'market' });
      return { stationId, sectorId, warCommodityId, stackedCommodityId, pairKey, calm, war, stacked };
    });
    requireProbe(result.warDemand.calm.conflictState === 'cold'
      && result.warDemand.calm.weapons.multiplier === 1 && result.warDemand.calm.medical.multiplier === 1,
      `Helios calm baseline was not established (${JSON.stringify(result.warDemand.calm)})`);
    requireProbe(result.warDemand.war.conflictState === 'war'
      && Math.abs(result.warDemand.war.weapons.multiplier - 1.22) < 1e-9
      && result.warDemand.war.weapons.driverIds.includes('war-footing'),
    `Helios war demand did not reach Weapon Systems (${JSON.stringify(result.warDemand.war)})`);
    requireProbe(result.warDemand.war.weapons.buy > result.warDemand.calm.weapons.buy,
      `War demand did not raise the Weapon Systems buy quote (${result.warDemand.calm.weapons.buy} -> ${result.warDemand.war.weapons.buy})`);
    requireProbe(result.warDemand.stacked.conflictState === 'war'
      && result.warDemand.stacked.pricePressure > 0.45
      && result.warDemand.stacked.priceDriver === 'infrastructure_disruption'
      && Math.abs(result.warDemand.stacked.multiplier - 1.34) < 1e-9
      && result.warDemand.stacked.driverIds.includes('war-footing')
      && result.warDemand.stacked.driverIds.includes('blockade-relief'),
    `Helios did not reach stacked war + blockade demand (${JSON.stringify(result.warDemand.stacked)})`);
    requireProbe(result.warDemand.stacked.buy > result.warDemand.war.medical.buy,
      `Blockade demand did not stack above Medical Supplies war demand (${result.warDemand.war.medical.buy} -> ${result.warDemand.stacked.buy})`);
    requireProbe(Math.abs(result.warDemand.stacked.restrictedControl.multiplier - 1.22) < 1e-9
      && !result.warDemand.stacked.restrictedControl.driverIds.includes('blockade-relief'),
    `Restricted Weapon Systems incorrectly inherited the lawful blockade premium (${JSON.stringify(result.warDemand.stacked.restrictedControl)})`);

    const marketSearch = page.locator('[data-market-search]');
    await marketSearch.fill('Medical Supplies');
    await page.waitForFunction(({ commodityId, buy }) => {
      const rows = [...document.querySelectorAll('.sx-mkt__list [data-cmdty]')];
      const row = rows[0];
      const renderedBuy = Number(String(row?.querySelector('.sx-mkt-row__price')?.textContent || '').replace(/[^0-9]/g, ''));
      return rows.length === 1 && row?.getAttribute('data-cmdty') === commodityId
        && row.classList.contains('is-active') && renderedBuy === buy
        && document.querySelector('.sx-mkt-title h2')?.textContent?.trim() === 'Medical Supplies';
    }, { commodityId: result.warDemand.stackedCommodityId, buy: result.warDemand.stacked.buy }, { timeout: 5000 });
    result.stackedSurface = await page.evaluate(() => {
      const row = document.querySelector('.sx-mkt__list [data-cmdty].is-active');
      const stage = document.querySelector('.sx-mkt__stage');
      const summaryId = stage?.getAttribute('aria-describedby') || '';
      const labelledBy = stage?.getAttribute('aria-labelledby') || '';
      const textMetric = (node) => ({
        text: String(node?.textContent || '').replace(/\s+/g, ' ').trim(),
        clientWidth: node?.clientWidth || 0,
        scrollWidth: node?.scrollWidth || 0,
        clientHeight: node?.clientHeight || 0,
        scrollHeight: node?.scrollHeight || 0,
      });
      const rowDriverNodes = [...(row?.querySelectorAll('.sx-mkt-row__drivers i') || [])];
      const ribbonNodes = [...document.querySelectorAll('.sx-mkt-driver-ribbon > span')];
      return {
        name: row?.querySelector('.sx-mkt-row__name')?.textContent?.trim() || '',
        price: Number(String(row?.querySelector('.sx-mkt-row__price')?.textContent || '').replace(/[^0-9]/g, '')),
        demandLabel: row?.querySelector('.sx-mkt-row__held')?.textContent?.trim() || '',
        rowDrivers: rowDriverNodes.map(textMetric),
        ribbonDrivers: ribbonNodes.map((node) => ({
          ...textMetric(node),
          primary: textMetric(node.querySelector('b')),
          secondary: textMetric(node.querySelector('i')),
          accessibleLabel: String(node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
        })),
        explanation: String(summaryId && document.getElementById(summaryId)?.textContent || '')
          .replace(/\s+/g, ' ').trim(),
        rowAccessibleLabel: String(row?.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
        nativeTitlePresent: !!row?.hasAttribute('title'),
        selectedTabId: row?.id || '',
        labelledBy,
        labelledNodeCount: labelledBy ? document.querySelectorAll(`#${CSS.escape(labelledBy)}`).length : 0,
      };
    });
    requireProbe(result.stackedSurface.name === 'Medical Supplies'
      && result.stackedSurface.price === result.warDemand.stacked.buy
      && /HIGH DEMAND/i.test(result.stackedSurface.demandLabel),
    `Medical Supplies stacked state is not legible in the live row (${JSON.stringify(result.stackedSurface)})`);
    requireProbe(result.stackedSurface.rowDrivers.length === 4
      && result.stackedSurface.rowDrivers.some((driver) => /war.*blockade.*(?:↑|up)/i.test(driver.text)),
    `Medical Supplies row omits a stacked war + blockade driver (${JSON.stringify(result.stackedSurface.rowDrivers)})`);
    requireProbe(result.stackedSurface.ribbonDrivers.length === 4
      && result.stackedSurface.ribbonDrivers.some((driver) => /war.*blockade.*(?:↑|up)/i.test(driver.text)),
    `Selected Medical Supplies instrument omits stacked war + blockade demand (${JSON.stringify(result.stackedSurface.ribbonDrivers)})`);
    requireProbe(result.stackedSurface.rowDrivers.every((driver) => driver.scrollWidth <= driver.clientWidth + 1
      && driver.scrollHeight <= driver.clientHeight + 1)
      && result.stackedSurface.ribbonDrivers.every((driver) => driver.primary.scrollWidth <= driver.primary.clientWidth + 1
        && driver.primary.scrollHeight <= driver.primary.clientHeight + 1
        && driver.secondary.scrollWidth <= driver.secondary.clientWidth + 1
        && driver.secondary.scrollHeight <= driver.secondary.clientHeight + 1),
    `Stacked Market causes are visually clipped (${JSON.stringify(result.stackedSurface)})`);
    requireProbe(/active faction war raises local demand for medical supplies/i.test(result.stackedSurface.explanation)
      && /disrupted supply lanes increase local demand for medical supplies/i.test(result.stackedSurface.explanation),
    `Medical Supplies accessible explanation omits a stacked cause (${result.stackedSurface.explanation})`);
    requireProbe(result.stackedSurface.rowAccessibleLabel.endsWith(result.stackedSurface.explanation)
      && !result.stackedSurface.nativeTitlePresent,
    'The stacked commodity tab lost its full accessible explanation or restored a native title');
    requireProbe(result.stackedSurface.labelledBy === result.stackedSurface.selectedTabId
      && result.stackedSurface.labelledNodeCount === 1,
    `The stacked Market tabpanel no longer follows its selected tab (${JSON.stringify(result.stackedSurface)})`);

    await page.evaluate(() => document.fonts && document.fonts.ready);
    // The station screen and operation frame each have a one-shot acquisition transition. Measure
    // only their settled geometry, then immediately assert that the transition actually settled.
    await page.waitForTimeout(420);
    await page.waitForFunction(() => {
      const app = document.querySelector('.sx-app');
      const appRect = app && app.getBoundingClientRect();
      return !!(appRect && Math.abs(appRect.top) <= 0.75
        && Math.abs(appRect.bottom - window.innerHeight) <= 0.75);
    }, null, { timeout: 3000 });
    result.layout = await page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        const r = node && node.getBoundingClientRect();
        return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          width: r.width, height: r.height };
      };
      const selectors = ['.sx-app', '.sx-dock', '.sx-screen', '.sx-mkt-browser',
        '.sx-mkt__stage', '.sx-mkt__trade', '.sx-mkt-driver-ribbon'];
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        rects: Object.fromEntries(selectors.map((selector) => [selector, rect(selector)])),
      };
    });
    requireProbe(result.layout.scrollWidth <= result.layout.innerWidth + 1
      && result.layout.scrollHeight <= result.layout.innerHeight + 1,
    `Station created page-level overflow ${result.layout.scrollWidth}x${result.layout.scrollHeight} in ${result.layout.innerWidth}x${result.layout.innerHeight}`);
    requireProbe(Object.entries(result.layout.rects).every(([, rect]) => rect
      && rect.left >= -1.5 && rect.right <= result.layout.innerWidth + 1.5
      && rect.top >= -1.5 && rect.bottom <= result.layout.innerHeight + 1.5
      && rect.width > 0 && rect.height > 0),
    `A critical Market region is clipped at ${viewport.id} (${JSON.stringify(result.layout.rects)})`);

    await page.screenshot({ path: join(OUT, `market-stacked-drivers-${viewport.id}.png`) });
    requireProbe(pageErrors.length === 0, `Console/page errors: ${pageErrors.join(' | ')}`);
  } catch (error) {
    result.fatal = String(error && error.stack || error);
    failures.push(`Fatal probe error: ${String(error && error.message || error)}`);
    try { await page.screenshot({ path: join(OUT, `market-drivers-${viewport.id}-failure.png`) }); } catch { /* best effort */ }
  } finally {
    result.ok = failures.length === 0;
    await context.close();
  }
  return result;
}

let server = null;
let browser = null;
const report = { profiles: [], failures: [] };
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: process.env.SF_PROBE_HEADED !== '1',
    args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  for (const viewport of VIEWPORTS) {
    const profile = await runProfile(browser, server.baseUrl, viewport);
    report.profiles.push(profile);
    report.failures.push(...profile.failures.map((failure) => `${viewport.id}: ${failure}`));
  }
  report.ok = report.failures.length === 0;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  report.fatal = String(error && error.stack || error);
  report.ok = false;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(report.fatal);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
