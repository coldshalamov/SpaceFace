// ui-page-shot.mjs — one PNG of any repo-served page at any viewport, for LOOKING at design-system
// pages (tools/deckplate-kit.html and friends). Same server and browser the UI bench uses; no game
// boot. Live acceptance stays with ui-stills / ui-look.
//
//   node scripts/ui-page-shot.mjs --page=tools/deckplate-kit.html
//   node scripts/ui-page-shot.mjs --page=tools/deckplate-kit.html?dialog=1 --viewport=1280x720 --out=.devshots/kit
//
// Output: <out>/<page-basename>[-<query>]-<W>x<H>.png (default out .devshots/ui-page-shot).

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { startFreshServer } from './capture-ui-matrix.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const args = { page: null, viewports: [], out: '.devshots/ui-page-shot', settle: 1400, reduced: false };
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--page=')) args.page = a.slice(7);
  else if (a.startsWith('--viewport=')) args.viewports.push(...a.slice(11).split(','));
  else if (a.startsWith('--out=')) args.out = a.slice(6);
  else if (a.startsWith('--settle=')) args.settle = Number(a.slice(9)) || args.settle;
  else if (a === '--reduced-motion') args.reduced = true;
}
if (!args.page) {
  console.error('ui-page-shot: --page=<repo-relative page> is required');
  process.exit(2);
}
if (!args.viewports.length) args.viewports.push('1920x1080');

const server = await startFreshServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const outDir = path.resolve(ROOT, args.out);
mkdirSync(outDir, { recursive: true });
const [pagePath, query = ''] = args.page.split('?');
const stem = path.basename(pagePath, path.extname(pagePath)) + (query ? `-${query.replace(/[^a-z0-9]+/gi, '_')}` : '');
try {
  for (const vp of args.viewports) {
    const [width, height] = vp.split('x').map(Number);
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: args.reduced ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${server.baseUrl}${args.page}`, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(args.settle);
    const file = path.join(outDir, `${stem}-${width}x${height}.png`);
    await page.screenshot({ path: file });
    console.log(`  ${vp.padEnd(10)} ${path.relative(ROOT, file)}${errors.length ? `  (${errors.length} console error(s): ${errors[0]})` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
