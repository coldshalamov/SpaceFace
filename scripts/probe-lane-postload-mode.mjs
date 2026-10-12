// Post-Continue lane diagnosis: boots ?simLane=worker, ensures a quick save exists
// (writes one if the slot is empty by launching a fresh game), reloads the page,
// clicks Continue, then samples BOTH main and worker mode/tick/pos over ~8s while
// holding thrust — distinguishes worker-stuck-loading vs mirror-stale vs healthy.
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('./', import.meta.url));

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
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

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button')].filter(x =>
      x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'
      && !x.disabled && x.getAttribute('aria-disabled') !== 'true');
    const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
}

const port = await findFreePort(8460);
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  stdio: ['ignore', 'ignore', 'ignore'],
  windowsHide: true,
});
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.goto(`http://127.0.0.1:${port}/?simLane=worker`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 60000 });

// First pass: New Game + quick save so the reload has a Continue target.
await clickButton(page, 'New Game');
await page.waitForTimeout(400);
await clickButton(page, 'Launch');
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.SF.bus.emit('game:save', { slot: 'quick' }));
await page.waitForTimeout(900);
console.log('fresh save written');

await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 60000 });
const clicked = await clickButton(page, 'Continue');
console.log('continue clicked:', clicked);

// Sample mode transitions on BOTH realms at 1s cadence for ~10s.
for (let i = 0; i < 10; i++) {
  const snap = await page.evaluate(async () => {
    const st = window.SF.state;
    const p = st.entities && st.entities.get(st.playerId);
    let worker = null;
    try {
      const r = window.SF.laneRpc ? await window.SF.laneRpc('probeState', {}) : null;
      worker = r && r.result ? r.result : r;
    } catch (e) { worker = { rpcError: String(e).slice(0, 120) }; }
    return {
      main: { mode: st.mode, tick: st.tick, x: p && p.pos && p.pos.x },
      worker: worker && {
        mode: worker.mode, tick: worker.tick,
        x: worker.playerPos && worker.playerPos.x,
      },
    };
  });
  console.log(`t+${i}s`, JSON.stringify(snap));
  if (i === 0) {
    await page.mouse.move(720, 450);
    await page.keyboard.down('KeyW');
  }
  await page.waitForTimeout(1000);
}
await page.keyboard.up('KeyW');
await browser.close();
server.kill();
