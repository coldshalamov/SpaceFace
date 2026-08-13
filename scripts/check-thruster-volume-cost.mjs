#!/usr/bin/env node
/**
 * GPU cost gate for the raymarched plume.
 *
 * A volumetric effect is the one kind of shader that can silently eat a frame: cost scales with
 * covered pixels times march steps, so it is cheap in a thumbnail and ruinous when the plume fills
 * the screen. This measures actual GPU time with timer queries at the two framings that matter.
 *
 * The gate is on the plume's cost expressed in fullscreen reference passes, not in milliseconds.
 * Absolute milliseconds on an integrated GPU swing by more than 2x with thermal state — measured
 * here, the same build reported 1.1 ms and 3.5 ms for the same work minutes apart — so a
 * millisecond threshold would be a coin flip. The reference pass is rendered in the same
 * interleaved loop, so the ratio holds still while the clock wanders. Milliseconds are still
 * reported, because the ratio needs an anchor to be interpretable.
 *
 * Budget: the render phase owns ~7 ms of the 16.7 ms frame. On the Intel Xe iGPU this was tuned
 * against, one reference pass is roughly 1 ms at 1080p, so the ratios below are close to
 * milliseconds on that machine and scale sensibly on faster ones.
 */
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const arg = (n, d = '') => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : d);
const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'graphics', 'thruster-volume-cost')));

// Roughly 2x the measured cost, which is tight enough to catch a real regression and loose enough
// not to flap on driver differences. At the time of writing: chase 0.39, near 0.76.
const BUDGET_CHASE_REF = 0.8;
const BUDGET_NEAR_REF = 1.6;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

const server = createServer(async (req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/') u = '/scripts/thruster-volume-bench.html';
  const f = path.join(ROOT, u.replace(/^\//, ''));
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end('missing'); return; }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(await readFile(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const executablePath = findBrowser();
if (!executablePath) throw new Error('Chrome/Edge required');
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  // Timer queries need a real GPU path; SwiftShader would measure nothing useful.
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu-rasterization', '--use-angle=default'],
});

const runs = {};
try {
  for (const framing of ['chase', 'near']) {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e?.message || e)));
    await page.goto(`${baseUrl}/scripts/thruster-volume-bench.html?framing=${framing}&rounds=160`, {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await page.waitForFunction(() => !!window.__bench, null, { timeout: 120_000 });
    runs[framing] = await page.evaluate(() => window.__bench);
    runs[framing].errors = errs;
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const fails = [];
if (!runs.chase.supported) {
  fails.push('EXT_disjoint_timer_query_webgl2 unavailable — cost is unmeasured, not proven cheap');
}
if (!(runs.chase.plumeInRefPasses <= BUDGET_CHASE_REF)) {
  fails.push(`chase framing costs ${runs.chase.plumeInRefPasses.toFixed(2)} reference passes > ${BUDGET_CHASE_REF}`);
}
if (!(runs.near.plumeInRefPasses <= BUDGET_NEAR_REF)) {
  fails.push(`near framing costs ${runs.near.plumeInRefPasses.toFixed(2)} reference passes > ${BUDGET_NEAR_REF}`);
}

await mkdir(OUT, { recursive: true });
const report = {
  gate: 'check-thruster-volume-cost',
  ok: fails.length === 0,
  fails,
  budgetsInReferencePasses: { chase: BUDGET_CHASE_REF, near: BUDGET_NEAR_REF },
  runs,
};
await writeFile(path.join(OUT, 'volume-cost.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`gpu: ${runs.chase.gpu}`);
for (const framing of ['chase', 'near']) {
  const r = runs[framing];
  console.log(`${framing}: ${r.plumeInRefPasses.toFixed(2)} ref passes `
    + `(${r.plumeMs.toFixed(2)}ms here, ref pass ${r.referenceMs.toFixed(2)}ms), `
    + `${r.steps} march steps, ${r.coveragePct.toFixed(1)}% of frame lit`);
}
console.log(`noise bake: ${runs.chase.noise.bakeMs.toFixed(0)}ms once, ${(runs.chase.noise.bytes / 1024).toFixed(0)}KB`);

if (!report.ok) {
  console.error('THRUSTER VOLUME COST GATE FAIL');
  for (const f of fails) console.error(' -', f);
  process.exit(1);
}
console.log('THRUSTER VOLUME COST GATE PASS');
