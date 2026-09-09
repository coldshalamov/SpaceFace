#!/usr/bin/env node
/**
 * Thruster evidence on the REAL player route — not the look-dev lab.
 *
 * The lab renders PlasmaStreamSystem in isolation against a stand-in box. That is the right tool
 * for tuning the density field, and the wrong tool for claiming the player sees anything: it shares
 * no camera, no ship, no post chain, and no frame budget with the game. This script boots the actual
 * game route, starts a new game, flies it, and captures what the pilot sees while it measures what
 * the frame costs.
 *
 * Captures cruise, boost, and brake — brake specifically because the bow retro jets are the thing
 * that used to render as a dotted line, and only the live route drives them.
 *
 * Usage:
 *   node scripts/capture-thruster-player-route.mjs
 *   node scripts/capture-thruster-player-route.mjs --out <dir> --headed
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
const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'graphics', 'thruster-player-route')));
const HEADLESS = !args.includes('--headed');
// Long enough for the frame-time distribution to have a meaningful tail, short enough that this
// stays a capture rather than a soak.
const SAMPLE_MS = Number(arg('sample', '4000')) || 4000;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2',
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
        if (urlPath === '/') urlPath = '/index.html';
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

/** Frame times sampled from inside the page, so this is the real composited loop, not a proxy. */
async function sampleFrames(page, ms) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    const stop = last + duration;
    const tick = (now) => {
      times.push(now - last);
      last = now;
      if (now < stop) requestAnimationFrame(tick);
      else {
        // The first frame after the sample starts includes whatever the caller just did.
        const s = times.slice(1).sort((a, b) => a - b);
        const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0;
        resolve({
          frames: s.length,
          median: at(0.5),
          p95: at(0.95),
          p99: at(0.99),
          worst: s[s.length - 1] || 0,
          over16: s.filter((t) => t > 16.7).length,
        });
      }
    };
    requestAnimationFrame(tick);
  }), ms);
}

function readThrusterState(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const vfx = sf?.registry?.get?.('vfx');
    const energy = vfx?._energy;
    const stream = energy?.plasmaStream;
    const retro = energy?.retroVolume;
    const state = sf?.state;
    const player = state?.entities?.get(state.playerId);
    return {
      mode: state?.mode || null,
      playerDefId: player?.data?.defId || null,
      speed: player ? Math.hypot(player.vel?.x || 0, player.vel?.z || 0) : 0,
      plasma: stream ? stream.inspect() : null,
      retro: retro ? retro.inspect() : null,
    };
  });
}

const executablePath = findBrowser();
if (!executablePath) throw new Error('Chrome/Edge required');

await mkdir(OUT, { recursive: true });
const { server, baseUrl } = await startStaticServer(ROOT);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const issues = [];
page.on('pageerror', (e) => issues.push(String(e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error') issues.push(`console: ${m.text()}`); });

const report = { route: baseUrl, phases: {}, issues };
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 90_000 });

  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  try {
    await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 60_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(OUT, 'route-stuck.png') });
    const stuck = await page.evaluate(() => ({
      mode: window.SF?.state?.mode || null,
      screen: document.querySelector('[data-screen]')?.getAttribute('data-screen') || null,
      buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 40),
      loading: window.SF?.state?.loading || null,
    }));
    console.error('stuck before flight:', JSON.stringify(stuck, null, 2));
    console.error('issues:', issues.slice(0, 20));
    throw error;
  }
  await page.waitForTimeout(1500);

  // Idle: nothing should be burning, and that is itself a claim worth capturing.
  report.phases.idle = await readThrusterState(page);
  await page.screenshot({ path: path.join(OUT, 'route-idle.png') });

  // Cruise.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(OUT, 'route-cruise.png') });
  report.phases.cruise = await readThrusterState(page);
  report.phases.cruise.frames = await sampleFrames(page, SAMPLE_MS);

  // Boost: the case the owner called out as inflating into a cone.
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'route-boost.png') });
  report.phases.boost = await readThrusterState(page);
  report.phases.boost.frames = await sampleFrames(page, SAMPLE_MS);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');

  // Brake: the bow retro jets, which used to be the dotted line out of the nose.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'route-brake.png') });
  report.phases.brake = await readThrusterState(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'route-brake-2.png') });
  report.phases.brake2 = await readThrusterState(page);
  await page.keyboard.up('KeyS');

  await writeFile(path.join(OUT, 'player-route.json'), JSON.stringify(report, null, 2));

  const c = report.phases.cruise;
  console.log('player route thruster capture');
  console.log(`  mode=${c.mode} ship=${c.playerDefId} speed=${c.speed?.toFixed?.(1)}`);
  console.log(`  cruise plume: ${c.plasma?.volume?.live} nozzle(s), ${c.plasma?.volume?.steps} march steps, ${c.plasma?.medium}`);
  console.log(`  boost plume: ${report.phases.boost.plasma?.volume?.live} nozzle(s), ${report.phases.boost.plasma?.volume?.steps} steps`);
  console.log(`  brake retro: ${report.phases.brake.retro?.live} jet(s) / ${report.phases.brake2.retro?.live} jet(s) one frame-batch later`);
  for (const phase of ['cruise', 'boost']) {
    const f = report.phases[phase].frames;
    console.log(`  ${phase} frames: median ${f.median.toFixed(2)}ms  p95 ${f.p95.toFixed(2)}ms  p99 ${f.p99.toFixed(2)}ms  worst ${f.worst.toFixed(2)}ms  (${f.over16}/${f.frames} over 16.7ms)`);
  }
  if (issues.length) {
    console.log('  page issues:');
    for (const i of issues.slice(0, 10)) console.log(`   - ${i}`);
  }
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
