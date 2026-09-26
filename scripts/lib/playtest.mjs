// Shared playtest harness for the audit lane (design/program/vm-drop/playtest-audit).
// Boots the real game route on an isolated store, records per-beat frames/screens/controls/
// text/console errors to .devshots/<run>/, and keeps a structured observations list so a
// reviewer can audit text cheaply and open PNGs only where the text says to look.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './load-playwright.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`game server did not answer at ${url}`);
}

function cpuSnapshot() {
  let idle = 0, total = 0;
  for (const cpu of os.cpus()) {
    for (const v of Object.values(cpu.times)) total += v;
    idle += cpu.times.idle;
  }
  return { idle, total };
}
function hostBusyPct(a, b) {
  const t = b.total - a.total;
  return t > 0 ? 100 * (1 - (b.idle - a.idle) / t) : 0;
}

// Boot the game. `query` is the URL search string (e.g. '?demo=1' or '' for the normal route).
export async function bootPlaytest({ outDir, query = '', headless = true, viewport = { width: 1600, height: 900 } } = {}) {
  const { chromium } = await loadPlaywright();
  fs.mkdirSync(outDir, { recursive: true });
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
  });
  const consoleErrors = [];
  const ctx = {
    outDir, consoleErrors, shaderErrors: 0,
    steps: [], observations: [], port, server, browser: null, page: null, t0: Date.now(),
  };
  await waitForServer(`http://127.0.0.1:${port}/`);
  ctx.browser = await chromium.launch({
    headless,
    args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', `--window-size=${viewport.width},${viewport.height}`],
  });
  ctx.page = await ctx.browser.newPage({ viewport });
  const page = ctx.page;
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('404') && /__spaceface_player_store/.test(msg.location()?.url || text)) return;
    if (/Shader Error|Program Info Log|undeclared identifier|VALIDATE_STATUS false/i.test(text)) ctx.shaderErrors += 1;
    consoleErrors.push(`[console] ${text.slice(0, 300)}`);
  });
  await page.addInitScript(() => {
    window.__SF_PT_FRAMES__ = { stamps: [], lastT: null };
    const tick = (t) => {
      const f = window.__SF_PT_FRAMES__;
      f.stamps.push({ wall: Date.now(), dt: f.lastT == null ? 16.7 : t - f.lastT });
      f.lastT = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      if (!localStorage.getItem('sf.settings.profile.v1')) {
        localStorage.setItem('sf.settings.profile.v1', JSON.stringify({
          version: 1,
          settings: { accessibility: { motionPreference: 'system' }, video: { motionReduce: true } },
        }));
      }
    } catch (_) { /* storage unavailable */ }

    // Cheap per-beat glass census: what screen is up, what the visible text is, what controls
    // exist — enough for a reviewer to audit copy/UX without opening the PNG.
    window.__SF_PT_SNAP__ = () => {
      const vis = (el) => !!(el && el.offsetParent !== null && !el.closest('[hidden]'));
      const text = (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 4500);
      const controls = [...document.querySelectorAll(
        'button,[role="button"],.k-word,[data-action],a,input,select,textarea,[tabindex="0"]')]
        .filter(vis).slice(0, 160)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            act: el.dataset && el.dataset.action || null,
            text: (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 90),
            disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          };
        });
      // All mounted .screen roots — a screen that stays mounted under another one is a
      // layering defect this field makes visible in the census (seen: techTree ghosting
      // under the docked station UI).
      const screens = [...document.querySelectorAll('.screen, [data-k-screen]')].map((el) => ({
        id: el.dataset.screen || el.dataset.kScreen || el.className.split(' ')[0],
        visible: !!(el.offsetParent !== null && !el.hidden),
      }));
      const SF = window.SF || {};
      const st = SF.state || {};
      const p = st.entities && st.playerId != null ? st.entities.get(st.playerId) : null;
      return {
        screen: document.body.dataset.kScreen || null,
        screens,
        mode: st.mode || null,
        run: st.run ? { kind: st.run.kind, phase: st.run.phase, wave: st.run.wave } : null,
        simTime: st.simTime != null ? +st.simTime.toFixed(1) : null,
        player: p ? { alive: p.alive !== false, hull: p.hull, shield: p.shield, credits: st.player && st.player.credits } : null,
        docked: !!(st.ui && st.ui.docked),
        dockedStationId: st.ui && st.ui.dockedStationId || null,
        entities: st.entities ? st.entities.size : null,
        text, controls,
      };
    };

    // In-page seam helpers (same contract probe-demo-path installs): autopilot to a station,
    // dock/undock through the real bus events, and proximity queries used by travel logic.
    const H = window.__SF_PT_HELPERS__ = {
      st: () => window.SF.state,
      player: () => window.SF.state.entities.get(window.SF.state.playerId),
      station: (id) => {
        for (const e of window.SF.state.entities.values()) {
          if (e.id === id || e.stationId === id || (e.data && e.data.stationId === id)) return e;
        }
        return null;
      },
      stationIds: () => {
        const out = [];
        for (const e of window.SF.state.entities.values()) {
          if (e && e.type === 'station') out.push(e.stationId || (e.data && e.data.stationId) || e.id);
        }
        return out;
      },
      distTo: (id) => {
        const p = H.player(); const s = H.station(id);
        if (!p || !s) return Infinity;
        const pp = p.pos || p; const sp = s.pos || s;
        return Math.hypot(sp.x - pp.x, sp.z - pp.z);
      },
      dockRange: (id) => {
        const s = H.station(id);
        const dr = s && (s.dockRadius || (s.data && s.data.dockRadius));
        return dr || (s && s.r ? s.r * 0.9 : 120);
      },
      stationInRange: () => {
        const p = H.player(); if (!p) return null;
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.type !== 'station') continue;
          const dr = e.dockRadius || (e.data && e.data.dockRadius) || (e.r || 90) * 0.9;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d <= dr) return e.stationId || (e.data && e.data.stationId) || e.id;
        }
        return null;
      },
      autopilot: (id) => {
        const st = window.SF.state;
        const s = H.station(id);
        st.nav.autopilot = s
          ? { active: true, targetEntityId: s.id, target: null, label: 'playtest', arrivalRadius: Math.max(30, H.dockRange(id) * 0.8), status: 'cruise' }
          : { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' };
        return !!s;
      },
      dock: (id) => {
        const st = window.SF.state;
        window.SF.bus.emit('dock:attempt', { stationId: id });
        window.SF.bus.emit('dock:docked', { stationId: id });
        if (st.ui) { st.ui.docked = true; st.ui.dockedStationId = id; }
      },
      undock: (id) => {
        const st = window.SF.state;
        if (st.ui) { st.ui.docked = false; st.ui.dockedStationId = null; }
        window.SF.bus.emit('dock:undocked', { stationId: id });
      },
      docked: () => !!(window.SF.state.ui && window.SF.state.ui.docked),
      hostilesNear: (range) => {
        const p = H.player(); if (!p) return [];
        const out = [];
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.alive === false || e.id === p.id) continue;
          const hostile = (e.data && e.data.ai && e.data.ai.hostile === true)
            || (e.ai && e.ai.hostileToPlayer)
            || (e.team != null && e.team !== p.team && e.team !== 2 && e.team !== 0);
          if (!hostile) continue;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d <= range) out.push({ id: e.id, shipId: e.shipId, d: +d.toFixed(0) });
        }
        return out;
      },
      salvageNear: (range) => {
        const p = H.player(); if (!p) return [];
        const out = [];
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.alive === false) continue;
          if (e.type !== 'pickup' && e.type !== 'wreck' && !(e.data && e.data.salvage)) continue;
          const ep = e.pos || e; const pp = p.pos || p;
          const d = Math.hypot(ep.x - pp.x, ep.z - pp.z);
          if (d <= range) out.push({ id: e.id, d: +d.toFixed(0) });
        }
        return out;
      },
      credits: () => window.SF.state.player.credits,
    };
  });
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  return ctx;
}

async function frameCount(ctx) {
  return ctx.page.evaluate(() => ((window.__SF_PT_FRAMES__ && window.__SF_PT_FRAMES__.stamps) || []).length);
}
async function frameWindowCount(ctx, a, b) {
  return ctx.page.evaluate(([s, e]) => {
    const st = (window.__SF_PT_FRAMES__ && window.__SF_PT_FRAMES__.stamps) || [];
    let over = 0;
    for (let i = s; i < Math.min(e, st.length); i++) if (st[i].dt > 100) over++;
    return over;
  }, [a, b]);
}

// One audited beat. fn returns a detail object; the harness adds timing, frame stats,
// screenshot, and a __SF_PT_SNAP__ census (screen, text, controls) to every record.
export async function beat(ctx, id, note, fn, { shot = true } = {}) {
  const rec = { id, note, reached: false, startedAt: Date.now() };
  const cpu0 = cpuSnapshot();
  const f0 = await frameCount(ctx).catch(() => 0);
  try {
    rec.detail = await fn();
    rec.reached = true;
  } catch (error) {
    rec.error = String((error && error.message) || error).slice(0, 500);
  }
  rec.seconds = +((Date.now() - rec.startedAt) / 1000).toFixed(1);
  rec.cpuPct = +hostBusyPct(cpu0, cpuSnapshot()).toFixed(0);
  const f1 = await frameCount(ctx).catch(() => f0);
  rec.framesOver100 = await frameWindowCount(ctx, f0, f1).catch(() => null);
  rec.frames = f1 - f0;
  try { rec.snap = await ctx.page.evaluate(() => window.__SF_PT_SNAP__()); } catch { rec.snap = null; }
  if (shot) {
    try {
      rec.shot = path.join(ctx.outDir, `${String(ctx.steps.length).padStart(2, '0')}-${id}.png`);
      await ctx.page.screenshot({ path: rec.shot });
    } catch { rec.shot = null; }
  }
  ctx.steps.push(rec);
  console.log(`[beat] ${rec.reached ? 'OK  ' : 'FAIL'} ${id} ${rec.seconds}s cpu=${rec.cpuPct}% frames>100ms=${rec.framesOver100}/${rec.frames}${rec.error ? ' err=' + rec.error : ''}`);
  return rec;
}

// Capture a screenshot mid-beat (e.g. after opening a screen, before closing it) —
// the beat-level shot always lands after fn() returns, which is post-close.
export async function shotNow(ctx, suffix) {
  const file = path.join(ctx.outDir, `${String(ctx.steps.length).padStart(2, '0')}-${suffix}.png`);
  await ctx.page.screenshot({ path: file });
  // Also snapshot the census right now — the beat's end-state snap lands post-close.
  try {
    const s = await ctx.page.evaluate(() => window.__SF_PT_SNAP__());
    fs.mkdirSync(path.join(ctx.outDir, 'census'), { recursive: true });
    fs.writeFileSync(path.join(ctx.outDir, 'census', `${suffix}.json`), JSON.stringify(s, null, 2));
  } catch { /* snap unavailable */ }
  return file;
}

// Click a rendered word/button whose text matches `pattern` — the same actuation a player makes.
export async function clickWord(ctx, pattern, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await ctx.page.evaluate((rx) => {
      const re = new RegExp(rx, 'i');
      const words = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
        .filter((w) => w.offsetParent !== null && re.test(w.textContent || ''));
      const w = words[0];
      if (!w) return false;
      w.click();
      return (w.textContent || '').trim();
    }, pattern.source);
    if (hit) return hit;
    await sleep(250);
  }
  throw new Error(`no visible word matching ${pattern}`);
}

export async function waitScreen(ctx, id, timeoutMs = 60_000) {
  await ctx.page.waitForFunction((want) => document.body.dataset.kScreen === want
    || !!document.querySelector(`.screen[data-screen="${want}"]:not([hidden])`), id, { timeout: timeoutMs });
}

// Record an audit observation. severity: 'defect' | 'rough-edge' | 'taste' | 'note'.
export function observe(ctx, severity, area, text, evidence = null) {
  ctx.observations.push({ at: new Date().toISOString(), severity, area, text, evidence });
  console.log(`[observe:${severity}] ${area} — ${text.slice(0, 140)}`);
}

export async function finish(ctx, extra = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    wallMinutes: +((Date.now() - ctx.t0) / 60000).toFixed(1),
    steps: ctx.steps.map((s) => ({
      id: s.id, reached: s.reached, seconds: s.seconds, cpuPct: s.cpuPct,
      framesOver100: s.framesOver100, frames: s.frames, note: s.note,
      detail: s.detail, error: s.error, shot: s.shot && path.basename(s.shot),
      snap: s.snap ? { screen: s.snap.screen, mode: s.snap.mode, controls: s.snap.controls.length } : null,
    })),
    shaderErrors: ctx.shaderErrors,
    consoleErrors: ctx.consoleErrors.slice(0, 60),
    observations: ctx.observations,
    ...extra,
  };
  fs.writeFileSync(path.join(ctx.outDir, 'report.json'), JSON.stringify(report, null, 2));
  // Text census for cheap review — one file per beat with the visible text + control list.
  const censusDir = path.join(ctx.outDir, 'census');
  fs.mkdirSync(censusDir, { recursive: true });
  for (const s of ctx.steps) {
    if (!s.snap) continue;
    fs.writeFileSync(path.join(censusDir, `${s.id}.json`), JSON.stringify(s.snap, null, 2));
  }
  console.log(`\nreport: ${path.join(ctx.outDir, 'report.json')} — ${ctx.steps.length} beats, ${ctx.observations.length} observations, ${ctx.consoleErrors.length} console errors, ${ctx.shaderErrors} shader errors`);
  if (ctx.browser) await ctx.browser.close().catch(() => {});
  ctx.server.kill();
  return report;
}
