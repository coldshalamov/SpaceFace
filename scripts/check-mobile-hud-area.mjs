#!/usr/bin/env node
// MOB-02: the phone flight HUD must cover at most 25% of the viewport, measured as the UNION
// of the furniture's element rectangles (overlaps counted once). Mounts the real ui-bench
// `mobileFlight` shot — the real deck view + real flight HUD over a still — on a touch phone
// context at the two phone viewports the packet names. No game boot.
//   node scripts/check-mobile-hud-area.mjs            (under the game lock)
import assert from 'node:assert/strict';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { HUD_FURNITURE, measureUnion } from './lib/phoneHudArea.mjs';

const BUDGET = 0.25;
// What a pilot would call "the HUD": every deck control and every HUD plate that sits over the
// world on the phone flight still. Transient furniture (toasts, lit alerts, tells, the ghost)
// counts only while it is actually visible — the same rule the screenshot applies.

const sizes = [{ width: 390, height: 844 }, { width: 844, height: 390 }];
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const server = await startBenchServer();
const playwright = await loadPlaywright();
let browser;
let failures = 0;
try {
  browser = await playwright.chromium.launch({ headless: true });
  for (const viewport of sizes) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=mobileFlight&chrome=0&phone=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 120_000 });
    await page.evaluate(async () => {
      document.documentElement.classList.add('sf-reduce-motion');
      await document.fonts.ready;
      for (let i = 0; i < 6; i += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    assert.deepEqual(errors, [], `${viewport.width}x${viewport.height}: browser errors`);
    const measured = await measureUnion(page, HUD_FURNITURE);
    const pct = (measured.covered / measured.area) * 100;
    console.log(`\n${measured.vw}x${measured.vh}: HUD union ${Math.round(measured.covered)} of ${measured.area} px² = ${pct.toFixed(1)}%`);
    for (const row of measured.rows) console.log(`   ${row.cls || row.sel}  ${row.x},${row.y} ${row.w}x${row.h}`);
    if (measured.covered > measured.area * (BUDGET + 0.0005)) {
      failures += 1;
      console.error(`   OVER BUDGET: ${pct.toFixed(1)}% > 25%`);
    } else console.log(`   within the 25% budget`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
process.exitCode = failures ? 1 : 0;
