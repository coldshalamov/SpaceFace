#!/usr/bin/env node
/**
 * Capture thruster look-dev lab (real PlasmaStreamSystem on live code path).
 * Usage:
 *   node scripts/capture-thruster-lookdev.mjs --out <dir> --iter 01
 * Writes rear.png, rear34.png, and note.json into out/iter-XX/
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'graphics', 'thruster-lookdev')));
const ITER = arg('iter', '00');
const FRAMES = Number(arg('frames', '100')) || 100;
const BOOST = args.includes('--boost');
// Optional scenario extensions (gate defaults unchanged): extra gameplay-camera and maneuver views.
const VIEWS = arg('views', '').split(',').map((v) => v.trim()).filter(Boolean);
const MANEUVER = arg('maneuver', 'straight');
const SPEED = arg('speed', '110');
const DRIVE = arg('drive', '');

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/scripts/thruster-lookdev-lab.html';
        const filePath = path.join(root, urlPath.replace(/^\//, ''));
        if (!filePath.startsWith(root) || !existsSync(filePath)) {
          res.writeHead(404); res.end('missing'); return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          // Look-dev MUST serve current source; stale module caches fake "no visual change".
          'Cache-Control': 'no-store',
        });
        res.end(body);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function captureView(page, baseUrl, view, bloom, maneuver = 'straight') {
  const q = new URLSearchParams({
    view,
    thrust: '1',
    boost: BOOST ? '1' : '0',
    bloom: bloom ? '1' : '0',
    frames: String(FRAMES),
    capture: '1',
    speed: SPEED,
    maneuver,
  });
  if (DRIVE !== '') q.set('drive', DRIVE);
  await page.goto(`${baseUrl}/scripts/thruster-lookdev-lab.html?${q}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(() => !!(window.__thrusterCapture && window.__thrusterCapture.dataUrl), null, {
    timeout: 45_000,
  });
  const payload = await page.evaluate(() => window.__thrusterCapture);
  return payload;
}

const executablePath = findBrowser();
if (!executablePath) throw new Error('Chrome/Edge required');

const iterDir = path.join(OUT, `iter-${ITER}`);
await mkdir(iterDir, { recursive: true });
const { server, baseUrl } = await startStaticServer(ROOT);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const issues = [];
page.on('pageerror', (e) => issues.push(String(e?.message || e)));

try {
  const rear = await captureView(page, baseUrl, 'rear', true);
  const rear34 = await captureView(page, baseUrl, 'rear34', true);
  const bloomOff = await captureView(page, baseUrl, 'rear34', false);
  // Gameplay camera: the view players actually see (chase cam, game speed). Optional views from
  // --views=a,b: 'game' (chase, default 110 WU/s), plus maneuver arcs when maneuver=turn|s.
  const extra = {};
  for (const v of VIEWS) {
    if (v === 'rear' || v === 'rear34') continue; // already captured above
    extra[v] = await captureView(page, baseUrl, v, true, MANEUVER);
  }

  async function writePng(name, dataUrl) {
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    await writeFile(path.join(iterDir, name), Buffer.from(b64, 'base64'));
  }
  await writePng('rear.png', rear.dataUrl);
  await writePng('rear34.png', rear34.dataUrl);
  await writePng('rear34-bloom-off.png', bloomOff.dataUrl);
  for (const v of Object.keys(extra)) {
    await writePng(`${v}${MANEUVER !== 'straight' ? `-${MANEUVER}` : ''}.png`, extra[v].dataUrl);
    if (extra[v].cropDataUrl) {
      await writePng(`${v}${MANEUVER !== 'straight' ? `-${MANEUVER}` : ''}-crop.png`, extra[v].cropDataUrl);
    }
  }
  const inspectExtra = {};
  for (const v of Object.keys(extra)) inspectExtra[v] = extra[v].inspect;
  const analysisExtra = {};
  for (const v of Object.keys(extra)) analysisExtra[`${v}Analysis`] = extra[v].analysis || null;
  analysisExtra.rear34Analysis = rear34.analysis || null;
  await writeFile(path.join(iterDir, 'capture.json'), JSON.stringify({
    iter: ITER,
    boost: BOOST,
    maneuver: MANEUVER,
    speed: Number(SPEED),
    rear: rear.inspect,
    rear34: rear34.inspect,
    bloomOff: bloomOff.inspect,
    ...inspectExtra,
    ...analysisExtra,
    issues,
  }, null, 2));
  // ASCII luminance maps straight to stdout: the agent reads shape/direction without thumbnails.
  for (const [label, payload] of Object.entries({ rear34, ...extra })) {
    const a = payload.analysis;
    if (!a) continue;
    console.log(`\n=== ${label} luminance map (ship@${a.shipScreen} nozzle@${a.nozzleScreen} bbox=${JSON.stringify(a.bbox)} brightPx=${a.brightPx}) ===`);
    for (const row of a.grid) console.log(row);
  }
  console.log(`wrote ${iterDir}`);
} finally {
  await browser.close();
  server.close();
}
