#!/usr/bin/env node
/**
 * Capture the plasma ribbon plume look-dev lab.
 *
 * Shoots the shipped chase framing by default, because tuning against a camera closer than the game
 * actually uses is what produced three consecutive rejected thruster passes.
 *
 * Usage:
 *   node scripts/capture-ribbon-plume.mjs
 *   node scripts/capture-ribbon-plume.mjs --views game,beauty --phase boost --maneuver turn
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'graphics', 'ribbon-plume')));
const VIEWS = arg('views', 'game,beauty').split(',').map((v) => v.trim()).filter(Boolean);
const PHASE = arg('phase', 'full');
const MANEUVER = arg('maneuver', 'straight');
const FRAMES = arg('frames', '150');
const BLOOM = arg('bloom', '1');
// Cruise speed sets how much history fits on screen: the trail's length is distance flown, so a slow
// pass is the only way to frame its far end and confirm it dissipates rather than being cut off.
const SPEED = arg('speed', '150');
const TAG = arg('tag', '');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/scripts/ribbon-plume-lab.html';
        const filePath = path.join(root, urlPath.replace(/^\//, ''));
        if (!filePath.startsWith(root) || !existsSync(filePath)) {
          res.writeHead(404); res.end('missing'); return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

const executablePath = findBrowser();
if (!executablePath) throw new Error('Chrome/Edge required');

await mkdir(OUT, { recursive: true });
const { server, baseUrl } = await startStaticServer(ROOT);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const issues = [];
page.on('pageerror', (e) => issues.push(String(e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error') issues.push(`console: ${m.text()}`); });

const report = { phase: PHASE, maneuver: MANEUVER, views: {}, issues };
try {
  for (const view of VIEWS) {
    const q = new URLSearchParams({
      view, phase: PHASE, maneuver: MANEUVER, frames: FRAMES, bloom: BLOOM, speed: SPEED,
    });
    await page.goto(`${baseUrl}/scripts/ribbon-plume-lab.html?${q}`, {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await page.waitForFunction(() => !!window.__ribbonCapture?.dataUrl, null, { timeout: 60_000 });
    const payload = await page.evaluate(() => window.__ribbonCapture);
    const suffix = [view, PHASE !== 'full' ? PHASE : '', MANEUVER !== 'straight' ? MANEUVER : '', TAG]
      .filter(Boolean).join('-');
    const file = `${suffix}.png`;
    await writeFile(
      path.join(OUT, file),
      Buffer.from(payload.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
    );
    report.views[view] = {
      file, plume: payload.inspect, contrail: payload.contrail, env: payload.env, shape: payload.shape,
    };
    console.log(
      `${file}  jet=${payload.inspect.jetLength.toFixed(1)}WU`
      + ` trail=${payload.contrail.liveSamples}/${payload.contrail.samples}`
      + ` span=${payload.contrail.spanWU.toFixed(0)}WU`
      + ` flow=${payload.flow.meanDelta.toFixed(1)}avg/${payload.flow.peakDelta.toFixed(0)}peak over ${payload.flow.litPixels}px`
      + ` spool=${payload.env.spool.toFixed(3)} boost=${payload.env.boost.toFixed(3)} dash=${payload.env.dash.toFixed(3)}`,
    );
  }
  await writeFile(path.join(OUT, 'capture.json'), JSON.stringify(report, null, 2));
  if (issues.length) {
    console.error('PAGE ISSUES:');
    for (const i of issues.slice(0, 12)) console.error(' -', i);
  }
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
