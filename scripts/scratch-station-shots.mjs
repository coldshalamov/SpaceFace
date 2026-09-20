// Scratch: interaction-state stills for the station UI (hover, popovers, palette, receipts).
// Delete after use. Output: .devshots/ui-station-states/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = `${ROOT}.devshots/ui-station-states`;
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();

const isPortFree = (port) => new Promise((resolve) => {
  const s = createNetServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});
const findFreePort = async (start) => { for (let p = start; p < start + 80; p++) if (await isPortFree(p)) return p; throw new Error('no port'); };

const port = await findFreePort(8200);
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.ok) break; } catch (_) {} await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
installCspSafePlaywrightPolling(page);
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
await page.waitForFunction(() => !!document.querySelector('[data-screen="mainMenu"]'), null, { timeout: 60000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').toLowerCase().includes('new game')).click());
await page.waitForFunction(() => !!document.querySelector('[data-screen="newGame"] .sf-ng-route'), null, { timeout: 10000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Launch').click());
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
await page.waitForTimeout(1200);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// 01 dock with a nav tile hovered
const marketTile = page.locator('[data-screen="station"] .sx-tile[data-nav="market"]');
await marketTile.hover();
await page.waitForTimeout(350);
await shot('01-dock-nav-hover');

// 02 vital verb hover (Hull Repair chip), with damage forced so the verb is live
await page.evaluate(() => { const p = window.SF.state.entities.get(window.SF.state.playerId); if (p) p.hull = Math.round(p.hullMax * 0.55); window.SF.state.fuel.current = Math.round(window.SF.state.fuel.max * 0.5); });
await page.waitForTimeout(600);
const repairChip = page.locator('[data-screen="station"] [data-vital-act="repair"]').first();
if (await repairChip.count()) { await repairChip.hover(); await page.waitForTimeout(300); }
await shot('02-vital-hover');

// 03 departure check popover
await page.evaluate(() => { const f = window.SF.state.fuel; if (f && f.max) f.current = Math.max(1, Math.round(f.max * 0.08)); });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('[data-screen="station"] .sxb-launch[data-act="undock"]').click());
await page.waitForFunction(() => { const p = document.querySelector('.sx-pop--dep'); return p && !p.hidden; }, null, { timeout: 5000 });
await page.waitForTimeout(400);
await shot('03-departure-pop');

// 04 cargo manifest popover (hold readout)
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('[data-screen="station"] [data-hold]').click());
await page.waitForFunction(() => { const p = document.querySelector('.sx-pop--hold'); return p && !p.hidden; }, null, { timeout: 5000 });
await page.waitForTimeout(400);
await shot('04-hold-pop');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 05 command palette
await page.keyboard.press('Control+k');
await page.waitForFunction(() => { const d = document.querySelector('#so-command-palette'); return d && d.open; }, null, { timeout: 5000 });
await page.waitForTimeout(300);
await shot('05-palette');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 06 service receipt: repair through the departure chip, then catch the receipt lane
await page.evaluate(() => { const p = window.SF.state.entities.get(window.SF.state.playerId); if (p) p.hull = Math.round(p.hullMax * 0.5); });
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('[data-screen="station"] .sxb-launch[data-act="undock"]').click());
await page.waitForFunction(() => { const p = document.querySelector('.sx-pop--dep'); return p && !p.hidden; }, null, { timeout: 5000 });
await page.waitForTimeout(300);
const depChip = page.locator('.sx-pop--dep .sx-depchip').filter({ hasText: /hull|repair/i }).first();
if (await depChip.count()) await depChip.click();
await page.waitForTimeout(700);
await shot('06-receipt');

// 07 comms history open
await page.evaluate(() => document.querySelector('[data-screen="station"] .sx-comms__toggle').click());
await page.waitForTimeout(400);
await shot('07-comms');
await page.evaluate(() => document.querySelector('[data-screen="station"] .sx-comms__toggle').click());
await page.waitForTimeout(300);

// 08 market, sell mode with hold contents
await page.evaluate(() => {
  const st = window.SF.state;
  st.player.cargo.items = { ...(st.player.cargo.items || {}), cmdty_ore_iron: 12 };
  const tile = document.querySelector('[data-screen="station"] .sx-dock [data-nav="market"]');
  tile.click();
});
await page.waitForTimeout(900);
await shot('08-market-buy');
await page.evaluate(() => {
  const sell = [...document.querySelectorAll('[data-screen="station"] .sx-trade__words button')].find((b) => (b.textContent || '').trim() === 'Sell');
  if (sell) sell.click();
});
await page.waitForTimeout(700);
await shot('09-market-sell');

// 10 shipworks, keyboard focus on a hardpoint via the systems board
await page.evaluate(() => document.querySelector('[data-screen="station"] .sx-dock [data-nav="shipworks"]').click());
await page.waitForTimeout(2500);
const hp = page.locator('[data-screen="station"] [data-spatial-slot]').first();
if (await hp.count()) { await hp.focus(); await page.waitForTimeout(400); }
await shot('10-shipworks');

// 11 ledger + keyboard focus on a row
await page.evaluate(() => document.querySelector('[data-screen="station"] .sx-dock [data-nav="ledger"]').click());
await page.waitForTimeout(900);
await shot('11-ledger');

console.log('done');
await browser.close();
child.kill();
