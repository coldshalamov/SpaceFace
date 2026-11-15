// DEMO ROUTES: a first-time player's first hour, scripted from the TITLE with real mouse/keyboard input
// only (no ?swarmRound= / ?sector= shortcuts), recording what that person experiences.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --headed --out=.devshots/fleet/demo/swarm-1
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=adventure --headed --out=.devshots/fleet/demo/adventure-1
//
//   --route=swarm|adventure   which door (required)
//   --out=dir                 default .devshots/fleet/demo/<route>
//   --viewport=1280x720       default 1280x720
//   --headed                  show the browser (default headless)
//   --intro=play|skip         adventure plays the intro through (timed, 120 s cap), swarm skips it with Space
//   --keep-saves              use the real saved-games store (default: an empty one, like a first-time player)
//   --max-min=N               wall cap in minutes (swarm 15, adventure 12)
//
// Writes <out>/demo-route.json, <out>/report.md and <out>/NN-<screen>.png. Observers read window.SF (as a
// person watching the screen could); every game action goes through Playwright's trusted input.
// Latch / swing / release code and event logging come from throw.mjs.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const ROUTE = argv.route;
if (ROUTE !== 'swarm' && ROUTE !== 'adventure') { console.error('usage: demo-route.mjs --route=swarm|adventure [--out=dir] [--viewport=WxH] [--headed]'); process.exit(2); }
const OUT = String(argv.out || `.devshots/fleet/demo/${ROUTE}`);
const [VW, VH] = String(argv.viewport || '1280x720').split('x').map(Number);
const HEADED = argv.headed === true || argv.headed === 'true';
const INTRO = String(argv.intro || (ROUTE === 'adventure' ? 'play' : 'skip'));
const CAP_MS = (Number(argv['max-min']) || (ROUTE === 'adventure' ? 12 : 15)) * 60_000;
const PORT = ROUTE === 'swarm' ? 8171 : 8172;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { route: ROUTE, viewport: `${VW}x${VH}`, headed: HEADED, intro: INTRO, startedAt: new Date().toISOString(),
  steps: [], screens: [], notes: [], errors: [], consoleErrors: [], clicks: 0, milestones: {}, outcome: null };
const wall0 = Date.now();
const wallS = () => +((Date.now() - wall0) / 1000).toFixed(1);
const note = (s) => { R.notes.push(`[${wallS()}s] ${s}`); console.log(`[${wallS()}s] ${s}`); };
const step = (name, detail) => { R.steps.push({ at: wallS(), name, detail }); console.log(`[${wallS()}s] STEP ${name}${detail ? ' - ' + detail : ''}`); };

// ---------------------------------------------------------------- in-page instrumentation
const INIT = () => {
  const D = (window.__dr = { t0: null, clicks: 0, ms: {}, text: [], ev: [], frames: [], longs: [], noise: [], hooked: false, introSeen: null, introGone: null, emitted: 0 });
  const now = () => performance.now();
  const rel = (t) => (D.t0 == null ? null : +((t - D.t0) / 1000).toFixed(2));
  D.rel = rel;
  // frame deltas for the whole session; mode tag lets us cut the playable span afterwards
  let last = 0;
  const loop = (t) => {
    if (last) {
      const s = window.SF && window.SF.state;
      const flight = !!(s && s.mode === 'flight');
      D.frames.push(+t.toFixed(1), +(t - last).toFixed(2), flight ? 1 : 0);
      if (flight && D.ms.firstFlight == null && D.t0 != null) D.ms.firstFlight = { t: rel(t), clicks: D.clicks };
    }
    last = t; requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) D.longs.push({ t: +e.startTime.toFixed(0), d: +e.duration.toFixed(0) }); }).observe({ entryTypes: ['longtask'] });
  } catch (e) { D.longTaskError = String(e); }
  // text seen by a player: toasts, alerts, the Stage lanes (+ anything with role=status/alert)
  const seen = new Map();
  const zone = (n) => {
    const el = n.nodeType === 1 ? n : n.parentElement; if (!el || !el.closest) return null;
    if (el.closest('#toast-live, [aria-live][class*="sr-only"]')) return null;
    if (el.closest('#toasts')) return 'toasts';
    if (el.closest('#alerts')) return 'alerts';
    if (el.closest('[id^="sf-stage"]')) { const id = el.closest('[id^="sf-stage"]').id.replace('sf-stage-', ''); return id === 'dialog' ? null : 'stage:' + id; } // dialog slot hosts whole hidden screens
    if (el.closest('#hud') && !el.closest('#screens')) return 'hud';
    return null;
  };
  const addText = (src, text, extra) => {
    text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text) return;
    const key = src + '|' + text; const t = now();
    if (seen.has(key) && t - seen.get(key) < 1200) return;
    seen.set(key, t);
    D.text.push({ t: rel(t), tAbs: +t.toFixed(0), src, text: text.slice(0, 240), ...extra });
  };
  D.addText = addText;
  const startObs = () => {
    if (!document.body) return setTimeout(startObs, 50);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') for (const n of m.addedNodes) {
          const z = zone(n); if (!z) continue; const tx = String(n.textContent || '').replace(/\s+/g, ' ').trim();
          if (z === 'hud' && (tx.length > 120 || (tx.match(/[A-Za-z]/g) || []).length < 4)) continue; // hud: only new word-like elements, not counters
          addText('dom:' + z, tx);
        } else if (m.type === 'characterData') { const z = zone(m.target); if (z && z !== 'hud') addText('dom:' + z, m.target.textContent || ''); }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  startObs();
};

// bus hooks, installed once window.SF.bus exists
const HOOK = () => {
  const D = window.__dr; const bus = window.SF && window.SF.bus;
  if (!bus || D.hooked) return !!D.hooked;
  D.hooked = true;
  const orig = bus.emit.bind(bus);
  const TEXTY = /^(toast|alert|voice:surface|stage:|floating|notice|banner|callout|announce|swarm:announce|hud:float|fx:text)/i;
  const MILE = new Set(['tether:latched', 'massline:throw', 'massline:selfSling', 'tether:cut', 'entity:killed', 'combat:collisionConsequence', 'swarm:drop:spawned',
    'dock:docked', 'player:docked', 'station:docked', 'dock:undocked', 'player:undocked', 'mission:accepted', 'mission:completed', 'mission:updated', 'nav:waypoint', 'game:started', 'game:newGame', 'run:started', 'run:ended', 'run:over', 'player:died', 'player:destroyed', 'swarm:roundStart', 'swarm:roundEnd', 'sector:entered']);
  const pickText = (p) => {
    if (p == null) return '';
    if (typeof p === 'string') return p;
    for (const k of ['text', 'line', 'message', 'msg', 'label', 'title', 'body', 'caption']) if (typeof p[k] === 'string' && p[k]) return p[k];
    try { return JSON.stringify(p).slice(0, 160); } catch (e) { return ''; }
  };
  bus.emit = function (ev, p, ...rest) {
    try {
      D.emitted++;
      const t = performance.now();
      if (typeof ev === 'string') {
        if (TEXTY.test(ev) || /:(toast|alert|announce)$/.test(ev)) {
          D.addText('bus:' + ev, pickText(p), { kind: p && (p.kind || p.sev || p.severity || p.channel) });
        }
        if (MILE.has(ev) || /^(tether|massline):/.test(ev)) {
          const s = window.SF.state;
          const imp = p && p.impactorId != null && s && s.entities && s.entities.get(p.impactorId);
          const rec = { ev, t: D.rel(t), sim: s ? +(+s.simTime).toFixed(2) : null, clicks: D.clicks, id: p && (p.id ?? p.payloadId ?? p.victimId), cause: p && (p.cause || p.source), killer: p && p.killerId,
            type: p && p.type, victim: p && p.victimId, pos: p && p.pos ? [Math.round(p.pos.x), Math.round(p.pos.z)] : undefined,
            impactor: imp ? `${imp.type}:${(imp.data && (imp.data.freight ? 'freight' : imp.data.shipClass || imp.data.kind)) || imp.defId || ''}` : undefined };
          if (ev === 'nav:waypoint' || ev === 'mission:updated' || ev === 'mission:accepted' || ev === 'mission:completed') rec.label = pickText(p && (p.label ? p : p.mission || p)).slice(0, 100);
          D.ev.push(rec);
          if (D.t0 != null) {
            const set = (k) => { if (D.ms[k] == null) D.ms[k] = { t: D.rel(t), clicks: D.clicks }; };
            if (ev === 'tether:latched') set('firstLatch');
            if (ev === 'massline:throw') set('firstThrow');
            if (ev === 'entity:killed' && !(s && p && p.victimId === s.playerId) && !(s && p && p.id === s.playerId)) set('firstKill');
          }
        }
      }
    } catch (e) { /* observer must never break the game */ }
    return orig(ev, p, ...rest);
  };
  return true;
};

// ---------------------------------------------------------------- server + browser
// A clean profile: the server keeps player saves on disk, and a save turns the ADVENTURE door into CONTINUE, so
// point this server at an empty store (a first-time player has none). --keep-saves uses the real store.
const STORE = join(OUT, '_clean-player-store');
if (argv['keep-saves'] !== true) mkdirSync(STORE, { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore',
  env: argv['keep-saves'] === true ? process.env : { ...process.env, SPACEFACE_PLAYER_STORE_DIR: STORE } });
let browser; let page; let shotN = 0; let nav = { t0Set: false };
const slug = (s) => String(s || 'screen').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'screen';

async function shot(label, extra) {
  const file = `${String(++shotN).padStart(2, '0')}-${slug(label)}.png`;
  const a = await page.evaluate(() => performance.now()).catch(() => 0);
  await page.screenshot({ path: join(OUT, file) }).catch((e) => note(`screenshot failed ${file}: ${e.message.slice(0, 80)}`));
  const b = await page.evaluate(() => performance.now()).catch(() => 0);
  await page.evaluate(([x, y]) => { window.__dr.noise.push([x, y + 400]); }, [a, b]).catch(() => {});
  R.screens.push({ file, label, at: wallS(), ...extra });
  return file;
}
const click = async (x, y, button = 'left') => {
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.down({ button }); await sleep(90); await page.mouse.up({ button });
  R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
};
const readBtns = () => page.evaluate(() => {
  const out = []; const seen = new Set();
  const sel = 'button, [role="button"], [role="menuitem"], [role="tab"], a[href], .k-word, [data-action], [data-tab], li[tabindex]';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity < 0.1) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
    const hit = document.elementFromPoint(cx, cy); if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
    const text = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue; const key = text + '|' + Math.round(cx) + '|' + Math.round(cy); if (seen.has(key)) continue; seen.add(key);
    out.push({ text: text.slice(0, 80), x: Math.round(cx), y: Math.round(cy), tag: el.tagName.toLowerCase() });
  }
  return out;
}).catch(() => []);
async function clickText(re, { optional = false } = {}) {
  const btns = await readBtns();
  const hit = btns.find((b) => re.test(b.text));
  if (!hit) { if (!optional) note(`no visible control matching ${re}; saw: ${btns.map((b) => b.text).slice(0, 14).join(' | ')}`); return null; }
  await click(hit.x, hit.y); note(`click "${hit.text}" (${hit.x},${hit.y})`); return hit;
}
const readConfirm = () => page.evaluate(() => {
  const root = document.getElementById('sf-confirm-root'); const d = root && root.querySelector('[role="dialog"]');
  if (!d || !root.classList.contains('sf-confirm--in')) return null;
  const r = d.getBoundingClientRect(); if (r.width < 4) return null;
  return { title: (d.querySelector('#sf-confirm-title') || {}).textContent || '', body: ((d.querySelector('#sf-confirm-body') || {}).textContent || '').slice(0, 300),
    buttons: [...d.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { text: b.textContent.trim(), x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2), ok: b.classList.contains('sf-confirm__ok') }; }) };
}).catch(() => null);
let lastConfirmKey = '';
async function answerConfirm(prefer = /^(play|ok|yes|confirm|continue|end run|leave|main menu)/i) {
  const c = await readConfirm(); if (!c) return null;
  const key = c.title + '|' + c.body.slice(0, 40);
  if (key !== lastConfirmKey) {
    lastConfirmKey = key; step('prompt', `"${c.title}" ${c.body.replace(/\s+/g, ' ').slice(0, 140)} [${c.buttons.map((b) => b.text).join(' / ')}]`);
    await sleep(500); await shot(`prompt-${c.title}`, { prompt: c.title });
  }
  const b = c.buttons.find((x) => prefer.test(x.text)) || c.buttons.find((x) => x.ok) || c.buttons[0];
  if (b) { await click(b.x, b.y); note(`answered prompt "${c.title}" with "${b.text}"`); }
  await sleep(400); return c;
}
const snap = () => page.evaluate(() => {
  const S = window.SF; const s = S && S.state; if (!s) return null;
  const sm = S.ctx && S.ctx.screenManager; const me = s.entities && s.entities.get(s.playerId);
  const run = s.run;
  return { mode: s.mode, top: sm && sm.top ? sm.top() : null, sim: +(+s.simTime).toFixed(1), hp: me ? (me.hull ?? me.hp ?? null) : null, alive: me ? me.alive !== false : null,
    pos: me ? [Math.round(me.pos.x), Math.round(me.pos.z)] : null, run: run ? { kind: run.kind, wave: run.wave, phase: run.phase, credits: run.credits } : null,
    docked: !!(s.dock && s.dock.docked) || s.mode === 'docked' || s.mode === 'station', sector: s.world && s.world.currentSectorId };
}).catch(() => null);

// screen tracker: a PNG the first time each distinct screen is on top
const seenScreens = new Set(); let lastScreenKey = null;
async function trackScreen(force) {
  const s = await snap(); if (!s) return s;
  const key = s.top ? `screen:${s.top}` : `${s.mode || 'none'}${s.run && s.run.wave ? '-r' + s.run.wave : ''}`;
  if (key !== lastScreenKey || force) {
    lastScreenKey = key;
    if (!seenScreens.has(key) || force) {
      seenScreens.add(key);
      await sleep(900);
      const btns = (await readBtns()).map((b) => b.text).slice(0, 24);
      step('screen', `${key} controls: ${btns.join(' | ')}`);
      await shot(key.replace('screen:', ''), { key, mode: s.mode, controls: btns });
    }
  }
  return s;
}
let nextGameplayShot = 15_000; let tZero = null;
async function gameplayShots() {
  if (tZero == null) return;
  if (Date.now() - tZero >= nextGameplayShot) { nextGameplayShot = (Date.now() - tZero) + 15_000; await shot(`gameplay-t${Math.round((Date.now() - tZero) / 1000)}`, { gameplay: true }); }
}
const hostilesQ = () => page.evaluate(() => {
  const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId); if (!me) return null;
  const hs = [];
  for (const e of s.entityList || []) {
    if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
    const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
    hs.push({ id: e.id, mass: e.mass, dist: Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z), scr: scr && { x: scr.x, y: scr.y, on: !!scr.onScreen } });
  }
  hs.sort((a, b) => a.dist - b.dist);
  const meScr = h.worldToScreen({ x: me.pos.x, y: 0, z: me.pos.z }, {});
  return { n: hs.length, near: hs[0] || null, light: hs.filter((e) => !(Number.isFinite(e.mass) && e.mass > 32) && e.scr && e.scr.on && e.scr.x > 300 && e.scr.x < 980 && e.scr.y > 140 && e.scr.y < 600)[0] || null, me: meScr && { x: meScr.x, y: meScr.y } };
}).catch(() => null);

// ---------------------------------------------------------------- shared: boot, intro, first-run prompt
async function bootToTitle() {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit' });
  const t0 = Date.now(); let introStart = null; let introEnd = null; let spaced = 0; let ready = false;
  while (Date.now() - t0 < 240_000) {
    const st = await page.evaluate(() => {
      const vis = (n) => { if (!n || n.hidden) return false; const c = getComputedStyle(n); const r = n.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const mm = document.querySelector('[data-screen="mainMenu"]');
      return { sf: !!(window.SF && window.SF.state && window.SF.bus), menu: !!(mm && getComputedStyle(mm).display !== 'none'), splash: vis(document.getElementById('cinematic-splash')) };
    }).catch(() => ({}));
    if (st.sf) await page.evaluate(HOOK).catch(() => {});
    if (st.splash && introStart == null) { introStart = Date.now(); step('intro', 'cinematic splash visible'); await sleep(1500); await shot('intro-cinematic'); }
    if (!st.splash && introStart != null && introEnd == null) { introEnd = Date.now(); step('intro', `ended after ${((introEnd - introStart) / 1000).toFixed(1)} s (${spaced} Space presses)`); }
    const c = await readConfirm();
    if (c) { await answerConfirm(/^play$/i); continue; }
    if (st.splash) {
      const age = Date.now() - introStart;
      const limit = INTRO === 'skip' ? 3500 : 120_000;
      if (age > limit && (Date.now() - (nav.lastSpace || 0)) > 2500) { await page.keyboard.press('Space'); spaced++; nav.lastSpace = Date.now(); note('pressed Space on the intro'); }
    } else if (st.menu && st.sf) { ready = true; break; }
    await sleep(400);
  }
  if (!ready) throw new Error('title never became ready');
  await sleep(800);
  R.intro_seconds = introStart ? +(((introEnd || Date.now()) - introStart) / 1000).toFixed(1) : 0;
  R.intro_spacePresses = spaced;
  await page.evaluate(HOOK).catch(() => {});
  await trackScreen(true);
  step('title', 'ready at ' + wallS() + ' s of wall since page load');
}
async function setZero() {
  tZero = Date.now();
  await page.evaluate(() => { window.__dr.t0 = performance.now(); window.__dr.clicks = 0; }).catch(() => {});
  R.clicks = 0;
}
const rendererInfo = () => page.evaluate(() => {
  try {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'no webgl';
    const x = gl.getExtension('WEBGL_debug_renderer_info');
    return x ? `${gl.getParameter(x.UNMASKED_RENDERER_WEBGL)} (vendor ${gl.getParameter(x.UNMASKED_VENDOR_WEBGL)})` : gl.getParameter(gl.RENDERER);
  } catch (e) { return 'error ' + e.message; }
});
const qualityInfo = () => page.evaluate(() => {
  const s = window.SF && window.SF.state; const v = s && s.settings && s.settings.video || {};
  return { qualityPreset: v.qualityPreset, qualityMode: v.qualityMode, renderScale: v.renderScale, dynamicResolution: v.dynamicResolution, shadows: v.shadows, bloom: v.bloom, particleQuality: v.particleQuality, graphicsPreset: s && s.settings && s.settings.graphicsPreset, pixelRatioCap: v.pixelRatioCap, dpr: devicePixelRatio };
}).catch(() => null);

// ---------------------------------------------------------------- shared: fly + fight primitives
const held = new Set();
const keyDown = async (k) => { if (!held.has(k)) { held.add(k); await page.keyboard.down(k); } };
const keyUp = async (k) => { if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
// The game drops held keys when the window loses focus (other windows on a shared desktop steal it), while
// Playwright still thinks they are down: re-assert them, as a player re-pressing a key would.
let lastReassert = 0;
async function reassertKeys() {
  if (Date.now() - lastReassert < 700) return; lastReassert = Date.now();
  await page.bringToFront().catch(() => {});
  for (const k of held) { await page.keyboard.up(k).catch(() => {}); await page.keyboard.down(k).catch(() => {}); }
}
const releaseAll = async () => { for (const k of [...held]) await keyUp(k); if (nav.lmb) { await page.mouse.up({ button: 'left' }).catch(() => {}); nav.lmb = false; } };
async function setFire(on) {
  if (on && !nav.lmb) { await page.mouse.down({ button: 'left' }); nav.lmb = true; }
  if (!on && nav.lmb) { await page.mouse.up({ button: 'left' }); nav.lmb = false; }
}
/** The pilot scheme: A/D yaw the ship (D raises rot), W/S thrust, the mouse only aims. Tap a yaw key toward bearing `rel`. */
async function yawToward(rel) {
  if (!Number.isFinite(rel) || Math.abs(rel) <= 0.1) return;
  await page.keyboard.press(rel > 0 ? 'KeyD' : 'KeyA', { delay: Math.max(15, Math.min(90, Math.abs(rel) / 4.5 * 1000)) });
}
/** Mouse toward a world point; returns {dist, onScreen}. Off-screen points are aimed along their bearing from the ship. */
const aimAt = (wx, wz) => page.evaluate(([x, z]) => {
  const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId); if (!me) return null;
  const dist = Math.hypot(x - me.pos.x, z - me.pos.z);
  let rel = Math.atan2(z - me.pos.z, x - me.pos.x) - me.rot; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI; // nose = (cos rot, sin rot) on XZ; D raises rot
  const t = h.worldToScreen({ x, y: 0, z }, {}); const m = h.worldToScreen({ x: me.pos.x, y: 0, z: me.pos.z }, {});
  if (t && t.onScreen && t.x > 30 && t.x < innerWidth - 30 && t.y > 30 && t.y < innerHeight - 30) return { dist, rel, x: t.x, y: t.y, on: true };
  const dx = (x - me.pos.x) / (dist || 1), dz = (z - me.pos.z) / (dist || 1);
  const p = h.worldToScreen({ x: me.pos.x + dx * 300, y: 0, z: me.pos.z + dz * 300 }, {});
  let vx = p.x - m.x, vy = p.y - m.y; const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
  return { dist, rel, x: Math.max(40, Math.min(innerWidth - 40, m.x + vx * 260)), y: Math.max(40, Math.min(innerHeight - 40, m.y + vy * 260)), on: false };
}, [wx, wz]).catch(() => null);

// ---------------------------------------------------------------- SWARM
async function swarmRoute() {
  await bootToTitle();
  await setZero();
  step('click', 'title: SWARM');
  await clickText(/^\s*swarm\b/i);
  // Whatever screens follow: launch round 1.
  const tPre = Date.now(); let inFlight = false; let door = [];
  while (Date.now() - tPre < 240_000) {
    await answerConfirm(/^(play|ok|yes|confirm|continue)/i);
    const s = await trackScreen();
    if (s && s.mode === 'flight' && !s.top) { const h = await hostilesQ(); if (h && h.n >= 2) { inFlight = true; break; } }
    const btns = await readBtns();
    if (s && s.top) door.push(s.top);
    const pri = [/^play$/i, /^launch round/i, /quick play/i, /hold the line/i, /^launch\b/i, /^(start|begin|deploy|ready)/i, /^continue$/i];
    let hit = null;
    for (const re of pri) { hit = btns.find((b) => re.test(b.text)); if (hit) break; }
    if (hit) { await click(hit.x, hit.y); note(`click "${hit.text}" on screen ${s && s.top}`); await sleep(1200); } else await sleep(700);
  }
  R.swarm_screens_before_fight = [...new Set(door)];
  step('fight', inFlight ? 'round 1 live' : 'NEVER REACHED A LIVE FIGHT');
  if (!inFlight) { R.outcome = 'never reached the fight'; return; }
  await page.mouse.move(VW / 2, VH / 2); await page.mouse.click(VW / 2, VH / 2).catch(() => {}); // focus (a click on the world, counted)
  R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
  await sleep(400);
  const q0 = await qualityInfo(); R.quality_atFlight = q0;
  await shot('flight-start', { gameplay: true });

  // The throw, as throw.mjs does it (latch with a real RMB press, swing, release toward the pack). A latch that
  // breaks at once ("TARGET LOST") or a release that throws nothing is retried with a fresh light target.
  const evCount = (name) => page.evaluate((n) => (window.__dr.ev || []).filter((e) => e.ev === n).length, name);
  let threw = false; let latchedEver = false;
  for (let cycle = 0; cycle < 5 && !threw; cycle++) {
    let pick = null; const tp = Date.now();
    while (!pick && Date.now() - tp < 40_000) { await steerFight(); const h = await hostilesQ(); pick = h && h.light; if (!pick) await sleep(400); }
    await releaseAll();
    if (!pick) { note('no light hostile on screen'); continue; }
    const l0 = await evCount('tether:latched'); const b0 = await evCount('tether:broken'); const t0n = await evCount('massline:throw');
    note(`throw cycle ${cycle + 1}: latch on ${JSON.stringify({ id: pick.id, mass: pick.mass, dist: Math.round(pick.dist) })}`);
    await page.mouse.move(pick.scr.x, pick.scr.y, { steps: 3 });
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
    R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
    let latched = false;
    for (let i = 0; i < 10 && !latched; i++) { await sleep(150); latched = (await evCount('tether:latched')) > l0; }
    if (!latched) { note('no latch this cycle'); continue; }
    latchedEver = true; await sleep(500);
    if ((await evCount('tether:broken')) > b0) { note('latch broke at once (target lost); retrying'); continue; }
    if (cycle === 0 || !R.screens.some((x) => x.label === 'latched')) await shot('latched', { gameplay: true });
    await keyDown('KeyW'); await keyDown('KeyD');
    for (let i = 0; i < 6; i++) { await page.mouse.move(VW / 2 + 260 * Math.cos(i * 0.6), VH / 2 + 200 * Math.sin(i * 0.6), { steps: 2 }); await sleep(200); if (i === 2 && !R.screens.some((x) => x.label === 'swing')) await shot('swing', { gameplay: true }); }
    await keyUp('KeyD');
    const aim = await page.evaluate(() => {
      const s = window.SF.state; const h = window.SF.helpers;
      const hs = (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0);
      if (!hs.length) return null;
      const c = hs.reduce((a, e) => ({ x: a.x + e.pos.x / hs.length, z: a.z + e.pos.z / hs.length }), { x: 0, z: 0 });
      return h.worldToScreen({ x: c.x, y: 0, z: c.z }, {});
    });
    await page.mouse.move(aim && Number.isFinite(aim.x) ? aim.x : VW / 2, aim && Number.isFinite(aim.y) ? aim.y : 200, { steps: 2 });
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
    R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
    await keyUp('KeyW');
    if (!R.screens.some((x) => x.label === 'release')) await shot('release', { gameplay: true });
    for (let i = 0; i < 12 && !threw; i++) { await sleep(250); threw = (await evCount('massline:throw')) > t0n; }
    note(threw ? 'THROW registered' : 'release did not register a throw; retrying');
    if (threw) await shot('after-throw', { gameplay: true });
  }
  step('throw', threw ? 'throw registered' : latchedEver ? 'latched but never threw' : 'never latched');

  // Keep fighting with basic input until round 3 or death (or the wall cap).
  let reachedR3At = null; let shopSeen = false; let lastFlightKey = '';
  const tEnd = wall0 + CAP_MS;
  while (Date.now() < tEnd) {
    const s = await trackScreen();
    if (!s) { await sleep(300); continue; }
    await gameplayShots();
    await answerConfirmQuiet();
    const top = s.top || '';
    if (/gameOver|results|ending|death/i.test(top)) { step('results', top); await releaseAll(); await sleep(1500); await shot('results-' + top, { final: true }); R.outcome = 'results screen: ' + top; return await swarmFinish(top); }
    if (top && !/pause/i.test(top)) {
      // a between-round shop / armory / draft screen
      await releaseAll();
      const btns = await readBtns();
      const launch = btns.find((b) => /^launch round/i.test(b.text)) || btns.find((b) => /(keep current loadout|^continue$|hold the line)/i.test(b.text));
      if (!shopSeen && /draft|shop|armory|fit/i.test(top + ' ' + btns.map((b) => b.text).join(' '))) {
        shopSeen = true; step('shop', `first between-round screen "${top}" after wall ${wallS()}s`);
        await sleep(1500); await shot('shop-open', { shop: true, controls: btns.map((b) => b.text).slice(0, 30) });
        // "open it": hover/click the first offer card if there is one, to see its detail; then continue
        const card = btns.find((b) => !/launch|browse|re-?roll|keep|skip|back|menu|esc/i.test(b.text) && b.y > 120);
        if (card) { await click(card.x, card.y); note(`inspected shop card "${card.text}"`); await sleep(900); await shot('shop-card', { shop: true }); }
      }
      if (launch) { await click(launch.x, launch.y); note(`click "${launch.text}"`); await sleep(1500); } else await sleep(800);
      continue;
    }
    if (s.run && s.run.wave >= 3 && reachedR3At == null && s.mode === 'flight' && !s.top) { reachedR3At = Date.now(); step('round3', `round ${s.run.wave} reached at wall ${wallS()}s`); }
    if (reachedR3At && Date.now() - reachedR3At > 25_000) { R.outcome = 'reached round 3 and fought 25 s'; break; }
    if (s.alive === false) { await sleep(1200); continue; }
    if (s.mode === 'flight' && !top) {
      const key = s.run ? `${s.run.wave}/${s.run.phase}` : ''; if (key !== lastFlightKey) { lastFlightKey = key; note(`run ${key} hp ${s.hp}`); }
      await steerFight();
    } else await sleep(300);
  }
  await releaseAll();
  if (!R.outcome) R.outcome = 'wall cap reached';
  // not dead: quit through pause -> main menu / end run
  await swarmFinish('quit');
}
async function answerConfirmQuiet() { const c = await readConfirm(); if (c) await answerConfirm(/^(ok|yes|confirm|continue|play)/i); }
async function steerFight() {
  await reassertKeys();
  const h = await hostilesQ(); if (!h || !h.near) { await keyUp('KeyW'); await setFire(false); await sleep(150); return; }
  const aim = await aimAt(...(await page.evaluate((id) => { const e = window.SF.state.entities.get(id); return e ? [e.pos.x, e.pos.z] : [0, 0]; }, h.near.id)));
  if (aim) { await page.mouse.move(aim.x, aim.y, { steps: 2 }); await yawToward(aim.rel); }
  if (h.near.dist > 260) await keyUp('KeyS'), await keyDown('KeyW'); else if (h.near.dist < 120) { await keyUp('KeyW'); await keyDown('KeyS'); } else { await keyUp('KeyW'); await keyUp('KeyS'); }
  await setFire(h.near.dist < 760);
  await sleep(110);
}
async function swarmFinish(how) {
  if (how === 'quit') {
    step('quit', 'Esc -> pause -> end run / main menu');
    await page.keyboard.press('Escape'); await sleep(1200); await trackScreen(true);
    const hit = await clickText(/^(end run|main menu)/i);
    if (hit) { await sleep(700); await answerConfirm(/^(end run|ok|yes|confirm|leave|main menu|continue)/i); }
    for (let i = 0; i < 30; i++) { await sleep(700); await answerConfirmQuiet(); const s = await trackScreen(); if (s && s.top && /gameOver|results|mainMenu/i.test(s.top)) break; }
    await sleep(1500); const s = await snap(); await shot('results-after-quit-' + (s && s.top || 'none'), { final: true });
    R.outcome = (R.outcome || '') + ` -> quit via pause, landed on ${s && s.top}`;
  }
  if (how !== 'quit') {
    // results: show every control then press the main-menu-ish path once so the screen after is recorded too
    const btns = await readBtns(); note('results controls: ' + btns.map((b) => b.text).join(' | '));
  }
}

// ---------------------------------------------------------------- ADVENTURE
const advState = () => page.evaluate(() => {
  const s = window.SF.state; const me = s.entities.get(s.playerId); const wp = s.nav && s.nav.waypoint;
  const sm = window.SF.ctx && window.SF.ctx.screenManager;
  let tgt = null;
  if (wp && wp.targetEntityId != null) { const e = s.entities.get(wp.targetEntityId); if (e) tgt = { id: e.id, type: e.type, pos: [e.pos.x, e.pos.z], name: e.name || e.defId || (e.data && e.data.name) }; }
  if (!tgt && wp && wp.pos && wp.kind === 'mission') { // a marker with no bound entity: the body sitting on it (the sample rock), not passing traffic
    let best = null;
    for (const e of s.entityList || []) {
      if (!e || e.alive === false || e.isPlayer || e.type === 'ship' || e.type === 'station' || e.type === 'projectile') continue;
      const d = Math.hypot(e.pos.x - wp.pos.x, e.pos.z - wp.pos.z); if (d > 220) continue;
      const score = d - (/aster|rock|ore|sample|wreck|derelict/i.test(`${e.type} ${e.defId || ''} ${e.name || ''}`) ? 60 : 0) - (e.mass > 40 ? 20 : 0);
      if (!best || score < best.score) best = { score, id: e.id, type: e.type, pos: [e.pos.x, e.pos.z], name: e.name || e.defId || (e.data && e.data.name), d: Math.round(d) };
    }
    if (best) tgt = best;
  }
  const tracked = s.ui && s.ui.trackedMissionId; const m = tracked && (s.missions && s.missions.active || []).find((x) => x.id === tracked);
  const stations = [];
  for (const e of s.entityList || []) if (e && e.alive !== false && e.type === 'station') stations.push({ id: e.id, name: e.name || e.defId, d: Math.round(me ? Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) : 0) });
  stations.sort((a, b) => a.d - b.d);
  const tether = s.tether || (me && me.tether) || null;
  return { mode: s.mode, top: sm && sm.top ? sm.top() : null, sim: +(+s.simTime).toFixed(1), pos: me ? [me.pos.x, me.pos.z] : null, speed: me && me.vel ? Math.round(Math.hypot(me.vel.x, me.vel.z)) : null, vel: me && me.vel ? [me.vel.x, me.vel.z] : null,
    wp: wp ? { kind: wp.kind, label: wp.label, pos: wp.pos && [Math.round(wp.pos.x), Math.round(wp.pos.z)], tid: wp.targetEntityId, sectorId: wp.sectorId, onboarding: !!wp.onboarding } : null, tgt,
    mission: m ? { id: m.id, title: m.title || m.name, status: m.status, obj: (m.objectives || []).map((o) => o && (o.text || o.label || o.type)).slice(0, 3) } : null,
    nearStation: stations[0] || null, sector: s.world && s.world.currentSectorId, docked: s.mode === 'docked' || s.mode === 'station' || !!(s.dock && s.dock.docked), latched: (() => { const ev = (window.__dr.ev || []); let on = false; for (const e of ev) { if (e.ev === 'tether:latched') on = true; else if (e.ev === 'tether:broken' || e.ev === 'tether:released') on = false; } return on; })(),
    objText: (() => { const hud = document.getElementById('hud'); if (!hud) return ''; const w = document.createTreeWalker(hud, NodeFilter.SHOW_ELEMENT); let n; while ((n = w.nextNode())) { const t = n.children.length === 0 ? (n.textContent || '').trim() : ''; if (/^ACT\s+[IVX]+/i.test(t)) { const card = n.parentElement && n.parentElement.parentElement; return (card ? card.innerText : t).replace(/\s+/g, ' ').slice(0, 260); } } return ''; })() };
}).catch(() => null);

async function adventureRoute() {
  await bootToTitle();
  await setZero();
  step('click', 'title: NEW GAME');
  await clickText(/new game/i);
  // New Game screen(s) -> defaults -> LAUNCH
  const tPre = Date.now(); let flying = false;
  while (Date.now() - tPre < 300_000) {
    await answerConfirm(/^(play|ok|yes|confirm|continue)/i);
    const s = await trackScreen();
    if (s && s.mode === 'flight' && !s.top) { flying = true; break; }
    const btns = await readBtns();
    const hit = btns.find((b) => /^(launch|start|begin|take off|set out|continue)\b/i.test(b.text)) || btns.find((b) => /launch/i.test(b.text));
    if (hit) { await click(hit.x, hit.y); note(`click "${hit.text}" on ${s && s.top}`); await sleep(1500); } else await sleep(800);
  }
  step('flight', flying ? 'in flight' : 'NEVER REACHED FLIGHT');
  if (!flying) { R.outcome = 'never reached flight'; return; }
  await sleep(1500);
  R.quality_atFlight = await qualityInfo();
  await shot('flight-start', { gameplay: true });
  await page.mouse.click(VW / 2, VH / 2); R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});

  const tEnd = wall0 + CAP_MS; const advThrow = { done: false, tries: 0, l0: 0 }; let phase = 'seek'; let lastLog = 0; let latchTries = 0; let lastLatchTry = 0; let docked = false; let dockedAt = null; let lastE = 0;
  const trail = []; let lastWpKey = ''; let undocked = false; let sawMarketTab = false; let sawMissionsTab = false;
  while (Date.now() < tEnd) {
    const s = await trackScreen(); await gameplayShots();
    await answerConfirmQuiet();
    const a = await advState(); if (!a) { await sleep(300); continue; }
    if (Date.now() - lastLog > 5000) { lastLog = Date.now(); const line = `${phase} sim ${a.sim} wp=${a.wp ? a.wp.label + '@' + a.wp.pos : 'none'} tgt=${a.tgt ? a.tgt.type : '-'} speed ${a.speed} top=${a.top || '-'} latched=${a.latched} st=${a.nearStation ? a.nearStation.name + ':' + a.nearStation.d : '-'}`; note(line); trail.push({ t: wallS(), line }); }
    if (a.objText && a.objText !== nav.lastObjText) { nav.lastObjText = a.objText; step('objective-card', a.objText); }
    const wpKey = a.wp ? `${a.wp.label}|${a.wp.kind}` : ''; if (wpKey !== lastWpKey) { lastWpKey = wpKey; step('objective', a.wp ? `${a.wp.label} (${a.wp.kind}) ${a.tgt ? a.tgt.type : ''}` : 'none'); }

    if (a.docked || (a.top && /station|dock|market|hub/i.test(a.top) && !/pause/.test(a.top))) {
      await releaseAll();
      if (!docked) { docked = true; dockedAt = wallS(); step('docked', `${a.top} at ${a.nearStation && a.nearStation.name}`); await sleep(1500); }
      const btns = await readBtns();
      if (!sawMarketTab) { const m = btns.find((b) => /^market\b/i.test(b.text)); if (m) { await click(m.x, m.y); sawMarketTab = true; await sleep(1500); await shot('station-market', { controls: (await readBtns()).map((b) => b.text).slice(0, 30) }); continue; } }
      if (!sawMissionsTab) { const m = btns.find((b) => /^missions?\b/i.test(b.text)); if (m) { await click(m.x, m.y); sawMissionsTab = true; await sleep(1500); await shot('station-missions', { controls: (await readBtns()).map((b) => b.text).slice(0, 30) }); continue; } }
      if ((sawMarketTab || !btns.some((b) => /^market\b/i.test(b.text))) && (sawMissionsTab || !btns.some((b) => /^missions?\b/i.test(b.text)))) {
        const u = btns.find((b) => /^(undock|launch|depart|leave)/i.test(b.text));
        if (u) { await click(u.x, u.y); step('undock', `"${u.text}"`); await sleep(2500); undocked = true; R.outcome = 'docked at Helios, opened Market and Missions, undocked'; break; }
        note('no undock control seen: ' + btns.map((b) => b.text).join(' | ')); await page.keyboard.press('Escape'); await sleep(800);
      }
      await sleep(500); continue;
    }
    if (a.top && !/pause/i.test(a.top)) { // some other screen (tutorial card, log, results) in our way
      const btns = await readBtns(); const c = btns.find((b) => /^(continue|ok|got it|close|skip|resume|dismiss|accept|next)/i.test(b.text));
      if (c) { await click(c.x, c.y); note(`dismissed screen ${a.top} via "${c.text}"`); } else { await page.keyboard.press('Escape'); }
      await sleep(900); continue;
    }
    if (a.mode !== 'flight') { await sleep(400); continue; }

    // choose a destination: the tracked objective's marker; else nearest station
    let tx = null, tz = null, kind = 'none';
    if (a.tgt) { tx = a.tgt.pos[0]; tz = a.tgt.pos[1]; kind = a.tgt.type; }
    else if (a.wp && a.wp.pos) { tx = a.wp.pos[0]; tz = a.wp.pos[1]; kind = a.wp.kind || 'waypoint'; }
    let labelText = a.wp ? String(a.wp.label || '') : '';
    // OPENING-1b: the first lesson is the light loose rock beside the derelict. Until a throw lands,
    // fly at THAT rock (not the heavy 47-A boulder), latch it, swing it through the derelict, release.
    if (!advThrow.done && advThrow.tries < 4 && a.mode === 'flight') {
      const lr = await page.evaluate(() => {
        const s = window.SF.state; const r = (s.entityList || []).find((e) => e && e.alive !== false && e.data && e.data.rescueRole === 'rock');
        return r ? { x: r.pos.x, z: r.pos.z } : null;
      }).catch(() => null);
      if (lr) { tx = lr.x; tz = lr.z; kind = 'asteroid'; labelText = 'Loose rock'; }
    }
    if (tx == null) { // no marker: drift forward and look around, as a lost player would
      await keyDown('KeyW'); await sleep(300); continue;
    }
    await reassertKeys();
    const aim = await aimAt(tx, tz); if (!aim) { await sleep(200); continue; }
    await page.mouse.move(aim.x, aim.y, { steps: 2 });
    const isRock = /asteroid|rock|sample|ore|rubble|recover|47-a/i.test(`${kind} ${labelText} ${a.tgt && a.tgt.name || ''}`) && !/helios|dock|station/i.test(labelText);
    const isDock = /dock|helios|station|market/i.test(`${kind} ${labelText}`) || kind === 'station';
    // slow into the target
    const stop = isRock ? 120 : isDock ? 110 : 50;
    const want = Math.max(0, Math.min(190, (aim.dist - stop) * 0.55)); // speed profile: slow into the target
    await yawToward(aim.rel); // KEYBOARD STEERS: the first runs flew off because only the mouse was pointed at the marker
    const aligned = Math.abs(aim.rel) < 0.5;
    if (a.speed > want + 18) { await keyUp('KeyW'); await keyDown('KeyS'); } else if (a.speed < want - 8 && aligned) { await keyUp('KeyS'); await keyDown('KeyW'); } else { await keyUp('KeyW'); await keyUp('KeyS'); }
    if (a.nearStation && a.nearStation.d > 9000) { R.outcome = `left the arena: ${a.nearStation.d} u from the nearest station while chasing ${labelText}`; note(R.outcome); break; }
    // latch the rock once it is close (and not already towing)
    if (isRock && !a.latched && aim.dist < 380 && Date.now() - lastLatchTry > 4000 && latchTries < 12) {
      lastLatchTry = Date.now(); latchTries++;
      await page.mouse.move(aim.x, aim.y, { steps: 2 }); await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
      R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
      note(`latch try ${latchTries} dist ${Math.round(aim.dist)}`); await sleep(500);
      if (latchTries === 1 || latchTries === 3) await shot(`latch-try-${latchTries}`, { gameplay: true });
    }
    if (!advThrow.done && advThrow.tries < 4 && isRock && /loose rock/i.test(labelText)) {
      const evN = (name) => page.evaluate((n) => (window.__dr.ev || []).filter((e) => e.ev === n).length, name);
      if ((await evN('tether:latched')) > advThrow.l0 && a.latched) {
        advThrow.tries++; const t0n = await evN('massline:throw');
        await shot('latched-rock', { gameplay: true });
        await keyDown('KeyW'); await keyDown('KeyD');
        for (let i = 0; i < 6; i++) { await page.mouse.move(VW / 2 + 260 * Math.cos(i * 0.6), VH / 2 + 200 * Math.sin(i * 0.6), { steps: 2 }); await sleep(200); if (i === 2) await shot('swing-rock', { gameplay: true }); }
        await keyUp('KeyD');
        const aimD = await page.evaluate(() => {
          const s = window.SF.state; const h = window.SF.helpers;
          const d = (s.entityList || []).find((e) => e && e.alive !== false && e.data && e.data.rescueRole === 'derelict');
          return d ? h.worldToScreen({ x: d.pos.x, y: 0, z: d.pos.z }, {}) : null;
        }).catch(() => null);
        await page.mouse.move(aimD && Number.isFinite(aimD.x) ? aimD.x : VW / 2, aimD && Number.isFinite(aimD.y) ? aimD.y : 200, { steps: 2 });
        await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
        R.clicks++; await page.evaluate(() => { window.__dr.clicks++; }).catch(() => {});
        await keyUp('KeyW'); await shot('release-rock', { gameplay: true });
        const rel0 = await evN('tether:released');
        for (let i = 0; i < 12 && !advThrow.done; i++) { await sleep(250); advThrow.done = (await evN('massline:throw')) > t0n || (await evN('tether:released')) > rel0 || (await evN('tether:cut')) > 0; }
        const evs = await page.evaluate(() => (window.__dr.ev || []).filter((e) => /massline:throw|tether:released|tether:cut/.test(e.ev)).slice(-3)).catch(() => []);
        R.milestones.rockRelease = evs.length ? evs[evs.length - 1] : null; note('rock release events: ' + JSON.stringify(evs));
        note(advThrow.done ? 'THROW registered on the loose rock' : 'release did not register a throw; retrying');
        if (advThrow.done) { await sleep(1500); await shot('after-throw-derelict', { gameplay: true }); }
      }
    }
    if (isDock && aim.dist < 240 && Date.now() - lastE > 2000) { lastE = Date.now(); await page.keyboard.press('KeyE'); note(`pressed E at dist ${Math.round(aim.dist)}`); await sleep(600); }
    await sleep(120);
  }
  await releaseAll();
  R.adventure_trail = trail.slice(-60);
  if (!R.outcome) R.outcome = `stopped at wall ${wallS()}s: phase ${phase}, ${docked ? 'docked' : 'not docked'}; last objective ${lastWpKey}`;
}

// ---------------------------------------------------------------- finish: stats + report
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))].toFixed(2); }
async function collect() {
  const d = await page.evaluate(() => {
    const D = window.__dr; return { t0: D.t0, ms: D.ms, text: D.text, ev: D.ev, frames: D.frames, longs: D.longs, noise: D.noise, emitted: D.emitted, hooked: D.hooked, clicks: D.clicks, longTaskError: D.longTaskError };
  }).catch((e) => { note('collect failed ' + e.message); return null; });
  if (!d) return;
  const first = d.ms.firstFlight ? d.ms.firstFlight.t : null;
  const dts = []; const dtsClean = []; const noise = d.noise || [];
  for (let i = 0; i < d.frames.length; i += 3) {
    const t = d.frames[i], dt = d.frames[i + 1], fl = d.frames[i + 2];
    if (!fl || d.t0 == null || (t - d.t0) / 1000 < (first ?? 1e9)) continue;
    dts.push(dt);
    if (!noise.some(([a, b]) => t >= a && t <= b)) dtsClean.push(dt);
  }
  const stat = (a) => ({ frames: a.length, p50: pct(a, .5), p95: pct(a, .95), p99: pct(a, .99), max: a.length ? +Math.max(...a).toFixed(1) : null, over100ms: a.filter((x) => x > 100).length, over250ms: a.filter((x) => x > 250).length, fpsMean: a.length ? +(1000 / (a.reduce((x, y) => x + y, 0) / a.length)).toFixed(1) : null });
  R.frame_playable = stat(dts);
  R.frame_playable_excluding_screenshots = stat(dtsClean);
  const playStart = d.t0 != null && first != null ? d.t0 + first * 1000 : Infinity;
  const longs = d.longs.filter((l) => l.t >= playStart);
  R.longTasks = { total_over_50ms: longs.length, over_250ms: longs.filter((l) => l.d >= 250).length, over_250ms_excl_screenshot: longs.filter((l) => l.d >= 250 && !noise.some(([a, b]) => l.t >= a - 600 && l.t <= b)).length, worst: longs.sort((a, b) => b.d - a.d).slice(0, 8), observerError: d.longTaskError || null };
  R.milestones = d.ms;
  R.events = d.ev.filter((e) => !/^(combat:collisionConsequence|massline:(tumbleEnd|recovering|recovered))$/.test(e.ev)).slice(0, 800);
  R.eventCounts = d.ev.reduce((m, e) => { m[e.ev] = (m[e.ev] || 0) + 1; return m; }, {});
  R.text = d.text.map(({ tAbs, src, text, kind }) => ({ t: d.t0 == null ? null : +((tAbs - d.t0) / 1000).toFixed(2), src, text, kind }));
  R.bus = { hooked: d.hooked, emitsSeen: d.emitted };
  R.quality_atEnd = await qualityInfo();
}
function toMd() {
  const L = []; const m = R.milestones || {};
  const ms = (k) => (m[k] ? `${m[k].t} s, ${m[k].clicks} clicks` : 'never');
  L.push(`# Demo route: ${R.route}`, '', `Run ${R.startedAt}; viewport ${R.viewport}; ${R.headed ? 'headed' : 'headless'}; intro mode ${R.intro}.`, '');
  L.push(`- Renderer: ${R.renderer}`, `- Quality preset at flight: ${JSON.stringify(R.quality_atFlight)}`, `- Quality at end: ${JSON.stringify(R.quality_atEnd)}`, `- Outcome: ${R.outcome}`);
  L.push(`- Total wall time ${R.wallSeconds} s; clicks from title click: ${R.clicks}; intro on screen ${R.intro_seconds ?? '?'} s`);
  L.push('', '## Timings from the title click (wall s, mouse presses so far)', `- first flight frame: ${ms('firstFlight')}`, `- first Line latch: ${ms('firstLatch')}`, `- first throw: ${ms('firstThrow')}`, `- first kill: ${ms('firstKill')}`);
  const f = R.frame_playable || {}; const g = R.frame_playable_excluding_screenshots || {};
  L.push('', '## Frame time over the playable span (flight mode, rAF deltas, ms)', `- all: n=${f.frames} p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} max ${f.max}; >100ms ${f.over100ms}; >250ms ${f.over250ms}; mean ${f.fpsMean} fps`, `- excluding screenshot windows: n=${g.frames} p50 ${g.p50} p95 ${g.p95} p99 ${g.p99} max ${g.max}; >100ms ${g.over100ms}; >250ms ${g.over250ms}`);
  const lt = R.longTasks || {}; L.push(`- long tasks: ${lt.total_over_50ms} over 50 ms, ${lt.over_250ms} at or over 250 ms (${lt.over_250ms_excl_screenshot} not near a screenshot); worst ${JSON.stringify(lt.worst)}`);
  L.push('', '## Steps'); for (const s of R.steps) L.push(`- ${s.at} s  ${s.name}: ${s.detail || ''}`);
  L.push('', '## Screens (PNG per screen)'); for (const s of R.screens) L.push(`- ${s.file}  (${s.at} s)${s.controls ? '  controls: ' + s.controls.join(' | ') : ''}`);
  L.push('', '## Every toast / alert / notice / stage string, with its time (s since title click)');
  const seen = new Map(); for (const t of (R.text || []).filter((x) => x.src !== 'dom:hud')) { const k = t.text; if (!seen.has(k)) seen.set(k, { n: 0, first: t }); seen.get(k).n++; }
  for (const [k, v] of seen) L.push(`- ${v.first.t == null ? 'pre-click' : v.first.t + ' s'}  [${v.first.src}] "${k}"${v.n > 1 ? `  x${v.n}` : ''}`);
  if (!(R.text || []).length) L.push('- (none captured)');
  const hud = new Map(); for (const t of (R.text || []).filter((x) => x.src === 'dom:hud' && x.t != null && x.t >= 0 && x.text.length <= 70)) if (!hud.has(t.text)) hud.set(t.text, t);
  L.push('', '## HUD word elements that appeared after the title click (floating text, chips, tags; noisy, first sighting each, max 150)');
  for (const [k, v] of [...hud].slice(0, 150)) L.push(`- ${v.t} s  "${k}"`);
  L.push('', '## Game events', ...Object.entries(R.eventCounts || {}).map(([k, v]) => `- ${k}: ${v}`));
  L.push('', '## Errors', ...(R.errors.length ? R.errors.slice(0, 30).map((e) => `- page error: ${e}`) : ['- no page errors']), ...(R.consoleErrors.length ? R.consoleErrors.slice(0, 30).map((e) => `- console: ${e}`) : ['- no console errors']));
  L.push('', '## Notes', ...R.notes.slice(-80).map((n) => `- ${n}`));
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- main
try {
  await sleep(2500);
  browser = await chromium.launch({ headless: !HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${VW + 20},${VH + 140}`] });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  page = await ctx.newPage();
  await page.addInitScript(INIT);
  page.on('pageerror', (e) => { R.errors.push(`[${wallS()}s] ${String(e.message).slice(0, 300)}`); console.log('pageerror', String(e.message).slice(0, 160)); });
  page.on('console', (m) => { if (m.type() === 'error') R.consoleErrors.push(`[${wallS()}s] ${m.text().slice(0, 300)}`); });
  page.on('requestfailed', (r) => R.consoleErrors.push(`[${wallS()}s] requestfailed ${r.url().slice(0, 120)}`));
  await page.goto('about:blank');
  R.renderer = await rendererInfo();
  note('renderer: ' + R.renderer);
  try {
    if (ROUTE === 'swarm') await swarmRoute(); else await adventureRoute();
  } catch (e) {
    R.errors.push(`ROUTE THREW: ${e.stack || e.message}`); console.log('ROUTE THREW', e.stack || e.message); R.outcome = (R.outcome || '') + ` | route threw: ${e.message}`;
    await shot('route-threw', {}).catch(() => {});
  }
  await releaseAll().catch(() => {});
  R.wallSeconds = wallS();
  await collect();
  R.quality_atEnd = R.quality_atEnd || await qualityInfo();
} finally {
  R.wallSeconds = R.wallSeconds || wallS();
  writeFileSync(join(OUT, 'demo-route.json'), JSON.stringify(R, null, 2));
  writeFileSync(join(OUT, 'report.md'), toMd());
  console.log(`wrote ${join(OUT, 'demo-route.json')} and report.md`);
  try { if (browser) await browser.close(); } catch (e) { /* closed */ }
  server.kill();
}
