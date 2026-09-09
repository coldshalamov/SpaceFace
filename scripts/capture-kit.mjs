// Captures _kitlab.html at the three declared widths → .devshots/frontend/A/kit-<w>.png
// (design/frontend/direction/KIT_SPEC.md §10; TASK_A step 5). No game boots: the page is the kit alone.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTHS = [[1280, 720], [1920, 1080], [2560, 1080]];
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || '.devshots/frontend/A';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

function startServer() {
  return new Promise((ok, fail) => {
    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = (urlPath === '/' ? '/_kitlab.html' : urlPath).replace(/^\/+/, '').replace(/\0/g, '');
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
try {
  for (const [w, h] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await page.goto(`${server.url}/_kitlab.html`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.getElementById('kit')?.dataset.kReady === '1', null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const facts = await page.evaluate(() => {
      // Resolve the unitless scale through a length: a probe 1000px wide × --k-s.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:calc(1000px * var(--k-s))';
      document.body.appendChild(probe);
      const s = probe.getBoundingClientRect().width / 1000;
      probe.remove();
      const h1 = document.querySelector('h1.k-display');
      const face = h1 ? getComputedStyle(h1).fontFamily.split(',')[0].replace(/"/g, '') : '';
      const title = h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0;
      const loaded = [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Bricolage Grotesque' && f.status === 'loaded');
      return { s, title, face, bricolageLoaded: loaded };
    });
    const path = `${OUT}/kit-${w}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`${path}  --k-s=${facts.s.toFixed(3)} title=${facts.title}px display=${facts.face} bricolage=${facts.bricolageLoaded ? 'loaded' : 'NOT LOADED'}`);
    if (!facts.bricolageLoaded) process.exitCode = 1;
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
