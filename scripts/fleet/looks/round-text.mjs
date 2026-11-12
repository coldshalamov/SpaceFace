// Lead look: ROUND TEXT. Start a Swarm round, launch it from the armory, and photograph a few frames
// 3-8 s into the round so the round's announcement (name, twist, voice line, receipts) can be read
// against the round panel, the centre column and the receipts.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/round-text.mjs [outPrefix] [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8163;
const out = process.argv[2] || '.devshots/fleet/looks/round-text/run';
const round = Number(process.argv[3] || 20);
mkdirSync(dirname(out), { recursive: true });
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);
  const t0 = Date.now();
  let live = 0;
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    live = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s || s.mode !== 'flight') return 0;
      return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
    }).catch(() => 0);
    if (live >= 1) break;
    await sleep(1500);
  }
  console.log(`fight live: ${live} hostiles after ${Math.round((Date.now() - t0) / 1000)} s`);
  await page.mouse.click(640, 360);
  // Frames at ~0.5 s intervals from 0 to ~8 s, plus a rect report of text vs panels.
  for (let i = 0; i < 16; i++) {
    await page.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.png` });
    if (i === 6 || i === 10) {
      const rects = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
        const o = {};
        for (const [k, sel] of Object.entries({ crun: '.sf-crun', col: '.sf-sj__col', stage: '#sf-stage-banner', item: '#sf-stage-banner .sf-stage__item', toasts: '#toasts', alert: '#alerts .sf-alert', objective: '.sf-mt-obj, .sf-objective' })) {
          o[k] = [...document.querySelectorAll(sel)].filter((e) => e.offsetWidth > 0).map(r);
        }
        return o;
      });
      console.log(i, JSON.stringify(rects));
      // Every visible text-bearing box over the world: who owns it, where it sits, does it have a plate.
      const owners = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
        if (el.children.length) return false; const t = (el.textContent || '').trim();
        const b = el.getBoundingClientRect(); return t.length > 24 && b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      }).map((el) => { const chain = []; let n = el; for (let k = 0; n && k < 4; k++, n = n.parentElement) chain.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
        const b = el.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)} ${chain.join(' < ')} | ${el.textContent.trim().slice(0, 40)}`; }));
      console.log(owners.join(String.fromCharCode(10)));
    }
    await sleep(500);
  }
  await browser.close();
} finally {
  server.kill();
}
