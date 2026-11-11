// MOB-01 look: does a real two-finger pinch move the phone flight camera?
// Boots the dev route's sector shot (title skipped, straight into flight) on a 390x844 touch
// viewport, drives a hardware-level two-touch pinch through CDP Input.dispatchTouchEvent —
// the same channel a real iPhone's fingers produce — and photographs before/after while reading
// the camera's requested zoom out of window.SF. Run under the lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/pinch-zoom.mjs [--land]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { loadPlaywright } from '../../lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LAND = process.argv.includes('--land');
const W = LAND ? 844 : 390, H = LAND ? 390 : 844;
const OUT = resolve(ROOT, '.devshots/fleet/looks/pinch-zoom');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await new Promise((res, rej) => {
  const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej);
});
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => console.log('  server:', String(d).trim().slice(0, 200)));
const t0 = Date.now();
let up = false;
while (Date.now() - t0 < 60000) {
  try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) { up = true; break; } } catch { /* not up yet */ }
  await sleep(400);
}
if (!up) throw new Error(`game server did not come up on :${port} within 60 s`);

const { chromium } = await loadPlaywright();
const chromeExe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({
  headless: true,
  ...(chromeExe ? { executablePath: chromeExe } : {}),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--no-first-run'],
});
const context = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', String(e.message).slice(0, 200)));
const cdp = await context.newCDPSession(page);

// The full live contact set rides every touch event, exactly like the OS delivers them.
const live = new Map();
let seq = 1;
const send = (type) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: [...live.values()].map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })),
});
const finger = {
  down: async (x, y) => { const id = seq++; live.set(id, { id, x, y }); await send('touchStart'); return id; },
  move: async (id, x, y) => { live.set(id, { id, x, y }); await send('touchMove'); },
  up: async (id) => { live.delete(id); await send('touchEnd'); },
};

const readCam = () => page.evaluate(() => {
  const m = window.SF?.registry?.get?.('input')?.touch?.mobile;
  return {
    zoom: window.SF?.state?.camera?.zoom ?? null,
    displayed: window.SF?.state?.camera?.displayedZoom ?? null,
    pinch: !!m?.model?.pinch,
    deck: document.documentElement.dataset.sfMobileFlight === '1',
  };
});

try {
  const url = `http://127.0.0.1:${port}/?sector=helios_core&shot=1`;
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.count().catch(() => 0)) {
    await splash.click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {});
  }
  await page.waitForFunction(() => window.__sfShotReady === true || !!window.SF?.state, null, { timeout: 180000 });
  await sleep(3000);
  const deck = await page.evaluate(() => document.documentElement.dataset.sfMobileFlight);
  console.log(`[pinch-zoom] ${W}x${H}  deck flight flag: ${deck}`);

  const before = await readCam();
  console.log(`[pinch-zoom] before: requested zoom ${before.zoom}, displayed ${before.displayed?.toFixed?.(0)}`);
  await page.screenshot({ path: join(OUT, `${W}x${H}-before.png`) });

  // two thumbs land on open glass and spread — the pinch
  const y = H * 0.6;
  const a = await finger.down(W * 0.32, y);
  const b = await finger.down(W * 0.62, y);
  await sleep(300);
  for (let i = 1; i <= 10; i += 1) {
    await finger.move(a, W * 0.32 - i * (W * 0.014), y);
    await finger.move(b, W * 0.62 + i * (W * 0.014), y);
    await sleep(50);
  }
  await sleep(120);
  const during = await readCam();
  console.log(`[pinch-zoom] during: pinch live=${during.pinch}  zoom ${before.zoom} -> ${during.zoom}`);
  await page.screenshot({ path: join(OUT, `${W}x${H}-pinch-out.png`) });
  await sleep(900); // let the eased camera arrive at the requested distance
  const settled = await readCam();
  await page.screenshot({ path: join(OUT, `${W}x${H}-zoomed.png`) });

  await finger.up(a);
  await sleep(200);
  const after = await readCam();
  console.log(`[pinch-zoom] one finger up: pinch live=${after.pinch}  zoom stays ${after.zoom} (session persistence)`);
  await finger.up(b);
  await sleep(400);
  const end = await readCam();
  console.log(`[pinch-zoom] settled: requested ${end.zoom}, displayed ${end.displayed?.toFixed?.(0)}`);

  const ok = before.zoom != null && during.pinch === true && during.zoom > before.zoom * 1.05 && end.pinch === false;
  console.log(ok ? '[pinch-zoom] PASS: two open thumbs pinched the camera out on the real route'
    : '[pinch-zoom] CHECK FAILED — inspect the numbers above');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
