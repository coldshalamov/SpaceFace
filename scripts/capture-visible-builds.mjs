#!/usr/bin/env node
// PQ-176.04 evidence: Shipworks preview stills at the shipping camera for two loadouts of the
// same hull — the lab's stock Kestrel fit, then a budget-heavy build (?fit=heavy). The canvas
// carries data-preview-* metadata; the stills prove fitted guns, budget modules and the drive
// recolor read on the authored sockets. Output: .devshots/visible-builds/*.png
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || '.devshots/visible-builds';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};

function startServer() {
  return new Promise((ok, fail) => {
    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = (urlPath === '/' ? '/station-lab.html' : urlPath).replace(/^\/+/, '').replace(/\0/g, '');
        const filePath = join(ROOT, rel);
        if (!filePath.startsWith(ROOT) || !existsSync(filePath)) { res.writeHead(404); res.end('missing'); return; }
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(readFileSync(filePath));
      } catch (err) { res.writeHead(500); res.end(String(err?.message || err)); }
    });
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(() => done())),
    }));
  });
}

mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--mute-audio'] });

const results = [];
try {
  for (const fit of ['light', 'heavy']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const url = `${server.url}/station-lab.html?screen=shipworks${fit === 'heavy' ? '&fit=heavy' : ''}`;
    await page.goto(url);
    const canvas = page.locator('.sx-sw__canvas');
    // The preview writes its shown fittings to the dataset; the authored upgrade settles async.
    await canvas.waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelector('.sx-sw__canvas')?.dataset.previewReady === 'true',
      null,
      { timeout: 30000 },
    );
    // Give the authored GLB admission + pipeline compile room to land before the still.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.sx-sw__canvas');
        return el && el.dataset.previewAssetState !== 'loading' && el.dataset.previewReveal !== 'acquiring';
      },
      null,
      { timeout: 30000 },
    ).catch(() => {});
    await page.waitForTimeout(2500);
    const meta = await canvas.evaluate((el) => ({
      defId: el.dataset.previewDefId,
      fittings: JSON.parse(el.dataset.previewFittings || '[]'),
      assetState: el.dataset.previewAssetState,
      ready: el.dataset.previewReady,
    }));
    const shot = join(OUT, `shipworks-${fit}.png`);
    await page.screenshot({ path: shot });
    const canvasShot = join(OUT, `shipworks-${fit}-canvas.png`);
    await canvas.screenshot({ path: canvasShot }).catch(() => {});
    results.push({ fit, meta, shot });
    console.log(`saved ${fit}:`, JSON.stringify(meta));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const heavy = results.find((r) => r.fit === 'heavy');
if (!heavy || !heavy.meta.fittings.includes('mod_engine_warp_l')) {
  console.error('heavy still did not show the heavy fittings — evidence is not what it claims');
  process.exit(1);
}
console.log('visible-builds stills complete:', results.map((r) => r.fit).join(', '));
