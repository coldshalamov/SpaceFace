// Frontend review look: live Swarm round 3 -> shoot the Foundry pad labels, the rope class-up
// plate (line:classChanged on the bus), and the Q context wheel held open.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/fe-pass.mjs <out-prefix> [WxH]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const PORT = 8163;
const out = process.argv[2] || '.devshots/fleet/fe-pass/live';
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
  // Original (pre-fe-pass) pad label rules, injected over the current ones for an honest before.
  const OLD = '.sf-fp{padding:0!important;background:none!important;border:0!important;box-shadow:none!important;border-radius:0!important;font-weight:760!important;line-height:normal!important;text-shadow:0 0 7px rgb(0 0 0 / .94),0 1px 0 rgb(0 0 0 / .5)!important}';
  const tag = await page.addStyleTag({ content: OLD });
  await sleep(200);
  await page.screenshot({ path: `${out}-pads-old.png` });
  await tag.evaluate((n) => n.remove());
  await sleep(200);
  await page.screenshot({ path: `${out}-pads.png` });
  console.log('pads', await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.sf-fp')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }))));
  console.log('emit', await page.evaluate(() => {
    const ui = window.SF.registry.get('ui');
    window.SF.bus.emit('line:classChanged', { classIndex: 3 });
    const st = ui && ui.stage;
    return JSON.stringify({ hasPlate: !!(ui && ui.discoveryPlate), hasStage: !!st, vis: st && st.visible('banner').length, queued: st && st.queued('banner').length, held: st && st.held('banner'), bannerHtml: (document.getElementById('sf-stage-banner') || {}).innerHTML?.length });
  }));
  await sleep(300);
  await page.screenshot({ path: `${out}-plate-early.png` });
  await sleep(700);
  console.log('chain', await page.evaluate(() => { const f = document.querySelector('.sf-discovery-plate__frame'); const o = []; for (let e = f; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); o.push(`${e.id || e.className.toString().slice(0, 40)} op=${c.opacity} vis=${c.visibility} pos=${c.position} z=${c.zIndex} tf=${c.transform.slice(0, 30)} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`); } return o.join(' | '); }));
  await page.screenshot({ path: `${out}-plate.png` });
  console.log('plate', await page.evaluate(() => { const f = document.querySelector('.sf-discovery-plate__frame'); if (!f) return 'none'; const r = f.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cs: getComputedStyle(f).backgroundColor, par: f.parentElement.className, inHud: !!f.closest('#hud'), font: getComputedStyle(f.firstElementChild).fontFamily.slice(0,40), fs: getComputedStyle(f.firstElementChild).fontSize, bl: getComputedStyle(f).borderLeftWidth }); }));
  await sleep(4500);
  await page.keyboard.down('q'); await sleep(1100);
  await page.screenshot({ path: `${out}-wheel.png` });
  console.log('wheel', await page.evaluate(() => { const w = document.getElementById('sf-context-wheel'); if (!w) return 'none'; const r = w.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), labels: [...w.querySelectorAll('.sf-cwheel__label')].map((l) => { const b = l.getBoundingClientRect(); return `${l.textContent}:${Math.round(b.width)}x${Math.round(b.height)}@${getComputedStyle(l).fontSize}`; }) }); }));
  await page.keyboard.up('q');
  await browser.close();
} finally { server.kill(); }
