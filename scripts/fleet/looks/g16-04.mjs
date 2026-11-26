// G16-04 look: notices on plates, merged floats, pad tags clear of the HUD, class-up plate seat.
// (derived from fe-pass.mjs)
// Frontend review look: live Swarm round 3 -> shoot the Foundry pad labels, the rope class-up
// plate (line:classChanged on the bus), and the Q context wheel held open.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/fe-pass.mjs <out-prefix> [WxH]
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const PORT = 8163;
const out = process.argv[2] || '.devshots/fleet/g16-04/after';
const [W, H] = (process.argv[3] || '1280x720').split('x').map(Number);
mkdirSync('.devshots/fleet/fe-pass', { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=3`, { waitUntil: 'commit', timeout: 120000 });
  const t0 = Date.now();
  let mode = '';
  while (Date.now() - t0 < 480_000) {
    mode = await page.evaluate(() => {
      const s = window.SF && (window.SF.state || (window.SF.getState && window.SF.getState()));
      return s ? `${s.mode}|${s.run && s.run.phase}` : 'no-state';
    }).catch(() => 'eval-failed');
    if (/flight\|(active|fight|armory|preparation)/.test(mode)) break;
    await sleep(2000);
  }
  console.log('mode', mode);
  const launch = page.getByText(/Launch round/i).first();
  if (await launch.isVisible().catch(() => false)) { await launch.click(); await sleep(6000); }
  await page.mouse.click(Math.round(W / 2), Math.round(H / 2)); await sleep(500);
  await page.screenshot({ path: `${out}-start.png` });
  await page.evaluate(() => {
    const bus = window.SF.bus;
    bus.emit('toast', { text: 'Graphics eased automatically to keep the game responsive', kind: 'info', ttl: 12 });
    bus.emit('toast', { text: 'CARGO RECOVERY NOTICE: Bounty after the spill, paid to the hauler who dragged it home from the foundry floor.', kind: 'warn', ttl: 12 });
    bus.emit('voice:say', { channel: 'tutorial', id: 'g1604:wasp', text: 'Wasp Swarmer: Light enough to throw — catch one on the line and whip it into its packmates.', ttl: 12 });
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    const pos = p && p.pos ? { x: p.pos.x + 60, y: 0, z: p.pos.z + 60 } : { x: 0, y: 0, z: 0 };
    for (const [w, sc] of [['SHUNTED', 12], ['SHUNTED', 256], ['FRIENDLY FIRE', 0], ['FRIENDLY FIRE', 0], ['FRIENDLY FIRE', 0], ['FRIENDLY FIRE', 0]]) bus.emit('swarm:killPopup', { pos, word: w, score: sc, cause: 'collision' });
  });
  await sleep(400);
  await page.screenshot({ path: `${out}-notices.png` });
  console.log('floats', await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.sf-sj__pop,.sf-ft')].filter((e) => !e.hidden && e.style.display !== 'none' && e.textContent).map((e) => e.textContent))));
  console.log('right', await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.sf-toast,.sf-commtape,.sf-caption')].map((e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { c: e.className.toString().slice(0, 30), t: e.textContent.slice(0, 30), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: c.backgroundColor + '|' + c.backgroundImage.slice(0, 30), pad: c.padding }; }))));
  console.log('pads', await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.sf-fp')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), op: e.style.opacity }; }))));
  console.log('avoid', await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.sf-sj__col > *:not([hidden]),.sf-crun,.sf-leftcontext,.sf-bars,.sf-radar')].map((e) => { const r = e.getBoundingClientRect(); return [e.className.toString().slice(0, 20), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }))));
  await page.evaluate(() => window.SF.bus.emit('line:classChanged', { classIndex: 3 }));
  await sleep(1000);
  await page.screenshot({ path: `${out}-plate.png` });
  console.log('plate', await page.evaluate(() => { const f = document.querySelector('.sf-discovery-plate__frame'); if (!f) return 'none'; const r = f.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); }));
  console.log('chain', await page.evaluate(() => { const f = document.querySelector('.sf-discovery-plate__frame'); const o = []; for (let e = f; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); o.push((e.id || e.className.toString().slice(0, 30)) + ' pos=' + c.position + ' left=' + e.style.left + ' top=' + e.style.top + ' tf=' + c.transform.slice(0, 24) + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return o.join(' | '); }));
  console.log('probe', await page.evaluate(() => [[1000, 35], [1100, 60], [1100, 140], [100, 560], [60, 450]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return x + ',' + y + ':' + (e ? (e.id || '') + '.' + e.className.toString().slice(0, 40) + ' <' + (e.parentElement && (e.parentElement.id || e.parentElement.className.toString().slice(0, 30))) : '-'); })));
  await browser.close();
} finally { server.kill(); }
