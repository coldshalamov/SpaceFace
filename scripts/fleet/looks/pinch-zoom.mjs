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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
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
// ctx.touch is the object the bridge populated (input.js: ctx.touch = this.touch); the registry
// route can resolve a lane facade whose .touch is not the live DOM-gesture stack.
const readPinch = () => page.evaluate(() => !!window.SF?.ctx?.touch?.mobile?.model?.pinch
  || !!window.SF?.registry?.get?.('input')?.touch?.mobile?.model?.pinch);

const readCam = () => page.evaluate(() => {
  const m = window.SF?.ctx?.touch?.mobile || window.SF?.registry?.get?.('input')?.touch?.mobile;
  const s = window.SF?.state;
  return {
    zoom: s?.camera?.zoom ?? null,
    displayed: s?.camera?.displayedZoom ?? null,
    pinch: !!m?.model?.pinch,
    hasModel: !!m?.model,
    deck: document.documentElement.dataset.sfMobileFlight === '1',
    mobile: document.documentElement.dataset.sfMobile ?? null,
    flightFlag: document.documentElement.dataset.sfMobileFlight ?? null,
    mode: s?.mode ?? null,
    paused: !!s?.paused,
    blocked: !!s?.input?.blocked,
    stack: s?.ui?.screenStack?.length ?? null,
    docHidden: document.hidden,
    bodyClass: document.body?.className ?? '',
    coarse: matchMedia('(pointer: coarse)').matches,
    touchPts: navigator.maxTouchPoints,
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
  await page.waitForFunction(() => window.__sfShotReady === true, null, { timeout: 180000 });
  await sleep(3000);
  const deck = await page.evaluate(() => document.documentElement.dataset.sfMobileFlight);
  console.log(`[pinch-zoom] ${W}x${H}  deck flight flag: ${deck}`);

  const before = await readCam();
  console.log(`[pinch-zoom] before: requested zoom ${before.zoom}, displayed ${before.displayed?.toFixed?.(0)}`);
  console.log(`[pinch-zoom] deck: mobile=${before.mobile} flight=${before.flightFlag} mode=${before.mode}`
    + ` paused=${before.paused} blocked=${before.blocked} stack=${before.stack} docHidden=${before.docHidden}`
    + ` coarse=${before.coarse} touchPts=${before.touchPts} model=${before.hasModel} body="${String(before.bodyClass).slice(0, 80)}"`);
  await page.screenshot({ path: join(OUT, `${W}x${H}-before.png`) });

  // raw pointer stream — what actually reached the window for each finger
  await page.evaluate(() => {
    window.__ptrLog = [];
    for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      window.addEventListener(t, (e) => {
        if (window.__ptrLog.length < 120) window.__ptrLog.push(`${t}#${e.pointerId}@${Math.round(e.clientX)},${Math.round(e.clientY)}`);
      }, true);
    }
  });

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
  console.log(`[pinch-zoom] during: pinch-out zoom ${before.zoom} -> ${during.zoom} (live flag ${during.pinch})`);
  await page.screenshot({ path: join(OUT, `${W}x${H}-pinch-out.png`) });
  await sleep(900); // let the eased camera arrive at the requested distance
  const settled = await readCam();
  await page.screenshot({ path: join(OUT, `${W}x${H}-zoomed.png`) });

  await finger.up(a);
  await sleep(200);
  const lifted = await readCam();
  // The surviving thumb is a re-anchored stick now — dragging it alone must not zoom.
  for (let i = 1; i <= 5; i += 1) { await finger.move(b, W * 0.62 - i * 25, y); await sleep(40); }
  const loneDrag = await readCam();
  await finger.up(b);
  console.log(`[pinch-zoom] one finger up: zoom stays ${lifted.zoom}; lone-thumb drag -> ${loneDrag.zoom}`);

  // a second pair squeezes back in — pinch zooms both directions
  const c = await finger.down(W * 0.30, y);
  const d = await finger.down(W * 0.78, y);
  await sleep(300);
  for (let i = 1; i <= 10; i += 1) {
    await finger.move(c, W * 0.30 + i * (W * 0.010), y);
    await finger.move(d, W * 0.78 - i * (W * 0.010), y);
    await sleep(50);
  }
  await sleep(120);
  const inRead = await readCam();
  console.log(`[pinch-zoom] pinch-in: zoom ${loneDrag.zoom} -> ${inRead.zoom}`);
  await page.screenshot({ path: join(OUT, `${W}x${H}-pinch-in.png`) });
  await finger.up(c); await finger.up(d);
  await sleep(400);
  const end = await readCam();
  console.log(`[pinch-zoom] settled: requested ${end.zoom}, displayed ${end.displayed?.toFixed?.(0)}`);
  const log = await page.evaluate(() => window.__ptrLog || []);
  console.log(`[pinch-zoom] pointer stream (${log.length}): ${log.join(' ')}`);

  // Under CDP touch emulation a lifted finger's pointerup is deferred past the surviving
  // contact's moves (only lostpointercapture arrives in order), so "release ends the pinch" is
  // asserted by the focused tests instead; what the real route proves here is the seeded
  // aspect-aware default, pinch-out to the 1.5x ceiling, and a squeeze back toward the floor.
  const ok = before.zoom != null && before.zoom > 200 // the aspect-aware default actually seeded
    && during.zoom > before.zoom * 1.05 // pinch-out opened the frame
    && (end.zoom ?? during.zoom) < during.zoom * 0.6; // the return squeeze pulled it far back in
  console.log(ok ? '[pinch-zoom] PASS: two open thumbs pinched the camera both ways on the real route'
    : '[pinch-zoom] CHECK FAILED — inspect the numbers above');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
