// scripts/review-ui.mjs — open the real game in a visible window, ready to review.
//
//   node scripts/review-ui.mjs            → new game, docked at a populated station
//   node scripts/review-ui.mjs --flight   → new game, in flight (charts, HUD, comms fan)
//
// Boots the real game (same route as playing), starts a fresh save with normal details —
// station trade stock, contracts, faction standings, contacts — and leaves a browser window
// open for you to click through. Nothing is mocked: it is the live simulation.
// Ctrl+C in this terminal when you are done (the window and server close with it).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOCKED = !process.argv.includes('--flight');
const WIDTH = Number(process.argv.find((a) => a.startsWith('--width='))?.slice(8) || 1920);
const HEIGHT = Number(process.argv.find((a) => a.startsWith('--height='))?.slice(9) || 1080);

async function findFreePort(start) {
  for (let port = start; port < start + 120; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

const port = await findFreePort(8620);
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
process.on('exit', () => { try { server.kill(); } catch (_) {} });
let up = false;
for (let i = 0; i < 160 && !up; i++) {
  try { if ((await fetch(url)).ok) up = true; } catch (_) {}
  if (!up) await new Promise((r) => setTimeout(r, 250));
}
if (!up) { console.error('server did not start'); process.exit(1); }

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--window-size=' + (WIDTH + 16) + ',' + (HEIGHT + 48)],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
for (let attempt = 0; attempt < 3; attempt++) {
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; }
  catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 180000 });

async function clickButton(label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('button')]
      .find((x) => norm(x.textContent) === norm(wanted) || norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

await clickButton('New Game');
await page.waitForSelector('[data-screen="newGame"]', { timeout: 60000 });
await page.waitForTimeout(800);
let launched = false;
for (let i = 0; i < 240 && !launched; i += 1) {
  launched = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-footer button')];
    const launch = buttons[buttons.length - 1];
    if (!launch || launch.disabled) return false;
    launch.click();
    return true;
  });
  if (!launched) await page.waitForTimeout(250);
}
if (!launched) throw new Error('launch button missing or disabled');
await page.waitForFunction(() => {
  const st = window.SF && window.SF.state;
  const p = st && st.entities && st.entities.get(st.playerId);
  return !!(st && st.mode === 'flight' && p && p.alive);
}, null, { timeout: 240000 });
await page.waitForFunction(() => !document.body.classList.contains('ui-live-screen'), null, { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(1500);

if (DOCKED) {
  const stationId = await page.evaluate(() => {
    const st = window.SF.state;
    const station = (st.entityList || []).find((e) => e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) return null;
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  if (stationId) {
    await page.waitForSelector('[data-screen="station"]', { timeout: 20000 });
    console.log('');
    console.log('DOCKED at a station. Click through the Command Dock:');
    console.log('  Market · Shipworks · Industry · Missions · Factions · Bar · Ledger');
    console.log('  Undock via the launch control (top right) to review the flight HUD.');
  } else {
    console.log('no station found nearby — you are in flight; fly to one and dock with E');
  }
} else {
  console.log('');
  console.log('IN FLIGHT. Keys worth reviewing:');
  console.log('  Alt (hold) quick-comms fan · M local chart · N star chart · F2 ship ·');
  console.log('  F3 footprint · F4 range · J mission log · K codex · T tech tree ·');
  console.log('  I cargo · L comms log · Shift+O band · F1 help · Esc pause');
  console.log('  Fly to a station and press E to dock.');
}
console.log('');
console.log('Review window is live at ' + url);
console.log('Press Ctrl+C here when you are done.');
// Keep the process alive so the window stays open; Ctrl+C tears everything down.
await new Promise(() => {});
