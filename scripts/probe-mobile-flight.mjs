#!/usr/bin/env node
// Real-route phone probe: boots the actual game in a touch-device Chrome (real GPU, hardware touch
// emulation through CDP, not synthetic JS events), walks title -> New Game -> Launch -> flight with
// fingers, then exercises the deck with real multi-touch: stick, boost, flick, gun, tether, powers
// wheel, pause, DOCK key, and a grid of "can a thumb start the stick here?" taps. Shoots the live deck.
//
//   node scripts/probe-mobile-flight.mjs                 # portrait 390x844
//   node scripts/probe-mobile-flight.mjs --land          # landscape 844x390
//   node scripts/probe-mobile-flight.mjs --width=360 --height=740 --lefty
//   node scripts/probe-mobile-flight.mjs --url=https://spaceface-play-demo.vercel.app   # a deployment
//
// Pictures and report.json land in .devshots/mobile-live/<tag>/. Exit code 1 if any check fails.
// Never touches the player's save drawer: the local server runs with an empty player store.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const LAND = !!argv.land;
const W = Number(argv.width) || (LAND ? 844 : 390);
const H = Number(argv.height) || (LAND ? 390 : 844);
const TAG = argv.tag || `${W}x${H}${argv.lefty ? '-lefty' : ''}`;
const OUT = resolve(ROOT, argv.out || `.devshots/mobile-live/${TAG}`);
const BOOT_TIMEOUT = Number(argv['boot-timeout'] || 600) * 1000;
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '  ok ' : ' FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return !!ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}
async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '', PORT: String(port) },
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) return { url: `http://127.0.0.1:${port}/`, stop: () => child.kill() }; } catch { /* not up yet */ }
    await sleep(400);
  }
  child.kill(); throw new Error('game server did not start');
}

const server = argv.url ? { url: String(argv.url).replace(/\/?$/, '/'), stop() {} } : await startServer();
const { chromium } = await loadPlaywright();
const chromeExe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({
  headless: true,
  ...(chromeExe && !argv.bundled ? { executablePath: chromeExe } : {}),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const context = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
});
// --lefty: a returning player's saved setting, in place before the game boots (the same profile key the game writes)
if (argv.lefty) await context.addInitScript(() => { try { localStorage.setItem('sf.settings.profile.v1', JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), settings: { controls: { touch: { layout: 'lefty' } } } })); } catch (e) { /* storage blocked: the run proceeds right-handed */ } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', String(e.message).slice(0, 200)));
const cdp = await context.newCDPSession(page);

// ---- real touch through CDP: every event carries the full set of live contacts ---------------------
const live = new Map();
let touchSeq = 1;
async function sendTouch(type) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...live.values()].map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })) });
}
const finger = {
  async down(x, y) { const id = touchSeq++; live.set(id, { id, x, y }); await sendTouch('touchStart'); return id; },
  async move(id, x, y) { live.set(id, { id, x, y }); await sendTouch('touchMove'); },
  // CDP: touchEnd lists the contacts that REMAIN, so the lifted one leaves the set first
  async up(id) { live.delete(id); await sendTouch('touchEnd'); },
  /** a human flick: down, one jump, up, delivered back to back so CDP latency cannot stretch it past the flick window */
  async flick(x0, y0, x1, y1) {
    const id = touchSeq++; const pt = (x, y) => ({ x, y, id, radiusX: 12, radiusY: 12, force: 1 });
    await Promise.all([
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x0, y0)] }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(x1, y1)] }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    ]);
  },
  async tap(x, y, hold = 60) { const id = await finger.down(x, y); await sleep(hold); await finger.up(id); },
  /** drag over `ms` in `steps` moves */
  async drag(id, x0, y0, x1, y1, ms = 300, steps = 10) { for (let i = 1; i <= steps; i += 1) { await finger.move(id, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(ms / steps); } },
};
// A production bundle does not expose window.SF (debug surfaces are dev-only), so against a deployment every read comes from
// the DOM the player sees: the speed numeral, the stick's own flags and readout, the wheel, the toast, which screen is up.
let HAS_SF = false;
const snapDom = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s), vis = (s) => { const e = q(s); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; };
  const stick = q('.mf-stick'), shown = !!stick && !stick.hidden;
  const word = q('.mf-stick .mf-num')?.textContent || '';
  const mag = /^[0-9]+$/.test(word) ? Number(word) / 100 : (stick?.dataset.boost === '1' ? 1 : 0);
  const screens = ['pause', 'station', 'mainMenu', 'newGame', 'settings'].filter((id) => { const e = q('[data-screen="' + id + '"]'); return e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none'; });
  const flightOn = document.documentElement.dataset.sfMobileFlight === '1';
  return { mode: flightOn ? 'flight' : 'other', rot: null, speed: Number((q('.mf-speed b')?.textContent || '').replace(/[^0-9.]/g, '')) || 0,
    axes: { lx: 0, ly: shown ? -mag : 0, rx: 0, ry: 0 },
    flight: { active: shown && !stick.classList.contains('is-leaving'), mag, boost: stick?.dataset.boost === '1', brake: stick?.dataset.brake === '1', flick: stick?.dataset.flick === '1' },
    fire: q('.mf-gun')?.dataset.held === '1', stickShown: shown && !stick.classList.contains('is-leaving'), boostFlag: stick?.dataset.boost, leaving: !!q('.mf-stick.is-leaving'),
    wheelOpen: vis('.mf-wheel'), gunHeld: q('.mf-gun')?.dataset.held, dockShown: vis('.mf-dock'),
    screens, toast: vis('.mf-toast') ? q('.mf-toast').textContent : null };
});
const snapSf = () => page.evaluate(() => {
  const st = window.SF.state, p = st.entities.get(st.playerId), t = window.SF.ctx.touch, m = t.mobile;
  const q = (s) => document.querySelector(s);
  return { mode: st.mode, rot: p ? +p.rot.toFixed(3) : null, speed: p ? +Math.hypot(p.vel.x, p.vel.z).toFixed(1) : null,
    axes: { lx: +t.axes.leftX.toFixed(2), ly: +t.axes.leftY.toFixed(2), rx: +t.axes.rightX.toFixed(2), ry: +t.axes.rightY.toFixed(2) },
    flight: { active: m.frame.flight.active, mag: +(m.frame.flight.magnitude || 0).toFixed(2), boost: !!m.frame.flight.boost, brake: !!m.frame.flight.brake, flick: !!m.frame.flight.flick },
    fire: !!t._btnHeld?.fire, stickShown: !!q('.mf-stick') && !q('.mf-stick').hidden, boostFlag: q('.mf-stick')?.dataset.boost, leaving: !!q('.mf-stick.is-leaving'),
    wheelOpen: !!q('.mf-wheel') && !q('.mf-wheel').hidden, gunHeld: q('.mf-gun')?.dataset.held, dockShown: !!q('.mf-dock') && !q('.mf-dock').hidden,
    screens: [...(st.ui.screenStack || [])], toast: q('.mf-toast') && !q('.mf-toast').hidden ? q('.mf-toast').textContent : null };
});
const snap = () => (HAS_SF ? snapSf() : snapDom());
const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height } : null; }, sel);
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

try {
  // ---- boot: title -> New Game -> Launch, with fingers ----------------------------------------------
  console.log(`probe: ${server.url}  ${W}x${H}  ->  ${OUT}`);
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  HAS_SF = await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: argv.url ? 8000 : BOOT_TIMEOUT }).then(() => true).catch(() => false);
  console.log(`  debug handle: ${HAS_SF ? 'window.SF present (dev route)' : 'absent (production bundle): reading the DOM only'}`);
  const splash = await page.waitForSelector('#cinematic-splash .cine-begin', { timeout: 120000 }).catch(() => null);
  if (splash) {
    await sleep(3500);
    check('splash says Tap to begin on a touch phone', /tap to begin/i.test(await page.textContent('.cine-begin')));
    const lock = await page.evaluate(() => { const t = document.querySelector('.cine-title').getBoundingClientRect(); return { l: t.left, r: t.right, vw: innerWidth }; });
    check('splash wordmark fits the screen', lock.l >= 0 && lock.r <= lock.vw, JSON.stringify(lock));
    await shot('00-splash');
    await finger.tap(W / 2, H / 2);
    await sleep(1200);
  }
  // motion-effects first-run question, if asked
  if (await page.$('[data-screen="motionAsk"]:not([hidden])')) { await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^full/i.test(b.textContent.trim()))?.click()); await sleep(800); }
  await page.waitForSelector('[data-screen="mainMenu"] button[data-action="newGame"]', { state: 'visible', timeout: 180000 });
  await sleep(1500);
  await shot('01-title');
  const menu = await page.evaluate(() => {
    const logo = document.querySelector('.dp-logotype').getBoundingClientRect();
    const items = [...document.querySelectorAll('[data-screen="mainMenu"] .dp-lit button, [data-screen="mainMenu"] nav button')].filter((b) => b.getBoundingClientRect().width > 4);
    const rects = items.map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent || '').trim().slice(0, 14), top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    return { logoBottom: logo.bottom, rects, vw: innerWidth, vh: innerHeight };
  });
  // landscape stands the verbs in their own scrolling column beside the name; the first three must be on screen
  const shown = LAND ? menu.rects.slice(0, 3) : menu.rects;
  check('title verbs sit inside the screen' + (LAND ? ' (first three; the column scrolls)' : ' below the logotype'), menu.rects.length >= 4 && shown.every((r) => (LAND || r.top >= menu.logoBottom - 2) && r.left >= 0 && r.right <= menu.vw && r.bottom <= menu.vh), JSON.stringify(menu.rects.map((r) => r.t)));
  const small = menu.rects.filter((r) => r.bottom - r.top < 44).map((r) => r.t);
  check('title verbs are thumb-sized (>= 44px)', small.length === 0, small.join(','));
  const newGame = await rect('[data-screen="mainMenu"] button[data-action="newGame"]'); // the demo build labels this verb Adventure
  await finger.tap(newGame.x, newGame.y);
  await page.waitForSelector('.sf-ng-footer', { state: 'visible', timeout: 30000 });
  await sleep(1500);
  await shot('02-new-game');
  const ng = await page.evaluate(() => {
    const hulls = [...document.querySelectorAll('.orr-turntable .k-word')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: r.left, r: r.right, h: r.height }; });
    const launch = document.querySelector('.sf-ng-launch').getBoundingClientRect();
    return { hulls, launchBottom: launch.bottom, vh: innerHeight, vw: innerWidth };
  });
  check('New Game offers the three hulls as on-screen choices', ng.hulls.length === 3 && ng.hulls.every((h) => h.l >= 0 && h.r <= ng.vw), JSON.stringify(ng.hulls.map((h) => h.t)));
  check('Launch is on screen', ng.launchBottom <= ng.vh);
  const launch = await rect('.sf-ng-launch');
  await finger.tap(launch.x, launch.y);
  const t0 = Date.now();
  await page.waitForFunction(() => (window.SF && window.SF.state ? window.SF.state.mode === 'flight' : document.documentElement.dataset.sfMobileFlight === '1'), null, { timeout: BOOT_TIMEOUT, polling: 1000 });
  check('a plain New Game is the adventure, not the physics toy', await page.evaluate(() => (window.SF && window.SF.state ? window.SF.state.sandbox !== true : !document.querySelector('.sf-sandbox-lab-form') || ![...document.querySelectorAll('.sf-sandbox-lab-form')].some((e) => e.offsetParent))));
  console.log(`  launch -> flight in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sleep(4000);

  // ---- the deck ---------------------------------------------------------------------------------------
  const deck = await page.evaluate(() => ({ flight: !document.querySelector('.mf-flight').hidden, flag: document.documentElement.dataset.sfMobileFlight, ghost: !document.querySelector('.mf-ghost').hidden, sandboxPanel: !!document.querySelector('.sf-sandbox-lab-form') && [...document.querySelectorAll('.sf-sandbox-lab-form')].some((e) => e.offsetParent) }));
  check('the deck is up in flight', deck.flight && deck.flag === '1', JSON.stringify(deck));
  check('no physics-lab rack over the HUD', !deck.sandboxPanel);
  await shot('10-flight-idle');

  // nothing the game prints may sit under a deck control or the status strip
  const overlaps = async (label) => {
    const hits = await page.evaluate(() => {
      const zones = ['.mf-status', '.mf-pause', '.mf-gun', '.mf-tether', '.mf-edge', '.mf-dock', '.mf-wheel-top'].map((sel) => [sel, document.querySelector(sel)]).filter(([, el]) => el && !el.hidden && el.getBoundingClientRect().width > 0).map(([sel, el]) => [sel, el.getBoundingClientRect()]);
      const out = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('#sf-touch-overlay') || e.closest('dialog') || e.tagName === 'CANVAS' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
        if (/semantic|sr-only|visually-hidden/.test(String(e.className))) continue; // screen-reader text, clipped off screen
        if (![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.08) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0) continue;
        for (const [name, z] of zones) {
          const w = Math.min(r.right, z.right) - Math.max(r.left, z.left), h = Math.min(r.bottom, z.bottom) - Math.max(r.top, z.top);
          if (w > 6 && h > 6) { out.push(name + ' <- ' + (String(e.className).split(' ')[0] || e.tagName.toLowerCase()) + ' "' + (e.textContent || '').trim().slice(0, 28) + '"'); break; }
        }
      }
      return [...new Set(out)];
    });
    check(label, hits.length === 0, hits.slice(0, 6).join(' | '));
    if (hits.length) {
      const chains = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !e.closest('#sf-touch-overlay') && e.getBoundingClientRect().width > 4 && getComputedStyle(e).display !== 'none' && ['#hud > *', '#ui-root > *', 'body > *'].some((sel) => e.matches(sel))).map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ').slice(0, 3).join('.')} [${[r.left, r.top, r.width, r.height].map(Math.round)}] ${cs.position} z=${cs.zIndex} op=${cs.opacity}`; }));
      writeFileSync(join(OUT, 'hud-containers.txt'), chains.join('\n'));
    }
  };
  await sleep(2500);
  await overlaps('HUD text keeps off the deck controls (idle)');
  // anything at all (not only text) standing in the powers handle's column, for the record
  writeFileSync(join(OUT, 'edge-column.txt'), (await page.evaluate(() => { const h = document.querySelector('.mf-edge').getBoundingClientRect(); return [...document.querySelectorAll('body *')].filter((e) => !e.closest('#sf-touch-overlay')).map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 2 && r.height > 2 && r.right > h.left && r.left < h.right && r.bottom > h.top && r.top < h.bottom).map(({ e, r }) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ').slice(0, 3).join('.')} [${[r.left, r.top, r.width, r.height].map(Math.round)}] ${getComputedStyle(e).position}`).slice(0, 25); })).join('\n'));
  const stickAt = { x: Math.round(W * (argv.lefty ? 0.7 : 0.3)), y: Math.round(H * (LAND ? 0.6 : 0.66)) };
  const radius = await page.evaluate(() => Math.min(innerWidth, innerHeight) * 0.19 < 54 ? 54 : Math.min(86, Math.min(innerWidth, innerHeight) * 0.19));
  const before = await snap();
  // stick: push up-right at ~70% and hold
  let id = await finger.down(stickAt.x, stickAt.y);
  await finger.drag(id, stickAt.x, stickAt.y, stickAt.x + radius * 0.55, stickAt.y - radius * 0.5, 200);
  await sleep(1500);
  let s = await snap();
  check('stick appears under the thumb and drives thrust', s.stickShown && s.flight.active && s.flight.mag > 0.3 && s.axes.ly < -0.1, JSON.stringify(s.flight) + ' ' + JSON.stringify(s.axes));
  if (HAS_SF) check('the hull turns toward the stick', Math.abs(s.rot - before.rot) > 0.05 || s.axes.lx !== 0, `rot ${before.rot} -> ${s.rot}`);
  await shot('11-flight-stick');
  await sleep(1500);
  const moving = await snap();
  check('the hull accelerates (the speed numeral climbs)', moving.speed > before.speed + 5, `speed ${before.speed} -> ${moving.speed}`);
  // boost: pull past the dashed ring
  await finger.drag(id, stickAt.x + radius * 0.55, stickAt.y - radius * 0.5, stickAt.x + radius * 1.1, stickAt.y - radius * 1.1, 200);
  await sleep(500);
  s = await snap();
  check('past the dashed ring latches boost', s.flight.boost && s.boostFlag === '1', JSON.stringify(s.flight));
  await shot('12-flight-boost');
  await finger.up(id);
  await sleep(120);
  s = await snap();
  check('letting go fades the instrument (it does not blink out)', s.leaving || !s.stickShown);
  await sleep(500);
  s = await snap();
  check('release returns the axes to neutral', !s.stickShown && s.axes.lx === 0 && s.axes.ly === 0 && !s.flight.active, JSON.stringify(s.axes));

  // flick: a quick straight jump and lift. Frames are counted inside the page: a flick pulse lasts ~4 sim ticks,
  // too short for a polled evaluate to catch reliably.
  await page.evaluate(() => {
    window.__flicks = 0;
    const watch = () => { const st = document.querySelector('.mf-stick'); if (!st) return setTimeout(watch, 50); new MutationObserver(() => { if (st.dataset.flick === '1') window.__flicks += 1; }).observe(st, { attributes: true, attributeFilter: ['data-flick'] }); };
    watch();
    if (window.SF && window.SF.ctx) { const m = window.SF.ctx.touch.mobile.model; const orig = m.sample.bind(m); m.sample = (dt) => { const f = orig(dt); if (f.flight.flick) window.__flicks += 1; return f; }; }
  });
  await finger.flick(stickAt.x, stickAt.y, stickAt.x + radius * 1.1, stickAt.y - radius * 0.2);
  await sleep(400);
  const flicks = await page.evaluate(() => window.__flicks);
  check('a fast straight flick requests a boost tap', flicks > 0, `flick frames: ${flicks}`);

  // gun
  const gun = await rect('.mf-gun');
  const gid = await finger.down(gun.x, gun.y);
  await sleep(250);
  s = await snap();
  check('GUN held feeds the fire channel', s.fire && s.gunHeld === '1');
  // gun + stick together
  const sid = await finger.down(stickAt.x, stickAt.y);
  await finger.drag(sid, stickAt.x, stickAt.y, stickAt.x - radius * 0.6, stickAt.y - radius * 0.3, 150);
  await sleep(300);
  s = await snap();
  check('fly and fire together; neither steals the other', s.fire && s.flight.active, JSON.stringify(s.flight));
  // gun drag-aim
  await finger.drag(gid, gun.x, gun.y, gun.x - 40, gun.y - 60, 150);
  await sleep(300);
  const aim = await page.evaluate(() => ({ aim: document.querySelector('.mf-gun').dataset.aim, beam: !document.querySelector('.mf-beam').hidden }));
  check('dragging the gun thumb aims on its own and shows the beam', aim.aim === '1' && aim.beam, JSON.stringify(aim));
  await shot('13-flight-fire-aim');
  await finger.up(sid); await finger.up(gid);
  await sleep(300);
  s = await snap();
  check('both thumbs up: nothing stuck', !s.fire && !s.flight.active && s.axes.rx === 0 || !s.fire, JSON.stringify({ fire: s.fire, axes: s.axes }));

  // tether: tap latches or cuts, hold shows the reel ladder
  const teth = await rect('.mf-tether');
  const tid = await finger.down(teth.x, teth.y);
  await sleep(300);
  const reel = await page.evaluate(() => !document.querySelector('.mf-reel').hidden);
  check('holding TETHER shows the reel ladder', reel);
  await finger.drag(tid, teth.x, teth.y, teth.x, teth.y - 60, 150);
  await sleep(200);
  await shot('14-flight-tether-reel');
  await finger.up(tid);
  await sleep(300);

  // powers wheel: swipe from the handle to a power and let go
  const edge = await rect('.mf-edge');
  const eid = await finger.down(edge.x, edge.y);
  await sleep(200);
  s = await snap();
  check('touching the powers handle opens the wheel', s.wheelOpen);
  const node = await rect('.mf-node[data-index="1"]');
  await finger.drag(eid, edge.x, edge.y, node.x, node.y, 250);
  await sleep(250);
  await shot('15-flight-wheel');
  const picked = await page.evaluate(() => document.querySelector('.mf-pick-name')?.textContent);
  await finger.up(eid);
  await sleep(400);
  s = await snap();
  check('lifting on a power requests it and closes the wheel', !s.wheelOpen && /requested/i.test(s.toast || ''), `${picked} -> ${s.toast}`);
  // pinned: tap the handle, tap a power
  await finger.tap(edge.x, edge.y);
  await sleep(400);
  s = await snap();
  check('tapping the handle pins the wheel open', s.wheelOpen);
  await shot('16-flight-wheel-pinned');
  await finger.tap(W * 0.2, H * 0.3); // open space: puts it away
  await sleep(400);
  s = await snap();
  check('a tap in open space puts the pinned wheel away', !s.wheelOpen);

  // DOCK key follows dock:range (needs the debug bus, so dev route only)
  if (HAS_SF) {
    await page.evaluate(() => window.SF.bus.emit('dock:range', { inRange: true }));
    await sleep(500);
    s = await snap();
    check('DOCK key appears when a berth is in range', s.dockShown);
    await shot('17-flight-dock');
    await page.evaluate(() => window.SF.bus.emit('dock:range', { inRange: false }));
    await sleep(300);
    check('DOCK key leaves when the berth does', !(await snap()).dockShown);
  }

  // main breadth: a grid of taps; every non-control point must start the stick
  const refused = await page.evaluate(() => {
    const out = [];
    const UI = 'button,a,input,textarea,select,label,[role="button"],[role="dialog"],[role="slider"],[contenteditable="true"],[data-sf-touch-ignore]';
    const NOFLY = '.screen,[aria-modal="true"],.sf-radar-wrap';
    const cols = 12, rows = 24;
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) {
      const x = Math.round((i + 0.5) * innerWidth / cols), y = Math.round((j + 0.5) * innerHeight / rows);
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (el.closest('[data-role]') || el.closest('.mf-edge') || el.closest('.mf-pause') || el.closest('.mf-dock') || el.closest('.sf-radar-wrap')) continue; // the keys, the handle and the radar dial (a tap sets a course) are controls on purpose
      if (el.closest(UI) || el.closest(NOFLY)) out.push({ x, y, el: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0], inUI: !!el.closest(UI) });
    }
    return out;
  });
  check('every empty point on the screen can start the stick', refused.length === 0, refused.slice(0, 6).map((r) => `${r.x},${r.y} ${r.el}`).join(' | '));

  // pause
  const pause = await rect('.mf-pause');
  await finger.tap(pause.x, pause.y);
  await page.waitForFunction(() => (window.SF && window.SF.state ? window.SF.state.ui.screenStack.includes('pause') : !!document.querySelector('[data-screen="pause"]') && document.querySelector('[data-screen="pause"]').getBoundingClientRect().width > 0), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  s = await snap();
  check('the pause key opens the pause screen', s.screens.includes('pause'), JSON.stringify(s.screens));
  await shot('20-pause');
  const pauseFit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-screen="pause"] button')].filter((x) => x.getBoundingClientRect().width > 4);
    return { n: b.length, off: b.filter((x) => x.getBoundingClientRect().right > innerWidth + 1 || x.getBoundingClientRect().left < -1).map((x) => x.textContent.trim().slice(0, 12)) };
  });
  check('every pause verb is inside the screen width', pauseFit.n > 5 && pauseFit.off.length === 0, JSON.stringify(pauseFit));
  const resume = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-screen="pause"] button')].find((x) => /^resume/i.test(x.textContent.trim())); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await finger.tap(resume.x, resume.y);
  await sleep(1500);
  s = await snap();
  check('Resume returns to flight with the deck up', s.mode === 'flight' && !s.screens.length && (await page.evaluate(() => !document.querySelector('.mf-flight').hidden)), JSON.stringify(s.screens));

  // dock and undock by thumb (--dock): fly to a berth, tap the DOCK key, use the station page, tap Undock
  if (argv.dock && HAS_SF) {
    const near = await page.evaluate(async () => {
      const st = window.SF.state, p = st.entities.get(st.playerId);
      const station = st.entityList.find((e) => e.type === 'station' && e.alive !== false && e.data && e.data.stationId);
      if (!station || !p) return null;
      // the berth anchor the dock gate measures against (physics.updateDockRange), so the ship parks where docking is lawful
      const mod = await import('/src/data/collisionProxyManifests.js');
      const manifest = mod.resolveCollisionProxyManifest(station);
      const anchor = manifest && manifest.docking ? mod.resolveDockAnchor(station, manifest, p) : null;
      p.pos.x = anchor ? anchor.x : station.pos.x + (station.radius || 60) + 30; p.pos.z = anchor ? anchor.z : station.pos.z; p.vel.x = 0; p.vel.z = 0;
      return { id: station.id, name: station.name || station.data?.name || null, anchored: !!anchor };
    });
    check('a station stands in the opening sector', !!near, JSON.stringify(near));
    if (near) {
      await page.waitForFunction(() => { const d = document.querySelector('.mf-dock'); return d && !d.hidden; }, null, { timeout: 30000 }).catch(() => {});
      s = await snap();
      check('the DOCK key lights beside a berth', s.dockShown);
      await shot('40-dock-key');
      const dk = await rect('.mf-dock');
      if (dk) await finger.tap(dk.x, dk.y);
      await page.waitForFunction(() => window.SF.state.ui.docked === true, null, { timeout: 60000 }).catch(() => {});
      await sleep(2500);
      const docked = await page.evaluate(() => ({ docked: window.SF.state.ui.docked === true, screens: [...window.SF.state.ui.screenStack] }));
      check('tapping DOCK docks the ship and opens the station', docked.docked, JSON.stringify(docked));
      await shot('41-station');
      const st = await page.evaluate(() => {
        const root = document.querySelector('.sx-berth'); const seat = document.querySelector('.sxb-launch-seat button, .sxb-launch-seat');
        const r = seat && seat.getBoundingClientRect(); const rail = document.querySelector('.of-facility-rail').getBoundingClientRect();
        return { scrolls: root && root.scrollHeight > root.clientHeight, undock: r && { l: r.left, r: r.right, t: r.top, b: r.bottom }, rail: { l: rail.left, r: rail.right }, vw: innerWidth, vh: innerHeight };
      });
      check('Undock is on screen and the tab rail fits the width', st.undock && st.undock.b <= st.vh && st.undock.r <= st.vw && st.rail.r <= st.vw + 1, JSON.stringify(st));
      const undock = await rect('.sxb-launch-seat button, .sxb-launch-seat');
      if (undock) await finger.tap(undock.x, undock.y, 120);
      await page.waitForFunction(() => window.SF.state.ui.docked === false && window.SF.state.mode === 'flight', null, { timeout: 60000 }).catch(() => {});
      await sleep(1500);
      s = await snap();
      check('Undock returns to flight with the deck up', s.mode === 'flight' && !s.screens.length && (await page.evaluate(() => !document.querySelector('.mf-flight').hidden)), JSON.stringify({ mode: s.mode, screens: s.screens }));
    }
  }

  // left hand
  if (argv.lefty) {
    // the whole run used the saved left-hand setting; confirm the deck really mirrored and keep a picture
    check('the saved left-hand setting mirrors the deck', await page.evaluate(() => document.documentElement.dataset.sfMobileLefty === '1' && document.querySelector('#sf-touch-overlay').dataset.lefty === '1'));
    await shot('30-flight-lefty');
  }
} catch (error) {
  check('probe ran to the end', false, String(error && error.stack || error).split('\n').slice(0, 3).join(' / '));
  await shot('99-failure').catch(() => {});
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ url: server.url, size: [W, H], results }, null, 2));
  await browser.close().catch(() => {});
  server.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${OUT})`);
process.exit(failed.length ? 1 : 0);
