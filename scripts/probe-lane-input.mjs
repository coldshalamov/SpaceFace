// S1 stage-8 diag: does a real keydown reach the worker sim's state.input?
// Boots ?simLane=worker, New Game → Launch → flight, holds W, samples the
// main-side input mirror + lane diag counters.
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LANE = (() => { const i = process.argv.indexOf('--sim-lane'); return i > 0 ? process.argv[i + 1] : 'worker'; })();
const QUERY = LANE === 'main' ? '' : `?simLane=${encodeURIComponent(LANE)}`;

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
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
await page.goto(`http://127.0.0.1:${port}/${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el && getComputedStyle(el).display !== 'none';
}, null, { timeout: 60000 });
console.log('menu reached — lane:', LANE);
await clickButton(page, 'New Game');
await page.waitForTimeout(400);
await clickButton(page, 'Launch');
await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, { timeout: 120000 });
await page.waitForTimeout(2500);
console.log('flight reached');

const sample = () => page.evaluate(() => {
  const st = window.SF.state;
  const p = st.entities && st.entities.get(st.playerId);
  const diag = (window.SF.simLaneDiag && window.SF.simLaneDiag()) || null;
  return {
    mode: st.mode,
    tick: st.tick,
    input: {
      moveZ: st.input && st.input.moveZ,
      moveX: st.input && st.input.moveX,
      boost: st.input && st.input.boost,
      brake: st.input && st.input.brake,
      blocked: st.input && st.input.blocked,
    },
    ui: { screenStackLen: st.ui && Array.isArray(st.ui.screenStack) ? st.ui.screenStack.length : -1, docked: st.ui && st.ui.docked },
    vel: p && p.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : null,
    vxvz: p ? { vx: p.vx, vz: p.vz } : null,
    pos: p && p.pos ? { x: p.pos.x, z: p.pos.z } : null,
    rot: p ? p.rot : null,
    rowKeys: p ? Object.keys(p).filter(k => ['pos','vel','vx','vz','rot','alive','hull'].includes(k)) : null,
    transformRecords: diag && diag.journal ? undefined : undefined,
    journal: diag && diag.journal,
    postedDirectives: diag && diag.postedDirectives,
    postedSteps: diag && diag.postedSteps,
    replyCount: diag && diag.replyCount,
    boundaryCaptureCount: diag && diag.boundaryCaptureCount,
    boundaryErrorCount: diag && diag.boundaryErrorCount,
    laneError: diag && diag.error,
  };
});

console.log('before:', JSON.stringify(await sample()));
await page.mouse.move(720, 450);
await page.keyboard.down('KeyW');
await page.waitForTimeout(400);
const probe1 = await page.evaluate(async () => {
  if (!window.SF.laneRpc) return 'no laneRpc';
  const r = await window.SF.laneRpc('probeState', {});
  return r && r.result ? r.result : r;
});
console.log('worker t+0.4s:', JSON.stringify(probe1));
console.log('t+0.4s:', JSON.stringify(await sample()));
await page.waitForTimeout(600);
console.log('t+1.0s:', JSON.stringify(await sample()));
await page.waitForTimeout(600);
console.log('t+1.6s:', JSON.stringify(await sample()));
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
console.log('after :', JSON.stringify(await sample()));

await browser.close();
server.kill();
process.exit(0);
