#!/usr/bin/env node
// Real player-route review. One live run; one explicitly labelled dock-arrival fixture.
// No source packaging, fake screenshot readiness, neutral-world replacement or gameplay patches.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startFreshServer } from './capture-ui-matrix.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const out = path.resolve(process.env.FRONTEND_REVIEW_OUT || 'scratch/frontend-review');
const report = { source: process.env.GITHUB_SHA || 'local', started: new Date().toISOString(),
  fixtures: [], checks: [], frames: [], issues: [] };
await mkdir(out, { recursive: true });
let server, browser, page;
const { chromium } = await loadPlaywright();
const writeReport = () => writeFile(path.join(out, 'review.json'), JSON.stringify(report, null, 2));
async function step(name, run) {
  const started = Date.now();
  try {
    const detail = await run();
    report.checks.push({ name, status: 'pass', ms: Date.now() - started, detail });
    console.log('PASS', name);
    return true;
  } catch (error) {
    report.checks.push({ name, status: 'fail', ms: Date.now() - started, error: String(error.stack || error) });
    console.error('FAIL', name, error.message);
    if (page && !page.isClosed()) await shot(`failure-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
    return false;
  } finally { await writeReport(); }
}
async function visible(selector, timeout = 15000) {
  return page.waitForFunction(sel => {
    const node = document.querySelector(sel);
    if (!node) return false;
    const b = node.getBoundingClientRect(); const s = getComputedStyle(node);
    return !node.hidden && b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }, selector, { timeout });
}
async function click(selector) {
  await visible(selector);
  // Native activation of the actual player control; no screen-manager shortcut.
  return page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node || node.disabled) throw new Error(`Control unavailable: ${sel}`);
    node.focus({ preventScroll: true }); node.click();
  }, selector);
}
async function button(screen, label) {
  await visible(`[data-screen="${screen}"]`);
  return page.evaluate(({ screen, label }) => {
    const root = document.querySelector(`[data-screen="${screen}"]`);
    const node = [...root.querySelectorAll('button')].find(b => {
      const text = b.innerText.replace(/\s+/g, ' ').trim();
      return text === label || text.startsWith(label + ' (');
    });
    if (!node || node.disabled) throw new Error(`Player button unavailable: ${screen} / ${label}`);
    node.focus({ preventScroll: true }); node.click();
  }, { screen, label });
}
async function input(selector, value) {
  await visible(selector);
  await page.locator(selector).fill(String(value), { timeout: 10000 });
}
async function shot(name) {
  await page.waitForTimeout(180);
  const viewport = page.viewportSize();
  const file = `${name}-${viewport.width}x${viewport.height}.png`;
  const state = await page.evaluate(() => {
    const sf = window.SF;
    const sm = sf?.registry?.get?.('ui')?.screenManager;
    const def = sm?.getActiveScreenDef?.();
    const current = [...document.querySelectorAll('[data-screen]')].find(n => n.getBoundingClientRect().width && getComputedStyle(n).display !== 'none');
    const canvas = [...document.querySelectorAll('canvas')].filter(n => n.getBoundingClientRect().width && getComputedStyle(n).display !== 'none');
    return { mode: sf?.state?.mode, screen: sm?.top?.(), bodyScreen: document.body.dataset.kScreen,
      hullReady: current?.dataset.kReady,
      previewState: current?.querySelector('.cd-hull-stage')?.dataset.previewState,
      preview: def?.hull?.getDiagnostics?.() || null,
      focus: document.activeElement?.outerHTML?.slice(0, 450),
      text: current?.innerText?.slice(0, 12000),
      canvases: canvas.map(n => ({ width: n.width, height: n.height, classes: n.className, data: {...n.dataset} })),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  await page.screenshot({ path: path.join(out, file), fullPage: false, timeout: 30000 });
  report.frames.push({ file, viewport, ...state });
  console.log('FRAME', file);
}
async function top() { return page.evaluate(() => window.SF?.registry?.get?.('ui')?.screenManager?.top?.() || null); }
async function flight() {
  for (let i = 0; i < 8; i++) {
    const id = await top();
    if (!id && await page.evaluate(() => window.SF.state.mode === 'flight')) return;
    if (id === 'station') throw new Error('Flight recovery must not silently fake an undock');
    const back = `[data-screen="${id}"] [data-action="back"]`;
    if (await page.locator(back).count()) await click(back); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  throw new Error(`Cannot return to flight; current screen ${await top()}`);
}
async function keyScreen(key, id) {
  await flight(); await page.keyboard.press(key);
  await page.waitForTimeout(900);
  if (await top() !== id) await page.keyboard.press(key);
  await visible(`[data-screen="${id}"]`, 20000);
}
async function stationTab(id) {
  await click(`[data-screen="station"] [data-nav="${id}"]`);
  await page.waitForFunction(tab => document.querySelector(`[data-screen="station"] [data-nav="${tab}"]`)?.getAttribute('aria-selected') === 'true', id);
  await page.waitForTimeout(250);
}
async function wallet() {
  return page.evaluate(() => ({ credits: window.SF.state.player.credits,
    cargo: {...window.SF.state.player.cargo?.items}, ledger: window.SF.state.player.tradeLedger?.length || 0 }));
}
try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(12000);
  installCspSafePlaywrightPolling(page);
  page.on('pageerror', e => report.issues.push({ kind: 'pageerror', text: e.stack || e.message }));
  page.on('console', m => { if (['error','warning'].includes(m.type()) && report.issues.length < 300) report.issues.push({ kind: m.type(), text: m.text() }); });
  page.on('response', r => { if (r.status() >= 400 && report.issues.length < 300) report.issues.push({ kind: 'http', status: r.status(), url: r.url() }); });
  await page.addInitScript(() => { sessionStorage.setItem('sf.cinematicSeen', '1'); });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await visible('[data-screen="mainMenu"]', 90000);
  assert.equal(new URL(page.url()).search, '', 'canonical player URL');
  await shot('title');
  await step('Crucible door', async () => {
    await click('[data-screen="mainMenu"] [data-action="crucible"]');
    await visible('[data-screen="crucible"]', 30000); await shot('crucible');
    await button('crucible','Back');
    await visible('[data-screen="mainMenu"]');
  });
  const launched = await step('New Game to live flight', async () => {
    await click('[data-screen="mainMenu"] [data-action="newGame"]');
    await visible('[data-screen="newGame"]');
    await input('#sf-ng-seed', '47');
    await page.waitForTimeout(2500); await shot('new-game');
    await click('[data-screen="newGame"] [data-action="launch"]');
    await page.waitForFunction(() => {
      const s = window.SF?.state; const p = s?.entities?.get(s.playerId);
      return s?.mode === 'flight' && p?.alive && p.hull > 0;
    }, null, { timeout: 120000 });
    await page.waitForTimeout(4000); await shot('flight');
  });
  if (!launched) throw new Error('A live game is required for the remaining workflow checks');
  await step('Pause settings back resume', async () => {
    await keyScreen('Escape','pause'); await shot('pause');
    await button('pause','Settings');
    await visible('[data-screen="settings"]'); await shot('settings');
    const sliders = page.locator('[data-screen="settings"] input[type="range"]');
    assert.ok(await sliders.count() > 0, 'audio sliders present');
    const before = await page.evaluate(() => JSON.stringify(window.SF.state.settings));
    await sliders.first().fill('0.43');
    const after = await page.evaluate(() => JSON.stringify(window.SF.state.settings));
    assert.notEqual(after, before, 'setting updates real state');
    await shot('settings-changed');
    await click('[data-screen="settings"] [data-action="back"]');
    await visible('[data-screen="pause"]');
    await button('pause','Resume');
    await flight();
    return { before, after };
  });
  for (const [name,key,id] of [['help','F1','help'],['codex','k','codex'],['missions','j','missionLog'],
    ['technology','t','techTree'],['ship-inspection','F2','ship'],['footprint','F3','footprint'],
    ['range','F4','range'],['local-map','m','galaxyMap'],['galaxy-map','n','galaxyMap']]) {
    await step(name, async () => { await keyScreen(key,id); await shot(name); await flight(); });
  }
  await step('Automation operations', async () => {
    await keyScreen('Escape','pause'); await button('pause','Operations');
    await visible('[data-screen="automation"]'); await shot('automation'); await flight();
  });
  await step('Save confirmation cancel and load', async () => {
    await keyScreen('Escape','pause');
    await button('pause','Save');
    await visible('[data-screen="saveLoad"]'); await shot('save-empty');
    await click('[data-screen="saveLoad"] [data-action="save"]');
    await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick'), null, { timeout:15000 });
    await page.waitForTimeout(400); await shot('save-written');
    await click('[data-screen="saveLoad"] [data-action="save"]');
    await visible('.sf-confirm'); await shot('confirmation');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('sf-confirm__cancel')), true, 'destructive confirmation defaults to cancel');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.sf-confirm')), true, 'focus remains inside dialog');
    await page.keyboard.press('Escape');
    await click('[data-screen="saveLoad"] [data-action="load"]');
    await visible('.sf-confirm'); await click('.sf-confirm__ok');
    await page.waitForFunction(() => window.SF.state.save?.currentSlot === 'quick', null, {timeout:30000});
    await flight();
  });
  await flight();
  report.fixtures.push({ name:'dock-arrival', explanation:'dock:docked event used by the existing station runtime test; no claim of physically flying to the berth' });
  await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList.find(e => e?.alive !== false && e?.type === 'station' && e.data?.stationId && !e.data.isGate);
    if (!station) throw new Error('No station in this live sector');
    sf.bus.emit('dock:docked', {stationId: station.data.stationId});
  });
  await visible('[data-screen="station"] .sx-dock', 30000);
  const facilities = ['market','shipworks','contracts','industry','factions','bar','ledger'];
  for (const id of facilities) await step(`Station ${id}`, async () => { await stationTab(id); await shot(id); });
  await step('Market buy and sell reconciled to real cargo and credits', async () => {
    await stationTab('market');
    await click('[data-screen="station"] [data-mode="buy"]');
    await click('.sx-mkt-row[data-cmdty]'); await input('#sx-market-qty','1');
    const commodity = await page.locator('.sx-mkt-row[aria-selected="true"]').getAttribute('data-cmdty');
    const before = await wallet();
    await click('.sx-mkt [data-go]');
    await page.waitForFunction(({id,qty}) => (window.SF.state.player.cargo.items[id] || 0) === qty + 1, {id:commodity,qty:before.cargo[commodity] || 0});
    const bought = await wallet();
    assert.ok(bought.credits < before.credits, 'buy debited actual credits');
    await shot('market-buy-receipt');
    await click('.sx-mkt [data-mode="sell"]');
    await click(`.sx-mkt-row[data-cmdty="${commodity}"]`); await input('#sx-market-qty','1');
    await click('.sx-mkt [data-go]');
    await page.waitForFunction(({id,qty}) => (window.SF.state.player.cargo.items[id] || 0) === qty, {id:commodity,qty:before.cargo[commodity] || 0});
    const sold = await wallet();
    assert.ok(sold.credits > bought.credits, 'sell credited actual credits');
    await shot('market-sell-receipt'); return {commodity,before,bought,sold};
  });
  await step('Mission acceptance changes active mission state', async () => {
    await stationTab('contracts');
    const accept = '.sx-ct [data-accept]:not(:disabled)'; await visible(accept);
    const id = await page.locator(accept).getAttribute('data-accept');
    await click(accept);
    await page.waitForFunction(mid => window.SF.state.missions.active.some(m => String(m.id || m.missionId) === mid), id);
    await click(`.sx-ct [data-track="${id}"]`);
    await page.waitForFunction(mid => String(window.SF.state.ui.trackedMissionId) === mid, id);
    await shot('mission-accepted-tracked'); return {id};
  });
  await step('Shipworks module selection', async () => {
    await stationTab('shipworks'); await click('.sx-sw [data-slot]');
    await visible('.sx-sw [data-preview-module]'); await click('.sx-sw [data-preview-module]');
    await shot('shipworks-module');
  });
  for (const viewport of [{width:1920,height:1080},{width:2560,height:1080}]) {
    await page.setViewportSize(viewport);
    for (const id of facilities) await step(`${id} ${viewport.width}`, async () => { await stationTab(id); await shot(id); });
  }
  await page.setViewportSize({width:1280,height:720});
  await step('Reduced motion station', async () => {
    await page.emulateMedia({reducedMotion:'reduce'});
    await stationTab('market');
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    await shot('market-reduced-motion');
  });
} catch (error) {
  report.checks.push({name:'review execution',status:'fail',error:String(error.stack || error)});
  console.error(error);
} finally {
  report.finished = new Date().toISOString();
  await writeReport();
  await browser?.close(); server?.kill();
  const failed = report.checks.filter(c => c.status === 'fail');
  console.log(`${report.frames.length} real frames, ${report.checks.length-failed.length} passing checks, ${failed.length} failures`);
  if (failed.length) process.exitCode = 1;
}
