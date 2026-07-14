#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../.devshots/alpha/m6-localization-reachability/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const probe = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (error) {}
  });
  await page.goto(`${probe.baseUrl}/?locale=qps-ploc`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.ctx, null, { timeout: 20000 });
  await waitForScreen('mainMenu');
  await page.waitForFunction(() => document.documentElement.dataset.locale === 'qps-ploc');

  await assertVisiblePseudoSurface('mainMenu');
  await page.screenshot({ path: `${OUT}/01-main-menu-qps-1280x720.png`, fullPage: false });

  await page.locator('[data-screen="mainMenu"] .sf-col button').first().click();
  await waitForScreen('newGame');
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertVisiblePseudoSurface('newGame');
  await page.screenshot({ path: `${OUT}/02-new-game-qps-1440x900.png`, fullPage: false });

  await page.locator('[data-screen="newGame"] .sf-ng-footer button').last().click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive);
  }, null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const hudReport = await page.evaluate(() => {
    const tracker = document.querySelector('.sf-mission-tracker');
    const title = tracker && tracker.querySelector('.sf-mt-title');
    return {
      locale: document.documentElement.dataset.locale,
      title: title && title.textContent,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.equal(hudReport.locale, 'qps-ploc');
  assert.equal(hudReport.horizontalOverflow, false, 'pseudo HUD must not widen the document');
  assert.match(hudReport.title || '', /^⟦.*⟧$/, 'HUD objective heading must use pseudo locale');
  await page.screenshot({ path: `${OUT}/03-flight-hud-qps-1440x900.png`, fullPage: false });

  await page.evaluate(() => {
    const sm = window.SF && window.SF.ctx && window.SF.ctx.screenManager;
    if (!sm || typeof sm.pushScreen !== 'function') throw new Error('pause screen manager unavailable');
    sm.pushScreen('pause');
    if (sm.syncVisibility) sm.syncVisibility();
  });
  await waitForScreen('pause');
  await assertVisiblePseudoSurface('pause');
  await page.screenshot({ path: `${OUT}/04-pause-qps-1440x900.png`, fullPage: false });

  console.log(JSON.stringify({
    ok: true,
    locale: 'qps-ploc',
    defaultLocale: 'en-US',
    screenshots: [
      '01-main-menu-qps-1280x720.png',
      '02-new-game-qps-1440x900.png',
      '03-flight-hud-qps-1440x900.png',
      '04-pause-qps-1440x900.png',
    ],
  }, null, 2));
} finally {
  await browser.close().catch(() => {});
  await probe.close().catch(() => {});
}

async function waitForScreen(id) {
  await page.waitForFunction((screenId) => {
    const el = document.querySelector(`[data-screen="${screenId}"]`);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 20;
  }, id, { timeout: 20000 });
}

async function assertVisiblePseudoSurface(id) {
  const report = await page.evaluate((screenId) => {
    const screen = document.querySelector(`[data-screen="${screenId}"]`);
    const rect = screen && screen.getBoundingClientRect();
    const controls = screen ? [...screen.querySelectorAll('h1, label, button, .sf-ng-route__title, .sf-slot-sub')] : [];
    const visible = controls.filter((el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 1 && r.height > 1;
    });
    return {
      locale: document.documentElement.dataset.locale,
      lang: document.documentElement.lang,
      screen: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      pseudoCount: visible.filter((el) => (el.textContent || '').includes('⟦')).length,
      clipped: visible.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim()),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, id);
  assert.equal(report.locale, 'qps-ploc');
  assert.equal(report.lang, 'qps-ploc');
  assert.ok(report.pseudoCount > 0, `${id} must expose pseudo-localized copy`);
  assert.deepEqual(report.clipped, [], `${id} pseudo copy must not clip horizontally`);
  assert.equal(report.horizontalOverflow, false, `${id} must not widen the document`);
  assert.ok(report.screen.left >= 0 && report.screen.right <= report.viewport.width + 1, `${id} must fit viewport width`);
}
