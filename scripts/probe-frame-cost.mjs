// Frame-cost probe (render lead, 2026-11-20). Boots the real game on a FIXED seed through the dev
// launch routes, flies a scripted path, and records per presented frame: main-thread time by phase,
// draw calls, triangles, programs, scene-graph census, GL call counts and a sampled CPU profile.
//
// Measurement discipline: this machine's load swings 2-3x minute to minute. Never compare two
// separate invocations. Give the variants to ONE invocation; it runs them interleaved
// (A B A B ...), each in a fresh browser on the same seed, and reports per-variant medians and the
// B/A ratio of each adjacent pair.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-frame-cost.mjs \
//     --route=adventure|swarm [--seed=4242] [--sector=sector_helios_prime] [--round=6] \
//     [--variants="base:rfx=off;fix:"] [--reps=2] [--secs=20] [--profile=1] [--shots=1] [--tag=x]
//
// A variant is `name:query` — the query is appended to the launch URL (e.g. rfx=off turns the
// render-lead fixes off; see src/render/frameCostSwitches.js).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// Queue plans: the game lock is first-come-first-served and the line can be long. A queued
// invocation runs whatever .devshots/frame-cost/plan-<tag>.json holds when the lock is finally
// granted (an array of argument arrays, run in order inside the same lock), so the measurement can
// be refined while waiting without giving up the place in line.
{
  const tagArg = process.argv.find((x) => x.startsWith('--tag='));
  const planFile = tagArg && !process.env.SF_FRAME_COST_IN_PLAN
    ? path.join(ROOT, '.devshots', 'frame-cost', `plan-${tagArg.slice(6)}.json`) : null;
  const { existsSync, readFileSync, renameSync } = await import('node:fs');
  if (planFile && existsSync(planFile)) {
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    renameSync(planFile, `${planFile}.ran`);
    const { spawnSync } = await import('node:child_process');
    for (const args of plan) {
      console.log(`[frame-cost] plan step: ${args.join(' ')}`);
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SF_FRAME_COST_IN_PLAN: '1' } });
    }
    process.exit(0);
  }
}
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const arg =(n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROUTE = arg('route', 'adventure');
const SEED = Number(arg('seed', 4242));
const SECTOR = arg('sector', 'sector_helios_prime');
const ROUND = arg('round', '6');
const ARENA = arg('arena', '');
const SECS = Number(arg('secs', 20));
const SETTLE = Number(arg('settle', 6));
const REPS = Number(arg('reps', 1));
const PROFILE = arg('profile', '1') !== '0';
const SHOTS = arg('shots', '1') !== '0';
const GLCOUNT = arg('glcount', '1') !== '0';
const TAG = arg('tag', ROUTE);
// Per-pass CPU timers also switch on probe-only census work inside the renderer; off by default.
const RENDERWORK = arg('renderwork', '0') === '1';
// Integrated GPUs on Auto present at a 30 fps cap; an explicit cap (default 120 = display-limited)
// shows the real headroom. --cap=0 keeps the game's own choice.
const CAP = Number(arg('cap', 120));
const VARIANTS = String(arg('variants', 'cur:')).split(';').filter(Boolean).map((v) => {
  const i = v.indexOf(':');
  return i < 0 ? { name: v, query: '' } : { name: v.slice(0, i), query: v.slice(i + 1) };
});
const OUT = path.join(ROOT, '.devshots', 'frame-cost', TAG);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });

function pct(values, p) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  return +a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))].toFixed(2);
}
const mean = (values) => { const a = values.filter(Number.isFinite); return a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null; };

// ---- CPU profile aggregation ---------------------------------------------------------------
function summarizeProfile(profile, wallMs) {
  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const parent = new Map();
  for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
  const keyOf = (n) => {
    const f = n.callFrame;
    const file = (f.url || '').replace(/^.*\/(src|node_modules|vendor)\//, '$1/').replace(/\?.*$/, '');
    return `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`;
  };
  const self = new Map();
  const incl = new Map();
  const samples = profile.samples || [];
  const deltas = profile.timeDeltas || [];
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    const dt = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000; // ms
    total += dt;
    const leaf = byId.get(samples[i]);
    if (!leaf) continue;
    const lk = keyOf(leaf);
    self.set(lk, (self.get(lk) || 0) + dt);
    const seen = new Set();
    for (let id = samples[i]; id != null; id = parent.get(id)) {
      const k = keyOf(byId.get(id));
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) || 0) + dt);
    }
  }
  const per = (ms) => +(ms / Math.max(1, wallMs) * 1000).toFixed(2); // ms per wall second
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ fn: k, msPerSec: per(v) }));
  return { totalMsPerSec: per(total), self: top(self, 60), inclusive: top(incl, 120) };
}

async function runOnce(chromium, variant, rep) {
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
  const label = `${variant.name}-r${rep}`;
  const result = { variant: variant.name, rep, query: variant.query, errors: [] };
  let browser;
  try {
    const q = new URLSearchParams();
    if (ROUTE === 'swarm') { q.set('swarmRound', ROUND); if (ARENA) q.set('swarmArena', ARENA); } else { q.set('sector', SECTOR); q.set('seed', String(SEED)); }
    for (const [k, v] of new URLSearchParams(variant.query)) q.set(k, v);
    const url = `http://127.0.0.1:${port}/?${q}`;
    for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await sleep(150); }
    browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
    const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { if (result.errors.length < 20) result.errors.push(String(e.message || e).slice(0, 300)); });
    await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180000 });
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => { const s = window.SF.state; return { flight: s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt), mode: s.mode }; }).catch(() => ({}));
      if (st.flight) break;
      if (ROUTE === 'swarm') {
        // The checkpoint start opens the armory; press its launch button like a player.
        await page.evaluate(() => {
          const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
          const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled && /^(Launch round \d+|Launch|Keep current loadout|Continue)/.test(n(x.textContent)));
          if (b) b.click();
        }).catch(() => {});
      }
      if (Date.now() - t0 > 400000) throw new Error(`no flight (mode ${st.mode})`);
      await sleep(1000);
    }
    result.loadS = +((Date.now() - t0) / 1000).toFixed(1);
    await page.bringToFront();
    await page.mouse.move(1000, 380);
    result.setup = await page.evaluate((cap) => {
      const S = window.SF.state;
      const v = S.settings && S.settings.video;
      if (cap > 0 && v) { v.frameCap = cap; try { window.SF.bus.emit('settings:changed', { section: 'video', key: 'frameCap' }); } catch {} }
      return { gpu: S.render.gpu || null, preset: v && v.qualityPreset, qualityMode: v && v.qualityMode, frameCap: v && v.frameCap,
        shadows: v && v.shadows, dynamicResolution: v && v.dynamicResolution, pixelRatioCap: v && v.pixelRatioCap, renderScale: v && v.renderScale };
    }, CAP).catch((e) => ({ err: String(e) }));
    await sleep(SETTLE * 1000);

    // ---- in-page recorder ----
    await page.evaluate((renderWork) => {
      const S = window.SF.state;
      const perf = S.perfRuntime;
      try { if (renderWork && perf && perf.setRenderWorkEnabled) perf.setRenderWorkEnabled(true); } catch {}
      try { perf && perf.resetStats && perf.resetStats(); } catch {}
      // Async GPU timer queries (no CPU stall); unavailable on some Chrome builds.
      try { const g = S.render.gpuTimers; if (g && g.setEnabled) { g.reset && g.reset(); g.setEnabled(true); } } catch {}
      const diag = window.__THREE_GAME_DIAGNOSTICS__ || null;
      const R = { frames: [], last: performance.now(), on: true, sample: {}, gl: null };
      window.__fc = R;
      const loop = () => {
        if (!R.on) return;
        const now = performance.now();
        const f = { dt: +(now - R.last).toFixed(2) };
        R.last = now;
        try {
          if (perf && perf.readFrameSample) {
            const s = perf.readFrameSample(R.sample);
            f.cb = s.callbackMs; f.untracked = s.untrackedMs; f.render = s.renderMs; f.pres = s.presentationMs;
            f.vfx = s.vfxMs; f.ui = s.uiMs; f.sim = s.simMs; f.feel = s.feelMs;
          }
          if (diag && diag.info) { f.calls = diag.info.calls; f.tris = diag.info.triangles; }
          const r = S.render && S.render.renderer;
          if (r && r.info) f.programs = Array.isArray(r.info.programs) ? r.info.programs.length : null;
          if (R.gl) { f.gl = R.gl.counts; R.gl.counts = {}; }
        } catch (e) { f.err = String(e.message || e); }
        R.frames.push(f);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }, RENDERWORK);

    // ---- scripted flight: the same key schedule every run ----
    const keyLeg = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
    const flightStart = Date.now();
    let profile = null;
    let cdp = null;
    const shots = [];
    const flying = (async () => {
      await page.keyboard.down('KeyW');
      if (ROUTE === 'swarm') await page.mouse.down();
      let i = 0;
      while (Date.now() - flightStart < SECS * 1000) {
        await sleep(1800);
        await keyLeg(i % 4 === 3 ? 'KeyA' : 'KeyD', 500);
        i += 1;
      }
      if (ROUTE === 'swarm') await page.mouse.up().catch(() => {});
      await page.keyboard.up('KeyW');
    })();
    if (SHOTS) {
      for (const at of [3, Math.round(SECS * 0.6)]) {
        const wait = flightStart + at * 1000 - Date.now();
        if (wait > 0) await sleep(wait);
        const file = `${TAG}-${label}-t${at}.png`;
        await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
        shots.push(file);
      }
    }
    // CPU profile over the middle of the flight, clear of the screenshots' own cost.
    if (PROFILE) {
      const wait = flightStart + Math.round(SECS * 0.6 + 1) * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      cdp = await ctx.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      const pt0 = Date.now();
      await cdp.send('Profiler.start');
      await page.evaluate(() => { window.__fc.profFrom = window.__fc.frames.length; });
      await sleep(Math.min(6000, Math.max(2000, SECS * 1000 * 0.25)));
      await page.evaluate(() => { window.__fc.profTo = window.__fc.frames.length; });
      const r = await cdp.send('Profiler.stop');
      const wallMs = Date.now() - pt0;
      profile = summarizeProfile(r.profile, wallMs);
      // Raw profile for drill-down (scripts/probe-frame-cost-tree.mjs) or DevTools.
      writeFileSync(path.join(OUT, `${label}.cpuprofile`), JSON.stringify({ ...r.profile, wallMs }));
    }
    await flying;
    // Short GL-count window after the timed flight (wrapping distorts timing; counts only).
    let glFrames = [];
    if (GLCOUNT) {
      await page.evaluate(() => {
        const r = window.SF.state.render.renderer;
        const gl = r.getContext();
        const names = ['useProgram', 'bindTexture', 'activeTexture', 'bindVertexArray', 'bindBuffer', 'bindFramebuffer', 'bufferSubData', 'bufferData', 'texImage2D', 'texSubImage2D',
          'uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix3fv', 'uniformMatrix4fv', 'uniform1iv',
          'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements', 'enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'depthMask', 'depthFunc', 'cullFace', 'frontFace', 'colorMask', 'viewport', 'scissor', 'clear',
          'getParameter', 'getError', 'getProgramParameter', 'getShaderParameter', 'getUniformLocation', 'getAttribLocation', 'getExtension', 'readPixels', 'getQueryParameter', 'getSyncParameter', 'clientWaitSync', 'fenceSync', 'finish', 'flush', 'isContextLost', 'getBufferSubData', 'checkFramebufferStatus'];
        const counts = {};
        const orig = {};
        for (const n of names) {
          const fn = gl[n];
          if (typeof fn !== 'function') continue;
          orig[n] = Object.prototype.hasOwnProperty.call(gl, n) ? fn : null;
          gl[n] = function () { window.__fc.gl.counts[n] = (window.__fc.gl.counts[n] || 0) + 1; return fn.apply(this, arguments); };
        }
        window.__fc.gl = { counts, orig, gl };
        window.__fc.glFrom = window.__fc.frames.length;
      });
      await sleep(2500);
      glFrames = await page.evaluate(() => {
        const G = window.__fc.gl;
        for (const [n, f] of Object.entries(G.orig)) { if (f) G.gl[n] = f; else delete G.gl[n]; }
        window.__fc.gl = null;
        return window.__fc.frames.slice(window.__fc.glFrom).map((f) => f.gl).filter(Boolean);
      });
    }
    // Scene census (one walk, outside the timed window).
    result.census = await page.evaluate(() => {
      const S = window.SF.state;
      const scene = S.render && S.render.scene;
      const c = { nodes: 0, visibleNodes: 0, meshes: 0, visibleMeshes: 0, instanced: 0, batched: 0, autoMatrix: 0, autoWorld: 0, frustumCulledOff: 0, castShadow: 0, transparent: 0, onBeforeRender: 0, lights: 0, materials: 0, sprites: 0, points: 0, lines: 0 };
      if (!scene) return c;
      const mats = new Set();
      const noop = Object.getPrototypeOf(scene).onBeforeRender;
      scene.traverse((o) => {
        c.nodes++;
        if (o.matrixAutoUpdate) c.autoMatrix++;
        if (o.matrixWorldAutoUpdate !== false) c.autoWorld++;
        if (o.isLight) c.lights++;
      });
      scene.traverseVisible((o) => {
        c.visibleNodes++;
        const draw = o.isMesh || o.isPoints || o.isLine || o.isSprite;
        if (!draw) return;
        if (o.isMesh) c.visibleMeshes++;
        if (o.isInstancedMesh) c.instanced++;
        if (o.isBatchedMesh) c.batched++;
        if (o.isSprite) c.sprites++;
        if (o.isPoints) c.points++;
        if (o.isLine) c.lines++;
        if (o.frustumCulled === false) c.frustumCulledOff++;
        if (o.castShadow) c.castShadow++;
        if (o.onBeforeRender !== noop) c.onBeforeRender++;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m) { mats.add(m); if (m.transparent) c.transparent++; } }
      });
      scene.traverse((o) => { if (o.isMesh) c.meshes++; });
      c.materials = mats.size;
      const r = S.render.renderer;
      c.shadowMapEnabled = !!(r.shadowMap && r.shadowMap.enabled);
      c.shadowAutoUpdate = !!(r.shadowMap && r.shadowMap.autoUpdate);
      c.pixelRatio = r.getPixelRatio ? r.getPixelRatio() : null;
      c.canvas = r.domElement ? [r.domElement.width, r.domElement.height] : null;
      c.sceneAutoUpdate = scene.matrixWorldAutoUpdate;
      return c;
    }).catch((e) => ({ err: String(e) }));
    result.renderInfo = await page.evaluate(() => {
      const S = window.SF.state;
      const dr = S.render && (S.render.dynamicResolution || S.render.dynRes);
      const out = { viewport: S.render && S.render.viewport ? { w: S.render.viewport.width, h: S.render.viewport.height } : null };
      try { out.renderWork = S.perfRuntime.getReport().renderWork; } catch (e) { out.err = String(e); }
      try { const g = S.render.gpuTimers; if (g) { const rep = g.getReport(); out.gpu = { status: rep.status, passes: rep.passes }; } } catch (e) { out.gpuErr = String(e); }
      try { out.dynResScale = S.render.dynResScale; out.liveFrameCap = S.render.frameCap; } catch {}
      try { out.dynRes = dr ? JSON.parse(JSON.stringify(dr, (k, v) => (typeof v === 'object' && v && v.isObject3D ? undefined : v))) : null; } catch { out.dynRes = 'unserializable'; }
      return out;
    }).catch((e) => ({ err: String(e) }));
    const frames = await page.evaluate(() => { window.__fc.on = false; return { frames: window.__fc.frames, profFrom: window.__fc.profFrom, profTo: window.__fc.profTo, glFrom: window.__fc.glFrom }; });
    const timed = frames.frames.slice(0, frames.glFrom ?? frames.frames.length).slice(10);
    const clean = timed.filter((f, i) => !(frames.profFrom != null && i + 10 >= frames.profFrom && i + 10 < frames.profTo));
    const col = (k, src = clean) => src.map((f) => f[k]);
    const fpsWindow = clean.reduce((s, f) => s + f.dt, 0);
    result.frames = {
      n: clean.length,
      fps: +(clean.length / (fpsWindow / 1000)).toFixed(1),
      dt: { p50: pct(col('dt'), 0.5), p95: pct(col('dt'), 0.95), p99: pct(col('dt'), 0.99), over33: clean.filter((f) => f.dt > 33.4).length, over50: clean.filter((f) => f.dt > 50).length },
      callback: { p50: pct(col('cb'), 0.5), p95: pct(col('cb'), 0.95), mean: mean(col('cb')) },
      render: { p50: pct(col('render'), 0.5), p95: pct(col('render'), 0.95), mean: mean(col('render')) },
      presentation: { p50: pct(col('pres'), 0.5), p95: pct(col('pres'), 0.95), mean: mean(col('pres')) },
      vfx: { p50: pct(col('vfx'), 0.5), mean: mean(col('vfx')) },
      ui: { p50: pct(col('ui'), 0.5), mean: mean(col('ui')) },
      untracked: { p50: pct(col('untracked'), 0.5), mean: mean(col('untracked')) },
      calls: { p50: pct(col('calls'), 0.5), max: Math.max(...col('calls').filter(Number.isFinite)) },
      tris: { p50: pct(col('tris'), 0.5), max: Math.max(...col('tris').filter(Number.isFinite)) },
      programs: { last: clean.length ? clean[clean.length - 1].programs : null },
    };
    if (frames.profFrom != null) {
      const pf = frames.frames.slice(frames.profFrom, frames.profTo);
      result.profiledFrames = pf.length;
    }
    if (glFrames.length) {
      const sum = {};
      for (const g of glFrames) for (const [k, v] of Object.entries(g)) sum[k] = (sum[k] || 0) + v;
      result.glPerFrame = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, +(v / glFrames.length).toFixed(1)]).sort((a, b) => b[1] - a[1]));
    }
    result.profile = profile;
    result.shots = shots;
    if (cdp) await cdp.detach().catch(() => {});
  } catch (e) {
    result.errors.push(`probe: ${e && (e.stack || e.message)}`);
  } finally {
    try { await browser?.close(); } catch {}
    try { server.kill(); } catch {}
  }
  writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(result, null, 1));
  const fr = result.frames || {};
  console.log(`[frame-cost] ${label}: fps ${fr.fps} dt p50 ${fr.dt?.p50} p95 ${fr.dt?.p95} | cb p50 ${fr.callback?.p50} render p50 ${fr.render?.p50} pres p50 ${fr.presentation?.p50} | calls ${fr.calls?.p50} tris ${fr.tris?.p50} | errors ${result.errors.length}`);
  return result;
}

const { chromium } = await loadPlaywright();
const all = [];
for (let rep = 0; rep < REPS; rep++) {
  for (const v of VARIANTS) all.push(await runOnce(chromium, v, rep));
}
// Per-variant medians and adjacent-pair ratios against the first variant.
const summary = { route: ROUTE, seed: ROUTE === 'swarm' ? `arena default, round ${ROUND}` : SEED, sector: SECTOR, variants: {} };
for (const v of VARIANTS) {
  const runs = all.filter((r) => r.variant === v.name && r.frames);
  const med = (sel) => pct(runs.map(sel), 0.5);
  summary.variants[v.name] = {
    runs: runs.length,
    fps: med((r) => r.frames.fps), dtP50: med((r) => r.frames.dt.p50), dtP95: med((r) => r.frames.dt.p95),
    cbP50: med((r) => r.frames.callback.p50), renderP50: med((r) => r.frames.render.p50), presP50: med((r) => r.frames.presentation.p50),
    calls: med((r) => r.frames.calls.p50), tris: med((r) => r.frames.tris.p50),
  };
}
if (VARIANTS.length > 1) {
  const a = VARIANTS[0].name;
  summary.pairRatios = [];
  for (let rep = 0; rep < REPS; rep++) {
    const ra = all.find((r) => r.variant === a && r.rep === rep && r.frames);
    for (const v of VARIANTS.slice(1)) {
      const rb = all.find((r) => r.variant === v.name && r.rep === rep && r.frames);
      if (!ra || !rb) continue;
      const ratio = (f) => { const x = f(ra); const y = f(rb); return Number.isFinite(x) && x > 0 && Number.isFinite(y) ? +(y / x).toFixed(3) : null; };
      summary.pairRatios.push({ rep, b: v.name, cb: ratio((r) => r.frames.callback.p50), render: ratio((r) => r.frames.render.p50), pres: ratio((r) => r.frames.presentation.p50), dt: ratio((r) => r.frames.dt.p50) });
    }
  }
}
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
