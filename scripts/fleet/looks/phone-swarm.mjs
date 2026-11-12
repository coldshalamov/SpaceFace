#!/usr/bin/env node
// MOB-07 look: a live phone Swarm round. Boots the real game in a touch-phone Chrome on
// `?swarmRound=N`, launches the round from the armory, waits for the fight, saves 3 frames ~4 s apart
// and measures the HUD footprint (same furniture list as check-mobile-hud-area.mjs).
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/phone-swarm.mjs --round=1 [--land] [--out=dir]
//
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { loadPlaywright } from '../../lib/load-playwright.mjs';
import { HUD_FURNITURE, SWARM_FURNITURE, MACHINE_NOTICE, measureUnion } from '../../lib/phoneHudArea.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROUND = Number(argv.round || 1);
const LAND = !!argv.land;
const W = LAND ? 844 : 390;
const H = LAND ? 390 : 844;
const OUT = resolve(ROOT, argv.out || `.devshots/fleet/looks/mob07/swarm-r${ROUND}-${W}x${H}`);
const BOOT_TIMEOUT = 420_000;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '', PORT: String(port) } });
const baseUrl = `http://127.0.0.1:${port}/`;
for (let t0 = Date.now(); Date.now() - t0 < 60_000;) {
  try { if ((await fetch(baseUrl)).ok) break; } catch { /* not up yet */ }
  await sleep(400);
}
const { chromium } = await loadPlaywright();
const chromeExe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)));
const tap = async (loc) => { await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {}); const r = await loc.boundingBox(); if (r) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
let code = 0;
try {
  await page.goto(`${baseUrl}?swarmRound=${ROUND}`, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: BOOT_TIMEOUT });
  const end = Date.now() + BOOT_TIMEOUT;
  let live = 0;
  while (Date.now() < end) {
    for (const b of [page.locator('#cinematic-splash .cine-begin:visible').first(),
      page.locator('[data-screen="motionAsk"] [data-action="full"]:visible').first(),
      page.locator('[data-screen="mainMenu"] [data-action="swarm"]:visible').first(),
      page.locator('.sf-confirm__ok:visible').first(), page.getByText(/Launch round/i).first()]) {
      if (await b.isVisible().catch(() => false)) await tap(b).catch(() => {});
    }
    const s = await page.evaluate(() => {
      const st = window.SF.state;
      const hostile = (st.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
      return { mode: st.mode, phase: st.run?.phase, touch: document.documentElement.dataset.sfMobileFlight, hostile };
    }).catch(() => ({}));
    if (s.mode === 'flight' && s.phase === 'active' && s.touch === '1' && s.hostile >= 1) { live = s.hostile; break; }
    await sleep(500);
  }
  console.log(`fight live: ${live} hostiles`);
  if (!live) { await page.screenshot({ path: join(OUT, '00-route-failure.png') }); throw new Error('Swarm round never went live'); }
  await sleep(1500);
  const results = [];
  for (let i = 0; i < 3; i += 1) {
    await page.screenshot({ path: join(OUT, `f${i}.png`) });
    const m = await measureUnion(page, [...HUD_FURNITURE, ...SWARM_FURNITURE], { ignoreText: MACHINE_NOTICE });
    results.push({ frame: i, pct: +(m.covered / m.area * 100).toFixed(1), rows: m.rows });
    console.log(`frame ${i}: HUD union ${(m.covered / m.area * 100).toFixed(1)}%`);
    if (i < 2) await sleep(4000);
  }
  writeFileSync(join(OUT, 'area.json'), JSON.stringify(results, null, 2));
  const worst = Math.max(...results.map((r) => r.pct));
  console.log(`${W}x${H} round ${ROUND}: worst ${worst}%`);
  for (const row of results.find((r) => r.pct === worst).rows) console.log(`   ${row.cls}  ${row.x},${row.y} ${row.w}x${row.h}`);
  if (worst > 25.05) { code = 1; console.error('OVER BUDGET'); }
} finally {
  await browser.close().catch(() => {});
  child.kill();
}
process.exitCode = code;
