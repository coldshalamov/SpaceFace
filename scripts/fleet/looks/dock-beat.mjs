// Lead look: THE DOCK ARRIVAL. Boot Helios in flight, park beside a station, press E, and shoot the
// beat (veil, berth word, station screen) with timings; then undock and dock again, skipping the
// second arrival with a key, to check the word is first-dock-only and a key ends the beat early.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/dock-beat.mjs [outPrefix]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8171;
const out = process.argv[2] || '.devshots/fleet/looks/dockbeat/run';
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(`http://127.0.0.1:${PORT}/?sector=sector_helios_prime&shot=1`, { waitUntil: 'commit', timeout: 120000 });
  const t0 = Date.now(); let ready = false;
  while (!ready && Date.now() - t0 < 240000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    ready = await page.evaluate(() => window.__sfShotReady === true).catch(() => false);
    if (!ready) await sleep(1000);
  }
  await sleep(3000);
  await page.evaluate(() => {
    const bus = window.SF.bus; const log = (window.__dockLog = []);
    for (const ev of ['dock:range', 'dock:docked', 'dock:undocked', 'dock:attempt']) bus.on(ev, (p) => log.push({ ev, at: performance.now(), inRange: p && p.inRange }));
  });
  const park = () => page.evaluate(() => {
    const s = window.SF.state; const me = s.entities.get(s.playerId);
    const st = (s.entityList || []).find((e) => e && e.type === 'station' && e.alive !== false);
    if (!st) return false;
    me.pos.x = st.pos.x + 60; me.pos.z = st.pos.z; me.vel && (me.vel.x = 0, me.vel.z = 0);
    return st.name || st.id;
  });
  await sleep(14000); // the idle warm of the station screen runs about 6 s into flight
  console.log('station', await park());
  await page.mouse.click(640, 360);
  const dock = async (label, skipAfterMs) => {
    const sid = await page.evaluate(() => { const st = (window.SF.state.entityList || []).find((e) => e && e.type === 'station' && e.alive !== false); return st && st.id; });
    await page.evaluate((id) => {
      window.SF.bus.emit('dock:range', { stationId: id, inRange: true });
      const rec = (window.__beat = { t0: performance.now(), wordOn: null, wordOff: null, screen: null, word: '' });
      const tick = () => {
        const w = document.querySelector('.sf-dock-word');
        const on = !!(w && !w.hidden);
        const top = window.SF.state.ui && window.SF.state.ui.screenStack && window.SF.state.ui.screenStack.slice(-1)[0];
        if (on && rec.wordOn == null) { rec.wordOn = performance.now() - rec.t0; rec.word = w.textContent; }
        if (!on && rec.wordOn != null && rec.wordOff == null) rec.wordOff = performance.now() - rec.t0;
        if (top === 'station' && rec.screen == null) rec.screen = performance.now() - rec.t0;
        if (rec.screen == null && performance.now() - rec.t0 < 8000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, sid);
    await page.keyboard.press('KeyE');
    await sleep(skipAfterMs ? skipAfterMs : 450);
    await page.screenshot({ path: `${out}-${label}-mid.png` });
    if (skipAfterMs) await page.keyboard.press('Space');
    await sleep(2500);
    await page.screenshot({ path: `${out}-${label}-end.png` });
    console.log(label, JSON.stringify(await page.evaluate(() => window.__beat)));
  };
  await dock('first', 0);
  await sleep(1500);
  await page.evaluate(() => window.SF.bus.emit('dock:undocked', { committed: true, intent: 'explicit' }));
  await sleep(2500);
  await dock('second', 450);
  console.log(JSON.stringify(await page.evaluate(() => window.__dockLog)));
  await browser.close();
} finally { server.kill(); }
