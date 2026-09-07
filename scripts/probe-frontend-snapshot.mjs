#!/usr/bin/env node
// probe-frontend-snapshot.mjs — J04 fast visual snapshot lab (CANONICAL_BUILD_MAP §11.12).
//
// Headless Playwright against `_uilab.html` isolation fixtures. No Three.js, no `server.js`.
// Writes `.devshots/frontend/<component>.png` at deviceScaleFactor 2, plus a magenta overlay
// `<name>.diff.png` when a previous PNG exists and pixels moved.
//
// Target: one page load, capture in well under a second after Chromium is up. Cold Chromium
// launch on Windows often dominates the wall clock — that cost is reported, never faked.
//
// Usage:
//   npm run probe:frontend-snapshot
//   node scripts/probe-frontend-snapshot.mjs --shot hud-vitals

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, '.devshots', 'frontend');
const args = process.argv.slice(2);
const onlyShot = argValue('--shot');

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/_uilab.html';
        const rel = urlPath.replace(/^\/+/, '').replace(/\0/g, '');
        const filePath = join(ROOT, rel);
        if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
          res.writeHead(404); res.end('missing'); return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(readFileSync(filePath));
      } catch (err) {
        res.writeHead(500); res.end(String(err && err.message || err));
      }
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function writePixelDiff(prevBuf, nextBuf, dest) {
  const prev = PNG.sync.read(prevBuf);
  const next = PNG.sync.read(nextBuf);
  if (prev.width !== next.width || prev.height !== next.height) {
    writeFileSync(dest, nextBuf);
    return { changed: true, pixels: -1, reason: 'size' };
  }
  const diff = new PNG({ width: prev.width, height: prev.height });
  let changed = 0;
  for (let i = 0; i < prev.data.length; i += 4) {
    const dr = prev.data[i] - next.data[i];
    const dg = prev.data[i + 1] - next.data[i + 1];
    const db = prev.data[i + 2] - next.data[i + 2];
    const da = prev.data[i + 3] - next.data[i + 3];
    if (dr || dg || db || da) {
      changed++;
      diff.data[i] = 255;
      diff.data[i + 1] = 0;
      diff.data[i + 2] = 180;
      diff.data[i + 3] = 255;
    } else {
      diff.data[i] = next.data[i];
      diff.data[i + 1] = next.data[i + 1];
      diff.data[i + 2] = next.data[i + 2];
      diff.data[i + 3] = next.data[i + 3];
    }
  }
  if (changed) writeFileSync(dest, PNG.sync.write(diff));
  else if (existsSync(dest)) { try { unlinkSync(dest); } catch (_) {} }
  return { changed: changed > 0, pixels: changed };
}

function cropPng(sheet, x, y, w, h) {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.min(sheet.width - sx, Math.ceil(w)));
  const sh = Math.max(1, Math.min(sheet.height - sy, Math.ceil(h)));
  const out = new PNG({ width: sw, height: sh });
  for (let row = 0; row < sh; row++) {
    const src = ((sy + row) * sheet.width + sx) * 4;
    const dst = row * sw * 4;
    out.data.set(sheet.data.subarray(src, src + sw * 4), dst);
  }
  return PNG.sync.write(out);
}

function writeCapture(dest, buf) {
  const prev = existsSync(dest) ? readFileSync(dest) : null;
  writeFileSync(dest, buf);
  if (!prev) return { wrote: dest, diff: null };
  const diffPath = dest.replace(/\.png$/i, '.diff.png');
  const result = writePixelDiff(prev, buf, diffPath);
  return { wrote: dest, diff: result.changed ? diffPath : null, pixels: result.pixels };
}

const t0 = Date.now();
mkdirSync(OUT, { recursive: true });
const { server, baseUrl } = await startStaticServer();
const { chromium } = await loadPlaywright();
const tLaunch = Date.now();
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-extensions', '--disable-background-networking', '--no-first-run', '--mute-audio'],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await context.newPage();
const shotQuery = onlyShot ? `&shot=${encodeURIComponent(onlyShot)}` : '';
await page.goto(`${baseUrl}/_uilab.html?lab=shots${shotQuery}`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
const tReady = Date.now();

async function measureShots() {
  return page.evaluate(() => {
    const lab = document.body.getAttribute('data-lab');
    const nodes = [...document.querySelectorAll('[data-shot]')];
    return {
      lab,
      items: nodes.filter((el) => !el.hidden).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: el.getAttribute('data-shot'),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      }),
    };
  });
}

const wantHud = !onlyShot || onlyShot === 'hud-full' || String(onlyShot).startsWith('hud-quadrant');
const wantChips = !onlyShot || (onlyShot !== 'hud-full' && !String(onlyShot).startsWith('hud-quadrant'));

const DSF = 2;
const written = [];
let hudPng = null;

// HUD first: one 1280×720 element, then quadrants are cropped in-process.
const hud = page.locator('[data-shot="hud-full"]');
if (wantHud && await hud.count()) {
  await hud.scrollIntoViewIfNeeded();
  hudPng = PNG.sync.read(await hud.screenshot({ type: 'png', animations: 'disabled' }));
  written.push(writeCapture(join(OUT, 'hud-full.png'), PNG.sync.write(hudPng)));
  if (!onlyShot) {
    const hw = hudPng.width / 2;
    const hh = hudPng.height / 2;
    const quads = [
      ['hud-quadrant-nw', 0, 0],
      ['hud-quadrant-ne', hw, 0],
      ['hud-quadrant-sw', 0, hh],
      ['hud-quadrant-se', hw, hh],
    ];
    for (const [qName, x, y] of quads) {
      written.push(writeCapture(join(OUT, `${qName}.png`), cropPng(hudPng, x, y, hw, hh)));
    }
  }
}

if (wantChips) {
  await page.evaluate(() => {
    const hudEl = document.querySelector('[data-shot="hud-full"]');
    if (hudEl) hudEl.hidden = true;
  });
  const chipH = await page.evaluate(() => Math.ceil(Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  )));
  // Keep the authored viewport height while taking the full-page sheet. Resizing the viewport
  // to the current scroll height makes every `min-height: 100vh` fixture expand again, so the
  // later crops land below the bitmap and collapse to one-pixel placeholders.
  const chips = await measureShots();
  if (chips.lab !== 'shots') {
    await browser.close();
    server.close();
    throw new Error('_uilab.html?lab=shots did not isolate the snapshot board');
  }
  const sheetBuf = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: true });
  const sheet = PNG.sync.read(sheetBuf);
  for (const item of chips.items) {
    if (!item.name || item.name === 'hud-full' || (onlyShot && item.name !== onlyShot)) continue;
    if (item.w < 8 || item.h < 8) continue;
    if (item.y < 0 || item.x < 0) continue;
    written.push(writeCapture(
      join(OUT, `${item.name}.png`),
      cropPng(sheet, item.x * DSF, item.y * DSF, item.w * DSF, item.h * DSF),
    ));
  }
}

if (!written.length) {
  await browser.close();
  server.close();
  throw new Error('_uilab.html?lab=shots produced no PNG captures');
}

await browser.close();
server.close();

const t1 = Date.now();
const total = t1 - t0;
const launchMs = tReady - tLaunch;
const captureMs = t1 - tReady;
const pngs = readdirSync(OUT).filter((n) => n.endsWith('.png') && !n.endsWith('.diff.png'));
const diffs = written.filter((w) => w.diff).length;
console.log(
  `probe:frontend-snapshot OK — ${written.length} capture(s), ${pngs.length} png(s) in ${OUT}` +
  (diffs ? `, ${diffs} diff(s)` : ''),
);
console.log(`  wall ${total}ms  chromium-to-ready ${launchMs}ms  capture ${captureMs}ms`);
if (total > 1000) {
  console.log('  WARN: wall clock over the 1s map budget — cold Chromium launch is the usual cause, not the fixtures');
}
if (captureMs > 500) {
  console.log('  WARN: capture after ready exceeded 500ms');
}
