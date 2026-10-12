#!/usr/bin/env node
// Real screen DOM, touch viewport, actual hit targets. No game boot or shared player saves.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const engine = option('browser', 'chromium');
const screens = option('screens', 'new-game,settings,ship,station-market,chart,help,save-load,automation,asteroid-works').split(',');
const sizes = option('viewport', '390x664,844x390').split(',').map((value) => {
  const [width, height] = value.split('x').map(Number);
  assert.ok(width > 0 && height > 0, `Invalid viewport: ${value}`);
  return { width, height };
});
const out = path.resolve('.devshots/mobile-screen-layout', engine);
mkdirSync(out, { recursive: true });
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const server = await startBenchServer();
const playwright = await loadPlaywright();
assert.ok(playwright[engine], `Unknown browser: ${engine}`);
let browser;
const results = [];
try {
  browser = await playwright[engine].launch({ headless: true });
  for (const viewport of sizes) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const screen of screens) {
      const errors = [];
      const onError = (error) => errors.push(error.message);
      page.on('pageerror', onError);
      await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=${screen}&chrome=0&phone=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 120_000 });
      await page.evaluate(async () => {
        document.documentElement.classList.add('sf-reduce-motion');
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.deepEqual(errors, [], `${engine} ${screen}: browser errors`);
      const root = page.locator('#screens > .screen').last();
      // The category/save rails scroll sideways inside their own viewport. WebKit includes
      // their clipped descendants in ancestor scrollWidth, so test the actual screen boundary.
      const frame = await root.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, overflowX: getComputedStyle(el).overflowX };
      });
      assert.ok(frame.left >= -1 && frame.right <= viewport.width + 1, `${engine} ${screen}: screen stays inside the phone viewport`);
      assert.ok(frame.overflowX === 'hidden' || frame.overflowX === 'clip', `${engine} ${screen}: horizontal rail overflow is contained`);
      if (screen === 'new-game') {
        const launch = page.locator('.sf-ng-launch');
        const box = await launch.boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width, 'Launch stays fully in the viewport');
        assert.ok(box.height >= 44, 'Launch has a phone touch target');
        const hit = await launch.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        assert.ok(hit, 'Launch receives the touch at its centre');
        assert.ok(await page.locator('.sf-ng-scroll').evaluate((el) => el.scrollTop < 1), 'New Game arrives at its heading');
        assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'sf-ng-pilot-name', 'Phone arrival does not open the keyboard');
        await page.locator('.orr-ng-stats').scrollIntoViewIfNeeded();
        assert.ok(await page.locator('.orr-ng-stats').isVisible(), 'Hull dials remain reachable');
        assert.equal(await page.locator('.orr-ng-stat').count(), 3, 'Mass, thrust and line dials show the selected hull');
        assert.ok(await page.locator('[aria-label="Loadout"]').isVisible(), 'Selected hull loadout remains visible');
        await page.getByRole('button', { name: 'Pelican', exact: true }).tap();
        assert.match(await page.locator('.sf-slot-card-title').textContent(), /Pelican/i, 'Touch hull choice updates its reading');
      }
      if (screen === 'settings') {
        await page.locator('.sf-tab').filter({ hasText: /controls/i }).tap();
        const row = page.locator('#sf-settings-pane .k-row').filter({ hasText: /control scheme/i }).first();
        const label = row.locator(':scope > label, :scope > span.k-t-body').first();
        const labelBox = await label.boundingBox();
        assert.ok(labelBox && labelBox.width > 200 && labelBox.height < 44, 'Control scheme label reads across its row');
      }
      if (screen === 'station-market') {
        await page.locator('[data-nav="contracts"]').tap();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const body = page.locator('.sx-screen__body');
        const bodyBox = await body.boundingBox();
        assert.ok(bodyBox && bodyBox.y < viewport.height && bodyBox.y + bodyBox.height > 0, 'Touch Missions brings its content into view');
        assert.ok((await body.innerText()).trim().length > 0, 'Missions navigation presents its actual content');
        await page.locator('[data-nav="industry"]').tap();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const title = await page.locator('.sx-fab-head__name').boundingBox();
        const action = await page.locator('.sx-fab-foot').boundingBox();
        assert.ok(title && action && action.y >= title.y + title.height, 'Industry action cannot cover its blueprint title');
        await page.locator('.sx-fab-head__name').scrollIntoViewIfNeeded();
      }
      const report = await page.evaluate(() => window.BENCH.report());
      assert.equal(report.broken, '', `${engine} ${screen} mounts`);
      const file = path.join(out, `${screen}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: file });
      results.push({ screen, viewport, report, file });
      page.off('pageerror', onError);
      console.log(`${engine} ${screen} ${viewport.width}x${viewport.height}: fits the phone viewport`);
    }
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(results, null, 2));
}
