// S1 stage-8 diag: does a forwarded game:load restore state in the worker?
// Boots ?simLane=worker, New Game → flight, writes 'quick', moves the ship,
// emits game:load, then samples worker probeState (mode/tick/pos/bus events).
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

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

const port = await findFreePort(8360);
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
await clickButton(page, 'New Game');
await page.waitForTimeout(400);
await clickButton(page, 'Launch');
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: 120000 });
await page.waitForTimeout(2000);
console.log('flight reached');

// Write quick slot (forwarded to worker; main persists the envelope too).
await page.evaluate(() => window.SF.bus.emit('game:save', { slot: 'quick' }));
await page.waitForTimeout(800);
const savedTick = await page.evaluate(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  return { tick: window.SF.state.tick, keys: keys.filter(k => k.startsWith('sf.')) };
});
console.log('saved:', JSON.stringify(savedTick));

// Move the ship so the restore has something to undo.
await page.mouse.move(720, 450);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1000);
await page.keyboard.up('KeyW');
const moved = await page.evaluate(() => {
  const st = window.SF.state;
  const p = st.entities && st.entities.get(st.playerId);
  return { tick: st.tick, x: p && p.pos && p.pos.x };
});
console.log('moved:', JSON.stringify(moved));

// Now the load.
await page.evaluate(() => window.SF.bus.emit('game:load', { slot: 'quick' }));
await page.waitForTimeout(2500);
const afterMain = await page.evaluate(() => {
  const st = window.SF.state;
  const p = st.entities && st.entities.get(st.playerId);
  const diag = (window.SF.simLaneDiag && window.SF.simLaneDiag()) || null;
  return { mode: st.mode, tick: st.tick, x: p && p.pos && p.pos.x, laneError: diag && diag.error };
});
console.log('after main-side:', JSON.stringify(afterMain));
const probe = await page.evaluate(async () => {
  if (!window.SF.laneRpc) return 'no laneRpc';
  const r = await window.SF.laneRpc('probeState', {});
  return r && r.result ? r.result : r;
});
console.log('worker:', JSON.stringify(probe));

const achv = await page.evaluate(() => {
  const career = window.SF.telemetry && window.SF.telemetry.getCareerStats ? window.SF.telemetry.getCareerStats() : null;
  const snap = window.SF.ctx && window.SF.ctx.achievements && window.SF.ctx.achievements.snapshot ? window.SF.ctx.achievements.snapshot() : null;
  const telemRaw = localStorage.getItem('sf_telemetry_v1');
  const achRaw = localStorage.getItem('sf.save.achievements');
  return {
    career,
    unlockedCount: snap && snap.unlockedCount,
    unlocked: snap && snap.unlocked,
    counters: snap && snap.counters,
    telemSessions: telemRaw ? JSON.parse(telemRaw).sessions.length : -1,
    achRawLen: achRaw ? achRaw.length : 0,
  };
});
console.log('achievements/career:', JSON.stringify(achv));

// Now replicate the check's exact second half: reload, click Continue, inspect.
await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 60000 });
const clicked = await clickButton(page, 'Continue');
console.log('continue clicked:', clicked);
await page.waitForTimeout(500);
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: 120000 });
await page.waitForTimeout(3000);
const achv2 = await page.evaluate(() => {
  const career = window.SF.telemetry && window.SF.telemetry.getCareerStats ? window.SF.telemetry.getCareerStats() : null;
  const snap = window.SF.ctx && window.SF.ctx.achievements && window.SF.ctx.achievements.snapshot ? window.SF.ctx.achievements.snapshot() : null;
  return { career, unlockedCount: snap && snap.unlockedCount, unlocked: snap && snap.unlocked, counters: snap && snap.counters };
});
console.log('post-continue achievements:', JSON.stringify(achv2));

// Post-restore flight: does input still move the ship? (CONTROLS~LOAD analog)
await page.mouse.move(720, 450);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1600);
await page.keyboard.up('KeyW');
const postW = await page.evaluate(() => {
  const st = window.SF.state;
  const p = st.entities && st.entities.get(st.playerId);
  return {
    tick: st.tick, x: p && p.pos && p.pos.x,
    vel: p && p.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : null,
    moveZ: st.input && st.input.moveZ,
    screenStack: st.ui && st.ui.screenStack ? [...st.ui.screenStack] : null,
    docked: st.ui && st.ui.docked,
    laneApplied: window.__SF_LANE_APPLIED ? [...window.__SF_LANE_APPLIED] : null,
  };
});
console.log('post-load W-hold:', JSON.stringify(postW));
const probe2 = await page.evaluate(async () => {
  const r = await window.SF.laneRpc('probeState', {});
  return r && r.result ? r.result : r;
});
console.log('worker post-load:', JSON.stringify(probe2));

await browser.close();
server.kill();
