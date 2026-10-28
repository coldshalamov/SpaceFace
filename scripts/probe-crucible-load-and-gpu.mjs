// Crucible load-freeze attribution + per-pass GPU time.
//
// Two questions the program census (probe-crucible-programs.mjs) left open:
//   1. What runs during the 1-9 s freezes in the Crucible loading / draft phases (not shader links: those
//      blocked 170 ms in a whole run)?
//   2. Where does GPU time go per frame inside an active round, pass by pass?
//
// HOW
//   (1) A CDP CPU profile (1 ms) starts right after the page loads and stops after the observation window. Every
//       long task >= --min-freeze ms is mapped onto the profile by wall-clock epoch, and the code that was running
//       inside that window is reported (inclusive top functions), beside the sim phase at that moment.
//   (2) WebGL2 is wrapped before the page runs. Draws/clears/blits open a GPU timer query (EXT_disjoint_timer_query_webgl2)
//       that closes when the framebuffer binding changes or the frame ends, so every render pass gets a GPU time, a
//       target size and a draw count. If the browser hides the extension, the probe falls back to timing gl.finish() at
//       frame start (how far the GPU is behind the CPU) and says so.
//
//   node scripts/probe-crucible-load-and-gpu.mjs                  headed (the real GPU), 60 s of active round
//   node scripts/probe-crucible-load-and-gpu.mjs --duration=90 --min-freeze=1000
//
// Output: .devshots/program-census/load-gpu-<stamp>.json and a printed report. Observation only.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const DURATION_S = Number(arg('duration', 60));
const MIN_FREEZE_MS = Number(arg('min-freeze', 1000));
const SEED = 4242;
const { chromium } = await loadPlaywright();

const INIT = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const gpu = window.__gpu = { supported: null, frameNo: 0, since: 0, tags: {}, frameNs: {}, frameDraws: {}, dt: [], disjoint: 0, finishMs: [], contexts: 0 };
  const longTasks = window.__longTasks = []; const phaseLog = window.__phaseLog = [];
  const states = new WeakMap(); const all = [];
  const now = () => performance.now();
  const ctxInfo = () => {
    try {
      const st = window.SF && window.SF.state; if (!st) return null;
      const run = st.run || null;
      return { sim: st.simTime, phase: run && run.phase, wave: run && run.wave, mode: st.mode, ents: st.entityList ? st.entityList.length : null };
    } catch (_) { return null; }
  };
  const st = (gl) => {
    let s = states.get(gl);
    if (!s) { s = { gl, id: all.length, ext: undefined, cur: null, fb: null, vw: 0, vh: 0, pass: 0, pending: [], lastDraws: 0 }; states.set(gl, s); all.push(s); gpu.contexts = all.length; }
    return s;
  };
  const getExt = (s) => {
    if (s.ext === undefined) {
      try { s.ext = s.gl.getExtension('EXT_disjoint_timer_query_webgl2') || null; } catch (_) { s.ext = null; }
      if (gpu.supported === null || s.ext) gpu.supported = !!s.ext;
    }
    return s.ext;
  };
  const begin = (s) => {
    if (s.cur) return;
    const c = { q: null, pass: s.pass++, w: s.vw, h: s.vh, rt: s.fb !== null, draws: 0, frame: gpu.frameNo, ctx: s.id };
    const ext = getExt(s);
    if (ext) { try { const q = s.gl.createQuery(); s.gl.beginQuery(ext.TIME_ELAPSED_EXT, q); c.q = q; } catch (_) { c.q = null; } }
    s.cur = c;
  };
  const record = (c, ns) => {
    const tag = 'c' + c.ctx + ' p' + c.pass + ' ' + c.w + 'x' + c.h + (c.rt ? ' target' : ' canvas');
    const t = gpu.tags[tag] || (gpu.tags[tag] = { n: 0, ns: 0, draws: 0 });
    t.n++; t.ns += ns || 0; t.draws += c.draws;
    gpu.frameNs[c.frame] = (gpu.frameNs[c.frame] || 0) + (ns || 0);
    gpu.frameDraws[c.frame] = (gpu.frameDraws[c.frame] || 0) + c.draws;
  };
  const end = (s) => {
    const c = s.cur; if (!c) return; s.cur = null;
    if (c.q) {
      try { s.gl.endQuery(s.ext.TIME_ELAPSED_EXT); } catch (_) { /* ignore */ }
      s.pending.push(c);
    } else record(c, 0);
  };
  const poll = (s) => {
    const ext = s.ext; if (!ext || !s.pending.length) return;
    const gl = s.gl; let disjoint = false;
    try { disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT); } catch (_) { /* ignore */ }
    if (disjoint) { gpu.disjoint++; for (const c of s.pending) { try { gl.deleteQuery(c.q); } catch (_) { /* ignore */ } } s.pending.length = 0; return; }
    while (s.pending.length) {
      const c = s.pending[0]; let ok = false;
      try { ok = !!gl.getQueryParameter(c.q, gl.QUERY_RESULT_AVAILABLE); } catch (_) { ok = true; }
      if (!ok) break;
      s.pending.shift(); let ns = 0;
      try { ns = Number(gl.getQueryParameter(c.q, gl.QUERY_RESULT)) || 0; } catch (_) { ns = 0; }
      try { gl.deleteQuery(c.q); } catch (_) { /* ignore */ }
      record(c, ns);
    }
    if (s.pending.length > 600) { for (const c of s.pending.splice(0, s.pending.length - 300)) { try { gl.deleteQuery(c.q); } catch (_) { /* ignore */ } } }
  };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) {
    const orig = proto[name]; if (typeof orig !== 'function') continue;
    proto[name] = function () { const s = st(this); begin(s); if (name !== 'clear' && name !== 'blitFramebuffer') s.cur.draws++; return orig.apply(this, arguments); };
  }
  const origBind = proto.bindFramebuffer;
  proto.bindFramebuffer = function (target, fb) { const s = st(this); if (fb !== s.fb) { end(s); s.fb = fb; } return origBind.call(this, target, fb); };
  const origViewport = proto.viewport;
  proto.viewport = function (x, y, w, h) { const s = st(this); s.vw = w; s.vh = h; if (s.cur && s.cur.draws === 0) { s.cur.w = w; s.cur.h = h; } return origViewport.call(this, x, y, w, h); };
  window.__gpuReset = () => { gpu.tags = {}; gpu.frameNs = {}; gpu.frameDraws = {}; gpu.dt.length = 0; gpu.finishMs.length = 0; gpu.disjoint = 0; gpu.since = gpu.frameNo; };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push({ epoch: performance.timeOrigin + e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* unsupported */ }
  let lastKey = null;
  setInterval(() => { const c = ctxInfo(); const key = c ? c.phase + '|' + c.mode : null; if (key !== lastKey) { lastKey = key; phaseLog.push({ epoch: Date.now(), ctx: c }); } }, 100);
  let last = now();
  const tick = () => {
    const t = now(); const dt = t - last; last = t;
    for (const s of all) { end(s); s.pass = 0; }
    gpu.frameNo++;
    gpu.dt.push({ f: gpu.frameNo, dt });
    for (const s of all) poll(s);
    if (gpu.supported === false && all.length) {
      let best = null; for (const s of all) if (!best || s.lastDraws > best.lastDraws) best = s;
      if (best) { const a = now(); try { best.gl.finish(); } catch (_) { /* ignore */ } gpu.finishMs.push(now() - a); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

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
async function startServer() {
  const port = await findFreePort(8640);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
  });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error('dev server exited before it was reachable');
    try { if ((await fetch(url)).ok) return { baseUrl: url, kill: () => child.kill() }; } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('dev server never became reachable');
}
const clickButton = (page, label) => page.evaluate((wanted) => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const all = [...document.querySelectorAll('#screens button')];
  const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
  if (!b || b.disabled) return false;
  b.click();
  return true;
}, label);
async function waitForButton(page, label, timeout) {
  await page.waitForFunction((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button')].find((x) => norm(x.textContent).includes(norm(wanted)));
    return !!b && !b.disabled;
  }, label, { timeout });
}

const SKIP_FN = /^\((root|program|idle|garbage collector)\)$/;
const keyOf = (n) => {
  const c = n.callFrame;
  return `${c.functionName || '(anon)'} ${(c.url || '').replace(/^https?:\/\/[^/]+\//, '')}:${c.lineNumber + 1}`;
};

// Map each long freeze onto the CPU profile and report what ran inside it.
function attributeFreezes(profile, epochAtStart, longTasks, phaseLog, minMs) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const epochs = new Float64Array(profile.samples.length);
  let t = 0;
  for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i] || 0; epochs[i] = epochAtStart + t / 1000; }
  const phaseAt = (epoch) => {
    let hit = null; for (const p of phaseLog) { if (p.epoch <= epoch) hit = p; else break; }
    return hit && hit.ctx ? `${hit.ctx.mode}/${hit.ctx.phase || '-'}` : 'boot';
  };
  const freezes = longTasks.filter((l) => l.d >= minMs).sort((a, b) => b.d - a.d).slice(0, 14);
  const out = [];
  for (const lt of freezes) {
    const lo = lt.epoch; const hi = lt.epoch + lt.d;
    const incl = new Map(); const selfF = new Map(); let total = 0; let programUs = 0; let gcUs = 0;
    for (let i = 0; i < epochs.length; i++) {
      if (epochs[i] < lo || epochs[i] > hi) continue;
      const us = profile.timeDeltas[i] || 0; total += us;
      const id = profile.samples[i]; const leaf = nodes.get(id);
      const lk = keyOf(leaf);
      if (/^\(program\)/.test(lk)) programUs += us;
      if (/^\(garbage collector\)/.test(lk)) gcUs += us;
      selfF.set(lk, (selfF.get(lk) || 0) + us);
      const seen = new Set();
      for (let cur = id; cur != null; cur = parent.get(cur)) {
        const k = keyOf(nodes.get(cur));
        if (SKIP_FN.test(nodes.get(cur).callFrame.functionName) || seen.has(k)) continue;
        seen.add(k); incl.set(k, (incl.get(k) || 0) + us);
      }
    }
    const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, us]) => `${Math.round(us / 1000)}ms ${name.slice(0, 110)}`);
    out.push({ ms: Math.round(lt.d), phase: phaseAt(lo), sampledMs: Math.round(total / 1000), nativeProgramMs: Math.round(programUs / 1000), gcMs: Math.round(gcUs / 1000), topInclusive: top(incl, 7), topSelf: top(selfF, 4) });
  }
  return out;
}

function gpuReport(g) {
  const pct = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 100) / 100; };
  const frames = Object.keys(g.frameNs).map(Number).filter((f) => f > g.since);
  const gpuMs = frames.map((f) => g.frameNs[f] / 1e6);
  const dt = g.dt.filter((d) => d.f > g.since).map((d) => d.dt);
  const draws = frames.map((f) => g.frameDraws[f] || 0);
  const tags = Object.entries(g.tags).map(([tag, v]) => ({ tag, segments: v.n, avgGpuMs: v.n ? Math.round((v.ns / v.n / 1e6) * 100) / 100 : 0, gpuMsPerFrame: frames.length ? Math.round((v.ns / frames.length / 1e6) * 100) / 100 : 0, drawsPerFrame: frames.length ? Math.round(v.draws / frames.length) : 0 }))
    .sort((a, b) => b.gpuMsPerFrame - a.gpuMsPerFrame).slice(0, 14);
  return {
    timerQueriesSupported: g.supported, contexts: g.contexts, framesMeasured: frames.length, disjointEvents: g.disjoint,
    gpuMsPerFrame: { p50: pct(gpuMs, 0.5), p95: pct(gpuMs, 0.95), mean: gpuMs.length ? Math.round((gpuMs.reduce((a, b) => a + b, 0) / gpuMs.length) * 100) / 100 : null },
    frameDtMs: { p50: pct(dt, 0.5), p95: pct(dt, 0.95), count: dt.length },
    drawsPerFrame: { p50: pct(draws, 0.5), p95: pct(draws, 0.95) },
    finishBlockMs: g.finishMs.length ? { p50: pct(g.finishMs, 0.5), p95: pct(g.finishMs, 0.95), note: 'gl.finish() wait at frame start = how far the GPU is behind the CPU (fallback when timer queries are hidden)' } : null,
    topPasses: tags,
  };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  let shown = 0;
  page.on('pageerror', (e) => { if (shown++ < 6) console.log('[page error]', String(e && e.message || e).slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' && shown++ < 6) console.log('[console error]', m.text().slice(0, 300)); });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 240000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
    const epochAtStart = Date.now();
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 300000 });
    await page.waitForFunction(() => { const el = document.querySelector('[data-screen="mainMenu"]'); return el && getComputedStyle(el).display !== 'none'; }, null, { timeout: 300000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().toLowerCase() === 'play' && !x.disabled); if (b) b.click(); });
    await waitForButton(page, 'Crucible', 60000);
    if (!(await clickButton(page, 'Crucible'))) throw new Error('Crucible button did not click');
    await page.waitForTimeout(500);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#screens .sf-crd-mode')].find((b) => b.dataset.ruleset === 'swarm'); if (c) c.click(); });
    if (!(await clickButton(page, 'Choose ship & kit'))) throw new Error('Choose ship & kit did not click');
    await page.evaluate((seed) => {
      const hull = [...document.querySelectorAll('#screens .sf-crd-hull')].find((b) => b.textContent.includes('Ricochet Runner')) || document.querySelector('#screens .sf-crd-hull');
      hull.click(); document.querySelector('#screens .sf-crd-seed input').value = String(seed);
    }, SEED);
    if (!(await clickButton(page, 'Open armory'))) throw new Error('Open armory did not click');
    await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 240000 });
    await waitForButton(page, 'Launch round 1', 240000);
    await clickButton(page, 'Launch round 1');
    await page.waitForFunction(() => window.SF.state.run && window.SF.state.run.phase === 'active', null, { timeout: 120000, polling: 100 });
    await page.evaluate(() => window.__gpuReset());
    console.log(`[load-gpu] round 1 active; measuring GPU for ${DURATION_S} s`);
    await page.waitForTimeout(DURATION_S * 1000);
    const { profile } = await cdp.send('Profiler.stop');
    const data = await page.evaluate(() => ({ gpu: window.__gpu, longTasks: window.__longTasks, phaseLog: window.__phaseLog }));
    const freezes = attributeFreezes(profile, epochAtStart, data.longTasks, data.phaseLog, MIN_FREEZE_MS);
    const gpu = gpuReport(data.gpu);
    const report = { settings: { durationS: DURATION_S, minFreezeMs: MIN_FREEZE_MS }, gpu, freezes, longTaskCount: data.longTasks.length, longTasksOver1s: data.longTasks.filter((l) => l.d >= 1000).length };
    mkdirSync('.devshots/program-census', { recursive: true });
    const file = `.devshots/program-census/load-gpu-${stamp}.json`;
    writeFileSync(file, JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[load-gpu] wrote ${file}`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
}
main().catch((err) => { console.error('[load-gpu] FAILED:', (err && err.stack) || err); process.exit(1); });
