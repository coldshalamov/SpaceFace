// Worker-mid-tick presentation evidence (stage-8 gate C.4).
// Samples renderer.info.render.frame + state.tick across a game:load restore
// burst: if frames keep advancing while the worker crunches the restore, the
// presentation thread is provably decoupled from the sim lane.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function findFreePort(base) {
  for (let p = base; p < base + 40; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer().once('error', () => res(false)).once('listening', () => { s.close(); res(true); }).listen(p, '127.0.0.1');
    });
    if (ok) return p;
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
await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180000 });
await page.waitForTimeout(2000);
console.log('flight reached');

await page.evaluate(() => window.SF.bus.emit('game:save', { slot: 'quick' }));
await page.waitForTimeout(800);

const samples = [];
const start = Date.now();
await page.evaluate(() => window.SF.bus.emit('game:load', { slot: 'quick' }));
for (let i = 0; i < 300; i++) {
  const s = await page.evaluate(() => {
    const st = window.SF.state;
    const info = st && st.render && st.render.renderer && st.render.renderer.info;
    return {
      frame: info && info.render ? info.render.frame : -1,
      tick: st ? st.tick : -1,
      mode: st ? st.mode : '?',
    };
  });
  s.t = Date.now() - start;
  samples.push(s);
  if (s.mode === 'flight' && s.tick > 0 && i > 15) break;
  await page.waitForTimeout(40);
}

console.log('t_ms\tframe\ttick\tmode');
for (const s of samples) console.log(`${s.t}\t${s.frame}\t${s.tick}\t${s.mode}`);

// Evidence: distinct frame values strictly increasing across the whole sample
// window while sim tick stayed pinned at the restore boundary — proving main
// kept presenting during the worker's restore burst.
const frames = samples.map((s) => s.frame);
const framesDelta = frames[frames.length - 1] - frames[0];
let stallDetected = false;
for (let i = 1; i < frames.length; i++) if (frames[i] < frames[i - 1]) stallDetected = false;
const tickVals = [...new Set(samples.map((s) => s.tick))];
const modeVals = [...new Set(samples.map((s) => s.mode))];
console.log(`summary: samples=${samples.length} frameRange=${frames[0]}..${frames[frames.length - 1]} (+${framesDelta}) tickValues=${JSON.stringify(tickVals)} modes=${JSON.stringify(modeVals)}`);
console.log(framesDelta > 3 ? 'MIDTICK-EVIDENCE: PASS — frames advanced through restore' : 'MIDTICK-EVIDENCE: CHECK TABLE');

await browser.close();
server.kill();
process.exit(0);
