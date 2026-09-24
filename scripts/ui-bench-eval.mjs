#!/usr/bin/env node
// ui-bench-eval.mjs — open one real screen in the UI bench (no game boot) and evaluate JS in it.
//
//   node scripts/ui-bench-eval.mjs <screen-id> "<expression>" [screenshot.png] [pre-js]
//   VW=1280 VH=720 node scripts/ui-bench-eval.mjs station-market "document.title"
//   HOVER=90,1018 node scripts/ui-bench-eval.mjs station-market "..."   (park the pointer first)
//
// The expression may be async (an IIFE returning a promise); its JSON result is printed. Use it to
// measure what a still cannot show: computed styles, boxes, which element holds focus, or a state
// the screen only reaches after a click. The bench exposes window.__BENCH_STATE and
// window.__BENCH_BUS, so a probe can change the state a mounted screen reads and emit the event
// that makes it refresh (the station refreshes on 'economy:tradeCompleted'). The screenshot, if a
// path is given, is taken after the expression settles. Screen ids: scripts/lib/uiBenchCatalog.mjs.
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { startBenchServer } = await import(pathToFileURL(ROOT + 'scripts/lib/benchServer.mjs').href);
const { loadPlaywright } = await import(pathToFileURL(ROOT + 'scripts/lib/load-playwright.mjs').href);
const { resolveShot } = await import(pathToFileURL(ROOT + 'scripts/lib/uiBenchCatalog.mjs').href);

const [id, expr = 'null', shotPath, preJs] = process.argv.slice(2);
if (!id || !resolveShot(id)) { console.error('unknown or missing screen id:', id); process.exit(1); }
const server = await startBenchServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1920), height: Number(process.env.VH || 1080) } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${server.baseUrl}tools/ui-bench.html?${new URLSearchParams({ screen: id, chrome: '0' })}`);
  await page.waitForFunction(() => document.documentElement.dataset.benchReady === '1' || window.__benchReady === true || window.__BENCH_READY === true,
    null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (preJs) { await page.evaluate((src) => Function(src)(), preJs); await page.waitForTimeout(300); }
  if (process.env.HOVER) {
    const [hx, hy] = process.env.HOVER.split(',').map(Number);
    await page.mouse.move(hx, hy);
    await page.waitForTimeout(200);
  }
  // eslint-disable-next-line no-new-func
  const out = await page.evaluate((src) => Function(`return (${src});`)(), expr);
  console.log(JSON.stringify(out, null, 2));
  if (shotPath) await page.screenshot({ path: shotPath });
} finally {
  await browser.close();
  await server.close();
}
