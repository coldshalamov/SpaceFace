#!/usr/bin/env node
// MOB-02: the phone flight HUD must cover at most 25% of the viewport, measured as the UNION
// of the furniture's element rectangles (overlaps counted once). Mounts the real ui-bench
// `mobileFlight` shot — the real deck view + real flight HUD over a still — on a touch phone
// context at the two phone viewports the packet names. No game boot.
//   node scripts/check-mobile-hud-area.mjs            (under the game lock)
import assert from 'node:assert/strict';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const BUDGET = 0.25;
// What a pilot would call "the HUD": every deck control and every HUD plate that sits over the
// world on the phone flight still. Transient furniture (toasts, lit alerts, tells, the ghost)
// counts only while it is actually visible — the same rule the screenshot applies.
const FURNITURE = [
  '#sf-touch-overlay .mf-status',
  '#sf-touch-overlay .mf-pause',
  '#sf-touch-overlay .mf-edge',
  '#sf-touch-overlay .mf-buttons > *',
  '#sf-touch-overlay .mf-dock:not([hidden])',
  '#sf-touch-overlay .mf-toast:not([hidden])',
  '#sf-touch-overlay .mf-guide-open:not([hidden])',
  '#sf-touch-overlay .mf-reel:not([hidden])',
  '#sf-touch-overlay .mf-beam:not([hidden])',
  '#sf-touch-overlay .mf-ghost:not([hidden]) > svg',
  '#sf-touch-overlay .mf-ghost:not([hidden]) .mf-ghost-label',
  '#sf-touch-overlay .mf-stick:not([hidden]) > *',
  '#sf-touch-overlay .mf-wheel:not([hidden]) > *',
  '#hud > .sf-leftcontext > *',
  '#hud .sf-rightdock > *',
  '#hud > .sf-radar-wrap--expanded',
  '#hud .sf-radar-orrery',
  '#race-tape:not([hidden])',
  '#alerts > *',
  '#toasts > *',
  '#hud > .sf-vtape.sf-vtape--on',
  '#hud .sf-tells > *',
  '.ml2-cadence-slot',
  '#sf-ml2 .ml2-preview',
  '.sf-tutorial-flight-card',
  '#sf-sector-law:not([hidden])',
];

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
    const measured = await page.evaluate((selectors) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const seen = new Set();
      const rows = [];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          const left = Math.max(0, r.left), top = Math.max(0, r.top);
          const right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
          const width = right - left, height = bottom - top;
          if (width <= 0 || height <= 0) continue;
          if (!el.checkVisibility?.({ checkVisibilityCSS: true, checkOpacity: true })) continue;
          rows.push({
            sel, cls: String(el.className?.baseVal !== undefined ? el.className.baseVal : el.className || el.id || el.tagName).slice(0, 60),
            x: Math.round(left * 10) / 10, y: Math.round(top * 10) / 10, w: Math.round(width * 10) / 10, h: Math.round(height * 10) / 10,
          });
        }
      }
      // Exact union of axis-aligned rectangles: sweep x edges, merge covered y-intervals per slab.
      const xs = [...new Set(rows.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
      let covered = 0;
      for (let i = 0; i + 1 < xs.length; i += 1) {
        const x0 = xs[i], x1 = xs[i + 1];
        const ys = rows.filter((r) => r.x < x1 && r.x + r.w > x0)
          .flatMap((r) => [[r.y, 1], [r.y + r.h, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let depth = 0, start = 0;
        for (const [y, d] of ys) {
          if (depth === 0) start = y;
          depth += d;
          if (depth === 0) covered += (x1 - x0) * (y - start);
        }
      }
      return { vw, vh, area: vw * vh, covered, rows };
    }, FURNITURE);
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
