// Unobserved Crucible stress bench — M0 instrument (a) of the Finish Program Lane 1 board.
//
// What the earlier probes could not say: what a round costs when nobody is watching. The
// program census runs a 1 ms CPU profile and the load probe reads query results through CDP;
// both inflate the main thread. This run keeps only the instruments that cost almost nothing:
//   * rAF frame-interval timestamps (the truth for frame time)
//   * EXT_disjoint_timer_query_webgl2 per render pass (GPU p50/p95, top passes)
//   * __SPACEFACE_PERF__.readFrameSample() once per rAF (sim/render/vfx/ui/callback split —
//     the counter's own docs bless bounded-window probe reads at no per-frame cost)
//   * the longtask observer (the freeze list)
// No screenshots, no readbacks, no CDP profiling inside the measured windows.
//
// Two windows per run: round 1 (the 150-body crowd the owner reports), then a forced wave-15
// crowd (run.wave set to 14, run:waveCleared emitted, remaining hostiles released to the
// lifetime sweep, draft clicked through — the real wave-15 plan spawns the real crowd).
//
//   node scripts/probe-crucible-stress.mjs                    headed, 60 s per window
//   node scripts/probe-crucible-stress.mjs --duration=45 --wave=15
//
// Output: .devshots/stress/<stamp>.json and a printed report. Observation only — nothing here
// mutates gameplay beyond the deliberate wave jump, and it kills nothing the run would keep.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const DURATION_S = Number(arg('duration', 60));
const WAVE = Number(arg('wave', 15));
const SEED = Number(arg('seed', 4242));
const SIM_LANE = arg('sim-lane', ''); // 'worker'|'main'|'' — the M1 A/B arm
const HEADLESS = process.argv.includes('--headless');
const browserPath = process.env.SF_PROBE_BROWSER
  || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => existsSync(candidate));
const { chromium } = await loadPlaywright();

const INIT = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const gpu = window.__gpu = { supported: null, frameNo: 0, since: 0, tags: {}, frameNs: {}, frameDraws: {}, disjoint: 0, contexts: 0 };
  const longTasks = window.__longTasks = [];
  const frames = window.__frames = []; // rAF truth + frame-phase split, one row per displayed frame
  const states = new WeakMap(); const all = [];
  const now = () => performance.now();
  const st = (gl) => {
    let s = states.get(gl);
    if (!s) { s = { gl, id: all.length, ext: undefined, cur: null, fb: null, vw: 0, vh: 0, pass: 0, pending: [] }; states.set(gl, s); all.push(s); gpu.contexts = all.length; }
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
    if (c.q) { try { s.gl.endQuery(s.ext.TIME_ELAPSED_EXT); } catch (_) { /* ignore */ } s.pending.push(c); }
    else record(c, 0);
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
  window.__gpuReset = () => { gpu.tags = {}; gpu.frameNs = {}; gpu.frameDraws = {}; gpu.disjoint = 0; gpu.since = gpu.frameNo; frames.length = 0; };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* unsupported */ }
  // Lane-diag sampler: simLaneDiag() every 250 ms — journal rebuilds, pending-tick
  // backlog and entity-mirror size deltas next to the frame ring name what stalls.
  const laneDiag = window.__laneDiag = [];
  setInterval(() => {
    try {
      const d = window.SF && typeof window.SF.simLaneDiag === 'function' ? window.SF.simLaneDiag() : null;
      if (d) laneDiag.push({ t: performance.now(), d });
    } catch (_) { /* diag sampling is advisory */ }
  }, 250);
  let last = now();
  const sample = {};
  const tick = () => {
    const t = now(); const dt = t - last; last = t;
    for (const s of all) { end(s); s.pass = 0; }
    gpu.frameNo++;
    const row = { f: gpu.frameNo, dt, t };
    const perf = window.__SPACEFACE_PERF__;
    if (perf && typeof perf.readFrameSample === 'function') {
      perf.readFrameSample(sample);
      row.sim = sample.simFrameMs; row.render = sample.renderMs; row.vfx = sample.vfxMs;
      row.ui = sample.uiMs; row.cb = sample.callbackMs; row.untr = sample.untrackedMs;
      row.ents = (window.SF && window.SF.state && window.SF.state.entityList) ? window.SF.state.entityList.length : null;
    }
    frames.push(row);
    if (frames.length > 20000) frames.splice(0, frames.length - 20000);
    for (const s of all) poll(s);
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
  const port = await findFreePort(8650);
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
  const all = [...document.querySelectorAll('#screens button, #screens [role="button"]')];
  const b = all.find((x) => norm(x.textContent) === norm(wanted)) || all.find((x) => norm(x.textContent).includes(norm(wanted)));
  if (!b || b.disabled) return false;
  b.click();
  return true;
}, label);
async function waitForButton(page, label, timeout) {
  await page.waitForFunction((wanted) => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('#screens button, #screens [role="button"]')].find((x) => norm(x.textContent).includes(norm(wanted)));
    return !!b && !b.disabled;
  }, label, { timeout });
}

const pct = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 100) / 100; };
const maxOf = (arr) => (arr.length ? Math.round(Math.max(...arr) * 100) / 100 : null);

function laneDiagSummary(diag, rows) {
  if (!diag.length) return null;
  const pick = (d) => d && d.d ? {
    journalRebuilds: d.d.journal && d.d.journal.rebuildPacks,
    appliedPacks: d.d.journal && d.d.journal.appliedPacks,
    retainedSegments: d.d.journal && d.d.journal.retainedSegments,
    writeSequence: d.d.journal && d.d.journal.writeSequence,
    completedTicksPending: d.d.completedTicksPending,
    fullRebuildsCoalesced: d.d.completedFullRebuildsCoalesced,
    coalesced: d.d.completedTickCoalescedCount,
    readModelEntities: d.d.readModelEntities,
    replyCount: d.d.replyCount,
    workerPumpTicks: d.d.workerPumpTicks,
    skippedPresentationTicks: d.d.skippedPresentationTicks,
  } : null;
  const maxPending = Math.max(...diag.map((s) => (s.d && s.d.completedTicksPending) || 0));
  const maxCoalesce = Math.max(...diag.map((s) => (s.d && s.d.completedTickCoalescingEvents) || 0));
  // For the worst frames, attach the diag sample nearest in time so a stall can be
  // tied to a rebuild or a pending-tick surge.
  const worst = rows.filter((r) => r.dt > 150).sort((a, b) => b.dt - a.dt).slice(0, 6).map((r) => {
    const near = diag.reduce((best, s) => (best == null || Math.abs(s.t - r.t) < Math.abs(best.t - r.t)) ? s : best, null);
    return { f: r.f, dt: Math.round(r.dt), t: Math.round(r.t), nearDiag: pick(near) };
  });
  return { samples: diag.length, first: pick(diag[0]), last: pick(diag[diag.length - 1]), maxPendingTicks: maxPending, maxCoalescingEvents: maxCoalesce, worstFrames: worst };
}

function windowReport(gpu, frames, longTasks, windowStart, laneDiag) {
  const since = gpu.since;
  const fns = Object.keys(gpu.frameNs).map(Number).filter((f) => f > since);
  const gpuMs = fns.map((f) => gpu.frameNs[f] / 1e6);
  const draws = fns.map((f) => gpu.frameDraws[f] || 0);
  const rows = frames.filter((r) => r.f > since);
  const dt = rows.map((r) => r.dt);
  const series = (k) => rows.map((r) => r[k]).filter((v) => Number.isFinite(v));
  const tags = Object.entries(gpu.tags).map(([tag, v]) => ({ tag, segments: v.n, gpuMsPerFrame: fns.length ? Math.round((v.ns / fns.length / 1e6) * 100) / 100 : 0, drawsPerFrame: fns.length ? Math.round(v.draws / fns.length) : 0 }))
    .sort((a, b) => b.gpuMsPerFrame - a.gpuMsPerFrame).slice(0, 10);
  return {
    frames: rows.length,
    frameDtMs: { p50: pct(dt, 0.5), p95: pct(dt, 0.95), p99: pct(dt, 0.99), longest: maxOf(dt), over50ms: dt.filter((d) => d > 50).length },
    simMs: { p50: pct(series('sim'), 0.5), p95: pct(series('sim'), 0.95) },
    renderMs: { p50: pct(series('render'), 0.5), p95: pct(series('render'), 0.95) },
    vfxMs: { p50: pct(series('vfx'), 0.5), p95: pct(series('vfx'), 0.95) },
    uiMs: { p50: pct(series('ui'), 0.5), p95: pct(series('ui'), 0.95) },
    callbackMs: { p50: pct(series('cb'), 0.5), p95: pct(series('cb'), 0.95) },
    untrackedMs: { p50: pct(series('untr'), 0.5), p95: pct(series('untr'), 0.95) },
    entities: { p50: pct(series('ents'), 0.5), max: maxOf(series('ents')) },
    gpuMsPerFrame: { p50: pct(gpuMs, 0.5), p95: pct(gpuMs, 0.95), mean: gpuMs.length ? Math.round((gpuMs.reduce((a, b) => a + b, 0) / gpuMs.length) * 100) / 100 : null },
    drawsPerFrame: { p50: pct(draws, 0.5), p95: pct(draws, 0.95) },
    topPasses: tags,
    longTasks: longTasks.filter((l) => l.t >= windowStart).map((l) => ({ t: Math.round(l.t), ms: Math.round(l.d) })),
    disjointEvents: gpu.disjoint,
    laneDiag: laneDiagSummary(laneDiag || [], rows),
  };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    headless: HEADLESS,
    executablePath: browserPath || undefined,
    args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  let shown = 0;
  page.on('pageerror', (e) => { if (shown++ < 8) console.log('[page error]', String(e && e.message || e).slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' && shown++ < 8) console.log('[console error]', m.text().slice(0, 300)); });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { settings: { durationS: DURATION_S, wave: WAVE, seed: SEED, simLane: SIM_LANE || 'default' }, hostBusy: null, windows: {} };
  try {
    await page.goto(`${server.baseUrl}${SIM_LANE ? `?simLane=${SIM_LANE}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
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
    try {
      await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 420000 });
    } catch (err) {
      const stuck = await page.evaluate(() => ({
        mode: window.SF?.state?.mode, run: window.SF?.state?.run && { phase: window.SF.state.run.phase, wave: window.SF.state.run.wave },
        screens: [...document.querySelectorAll('#screens > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.screen || e.id || e.className).slice(0, 6),
      })).catch(() => 'evaluate-failed');
      console.log('[stress] flight wait stuck at:', JSON.stringify(stuck));
      throw err;
    }
    await waitForButton(page, 'Launch round 1', 240000);
    await clickButton(page, 'Launch round 1');
    await page.waitForFunction(() => window.SF.state.run && window.SF.state.run.phase === 'active', null, { timeout: 120000, polling: 100 });
    await page.waitForTimeout(3000); // settle: wave-1 spawns and first-second hitches are draft cost, not crowd cost
    await page.evaluate(() => window.__gpuReset());
    console.log(`[stress] round 1 active; measuring ${DURATION_S} s unobserved`);
    const w1Start = Date.now();
    await page.waitForTimeout(DURATION_S * 1000);
    const g1 = await page.evaluate(() => ({ gpu: window.__gpu, frames: window.__frames.slice(), longTasks: window.__longTasks.slice(), laneDiag: window.__laneDiag.slice() }));
    report.windows.round1 = windowReport(g1.gpu, g1.frames, g1.longTasks, w1Start - 60000, g1.laneDiag);
    const ents1 = await page.evaluate(() => window.SF.state.entityList.length);
    report.windows.round1.entityCount = ents1;
    console.log(`[stress] round1: p50 ${report.windows.round1.frameDtMs.p50} ms  p99 ${report.windows.round1.frameDtMs.p99} ms  ents ${ents1}`);

    // ── force the wave-15 crowd ────────────────────────────────────────────
    // run.wave := WAVE-1, release live hostiles to the lifetime sweep, emit the
    // wave-clear receipt the wave owner would emit, then click through the draft.
    console.log(`[stress] forcing wave ${WAVE}…`);
    await page.evaluate(async ({ wave, lane }) => {
      if (lane === 'worker') {
        // The run state is a mirror — the jump must happen sim-side via the lane RPC.
        const res = await window.SF.laneRpc('swarmCall', { method: 'jumpToWave', wave });
        window.__swarmJumpResult = res;
        return;
      }
      const st = window.SF.state;
      const run = st.run;
      if (!run) return;
      run.wave = wave - 1;
      for (const e of st.entities.values()) {
        if (e && e.alive !== false && e.type === 'ship' && e.id !== st.playerId
          && e.data && e.data.combat && e.data.combat.hostile !== false) e.alive = false;
      }
      window.SF.bus.emit('run:waveCleared', { wave: wave - 1 });
    }, { wave: WAVE, lane: SIM_LANE });
    // The run goes cleanup -> draft -> wave_intro -> active. Click whatever verb the draft shows.
    const deadline = Date.now() + 120000;
    let onWave = null;
    while (Date.now() < deadline) {
      const info = await page.evaluate(() => ({ phase: window.SF.state.run && window.SF.state.run.phase, wave: window.SF.state.run && window.SF.state.run.wave }));
      if (info.phase === 'active' && info.wave === WAVE) { onWave = info; break; }
      // A null offerId is the draft's own legal skip — the run moves on either way
      // (survivalDraft.resolvePick). Emitting it while no draft is open is a no-op.
      await page.evaluate(() => window.SF.bus.emit('run:draftPickRequested', { offerId: null }));
      for (const verb of ['Launch', 'Fight', 'Deploy', 'Skip', 'Continue', 'Done', 'Start']) {
        if (await clickButton(page, verb)) break;
      }
      await page.waitForTimeout(700);
    }
    if (!onWave) console.log(`[stress] WARN wave ${WAVE} never went active — saving round-1 only (run=${JSON.stringify(await page.evaluate(() => window.SF.state.run && { phase: window.SF.state.run.phase, wave: window.SF.state.run.wave }))})`);
    else {
    await page.waitForTimeout(3000); // same settle as round 1
    await page.evaluate(() => window.__gpuReset());
    console.log(`[stress] wave ${WAVE} active; measuring ${DURATION_S} s unobserved`);
    const w2Start = Date.now();
    await page.waitForTimeout(DURATION_S * 1000);
    const g2 = await page.evaluate(() => ({ gpu: window.__gpu, frames: window.__frames.slice(), longTasks: window.__longTasks.slice(), laneDiag: window.__laneDiag.slice() }));
    report.windows[`wave${WAVE}`] = windowReport(g2.gpu, g2.frames, g2.longTasks, w2Start - 60000, g2.laneDiag);
    const ents2 = await page.evaluate(() => window.SF.state.entityList.length);
    report.windows[`wave${WAVE}`].entityCount = ents2;
    console.log(`[stress] wave${WAVE}: p50 ${report.windows[`wave${WAVE}`].frameDtMs.p50} ms  p99 ${report.windows[`wave${WAVE}`].frameDtMs.p99} ms  ents ${ents2}`);
    }

    report.hostBusy = { cpus: cpus().length, note: 'contended box; host busy reported, never a reason to skip' };
    mkdirSync('.devshots/stress', { recursive: true });
    const file = `.devshots/stress/crucible-${stamp}.json`;
    writeFileSync(file, JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 2));
    console.log(`[stress] wrote ${file}`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
}
main().catch((err) => { console.error('[stress] FAILED:', (err && err.stack) || err); process.exit(1); });
