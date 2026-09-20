// Scratch: what state is the Shipworks stage in after a normal New Game dock? Delete after use.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function findFreePort(start) { for (let p = start; p < start + 80; p++) if (await isPortFree(p)) return p; throw new Error('no port'); }
const port = await findFreePort(8150);
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.ok) break; } catch (_) {} await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
installCspSafePlaywrightPolling(page);
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
await page.waitForFunction(() => !!document.querySelector('[data-screen="mainMenu"]'), null, { timeout: 60000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').toLowerCase().includes('new game'));
  b.click();
});
await page.waitForFunction(() => !!document.querySelector('[data-screen="newGame"] .sf-ng-route'), null, { timeout: 10000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Launch');
  b.click();
});
await page.waitForFunction(() => {
  const st = window.SF.state;
  const p = st && st.entities && st.entities.get(st.playerId);
  return !!(st && st.mode === 'flight' && p && p.alive && p.hull > 0);
}, null, { timeout: 90000 });
await page.evaluate(() => {
  const sf = window.SF;
  const station = sf.state.entityList.find((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
  sf.bus.emit('dock:docked', { stationId: station.data.stationId });
});
await page.waitForFunction(() => !!document.querySelector('[data-screen="station"] .sx-dock'), null, { timeout: 15000 });
await page.evaluate(() => {
  const tile = document.querySelector('[data-screen="station"] .sx-dock [data-nav="shipworks"]');
  tile.click();
});
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(4000);
  const dump = await page.evaluate(() => {
    const stage = document.querySelector('.sx-sw__stage');
    const canvas = document.querySelector('.sx-sw__canvas');
    const slotfield = document.querySelector('.sx-sw__slotfield');
    const hp = document.querySelector('[data-spatial-slot]');
    const hpRect = hp ? hp.getBoundingClientRect() : null;
    const cs = slotfield ? getComputedStyle(slotfield) : null;
    return {
      stage: stage ? stage.className : null,
      stageClasses: stage ? [...stage.classList] : null,
      canvas: canvas ? { ...canvas.dataset } : null,
      slotfield: slotfield ? { cls: slotfield.className, visibility: cs.visibility, display: cs.display } : null,
      hardpoint: hp ? { rect: { w: hpRect.width, h: hpRect.height }, cls: hp.className } : null,
    };
  });
  console.log('DUMP', i, JSON.stringify(dump, null, 2));
  if (dump.slotfield && dump.slotfield.visibility === 'visible' && dump.hardpoint && dump.hardpoint.rect.w > 10) {
    console.log('HARDPOINT VISIBLE');
    break;
  }
}
await browser.close();
child.kill();
