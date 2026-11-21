#!/usr/bin/env node
// SOAK — long-session stability harness. Boots the REAL game in a real Chromium browser through
// the ordinary player route (the same bench server + player-truth routes as
// scripts/capture-opening.mjs), then plays with trusted keyboard/mouse input only — never a
// hidden state write. Every minute it records a JSONL row of memory / DOM / WebGL / entity /
// frame-time counters; at exit it prints a compact start/mid/final summary and a verdict.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/soak.mjs --mode=adventure [--minutes=120]
//   node scripts/fleet/game-lock.mjs run -- node scripts/soak.mjs --mode=swarm     [--minutes=120]
//
// Options:
//   --mode=adventure|swarm   which door to take from the title (default adventure)
//   --minutes=N              play budget, counted from first flight entry (default 120)
//   --out=<path>             JSONL report path (default .devshots/soak/<mode>-<timestamp>.jsonl)
//   --headed                 show the browser window (default headless)
//   --seed=<n>               world seed: Adventure new-game field; Swarm only on the door route
//   --swarm-route=quick|door quick = title Swarm door launches round 1 (default, same as
//                            capture-opening's ordinary route); door = Customize Swarm ->
//                            ship -> armory -> launch. Both drive gameplay by real input;
//                            the ordinary route proved reliable so no dev query-param route
//                            is used.
//
// Fail (exit 1) on: page crash / browser disconnect, any pageerror, no rAF frame for 10 s
// (hang), a page call that stays unanswered >20 s (main thread unresponsive), or unbounded
// growth. Growth verdicts are described below next to GROWTH.
//
// Reused internals (imported, not copied): startBenchServer (scripts/lib/benchServer.mjs —
// serves the repo exactly like server.js with a disposable player store, so saves exercise
// the real path without touching the owner's saves), launchChromium /
// keepHeadedWindowNormal / installSessionSignalGuard (player-truth/browser.mjs),
// bootToMenu / adventureToFlight / crucibleToArmory / waitForPreparationLaunch /
// armoryLaunchWord / clickText / waitBootOverlayGone / waitUntilFlight /
// readLaunchedRunSeed / T (player-truth/routes.mjs), fightBeat / cruiseBeat / noteKey
// (player-truth/driver.mjs), awaitRoundHandoff (player-truth/run.mjs — clicks the armory's
// "Launch round N" through the DOM). The small readers (nearest entity, nav bearing,
// station range) are copied from capture-opening.mjs because that script does not export
// them; they are observer-only reads of window.SF.
//
// Metric sources: performance.memory.usedJSHeapSize + CDP Performance.getMetrics
// (JSHeapUsedSize, Nodes, JSEventListeners, Documents, LayoutCount, RecalcStyleCount),
// window.__THREE_GAME_DIAGNOSTICS__.getReport() (renderer.info memory: geometries /
// textures / programs, plus frameMs p95 and draw calls — src/render/diagnostics.js),
// window.SF.state.entityList grouped by type, window.SF.simLaneDiag() (worker step ms,
// reply age, freeze flag — worker lane only, null on a main-thread sim),
// window.__SF_WITNESS__.snapshot() (the game's own 1 Hz recorder: callback/sim/render/ui ms,
// executedFrames, contextLost), and an init-script rAF counter on window.__soak for hang
// detection independent of the game's own counters.

import { mkdirSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { launchChromium, keepHeadedWindowNormal, installSessionSignalGuard } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, adventureToFlight, crucibleToArmory, waitForPreparationLaunch,
  armoryLaunchWord, clickText, waitBootOverlayGone, waitUntilFlight, readLaunchedRunSeed, T } from './player-truth/routes.mjs';
import { fightBeat, cruiseBeat, noteKey } from './player-truth/driver.mjs';
import { awaitRoundHandoff } from './player-truth/run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- args ----------
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const MODE = String(argv.mode || 'adventure');
if (!['adventure', 'swarm'].includes(MODE)) throw new Error('--mode must be adventure or swarm');
const MINUTES = Number(argv.minutes ?? 120);
if (!(MINUTES > 0)) throw new Error('--minutes must be > 0');
const HEADED = argv.headed === true || argv.headed === 'true' || argv.headed === '1';
const SEED = argv.seed != null ? Number(argv.seed) : 4242;
const SWARM_ROUTE = String(argv['swarm-route'] || 'quick');
if (!['quick', 'door'].includes(SWARM_ROUTE)) throw new Error('--swarm-route must be quick or door');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.resolve(String(argv.out || path.join('.devshots', 'soak', `${MODE}-${STAMP}.jsonl`)));
mkdirSync(path.dirname(OUT), { recursive: true });
const JSONL = createWriteStream(OUT, { flags: 'a' });

const SAMPLE_MS = 60_000;          // one JSONL sample row per minute
const RAF_HANG_MS = 10_000;        // no rAF frame for this long = hang (requirement 6)
const PAGE_CALL_TIMEOUT_MS = 20_000; // a page evaluate/wait that never answers = unresponsive page

// Growth ceilings (requirement 7). Baseline = mean of the first 3 samples.
// - >= SLOPE_MIN_SAMPLES (70 one-minute rows): least-squares slope over the LAST 60 rows.
//   Unbounded growth = slope's ~95% CI excludes zero AND slope exceeds the per-minute ceiling.
//   A significant slope under the ceiling is logged as a "watch" note, not a failure.
// - < 70 rows (e.g. a 1-minute smoke): per-minute rate vs baseline must stay under the same
//   ceilings. Needs >= 4 rows and >= 1.5 min of elapsed span, else the verdict is
//   "insufficient data" (passes).
const GROWTH = {
  slopeMinSamples: 70,
  slopeWindow: 60,
  baselineSamples: 3,
  minRows: 4,
  minElapsedMin: 1.5,
  heapMBPerMin: 3,        // sustained JS heap growth beyond 3 MB/min is a leak
  relPerMin: 0.02,        // DOM nodes / geometries / textures: >2%/min of baseline
  entitiesPerMin: 30,     // entities: whichever is larger — +30/min absolute
  entitiesRelPerMin: 0.05,// ...or +5%/min of baseline (waves legitimately add/remove bodies)
};

// ---------- run state ----------
let page = null;
let browser = null;
let server = null;
let cdp = null;
let cdpFailed = false;
let stopWindowTimer = null;
let fatal = null;              // { reason, at } — first fatal observation wins
let navT0 = null;              // wall clock at navigation (report timeline)
let playT0 = null;             // wall clock at first flight entry (the --minutes budget)
let jsonl = JSONL;
JSONL.write(`${JSON.stringify({ t: 'meta', at: new Date().toISOString(), mode: MODE, minutes: MINUTES, seed: SEED, swarmRoute: SWARM_ROUTE, headed: HEADED, node: process.version })}\n`);
let restarts = 0;              // run/session restarts (swarm re-runs, adventure recoveries)
const samples = [];            // per-minute rows (in-memory copy of the JSONL sample rows)
const consoleErrors = new Map();   // normalized text -> { text, count, at }
const consoleWarnings = new Map();
const activityLog = [];        // tail of activity outcomes for the summary

const relOut = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const wallMs = () => (playT0 ? Date.now() - playT0 : 0);

function writeRow(row) {
  try { jsonl?.write(`${JSON.stringify(row)}\n`); } catch { /* report is best-effort */ }
}
const event = (name, detail = '') => {
  writeRow({ t: 'event', at: new Date().toISOString(), wallMs: wallMs(), name, detail: String(detail).slice(0, 300) });
  console.log(`[soak] ${name}${detail ? ` — ${detail}` : ''}`);
};

function collectConsole(map, text) {
  const key = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!key) return;
  const hit = map.get(key);
  if (hit) { hit.count += 1; return; }
  const row = { t: 'console', at: new Date().toISOString(), wallMs: wallMs(), level: map === consoleErrors ? 'error' : 'warning', text: key.slice(0, 400), count: 1 };
  writeRow(row);
  map.set(key, { text: key, count: 1, at: wallMs() });
}

// ---------- bounded page calls ----------
// A hung page never resolves evaluate/waitForFunction/click calls — race every call that can
// block on the renderer so a dead main thread reads as `hang` instead of freezing the harness.
async function bounded(promise, ms = PAGE_CALL_TIMEOUT_MS, label = 'page call') {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not answer within ${Math.round(ms / 1000)}s (page unresponsive)`)), ms);
  });
  const tracked = Promise.resolve(promise);
  tracked.catch(() => {}); // a timed-out call may still settle later — swallow its late result
  try { return await Promise.race([tracked, timeout]); }
  finally { clearTimeout(timer); }
}
const evalPage = (fn, arg = undefined, ms = PAGE_CALL_TIMEOUT_MS) =>
  bounded(arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg), ms, 'page.evaluate');
const waitFn = (fn, arg = null, ms = 15000) =>
  bounded(page.waitForFunction(fn, arg, { timeout: ms }), ms + 5000, 'page.waitForFunction');

// ---------- page instrumentation: a rAF liveness counter independent of the game ----------
const INIT_SCRIPT = `(() => {
  const s = window.__soak = { raf: 0, lastRaf: 0, maxGap: 0, gapEma: 0, bigGaps: 0, installedAt: performance.now() };
  const loop = (t) => {
    s.raf++;
    if (s.lastRaf) {
      const gap = t - s.lastRaf;
      if (gap > s.maxGap) s.maxGap = gap;
      if (gap > 10000) s.bigGaps++;
      s.gapEma = s.gapEma ? s.gapEma + (gap - s.gapEma) * 0.05 : gap;
    }
    s.lastRaf = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})()`;

// ---------- one metric snapshot (all observer reads; nothing here writes state) ----------
async function sampleMetrics() {
  const row = await evalPage(() => {
    const SF = window.SF || {};
    const st = SF.state || {};
    const sm = SF.ctx && SF.ctx.screenManager;
    const mem = performance.memory || null;
    const soak = window.__soak || {};
    let diag = null;
    try { diag = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.() || null; } catch { /* optional */ }
    let witness = null;
    try { witness = window.__SF_WITNESS__?.snapshot?.() || null; } catch { /* optional */ }
    let lane = null;
    try { lane = typeof SF.simLaneDiag === 'function' ? SF.simLaneDiag() : null; } catch { /* optional */ }
    const kinds = {};
    let total = 0;
    for (const e of st.entityList || []) {
      if (!e) continue;
      total++;
      const k = e.type || '?';
      kinds[k] = (kinds[k] || 0) + 1;
    }
    const me = st.entities?.get?.(st.playerId) || (st.entityList || []).find((e) => e.id === st.playerId);
    const w = lane?.workerLastReplyWork || null;
    // renderer.info fallback when the diagnostics hook is not installed yet.
    const ri = st.render?.renderer?.info || null;
    return {
      heapBytes: mem && Number.isFinite(mem.usedJSHeapSize) ? mem.usedJSHeapSize : null,
      heapTotalBytes: mem && Number.isFinite(mem.totalJSHeapSize) ? mem.totalJSHeapSize : null,
      domNodes: document.getElementsByTagName('*').length,
      mode: st.mode || null,
      top: sm?.top?.() ?? null,
      docked: !!st.ui?.docked,
      run: st.run ? { phase: st.run.phase ?? null, wave: st.run.wave ?? null } : null,
      simTime: st.simTime ?? null,
      tick: st.tick ?? null,
      playerAlive: me ? me.alive !== false : null,
      entitiesTotal: total,
      kinds,
      gl: diag ? {
        geometries: diag.memory?.geometries ?? null,
        textures: diag.memory?.textures ?? null,
        programs: diag.memory?.programs ?? null,
        drawCalls: diag.render?.calls ?? null,
        triangles: diag.render?.triangles ?? null,
        frameMs: diag.frameMs || null,
        fps: diag.fps ?? null,
        fpsEma: diag.fpsEma ?? null,
        counts: diag.counts || null,
      } : (ri ? {
        geometries: ri.memory?.geometries ?? null,
        textures: ri.memory?.textures ?? null,
        programs: Array.isArray(ri.programs) ? ri.programs.length : null,
        drawCalls: ri.render?.calls ?? null,
        triangles: ri.render?.triangles ?? null,
      } : null),
      witness: witness ? {
        callbackMs: witness.callbackMs ?? null,
        callbackIntervalMs: witness.callbackIntervalMs ?? null,
        simMs: witness.simMs ?? null,
        renderMs: witness.renderMs ?? null,
        uiMs: witness.uiMs ?? null,
        drawCalls: witness.drawCalls ?? null,
        executedFrames: witness.executedFrames ?? null,
        contextLost: witness.contextLost === true,
        hitch: witness.hitch === true,
      } : null,
      workerStepMs: w ? (w.stepsMs ?? w.workMs ?? null) : null,
      replyAgeMs: lane?.msSinceLastAppliedReply ?? null,
      freezeLane: lane?.freezeActive === true,
      simLane: lane ? 'worker' : 'main',
      raf: {
        count: soak.raf ?? null,
        lastAt: soak.lastRaf ?? null,
        maxGap: soak.maxGap ?? null,
        gapEma: soak.gapEma ?? null,
        bigGaps: soak.bigGaps ?? 0,
        now: performance.now(),
      },
    };
  }, undefined, PAGE_CALL_TIMEOUT_MS);

  // CDP metrics — cheap exact counts (JS heap, live DOM nodes, JS event listeners).
  let cdpMetrics = null;
  if (cdp && !cdpFailed) {
    try {
      const { metrics } = await bounded(cdp.send('Performance.getMetrics'), 8000, 'CDP Performance.getMetrics');
      cdpMetrics = {};
      for (const m of metrics || []) cdpMetrics[m.name] = m.value;
    } catch { cdpFailed = true; }
  }
  row.cdp = cdpMetrics ? {
    heapBytes: cdpMetrics.JSHeapUsedSize ?? null,
    nodes: cdpMetrics.Nodes ?? null,
    jsEventListeners: cdpMetrics.JSEventListeners ?? null,
    documents: cdpMetrics.Documents ?? null,
    layoutCount: cdpMetrics.LayoutCount ?? null,
    recalcStyleCount: cdpMetrics.RecalcStyleCount ?? null,
  } : null;
  return row;
}

function rowToSample(row) {
  const heap = row.heapBytes ?? row.cdp?.heapBytes ?? null;
  return {
    at: new Date().toISOString(),
    wallMs: wallMs(),
    minute: Math.round(wallMs() / 60000 * 100) / 100,
    mode: row.mode, top: row.top, phase: row.run?.phase ?? null, wave: row.run?.wave ?? null,
    docked: row.docked, playerAlive: row.playerAlive,
    heapMB: heap != null ? Math.round(heap / 1048576 * 100) / 100 : null,
    heapTotalMB: row.heapTotalBytes != null ? Math.round(row.heapTotalBytes / 1048576) : null,
    cdpHeapMB: row.cdp?.heapBytes != null ? Math.round(row.cdp.heapBytes / 1048576 * 100) / 100 : null,
    domNodes: row.domNodes ?? row.cdp?.nodes ?? null,
    jsEventListeners: row.cdp?.jsEventListeners ?? null,
    geometries: row.gl?.geometries ?? null,
    textures: row.gl?.textures ?? null,
    programs: row.gl?.programs ?? null,
    drawCalls: row.gl?.drawCalls ?? null,
    triangles: row.gl?.triangles ?? null,
    entities: row.entitiesTotal ?? row.gl?.counts?.entities ?? null,
    kinds: row.kinds || null,
    particles: row.gl?.counts?.particles ?? null,
    lights: row.gl?.counts?.lights ?? null,
    fps: row.gl?.fps != null ? Math.round(row.gl.fps * 10) / 10 : null,
    frameLastMs: row.gl?.frameMs?.last != null ? Math.round(row.gl.frameMs.last * 100) / 100 : null,
    frameP95Ms: row.gl?.frameMs?.p95 != null ? Math.round(row.gl.frameMs.p95 * 100) / 100 : null,
    rafGapEmaMs: row.raf?.gapEma != null ? Math.round(row.raf.gapEma * 100) / 100 : null,
    rafMaxGapMs: row.raf?.maxGap != null ? Math.round(row.raf.maxGap) : null,
    callbackMs: row.witness?.callbackMs ?? null,
    simMs: row.witness?.simMs ?? null,
    renderMs: row.witness?.renderMs ?? null,
    uiMs: row.witness?.uiMs ?? null,
    workerStepMs: row.workerStepMs ?? null,
    replyAgeMs: row.replyAgeMs ?? null,
    freezeLane: row.freezeLane === true,
    contextLost: row.witness?.contextLost === true,
    documents: row.cdp?.documents ?? null,
    layoutCount: row.cdp?.layoutCount ?? null,
    recalcStyleCount: row.cdp?.recalcStyleCount ?? null,
    simTime: row.simTime ?? null,
    simLane: row.simLane ?? null,
    errors: [...consoleErrors.values()].reduce((a, e) => a + e.count, 0),
    warnings: [...consoleWarnings.values()].reduce((a, e) => a + e.count, 0),
  };
}

// rAF-gap counter at play start: boot (sector cook, shader links) can legitimately block the
// main thread once or twice before play begins, so hang detection counts NEW >10 s gaps.
let bigGapsBase = null;

async function takeSample() {
  const row = await sampleMetrics();
  if (bigGapsBase == null && row.raf?.bigGaps != null) bigGapsBase = row.raf.bigGaps;
  // Hang detection (requirement 6): a >10 s rAF gap right now, or a NEW >10 s gap during play.
  const stall = row.raf?.lastAt != null && row.raf?.now != null ? row.raf.now - row.raf.lastAt : 0;
  const newBigGaps = (row.raf?.bigGaps ?? 0) - (bigGapsBase ?? 0);
  if ((stall > RAF_HANG_MS || newBigGaps > 0) && !fatal) {
    fatal = { reason: `hang: no rAF frame for ${stall > RAF_HANG_MS ? `${Math.round(stall)}ms now` : `${newBigGaps} >10s gap(s) during play`}`, at: wallMs() };
    event('fatal', fatal.reason);
  }
  if (row.witness?.contextLost && !fatal) {
    fatal = { reason: 'WebGL context lost', at: wallMs() };
    event('fatal', fatal.reason);
  }
  const sample = rowToSample(row);
  samples.push(sample);
  writeRow({ t: 'sample', ...sample });
  const heap = sample.heapMB != null ? `${sample.heapMB}MB` : '?';
  console.log(`[soak] sample ${samples.length} @${sample.minute}min heap=${heap} dom=${sample.domNodes ?? '?'} geo=${sample.geometries ?? '?'}/tex=${sample.textures ?? '?'}/prog=${sample.programs ?? '?'} ent=${sample.entities ?? '?'} listeners=${sample.jsEventListeners ?? '?'} frame=${sample.frameP95Ms ?? '?'}ms worker=${sample.workerStepMs ?? 'n/a'}ms top=${sample.top ?? '-'} ph=${sample.phase ?? '-'}`);
  return sample;
}

// ---------- unbounded-growth analysis ----------
function metricValue(s, key) { const v = s[key]; return Number.isFinite(v) ? v : null; }
function baselineFor(key) {
  const vals = samples.slice(0, GROWTH.baselineSamples).map((s) => metricValue(s, key)).filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function slopeFit(vals) {
  // least squares over x = 0..n-1 (one x per minute of the window)
  const n = vals.length;
  const xs = vals.map((_, i) => i);
  const xm = xs.reduce((a, b) => a + b, 0) / n;
  const ym = vals.reduce((a, b) => a + b, 0) / n;
  let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - xm) ** 2; sxy += (xs[i] - xm) * (vals[i] - ym); }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = ym - slope * xm;
  let sse = 0;
  for (let i = 0; i < n; i++) { const r = vals[i] - (intercept + slope * xs[i]); sse += r * r; }
  const se = n > 2 && sxx ? Math.sqrt(sse / (n - 2) / sxx) : 0;
  return { slope, se };
}
// ~95% CI half-width: t*se with t≈2.0 (n=60 → t97.5≈2.00; conservative for n>=30)
const ciExcludesZero = ({ slope, se }) => se > 0 && Math.abs(slope) > 2.0 * se;

function growthVerdict(key, { ceilingAbs = null, ceilingRel = null } = {}) {
  const vals = samples.map((s) => metricValue(s, key)).filter((v) => v != null);
  const base = baselineFor(key);
  const last = vals.length ? vals[vals.length - 1] : null;
  const out = { key, first: base, mid: vals.length ? vals[Math.floor(vals.length / 2)] : null, last, verdict: 'insufficient data', detail: '' };
  if (vals.length < GROWTH.minRows || base == null) return out;
  const ceiling = (v) => Math.max(
    ceilingAbs != null ? ceilingAbs : -Infinity,
    ceilingRel != null && base != null ? base * ceilingRel : -Infinity,
  );
  const spanMin = (samples[samples.length - 1].wallMs - samples[0].wallMs) / 60000;
  if (samples.length >= GROWTH.slopeMinSamples) {
    const win = vals.slice(-GROWTH.slopeWindow);
    const fit = slopeFit(win);
    const significant = ciExcludesZero(fit);
    const cap = ceiling(last ?? base);
    out.detail = `slope ${fit.slope >= 0 ? '+' : ''}${fit.slope.toFixed(3)}/min over last ${win.length} samples (se ${fit.se.toFixed(3)}, cap ${cap.toFixed(2)}/min)`;
    if (significant && fit.slope > cap) { out.verdict = 'FAIL'; out.detail = `unbounded growth: ${out.detail}`; }
    else if (significant && fit.slope > 0) { out.verdict = 'ok (watch)'; out.detail = `significant but under ceiling: ${out.detail}`; }
    else out.verdict = 'ok';
    return out;
  }
  if (spanMin < GROWTH.minElapsedMin) return out;
  const rate = ((last ?? base) - base) / spanMin;
  const cap = ceiling(last ?? base);
  out.detail = `rate ${rate >= 0 ? '+' : ''}${rate.toFixed(3)}/min vs baseline ${base.toFixed(1)} (cap ${cap.toFixed(2)}/min, ${samples.length} samples — short-run ceiling rule)`;
  out.verdict = rate > cap ? 'FAIL' : 'ok';
  if (rate > cap) out.detail = `unbounded growth: ${out.detail}`;
  return out;
}

function allVerdicts() {
  return [
    growthVerdict('heapMB', { ceilingAbs: GROWTH.heapMBPerMin }),
    growthVerdict('domNodes', { ceilingRel: GROWTH.relPerMin }),
    growthVerdict('geometries', { ceilingRel: GROWTH.relPerMin }),
    growthVerdict('textures', { ceilingRel: GROWTH.relPerMin }),
    growthVerdict('entities', { ceilingAbs: GROWTH.entitiesPerMin, ceilingRel: GROWTH.entitiesRelPerMin }),
    growthVerdict('jsEventListeners', { ceilingRel: GROWTH.relPerMin }),
  ];
}

// ---------- shared observers (copied small pieces from capture-opening.mjs — it does not export) ----------
const readFlight = () => evalPage(() => {
  const st = window.SF?.state;
  const me = st?.entities?.get?.(st?.playerId) || st?.entityList?.find((e) => e.id === st?.playerId);
  return {
    mode: st?.mode, top: window.SF?.ctx?.screenManager?.top?.() ?? null,
    docked: !!st?.ui?.docked, dockInRange: !!st?.ui?.dockInRange,
    speed: me?.vel ? Math.hypot(me.vel.x || 0, me.vel.z || 0) : 0,
    alive: me ? me.alive !== false : false,
    savedAt: st?.meta?.lastSavedAt ?? null,
    phase: st?.run?.phase ?? null, wave: st?.run?.wave ?? null,
  };
}).catch(() => null);

const nearestEntity = (types) => evalPage((want) => {
  const st = window.SF?.state;
  const me = st?.entities?.get?.(st.playerId) || st?.entityList?.find((e) => e.id === st.playerId);
  if (!st || !me?.pos) return null;
  let best = null; let bd = Infinity;
  for (const e of st.entityList || []) {
    if (!e || e.id === me.id || e.alive === false || !e.pos) continue;
    if (!want.includes(e.type)) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return null;
  let rel = Math.atan2(best.pos.z - me.pos.z, best.pos.x - me.pos.x) - me.rot;
  while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  const scr = window.SF.ctx?.helpers?.worldToScreen?.(best.pos) || null;
  return { id: best.id, type: best.type, d: bd, rel, screen: scr };
}, types).catch(() => null);

const readHostile = (within = 900) => evalPage((limit) => {
  const st = window.SF?.state;
  const me = st?.entities?.get?.(st.playerId);
  if (!st || !me?.pos) return null;
  let best = null; let bd = limit;
  for (const e of st.entityList || []) {
    if (!e || e.alive === false || e.id === me.id || !e.pos) continue;
    if (e.type !== 'ship' && e.type !== 'drone') continue;
    const d = e.data || {};
    const hostile = d.runRole === 'enemy' || d.runRole === 'hostile'
      || !!(d.ai && (d.ai.huntPlayer || d.ai.forcePlayerTarget))
      || (e.team !== me.team && e.team !== 0 && e.team !== 2);
    if (!hostile) continue;
    const dist = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (dist < bd) { bd = dist; best = { id: e.id, d: dist }; }
  }
  return best;
}, within).catch(() => null);

const readNav = () => evalPage(async () => {
  const st = window.SF?.state;
  const me = st?.entities?.get(st.playerId) || st?.entityList?.find((e) => e.id === st.playerId);
  if (!st || !me?.pos) return null;
  const { resolveWaypointPresentationPosition } = await import('/src/ui/navigationWaypoint.js');
  const w = st.nav?.waypoint;
  const pos = w ? resolveWaypointPresentationPosition(st, w) : null;
  const dx = pos ? pos.x - me.pos.x : 0; const dz = pos ? pos.z - me.pos.z : 0;
  let rel = pos ? Math.atan2(dz, dx) - me.rot : 0;
  while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  return { label: w?.label || null, d: pos ? Math.hypot(dx, dz) : null, rel, pos };
}).catch(() => null);

// Standard scheme (default since R17): the nose follows the mouse, so steer by putting the
// cursor out ahead toward the bearing; A/D keys are the Pilot/Classic fallback.
async function turnToward(rel) {
  const aimPoint = await evalPage((r) => {
    const st = window.SF?.ctx?.state;
    if ((st?.settings?.gameplay?.controlScheme || 'helm-assist') !== 'helm-assist') return null;
    const me = st?.entities?.get?.(st.playerId);
    if (!me?.pos) return null;
    const a = (me.rot || 0) + r;
    const p = window.SF.ctx?.helpers?.worldToScreen?.({ x: me.pos.x + Math.cos(a) * 260, y: 0, z: me.pos.z + Math.sin(a) * 260 });
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  }, rel).catch(() => null);
  if (aimPoint) { await page.mouse.move(Math.round(aimPoint.x), Math.round(aimPoint.y), { steps: 2 }); return; }
  if (!(Math.abs(rel) > 0.12)) return;
  const code = rel > 0 ? 'KeyD' : 'KeyA';
  noteKey(page, code);
  await page.keyboard.press(code, { delay: Math.min(90, Math.abs(rel) / 4.5 * 1000) }).catch(() => {});
}

async function releaseKeys() {
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyG', 'KeyX', 'KeyQ', 'Space', 'ShiftLeft']) {
    await page.keyboard.up(k).catch(() => {});
  }
  await page.mouse.up().catch(() => {});
  await page.mouse.up({ button: 'right' }).catch(() => {});
}

// A stray modal must not poison the next activity — a player Escapes back to flight.
async function ensureFlightHud() {
  const f = await readFlight();
  if (f && f.mode !== 'flight') return;
  if (f && !f.docked && f.top && f.top !== 'hud') {
    noteKey(page, 'Escape');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(700);
  }
}

async function clickFirstVisible(selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => false)) {
      const text = await el.textContent().catch(() => '');
      await bounded(el.click(), 8000, `click ${sel}`).catch(() => {});
      return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    }
  }
  return null;
}

async function clickButtonMatching(re, scope = '#screens') {
  const word = await evalPage(([rootSel, src]) => {
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll(`${rootSel} button`)].find((x) => x.offsetParent && !x.disabled && rx.test(n(x.textContent)));
    return b ? n(b.textContent).slice(0, 80) : null;
  }, [scope, re.source]).catch(() => null);
  if (!word) return null;
  const loc = page.locator(`${scope} button:visible`).filter({ hasText: word.slice(0, 40) }).first();
  const ok = await bounded(loc.click(), 8000, `click "${word}"`).then(() => true, () => false);
  return ok ? word : null;
}

// Every activity runs through here: a transient failure is a skipped beat, never fatal.
async function attempt(name, fn, { budgetMs = 30000 } = {}) {
  try {
    const detail = await bounded(Promise.resolve().then(fn), Math.max(budgetMs, PAGE_CALL_TIMEOUT_MS + 5000), `activity ${name}`) ?? '';
    const rec = { name, ok: true, detail: String(detail).slice(0, 160) };
    activityLog.push(rec);
    writeRow({ t: 'activity', at: new Date().toISOString(), wallMs: wallMs(), ...rec });
    return rec;
  } catch (error) {
    const rec = { name, ok: false, detail: String(error?.message || error).slice(0, 200) };
    activityLog.push(rec);
    writeRow({ t: 'activity', at: new Date().toISOString(), wallMs: wallMs(), ...rec });
    await releaseKeys();
    await ensureFlightHud().catch(() => {});
    return rec;
  }
}

// ---------- adventure activities ----------
async function actFly(deadline) {
  let beats = 0;
  for (let i = 0; i < 4 && !deadlineHit(deadline); i++) { await cruiseBeat(page, i); beats++; }
  return `flew ${beats} beats (thrust + turns)`;
}

async function actFight(deadline) {
  let beats = 0;
  for (let i = 0; i < 5 && !deadlineHit(deadline); i++) {
    const f = await readFlight();
    if (!f || f.mode !== 'flight' || f.alive === false) break;
    if (!(await readHostile(1200))) { if (beats === 0) return 'no hostile within 1200m — skipped'; break; }
    await fightBeat(page, i);
    beats++;
  }
  return `fought ${beats} beats`;
}

async function actPowers(deadline) {
  const rock = await nearestEntity(['asteroid', 'wreck', 'ship', 'drone']);
  if (rock?.screen?.onScreen === true && !rock.screen.behind) {
    await page.mouse.move(Math.round(rock.screen.x), Math.round(rock.screen.y), { steps: 2 });
  }
  const pressed = [];
  for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
    if (deadlineHit(deadline)) break;
    noteKey(page, code);
    await page.keyboard.press(code).catch(() => {});
    pressed.push(code.slice(-1));
    await page.waitForTimeout(700);
  }
  return `pressed powers ${pressed.join(',')}${rock ? ` at ${rock.type} ${Math.round(rock.d)}m` : ' with nothing on canvas'}`;
}

async function actLine(deadline) {
  const code = await evalPage(async () => {
    const { resolveActionCodes } = await import('/src/systems/input.js');
    const codes = resolveActionCodes(window.SF.state, 'tether') || [];
    return codes.find((c) => !/^mouse/i.test(c)) || codes[0] || 'Space';
  }).catch(() => 'Space');
  const rock = await nearestEntity(['asteroid', 'wreck']);
  if (!rock || !rock.screen || rock.screen.onScreen !== true || rock.screen.behind) return 'no rock on canvas to latch — skipped';
  const cx = Math.round(rock.screen.x); const cy = Math.round(rock.screen.y);
  await page.mouse.move(cx, cy, { steps: 2 });
  await page.mouse.click(cx, cy, { button: 'right' });
  await page.waitForTimeout(1200);
  // Throw: hold the Line, fling, release — the same gesture the opening capture makes.
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(250);
  await page.mouse.move(cx + 240, cy - 70, { steps: 8 });
  await page.waitForTimeout(300);
  await page.mouse.up({ button: 'right' });
  noteKey(page, code);
  await page.keyboard.press(code).catch(() => {});
  return `latched/threw at ${rock.type} ${Math.round(rock.d)}m (RMB/${code})`;
}

async function actMine(deadline) {
  const rock = await nearestEntity(['asteroid']);
  if (!rock || rock.d > 400) return 'no asteroid within 400m — skipped';
  if (rock.screen?.onScreen === true && !rock.screen.behind) {
    await page.mouse.move(Math.round(rock.screen.x), Math.round(rock.screen.y), { steps: 2 });
    await page.mouse.click(Math.round(rock.screen.x), Math.round(rock.screen.y), { button: 'right' });
  }
  noteKey(page, 'KeyG');
  await page.keyboard.down('KeyG');
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < 8000 && !deadlineHit(deadline)) {
      const fresh = await nearestEntity(['asteroid']);
      if (fresh?.screen?.onScreen === true && !fresh.screen.behind) {
        await page.mouse.move(Math.round(fresh.screen.x), Math.round(fresh.screen.y), { steps: 1 });
      }
      await page.waitForTimeout(1500);
    }
  } finally { await page.keyboard.up('KeyG').catch(() => {}); }
  return `held the mining beam on ${rock.type} ${Math.round(rock.d)}m for 8s`;
}

// Dock, walk the hub, undock. Simplified from capture-opening's stepDock/stepStation/stepUndock:
// near a dockable station a plain E press calls the autopilot that flies corridor + berth, then
// a second E inside the prompt range docks. Every stage has a budget; failure just skips.
async function actDock(deadline) {
  const budgetEnd = Math.min(deadline, Date.now() + 90000);
  const readStation = () => evalPage(() => {
    const st = window.SF?.state;
    const me = st?.entities?.get?.(st?.playerId);
    if (!st || !me?.pos) return null;
    let best = null; let bd = Infinity;
    for (const e of st.entityList || []) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const data = e.data || {};
      if (data.isGate || !data.stationId) continue;
      const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    let rel = Math.atan2(best.pos.z - me.pos.z, best.pos.x - me.pos.x) - (me.rot ?? 0);
    while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
    const speed = me.vel ? Math.hypot(me.vel.x || 0, me.vel.z || 0) : 0;
    return { d: bd, rel, speed, inRange: !!st.ui?.dockInRange, docked: !!st.ui?.docked,
      name: best.data?.name || best.data?.stationName || best.data?.stationId || 'station' };
  }).catch(() => null);

  let s = await readStation();
  if (!s || s.d > 6000) return `no dockable station within 6km — skipped`;
  let askedAutopilot = false;
  const held = new Set();
  const hold = async (code, want) => {
    if (want && !held.has(code)) { noteKey(page, code); await page.keyboard.down(code).catch(() => {}); held.add(code); }
    else if (!want && held.has(code)) { await page.keyboard.up(code).catch(() => {}); held.delete(code); }
  };
  try {
    while (Date.now() < budgetEnd) {
      s = await readStation();
      if (!s) break;
      if (s.docked || s.inRange) break;
      if (!askedAutopilot) {
        askedAutopilot = true;
        noteKey(page, 'KeyE');
        await page.keyboard.press('KeyE').catch(() => {});   // dock autopilot does the corridor
        await page.waitForTimeout(1200);
        continue;
      }
      if (Number.isFinite(s.rel) && Math.abs(s.rel) > 0.15) await turnToward(s.rel);
      const wantStop = s.speed > Math.max(30, s.d * 0.12) && s.d < 900;
      await hold('KeyX', wantStop);
      await hold('KeyW', !wantStop && s.speed < 200);
      await page.waitForTimeout(700);
    }
    s = await readStation();
    if (!s?.inRange && !s?.docked) return `never reached dock range at ${s?.name || 'station'} (${s ? `${Math.round(s.d)}m v${s.speed.toFixed(0)}` : 'lost'}) — skipped`;
    if (!s.docked) {
      noteKey(page, 'KeyE');
      await page.keyboard.press('KeyE');
      const docked = await waitFn(() => !!window.SF?.state?.ui?.docked
        || window.SF?.ctx?.screenManager?.top?.() === 'station', null, 8000).then(() => true, () => false);
      if (!docked) return 'dock prompt lived but the station screen never opened — skipped';
    }
  } finally { await releaseKeys(); }
  // Inside: walk a few hub doors like a trader.
  const visited = [];
  for (const door of ['market', 'shipworks', 'contracts', 'bar']) {
    if (deadlineHit(deadline)) break;
    const tile = page.locator(`[data-nav="${door}"]`).first();
    if (!(await tile.isVisible().catch(() => false))) continue;
    await bounded(tile.click(), 8000, `station door ${door}`).catch(() => {});
    await page.waitForTimeout(900);
    visited.push(door);
  }
  // One cheap trade attempt: Market → sell view → a row → the Sell commit (all optional).
  await page.locator('[data-nav="market"]').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await clickFirstVisible(['#screens [data-mode="sell"]', '#screens button:has-text("Sell")']);
  await clickFirstVisible(['#screens .sx-mkt-row:not(.is-empty)', '#screens [data-cmdty]', '#screens .sx-row']);
  const sold = await clickFirstVisible(['#screens .sx-trade__go--sell', '#screens button:has-text("Sell")']);
  // Undock: Esc asks for departure → the check pop's primary button leaves.
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1200);
  const launched = page.locator('[data-pop-launch]').first();
  if (await launched.isVisible().catch(() => false)) await bounded(launched.click(), 8000, 'departure launch').catch(() => {});
  else await clickFirstVisible(['[data-act="undock"]', '#screens button:has-text("Undock")', '#screens button:has-text("Launch")']);
  const out = await waitFn(() => window.SF?.state?.mode === 'flight' && !window.SF?.state?.ui?.docked,
    null, 20000).then(() => true, () => false);
  if (!out) throw new Error('undock control clicked but never left the station');
  return `docked at ${s?.name || 'station'} · doors [${visited.join(',') || 'none'}]${sold ? ` · sold ("${sold}")` : ''} · undocked`;
}

async function actMap() {
  noteKey(page, 'KeyM');
  await page.keyboard.press('KeyM');
  const open = await waitFn(() => {
    const t = window.SF?.ctx?.screenManager?.top?.();
    return t === 'galaxyMap' || t === 'localmap' || t === 'starmap';
  }, null, 8000).then(() => true, () => false);
  if (!open) { await page.keyboard.press('Escape').catch(() => {}); return 'M opened no map screen — skipped'; }
  await page.waitForTimeout(1500);
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  return 'opened and closed the map (M)';
}

async function actSave() {
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  const open = await waitFn(() => window.SF?.ctx?.screenManager?.top?.() === 'pause', null, 8000).then(() => true, () => false);
  if (!open) return 'Esc opened no pause menu — skipped';
  const before = (await readFlight())?.savedAt ?? null;
  noteKey(page, 'F5');
  await page.keyboard.press('F5');
  const saved = await waitFn((was) => {
    const at = window.SF?.state?.meta?.lastSavedAt;
    return at != null && at !== was;
  }, before, 10000).then(() => true, () => false);
  noteKey(page, 'Escape');
  await page.keyboard.press('Escape');
  return saved ? 'paused, quick-saved (F5), resumed' : 'paused; F5 wrote no save this pass';
}

async function actObjective(deadline) {
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < 15000 && !deadlineHit(deadline)) {
      const nav = await readNav();
      if (nav?.d != null && nav.d < 250) return `reached the objective "${nav.label || 'marker'}"`;
      if (nav && Number.isFinite(nav.rel) && Math.abs(nav.rel) > 0.12) await turnToward(nav.rel);
      await page.waitForTimeout(700);
    }
  } finally { await page.keyboard.up('KeyW').catch(() => {}); }
  return 'flew toward the objective for 15s';
}

// Death / ejection recovery: gameOver offers "New Game" (fresh run in place) and
// "Main Menu / Load". New Game is the fastest honest route back to flight; if it
// is not offered, leave through the menu and take the ordinary New Game door.
async function recoverAdventure(deadline) {
  restarts++;
  event('recover', 'player dead or out of flight — restarting');
  // The gameOver sheet isn't the only death exit: a relaunch can land on the
  // startup-failure pane, whose "Retry" re-runs the same launch.
  const clicked = await clickButtonMatching(/^retry$/i, '[data-startup-failure]')
    || await clickButtonMatching(/^new game$/i)
    || await clickButtonMatching(/main menu|return to title/i);
  if (!clicked) { await page.keyboard.press('Escape').catch(() => {}); return 'no recovery control'; }
  // Wait for the death sheet to resolve into a live ship, a mode transition, or the title.
  await waitFn(() => {
    const st = window.SF?.state;
    const top = window.SF?.ctx?.screenManager?.top?.();
    if (top === 'gameOver') return false;
    const menu = document.querySelector('[data-screen="mainMenu"]');
    if (menu && getComputedStyle(menu).display !== 'none') return true;
    if (st?.mode !== 'flight') return true;
    const me = st?.entityList?.find((e) => e.id === st.playerId);
    return !!(me && me.alive !== false);
  }, null, 90000).catch(() => {});
  await waitUntilFlight(page, { timeout: T(120000) }).catch(() => {});
  const f = await readFlight();
  if (f?.mode === 'flight' && f.alive !== false) return `back in flight via "${clicked}"`;
  // Landed on the title instead (the menu word was the only way out): take the
  // ordinary New Game door — the menu must be VISIBLE, it lives in the DOM always.
  const menuUp = await evalPage(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return !!(el && getComputedStyle(el).display !== 'none');
  }).catch(() => false);
  if (menuUp) {
    await adventureToFlight(page, () => {}, { seed: SEED }).catch((e) => event('recover-fail', e.message));
    return `re-entered via New Game after "${clicked}"`;
  }
  return `"${clicked}" clicked but no flight or menu followed`;
}

const ADVENTURE_PLAN = [
  ['fly', actFly], ['fight', actFight], ['objective', actObjective], ['powers', actPowers],
  ['fly', actFly], ['map', actMap], ['fight', actFight], ['mine', actMine],
  ['fly', actFly], ['dock', actDock], ['line', actLine], ['save', actSave],
];

// Record a non-action beat (waiting, dead, observing) so the JSONL shows where the time went.
function skipBeat(name, detail) {
  const rec = { name, ok: true, detail: String(detail || '').slice(0, 160) };
  writeRow({ t: 'activity', at: new Date().toISOString(), wallMs: wallMs(), ...rec });
  activityLog.push(rec);
  return rec;
}

async function adventureBeat(deadline, idx) {
  const f = await readFlight();
  if (!f) return skipBeat('observe', 'no flight read');
  if (f.top === 'gameOver' || (f.mode !== 'flight' && f.mode !== 'paused') || f.alive === false) {
    await attempt('recover', () => recoverAdventure(deadline), { budgetMs: 150000 });
    return { name: 'recover', ok: true, detail: '' };
  }
  if (f.mode !== 'flight') { await sleep(800); return skipBeat('wait', `mode ${f.mode}`); }
  const [name, fn] = ADVENTURE_PLAN[idx % ADVENTURE_PLAN.length];
  const rec = await attempt(name, () => fn(deadline), { budgetMs: name === 'dock' ? 150000 : 60000 });
  return rec;
}

// ---------- swarm ----------
const readPhase = () => evalPage(() => {
  const st = window.SF?.state;
  return st ? { sim: st.simTime, mode: st.mode, ph: st.run?.phase ?? null, w: st.run?.wave ?? null,
    top: window.SF?.ctx?.screenManager?.top?.() ?? null,
    alive: !!st.entityList?.find((e) => e.id === st.playerId && e.alive !== false) } : null;
}).catch(() => null);

// Armory shelf: first available offer card, then its own fit/buy action (capture-opening's
// takeFirstUpgrade). Between-round shop: "Fortify the field" there and back.
async function takeFirstUpgrade() {
  const card = page.locator('#screens .sf-cru-card:visible:not(.is-unavail)').first();
  if (!await card.isVisible().catch(() => false)) return null;
  const name = (await card.textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  await bounded(card.click(), 8000, 'upgrade card').catch(() => {});
  await page.waitForTimeout(500);
  const act = await clickFirstVisible([
    '#screens button:has-text("Fit")', '#screens button:has-text("Buy")',
    '#screens button:has-text("Take")', '#screens button:has-text("Install")',
  ]);
  return act ? `took upgrade "${name}"` : null;
}

async function visitSwarmShop() {
  const open = page.getByRole('button', { name: 'Fortify the field', exact: true });
  if (!await open.isVisible().catch(() => false)) return null;
  await bounded(open.click(), 8000, 'fortify shop').catch(() => {});
  await page.waitForTimeout(1200);
  const back = page.getByRole('button', { name: 'Return to armory', exact: true });
  if (await back.isVisible().catch(() => false)) await bounded(back.click(), 8000, 'return to armory').catch(() => {});
  return 'visited the between-round shop';
}

// Run ended (or won): the results plate offers "Run it again — same seed", "Back to the
// hangar" / "New run", "Main menu", and on victory "keep going" offers. Re-run through the
// public words; fall back to the title's Swarm door like the first entry.
async function restartSwarm(deadline) {
  restarts++;
  event('restart', 'run ended — starting another');
  // A relaunch can land on the startup-failure pane — its Retry re-runs the launch.
  if (await clickButtonMatching(/^retry$/i, '[data-startup-failure]')) {
    await waitUntilFlight(page, { timeout: T(120000), active: true }).catch(() => {});
    const rel = await readFlight();
    if (rel?.mode === 'flight' && rel.phase === 'active') return 'failure pane Retry relaunched the run';
  }
  const clicked = await clickButtonMatching(/run it again|retry seed|keep going|again/i)
    || await clickButtonMatching(/back to the hangar|new run|main menu/i);
  await page.waitForTimeout(2000);
  const f = await readFlight();
  if (f?.mode === 'flight' && f.phase && f.phase !== 'ended' && f.phase !== 'victory') return `re-running ("${clicked || 'auto'}")`;
  // Through the title again (menu click, or results already left us on it).
  const onMenu = await evalPage(() => {
    const el = document.querySelector('[data-screen="mainMenu"]');
    return !!(el && getComputedStyle(el).display !== 'none');
  }).catch(() => false);
  if (!onMenu && !clicked) return 'no restart control found — waiting';
  if (onMenu) {
    if (SWARM_ROUTE === 'door') {
      await crucibleToArmory(page, { ruleset: 'swarm', seed: SEED }, () => {});
      await waitForPreparationLaunch(page, {});
      const word = await armoryLaunchWord(page);
      await clickText(page, word || 'Launch round 1');
    } else {
      await page.locator('[data-screen="mainMenu"] [data-action="swarm"]').first().click({ timeout: T(60000) });
    }
  }
  await waitUntilFlight(page, { timeout: T(120000), active: true }).catch(() => {});
  await waitBootOverlayGone(page).catch(() => {});
  const now = await readPhase();
  return `restart via "${clicked || (onMenu ? 'swarm door' : 'none')}" → phase ${now?.ph || '?'}`;
}

async function swarmBeat(deadline, beat) {
  const ph = await readPhase();
  if (!ph) return skipBeat('observe', 'no phase read');
  if (ph.ph === 'ended' || ph.ph === 'victory' || ph.top === 'crucibleResults') {
    return attempt('restart', () => restartSwarm(deadline), { budgetMs: 180000 });
  }
  if (ph.top === 'pilotCards') {
    return attempt('pilot-card', async () => {
      noteKey(page, 'Digit1');
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(800);
      const still = await readPhase();
      if (still?.top === 'pilotCards') {
        await clickFirstVisible(['#screens [data-screen="pilotCards"] button', '#screens .sf-pilot-card', '#screens .k-card button']);
      }
      return 'took a pilot card (Digit1)';
    });
  }
  if (ph.ph === 'draft' || ph.ph === 'cleanup' || ph.ph === 'refit'
      || ph.top === 'crucibleDraft' || ph.top === 'crucibleRefit' || ph.top === 'crucibleFortify') {
    return attempt('between-round', async () => {
      const notes = [];
      const up = await takeFirstUpgrade(); if (up) notes.push(up);
      const shop = await visitSwarmShop(); if (shop) notes.push(shop);
      const next = await awaitRoundHandoff(page, {
        previousWave: ph.w || 0, timeoutMs: Math.min(15000, Math.max(2000, deadline - Date.now())),
      }).catch(() => null);
      if (next?.kind === 'terminal') return 'run went terminal during handoff';
      if (next?.kind === 'active') notes.push(`round ${next.wave} launched`);
      return notes.join(' · ') || 'armory open, nothing actionable this pass';
    }, { budgetMs: 60000 });
  }
  if (ph.mode === 'flight' && ph.alive === false && ph.ph === 'active') {
    await sleep(1200);
    return skipBeat('down', 'ship down — waiting for the run to settle');
  }
  if (ph.mode === 'flight' && ph.ph === 'active') {
    return attempt('fight', async () => {
      await fightBeat(page, beat);
      if (beat % 6 === 5) {
        for (const d of ['Digit1', 'Digit2', 'Digit3']) {
          noteKey(page, d); await page.keyboard.press(d).catch(() => {}); await page.waitForTimeout(500);
        }
        await page.mouse.click(800, 450, { button: 'right' }).catch(() => {});
        return 'fight beat + powers + the Line';
      }
      return 'fight beat';
    }, { budgetMs: 45000 });
  }
  // Stuck on an unexpected screen: a player would back out with Esc.
  return attempt('unstick', async () => {
    noteKey(page, 'Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    return `top=${ph.top ?? 'none'} phase=${ph.ph ?? 'none'} — Esc`;
  });
}

// ---------- main ----------
async function main() {
  installSessionSignalGuard(process);
  server = await startBenchServer({});
  const { chromium } = await loadPlaywright();
  ({ browser } = await launchChromium(chromium, {
    headless: !HEADED,
    args: ['--window-size=1680,960', '--mute-audio', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  }));
  browser.on('disconnected', () => {
    if (!fatal) fatal = { reason: 'browser disconnected', at: wallMs() };
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  if (HEADED) stopWindowTimer = await keepHeadedWindowNormal(page, { headed: true });
  page.on('crash', () => { if (!fatal) fatal = { reason: 'page crashed', at: wallMs() }; });
  page.on('close', () => { if (!fatal) fatal = { reason: 'page closed', at: wallMs() }; });
  page.on('pageerror', (e) => {
    const text = String(e?.stack || e?.message || e).slice(0, 400);
    collectConsole(consoleErrors, `pageerror: ${text}`);
    if (!fatal) { fatal = { reason: `pageerror: ${String(e?.message || e).slice(0, 200)}`, at: wallMs() }; }
    event('fatal', fatal.reason);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') collectConsole(consoleErrors, m.text());
    else if (m.type() === 'warning') collectConsole(consoleWarnings, m.text());
  });
  await page.addInitScript(INIT_SCRIPT);
  try { cdp = await context.newCDPSession(page); await cdp.send('Performance.enable'); }
  catch { cdp = null; }

  const stepLog = (name, ok, detail) => event(`route ${name}`, detail || (ok ? '' : 'failed'));
  navT0 = Date.now();
  await bootToMenu(page, server.baseUrl, stepLog);
  event('menu', `${((Date.now() - navT0) / 1000).toFixed(1)}s to main menu`);

  // Enter the mode through the ordinary player route.
  const enterMode = async () => {
    if (MODE === 'adventure') {
      const info = await adventureToFlight(page, stepLog, { seed: SEED });
      event('launched', `adventure seed ${info.runSeed}`);
    } else {
      if (SWARM_ROUTE === 'door') {
        await crucibleToArmory(page, { ruleset: 'swarm', seed: SEED }, stepLog);
        await waitForPreparationLaunch(page, {});
        const word = await armoryLaunchWord(page);
        await clickText(page, word || 'Launch round 1');
      } else {
        await page.locator('[data-screen="mainMenu"] [data-action="swarm"]').first().click({ timeout: T(60000) });
      }
      await waitUntilFlight(page, { timeout: T(600000), active: true });
      await waitBootOverlayGone(page);
      event('launched', `swarm (${SWARM_ROUTE} route)`);
    }
  };
  // A launch can land on the game's own startup-failure pane ([data-startup-failure]:
  // "Retry" re-runs the same launch; "Back to menu" returns to the door). A player
  // retries rather than quitting, so the soak does the same — up to two recoveries
  // before the boot itself counts as failed.
  let booted = false;
  let bootError = null;
  for (let attemptNo = 1; attemptNo <= 3 && !booted; attemptNo++) {
    if (attemptNo > 1) {
      const paneUp = await evalPage(() => !!document.querySelector('[data-startup-failure]')).catch(() => false);
      const retried = paneUp && await clickButtonMatching(/^retry$/i, '[data-startup-failure]');
      if (retried) {
        event('startup-retry', `failure pane Retry (attempt ${attemptNo})`);
        try {
          await waitUntilFlight(page, { timeout: T(600000), active: MODE === 'swarm' });
          await waitBootOverlayGone(page).catch(() => {});
          event('launched', `${MODE} after the failure pane's Retry`);
          booted = true;
          break;
        } catch (retryErr) {
          if (!retryErr?.startupFailure) throw retryErr;
          bootError = retryErr;
          event('startup-failure', `Retry attempt ${attemptNo} — ${String(retryErr.startupFailure).slice(0, 140)}`);
          continue;
        }
      }
      const backed = paneUp && await clickButtonMatching(/back to menu/i, '[data-startup-failure]');
      if (!backed) break;
      await waitFn(() => {
        const el = document.querySelector('[data-screen="mainMenu"]');
        return !!(el && getComputedStyle(el).display !== 'none');
      }, null, 90000).catch(() => {});
    }
    try {
      await enterMode();
      booted = true;
    } catch (err) {
      if (!err?.startupFailure) throw err;
      bootError = err;
      event('startup-failure', `launch attempt ${attemptNo} — ${String(err.startupFailure).slice(0, 140)}`);
    }
  }
  if (!booted) throw (bootError || new Error('launch failed without a startup-failure pane'));
  const runSeed = await readLaunchedRunSeed(page).catch(() => null);
  if (runSeed != null) event('run-seed', String(runSeed));

  playT0 = Date.now();
  const deadline = playT0 + MINUTES * 60000;
  let nextSampleAt = playT0;   // baseline sample immediately, then every SAMPLE_MS
  let idx = 0; let beat = 0;

  while (!fatal && Date.now() < deadline) {
    if (Date.now() >= nextSampleAt) {
      nextSampleAt += SAMPLE_MS;
      const sample = await takeSample();
      if (sample) {
        for (const v of allVerdicts()) {
          if (v.verdict === 'FAIL' && !fatal) {
            fatal = { reason: v.detail || `${v.key} unbounded growth`, at: wallMs() };
            event('fatal', fatal.reason);
          }
        }
      }
    }
    if (fatal) break;
    if (page.isClosed()) { fatal = { reason: 'page closed', at: wallMs() }; break; }
    if (MODE === 'adventure') await adventureBeat(deadline, idx++);
    else await swarmBeat(deadline, beat++);
  }
}

const deadlineHit = (deadline) => deadline != null && Date.now() > deadline;

function printSummary() {
  const verdicts = allVerdicts();
  const rows = samples;
  const pick = (key) => ({
    first: rows.length ? baselineFor(key) : null,
    mid: rows.length ? rows[Math.floor(rows.length / 2)][key] : null,
    last: rows.length ? rows[rows.length - 1][key] : null,
  });
  const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v.toFixed(d)).toString());
  const metricLines = [
    ['heapMB', 'JS heap MB'], ['domNodes', 'DOM nodes'], ['geometries', 'GL geometries'],
    ['textures', 'GL textures'], ['programs', 'GL programs'], ['entities', 'entities'],
    ['jsEventListeners', 'JS event listeners'], ['drawCalls', 'draw calls'],
    ['frameP95Ms', 'frame p95 ms'], ['workerStepMs', 'worker step ms'],
  ];
  const lines = [];
  lines.push('', `================ SOAK SUMMARY — ${MODE} ================`);
  lines.push(`report: ${relOut(OUT)}`);
  lines.push(`played ${(wallMs() / 60000).toFixed(1)} min · ${rows.length} samples · ${activityLog.length} activities · ${restarts} restarts`);
  lines.push(`metric                start        mid       final`);
  for (const [key, label] of metricLines) {
    const p = pick(key);
    lines.push(`  ${label.padEnd(20)} ${fmt(p.first).padStart(9)} ${fmt(p.mid).padStart(11)} ${fmt(p.last).padStart(11)}`);
  }
  lines.push('', 'verdicts:');
  for (const v of verdicts) {
    const mark = v.verdict === 'FAIL' ? 'FAIL' : v.verdict.startsWith('ok') ? ' ok ' : ' -- ';
    lines.push(`  [${mark}] ${v.key.padEnd(18)} ${v.verdict}${v.detail ? ` — ${v.detail}` : ''}`);
  }
  const errList = [...consoleErrors.values()].sort((a, b) => b.count - a.count);
  const warnList = [...consoleWarnings.values()].sort((a, b) => b.count - a.count);
  lines.push('', `console errors: ${errList.reduce((a, e) => a + e.count, 0)} (${errList.length} distinct)`);
  for (const e of errList.slice(0, 12)) lines.push(`  x${e.count} ${e.text.slice(0, 140)}`);
  lines.push(`console warnings: ${warnList.reduce((a, e) => a + e.count, 0)} (${warnList.length} distinct)`);
  for (const e of warnList.slice(0, 12)) lines.push(`  x${e.count} ${e.text.slice(0, 140)}`);
  if (fatal) lines.push('', `FATAL: ${fatal.reason} @${(fatal.at / 60000).toFixed(1)}min`);
  const failed = verdicts.some((v) => v.verdict === 'FAIL') || fatal;
  lines.push('', `VERDICT: ${failed ? 'FAIL' : 'PASS'}`);
  const text = lines.join('\n');
  console.log(text);
  writeRow({
    t: 'summary', at: new Date().toISOString(), wallMs: wallMs(), mode: MODE,
    minutesPlayed: Math.round(wallMs() / 600) / 100, sampleCount: rows.length,
    restarts, fatal: fatal || null,
    metrics: Object.fromEntries(metricLines.map(([key]) => [key, pick(key)])),
    verdicts,
    consoleErrors: errList, consoleWarnings: warnList,
    verdict: failed ? 'FAIL' : 'PASS',
  });
  return failed ? 1 : 0;
}

main().then(async () => {
  // Final sample + verdict even on an early fatal, so the report always closes with data.
  try { await takeSample(); } catch { /* page may be gone */ }
  process.exitCode = printSummary();
}).catch(async (err) => {
  console.error('[soak] harness failure:', err);
  event('fatal', `harness: ${String(err?.message || err).slice(0, 300)}`);
  if (!fatal) fatal = { reason: `harness: ${String(err?.message || err).slice(0, 200)}`, at: wallMs() };
  try { await page?.screenshot({ path: OUT.replace(/\.jsonl$/, '-fatal.png'), timeout: 5000 }); } catch { /* best effort */ }
  try { process.exitCode = printSummary(); } catch { process.exitCode = 1; }
}).finally(async () => {
  try { jsonl?.end(); } catch { /* ignore */ }
  if (stopWindowTimer) await stopWindowTimer().catch(() => {});
  if (browser) await Promise.race([browser.close(), sleep(8000)]).catch(() => {});
  if (server) await Promise.race([server.close(), sleep(5000)]).catch(() => {});
});
