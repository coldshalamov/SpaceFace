// Live A/B frame-cost probe (render lead, 2026-11-20). ONE boot, ONE scene: the change under test
// is flipped off and on in alternating windows inside the same page, so machine load (which swings
// 2-3x here) hits both sides equally and the seed cannot drift between runs. Reports per-variant
// main-thread cost per frame, GL call counts per frame, and paired window ratios.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-frame-toggle.mjs \
//     --route=swarm|adventure [--round=20] [--seed=4242] --toggle=sort[,shadowsOff] \
//     [--windows=8] [--win=3] [--profile=on] [--shots=1] [--tag=x]
//
// Toggles (fix ON is the B side):
//   sort        state-sorted opaque list vs raw traversal order (renderer.setOpaqueSort)
//   shadowsOff  Shadows setting off vs on (settings.video.shadows)
//   rfx:<name>  any per-frame switch read through frameCostSwitches.frameCostFixOn (globalThis.__sfRfx)
// Dynamic resolution is pinned at 1.0 during the measurement so it cannot act on one side only.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };

// Queue plans (see probe-frame-cost.mjs): a waiting invocation runs plan-<tag>.json when granted.
{
  const tagArg = process.argv.find((x) => x.startsWith('--tag='));
  const planFile = tagArg && !process.env.SF_FRAME_COST_IN_PLAN
    ? path.join(ROOT, '.devshots', 'frame-cost', `plan-${tagArg.slice(6)}.json`) : null;
  const { existsSync, readFileSync, renameSync } = await import('node:fs');
  if (planFile && existsSync(planFile)) {
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    renameSync(planFile, `${planFile}.ran`);
    const { spawnSync } = await import('node:child_process');
    for (const step of plan) {
      const script = step.script ? path.join(ROOT, step.script) : fileURLToPath(import.meta.url);
      const args = step.args || step;
      console.log(`[frame-toggle] plan step: ${path.basename(script)} ${args.join(' ')}`);
      const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SF_FRAME_COST_IN_PLAN: '1' } });
      if (r.status !== 0 && step.stopOnFail !== false) { console.log('[frame-toggle] plan step failed; stopping plan'); break; }
    }
    process.exit(0);
  }
}

const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const ROUTE = arg('route', 'adventure');
const SEED = Number(arg('seed', 4242));
const SECTOR = arg('sector', 'sector_helios_prime');
const ROUND = arg('round', '20');
const ARENA = arg('arena', '');
const TOGGLES = String(arg('toggle', 'sort')).split(',').filter(Boolean);
const WINDOWS = Number(arg('windows', 8));
const WIN = Number(arg('win', 3));
const SETTLE = Number(arg('settle', 5));
const PROFILE = arg('profile', 'on'); // on | off | none — which side gets the CPU profile window
const SHOTS = arg('shots', '1') !== '0';
const FLIGHT_TIMEOUT = Number(arg('flightTimeout', 200)) * 1000;
const CAP = Number(arg('cap', 0));
// --dynres=1 leaves the game's own dynamic-resolution controller running (to watch what it does).
const DYNRES = arg('dynres', '0') === '1';
const QUERY = String(arg('query', ''));
// Per-frame watch on named scene objects (comma list): visible flag, layer mask, residency hold and
// whether three actually drew it (onBeforeRender fires per draw).
const WATCH = String(arg('watch', '')).split(',').map((x) => x.trim()).filter(Boolean);
const TAG = arg('tag', `${ROUTE}-${TOGGLES.join('+')}`);
const OUT = path.join(ROOT, '.devshots', 'frame-cost', TAG);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });
const pct = (values, p) => { const a = values.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))].toFixed(2) : null; };
const mean = (values) => { const a = values.filter(Number.isFinite); return a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null; };

const report = { route: ROUTE, seed: ROUTE === 'swarm' ? `default arena, round ${ROUND}` : SEED, sector: SECTOR, toggles: TOGGLES, errors: [] };
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
let ok = false;
try {
  const q = new URLSearchParams(QUERY);
  if (ROUTE === 'swarm') { q.set('swarmRound', ROUND); if (ARENA) q.set('swarmArena', ARENA); } else { q.set('sector', SECTOR); q.set('seed', String(SEED)); }
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (report.errors.length < 20) report.errors.push(String(e.message || e).slice(0, 300)); });
  // First-use stalls name themselves: bloom.js warns "[GPU brick] bloomScene N ms {owners,newPrograms}".
  report.bricks = [];
  page.on('console', (m) => { const t = m.text(); if (/GPU brick|in-frame link|first-use|late admission/i.test(t) && report.bricks.length < 40) report.bricks.push({ at: Date.now(), text: t.slice(0, 1500) }); });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
  await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 180000 });
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => { const s = window.SF.state; return { flight: s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt), mode: s.mode }; }).catch(() => ({}));
    if (st.flight) break;
    if (ROUTE === 'swarm') {
      await page.evaluate(() => {
        const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled && /^(Launch round \d+|Launch|Keep current loadout|Continue)/.test(n(x.textContent)));
        if (b) b.click();
      }).catch(() => {});
    }
    if (Date.now() - t0 > FLIGHT_TIMEOUT) throw new Error(`no flight after ${FLIGHT_TIMEOUT / 1000}s (mode ${st.mode})`);
    await sleep(1000);
  }
  report.loadS = +((Date.now() - t0) / 1000).toFixed(1);
  await page.bringToFront();
  await page.mouse.move(1000, 380);
  report.setup = await page.evaluate(({ cap, dynres }) => {
    const S = window.SF.state;
    const v = S.settings && S.settings.video;
    if (cap > 0 && v) { v.frameCap = cap; try { window.SF.bus.emit('settings:changed', { section: 'video', key: 'frameCap' }); } catch {} }
    const render = window.SF.registry && window.SF.registry.get && window.SF.registry.get('render');
    try { if (!dynres) render && render._adaptive && render._adaptive.setEnabled(false); } catch {}
    const r = S.render.renderer;
    return { gpu: S.render.gpu || null, preset: v && v.qualityPreset, qualityMode: v && v.qualityMode, frameCap: v && v.frameCap, liveCap: S.render.frameCap,
      shadows: v && v.shadows, pixelRatio: r && r.getPixelRatio ? r.getPixelRatio() : null, canvas: r && r.domElement ? [r.domElement.width, r.domElement.height] : null,
      dynResScale: S.render.dynResScale, dynResPinned: !dynres && !!(render && render._adaptive) };
  }, { cap: CAP, dynres: DYNRES }).catch((e) => ({ err: String(e) }));
  await sleep(SETTLE * 1000);

  // ---- toggles + recorder ----
  await page.evaluate(async ({ toggles, watch }) => {
    const S = window.SF.state;
    const r = S.render.renderer;
    const { createOpaqueStateSort } = await import('/src/render/opaqueStateSort.js');
    const sorter = createOpaqueStateSort(r);
    const apply = {
      sort: (on) => r.setOpaqueSort(on ? sorter : () => 0),
      // res60: internal resolution 0.6 vs 1.0 — is the scene pass fill-bound?
      res60: (on) => { const rs = window.SF.registry.get('render'); S.render.dynResScale = on ? 0.6 : 1; rs._applySize(); },
      shadowsOff: (on) => { S.settings.video.shadows = !on; window.SF.bus.emit('settings:changed', { section: 'video', key: 'shadows' }); },
    };
    const perf = S.perfRuntime;
    const diag = window.__THREE_GAME_DIAGNOSTICS__ || null;
    const R = { frames: [], last: performance.now(), on: true, side: null, sample: {}, gl: null, watched: [], newPrograms: [], lastPrograms: null };
    try { const g = S.render.gpuTimers; if (g && g.setEnabled) { g.reset && g.reset(); R.gpuOn = g.setEnabled(true); } } catch {}
    window.__ft = R;
    R.attachWatch = () => {
      if (!watch.length) return;
      S.render.scene.traverse((o) => {
        if (!watch.includes(o.name) || R.watched.some((w) => w.o === o)) return;
        const w = { o, name: o.name, drawn: 0 };
        const prev = o.onBeforeRender;
        o.onBeforeRender = function () { w.drawn++; return prev.apply(this, arguments); };
        R.watched.push(w);
      });
    };
    R.attachWatch();
    R.set = (on) => {
      for (const t of toggles) {
        if (t.startsWith('rfx:')) { (globalThis.__sfRfx ||= {})[t.slice(4)] = on; continue; }
        // hidedeep:<exact name> — the same for every named node anywhere in the scene (set pieces,
        // not entity roots: the renderer re-shows those each frame).
        if (t.startsWith('hidedeep:')) {
          const name = t.slice(9);
          S.render.scene.traverse((c) => {
            if (c.name !== name) return;
            if (on) { if (c.__ftHidden !== true && c.visible) { c.__ftHidden = true; c.visible = false; } }
            else if (c.__ftHidden === true) { c.__ftHidden = false; c.visible = true; }
          });
          continue;
        }
        // hide:<name prefix> — GPU/CPU cost attribution: ON hides every top-level root with that name.
        if (t.startsWith('hide:')) {
          const prefix = t.slice(5);
          for (const c of S.render.scene.children) {
            if (!String(c.name || '').startsWith(prefix)) continue;
            if (on) { if (c.__ftHidden !== true && c.visible) { c.__ftHidden = true; c.visible = false; } }
            else if (c.__ftHidden === true) { c.__ftHidden = false; c.visible = true; }
          }
          continue;
        }
        apply[t](on);
      }
      R.side = on ? 'on' : 'off';
      R.sideAt = performance.now();
    };
    const loop = () => {
      if (!R.on) return;
      const now = performance.now();
      const f = { dt: +(now - R.last).toFixed(2), side: R.side, age: now - (R.sideAt || now), mode: S.mode, dyn: S.render.dynResScale, bound: S.render.dynResBound, dynEl: S.render.dynResEligible, dynOn: S.render.dynResEnabled,
        why: S.render.dynResEligible === false ? [S.mode, S.paused, S.timeScale, S.render.openingFirstPictureReady, S.render.flightVeilHoldsSim, S.render.liveSectorGpuAdmission, Number.isFinite(S.render.firstPlayableFrameAt)].join(',') : null };
      R.last = now;
      try {
        const s = perf.readFrameSample(R.sample);
        f.cb = s.callbackMs; f.render = s.renderMs; f.pres = s.presentationMs; f.ui = s.uiMs; f.vfx = s.vfxMs;
        if (diag && diag.info) { f.calls = diag.info.calls; f.tris = diag.info.triangles; }
        // Presented draw guard still wrapped after the frame = that pass did not settle.
        f.guard = r.renderBufferDirect === r.__sfUnreadyDrawGuardFn ? 1 : 0;
        if (R.gpuOn) { try { const rep = S.render.gpuTimers.getReport(); const ps = rep.passes || {}; f.gpu = (ps.bloomScene ? ps.bloomScene.last : 0); f.gpuAll = f.gpu + (ps.bloomComposite ? ps.bloomComposite.last : 0) + (ps.bloomDownsample ? ps.bloomDownsample.last : 0); } catch (_) {} }
        f.programs = r.info && r.info.programs ? r.info.programs.length : null;
        // Programs linked since the last frame: name them (first-use compiles inside the fight).
        if (f.programs != null && R.lastPrograms != null && f.programs > R.lastPrograms && R.newPrograms.length < 200) {
          for (let i = R.lastPrograms; i < f.programs; i++) {
            const pr = r.info.programs[i];
            R.newPrograms.push({ t: Math.round(now), name: pr && pr.name, key: String(pr && pr.cacheKey || '').slice(0, 160) });
          }
        }
        R.lastPrograms = f.programs;
        f.children = S.render.scene.children.length;
        if (R.gl) { f.gl = R.gl.counts; R.gl.counts = {}; }
        if (R.watched.length) {
          f.w = R.watched.map((w) => {
            let anc = true;
            for (let n = w.o; n; n = n.parent) if (n.visible === false) { anc = false; break; }
            const row = [w.drawn, w.o.visible ? 1 : 0, anc ? 1 : 0, w.o.layers.mask, w.o.userData && w.o.userData.sfResidencyHeld ? 1 : 0, w.o.count ?? -1];
            w.drawn = 0;
            return row;
          });
        }
      } catch (e) { f.err = String(e.message || e); }
      R.frames.push(f);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    R.set(false);
  }, { toggles: TOGGLES, watch: WATCH });

  // ---- scripted flight (wall-clock schedule, same every run) ----
  const flightEnd = Date.now() + (WINDOWS * WIN + 8) * 1000;
  const flying = (async () => {
    // Swarm: no thrust (a held W flies into the Foundry rim and ends the run in ~10 s); hold fire
    // and turn in place so the fight comes to the ship. Adventure: cruise with thrust.
    if (ROUTE !== 'swarm') await page.keyboard.down('KeyW');
    if (ROUTE === 'swarm') await page.mouse.down();
    let i = 0;
    while (Date.now() < flightEnd) {
      await sleep(1800);
      await page.keyboard.down(i % 4 === 3 ? 'KeyA' : 'KeyD'); await sleep(500); await page.keyboard.up(i % 4 === 3 ? 'KeyA' : 'KeyD');
      i += 1;
    }
    if (ROUTE === 'swarm') await page.mouse.up().catch(() => {});
    if (ROUTE !== 'swarm') await page.keyboard.up('KeyW');
  })();

  // Timed windows: off, on, off, on ...
  for (let w = 0; w < WINDOWS; w++) {
    await page.evaluate((on) => window.__ft.set(on), w % 2 === 1);
    await sleep(WIN * 1000);
  }
  if (PROFILE !== 'none') {
    await page.evaluate((v) => window.__ft.set(v), PROFILE === 'on');
    await sleep(800);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    const p0 = Date.now();
    const f0 = await page.evaluate(() => window.__ft.frames.length);
    await cdp.send('Profiler.start');
    await sleep(4000);
    const prof = await cdp.send('Profiler.stop');
    const f1 = await page.evaluate(() => window.__ft.frames.length);
    writeFileSync(path.join(OUT, `${TAG}-${PROFILE}.cpuprofile`), JSON.stringify({ ...prof.profile, wallMs: Date.now() - p0, frames: f1 - f0 }));
    report.profile = { side: PROFILE, frames: f1 - f0, wallMs: Date.now() - p0 };
    await cdp.detach().catch(() => {});
  }
  // GL counts: 4 short windows, counts only (the wrapper distorts timing).
  await page.evaluate(() => {
    const gl = window.SF.state.render.renderer.getContext();
    const names = ['useProgram', 'bindTexture', 'bindVertexArray', 'bufferSubData', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced',
      'uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix3fv', 'uniformMatrix4fv', 'uniform1iv',
      'enable', 'disable', 'blendFuncSeparate', 'depthMask', 'frontFace', 'texSubImage2D', 'getParameter', 'getError', 'getProgramParameter', 'readPixels', 'clientWaitSync', 'finish'];
    const orig = {};
    window.__ft.gl = { counts: {}, orig, gl };
    for (const n of names) {
      const fn = gl[n];
      if (typeof fn !== 'function') continue;
      orig[n] = Object.prototype.hasOwnProperty.call(gl, n) ? fn : null;
      gl[n] = function () { const c = window.__ft.gl.counts; c[n] = (c[n] || 0) + 1; return fn.apply(this, arguments); };
    }
  });
  for (let w = 0; w < 4; w++) {
    await page.evaluate((on) => { window.__ft.set(on); window.__ft.glWindow = true; }, w % 2 === 1);
    await sleep(1200);
  }
  await page.evaluate(() => { const G = window.__ft.gl; for (const [n, f] of Object.entries(G.orig)) { if (f) G.gl[n] = f; else delete G.gl[n]; } window.__ft.gl = null; window.__ft.glDone = window.__ft.frames.length; });

  // Same-instant picture proof for the sort: draw the SAME scene state twice in one JS task (nothing
  // can move in between), once per order, into an offscreen target, and count differing pixels.
  if (TOGGLES.includes('sort')) {
    report.sortPixelDiff = await page.evaluate(async () => {
      const S = window.SF.state;
      const r = S.render.renderer;
      const THREE = window.SF.THREE;
      const { createOpaqueStateSort } = await import('/src/render/opaqueStateSort.js');
      const cam = (S.camera && S.camera.obj) || null;
      const scene = S.render.scene;
      if (!cam || !scene || !THREE) return { skipped: true };
      const w = 768, h = 432;
      const rt = new THREE.WebGLRenderTarget(w, h);
      const read = () => { const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px); return px; };
      const prevTarget = r.getRenderTarget();
      const results = [];
      for (let k = 0; k < 3; k++) {
        r.setOpaqueSort(() => 0); r.setRenderTarget(rt); r.clear(); r.render(scene, cam); const a = read();
        r.setOpaqueSort(createOpaqueStateSort(r)); r.setRenderTarget(rt); r.clear(); r.render(scene, cam); const b = read();
        r.setOpaqueSort(() => 0); r.setRenderTarget(rt); r.clear(); r.render(scene, cam); const c = read();
        let diffAB = 0, diffAC = 0, maxAB = 0;
        for (let i = 0; i < a.length; i += 4) {
          const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          if (d > 6) diffAB++;
          if (d > maxAB) maxAB = d;
          const e = Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]);
          if (e > 6) diffAC++;
        }
        results.push({ diffPixelsSortVsRaw: diffAB, diffPixelsRawVsRaw: diffAC, maxChannelSum: maxAB, pixels: w * h });
        await new Promise((res) => setTimeout(res, 500));
      }
      r.setRenderTarget(prevTarget);
      rt.dispose();
      window.__ft.set(window.__ft.side === 'on');
      return results;
    }).catch((e) => ({ err: String(e) }));
  }
  // Picture: one shot per side, then a CPU profile of the requested side.
  if (SHOTS) {
    report.shots = [];
    for (const on of [false, true]) {
      await page.evaluate((v) => window.__ft.set(v), on);
      await sleep(600);
      const file = `${TAG}-${on ? 'on' : 'off'}.png`;
      await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
      report.shots.push(file);
    }
  }
  // Program churn + material sharing diagnostics over ~40 presented frames.
  report.materialDiag = await page.evaluate(async () => {
    const S = window.SF.state;
    const r = S.render.renderer;
    const props = r.properties;
    const mats = new Map();
    S.render.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && !mats.has(m)) mats.set(m, { o });
    });
    const snap = () => {
      for (const [m, row] of mats) {
        const rec = props.get(m);
        const cur = rec ? [m.version, rec.__version, rec.lightsStateVersion, rec.currentProgram && rec.currentProgram.id, rec.toneMapping, rec.outputColorSpace, rec.envMap && rec.envMap.uuid] : null;
        if (row.last && cur) {
          const names = ['material.version', '__version', 'lightsStateVersion', 'program', 'toneMapping', 'outputColorSpace', 'envMap'];
          for (let i = 0; i < cur.length; i++) if (cur[i] !== row.last[i]) { row.changes = row.changes || {}; row.changes[names[i]] = (row.changes[names[i]] || 0) + 1; }
        }
        row.last = cur;
      }
    };
    for (let i = 0; i < 40; i++) { snap(); await new Promise((res) => requestAnimationFrame(() => res())); }
    const churn = {};
    const churnExamples = [];
    for (const [m, row] of mats) {
      if (!row.changes) continue;
      for (const [k, v] of Object.entries(row.changes)) churn[k] = (churn[k] || 0) + 1;
      if (churnExamples.length < 12) churnExamples.push({ name: m.name || m.type, type: m.type, obj: String(row.o.name || row.o.type).slice(0, 40), changes: row.changes });
    }
    // Sharing: how many drawn materials are parameter-identical twins of another?
    const sig = (m) => {
      const parts = [m.type, m.side, m.transparent, m.blending, m.depthWrite, m.vertexColors, m.flatShading, m.alphaTest, m.opacity];
      for (const k of ['color', 'emissive', 'specular', 'sheenColor']) if (m[k] && m[k].getHexString) parts.push(m[k].getHexString());
      for (const k of ['roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity', 'shininess', 'clearcoat']) if (k in m) parts.push(m[k]);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap']) parts.push(m[k] ? m[k].uuid : '-');
      parts.push(m.customProgramCacheKey ? m.customProgramCacheKey() : '', m.onBeforeCompile ? String(m.onBeforeCompile).length : 0);
      if (m.uniforms) parts.push('U' + Object.keys(m.uniforms).length + ':' + m.uuid);
      return parts.join('|');
    };
    const groups = new Map();
    for (const m of mats.keys()) { const k = sig(m); groups.set(k, (groups.get(k) || 0) + 1); }
    const twins = [...groups.values()].filter((n) => n > 1);
    return { drawnMaterials: mats.size, uniqueSignatures: groups.size, twinGroups: twins.length, twinMaterials: twins.reduce((a, b) => a + b, 0), churnByField: churn, churnMaterials: [...mats.values()].filter((r) => r.changes).length, churnExamples };
  }).catch((e) => ({ err: String(e) }));
  // Draw attribution: visible, in-frustum drawables per top-level root (≈ color-pass draws).
  report.drawAttribution = await page.evaluate(() => {
    const S = window.SF.state;
    const THREE = window.SF.THREE;
    const cam = S.camera && S.camera.obj;
    const scene = S.render.scene;
    if (!cam || !THREE) return null;
    cam.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const rows = new Map();
    let total = 0;
    for (const child of scene.children) {
      if (!child.visible) continue;
      const key = String(child.name || child.type || '?').replace(/_\d+$/, '').slice(0, 44);
      child.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        if (o.isInstancedMesh && o.count === 0) return;
        if (o.frustumCulled !== false) {
          try { if (o.isSprite ? !frustum.intersectsSprite(o) : !frustum.intersectsObject(o)) return; } catch (_) { return; }
        }
        const n = Array.isArray(o.material) ? o.material.length : 1;
        const row = rows.get(key) || { key, draws: 0, instanced: 0, tris: 0 };
        row.draws += n; total += n;
        if (o.isInstancedMesh) row.instanced += n;
        const g = o.geometry;
        const idx = g && (g.index ? g.index.count : (g.attributes && g.attributes.position ? g.attributes.position.count : 0));
        row.tris += Math.floor((idx || 0) / 3) * (o.isInstancedMesh ? o.count : 1);
        rows.set(key, row);
      });
    }
    return { total, top: [...rows.values()].sort((a, b) => b.draws - a.draws).slice(0, 25) };
  }).catch((e) => ({ err: String(e) }));
  // Scene census: which top-level subtrees hold the nodes the per-frame matrix walk visits.
  report.census = await page.evaluate(() => {
    const scene = window.SF.state.render.scene;
    const rows = new Map();
    let nodes = 0, auto = 0, visible = 0;
    for (const child of scene.children) {
      const key = String(child.name || child.type || '?').slice(0, 40);
      const row = rows.get(key) || { key, roots: 0, nodes: 0, auto: 0, visibleNodes: 0, frozen: 0 };
      row.roots++;
      child.traverse((o) => { row.nodes++; nodes++; if (o.matrixAutoUpdate) { row.auto++; auto++; } if (o.userData && o.userData.sfMatrixFrozen) row.frozen++; });
      if (child.visible) child.traverseVisible(() => { row.visibleNodes++; visible++; });
      rows.set(key, row);
    }
    return { nodes, auto, visible, top: [...rows.values()].sort((a, b) => b.nodes - a.nodes).slice(0, 30) };
  }).catch((e) => ({ err: String(e) }));
  await flying;
  const data = await page.evaluate(() => {
    window.__ft.on = false;
    let gpu = null;
    try { const g = window.SF.state.render.gpuTimers; if (g) { const rep = g.getReport(); gpu = { status: rep.status, passes: rep.passes }; } } catch (e) { gpu = { err: String(e) }; }
    return { frames: window.__ft.frames, glDone: window.__ft.glDone, newPrograms: window.__ft.newPrograms, gpu };
  });
  report.newPrograms = data.newPrograms;
  report.gpu = data.gpu;
  // Timed frames: drop the first 400 ms after each flip (the switch's own settle) and anything not in flight.
  // A frame that drew nothing (run over, results screen) is not a measurement of the scene.
  const timed = data.frames.filter((f) => !f.gl && f.side && f.age > 400 && f.mode === 'flight' && f.calls > 0);
  report.deadFrames = data.frames.filter((f) => !(f.calls > 0)).length;
  const glFrames = data.frames.filter((f) => f.gl && f.age > 200);
  const sides = {};
  for (const side of ['off', 'on']) {
    const fr = timed.filter((f) => f.side === side);
    const span = fr.reduce((s, f) => s + f.dt, 0);
    const gl = glFrames.filter((f) => f.side === side);
    const glSum = {};
    for (const f of gl) for (const [k, v] of Object.entries(f.gl)) glSum[k] = (glSum[k] || 0) + v;
    const uniformCalls = Object.entries(glSum).filter(([k]) => k.startsWith('uniform')).reduce((s, [, v]) => s + v, 0);
    sides[side] = {
      frames: fr.length,
      fps: span > 0 ? +(fr.length / (span / 1000)).toFixed(1) : null,
      dtP50: pct(fr.map((f) => f.dt), 0.5), dtP95: pct(fr.map((f) => f.dt), 0.95),
      cbP50: pct(fr.map((f) => f.cb), 0.5), cbMean: mean(fr.map((f) => f.cb)),
      renderP50: pct(fr.map((f) => f.render), 0.5), renderMean: mean(fr.map((f) => f.render)),
      gpuSceneP50: pct(fr.map((f) => f.gpu), 0.5), gpuAllP50: pct(fr.map((f) => f.gpuAll), 0.5),
      presP50: pct(fr.map((f) => f.pres), 0.5), uiP50: pct(fr.map((f) => f.ui), 0.5),
      calls: pct(fr.map((f) => f.calls), 0.5), tris: pct(fr.map((f) => f.tris), 0.5),
      dynRes: [...new Set(fr.map((f) => f.dyn))],
      guardArmedShare: fr.length ? +(fr.filter((f) => f.guard).length / fr.length).toFixed(2) : null,
      programsSeen: [...new Set(fr.map((f) => f.programs))].slice(0, 6),
      sceneChildrenChanges: fr.reduce((n, f, i) => n + (i && f.children !== fr[i - 1].children ? 1 : 0), 0),
      glPerFrame: gl.length ? Object.fromEntries(Object.entries(glSum).map(([k, v]) => [k, +(v / gl.length).toFixed(1)]).sort((a, b) => b[1] - a[1])) : null,
      uniformCallsPerFrame: gl.length ? +(uniformCalls / gl.length).toFixed(1) : null,
    };
  }
  // Paired windows: each on-window against the off-window before it.
  const windowsList = [];
  let cur = null;
  for (const f of timed) {
    if (!cur || cur.side !== f.side) { cur = { side: f.side, cb: [], render: [], gpu: [] }; windowsList.push(cur); }
    cur.cb.push(f.cb); cur.render.push(f.render); cur.gpu.push(f.gpu);
  }
  report.pairs = [];
  for (let i = 1; i < windowsList.length; i++) {
    if (windowsList[i].side === 'on' && windowsList[i - 1].side === 'off') {
      const a = windowsList[i - 1], b = windowsList[i];
      report.pairs.push({ cbRatio: +(pct(b.cb, 0.5) / pct(a.cb, 0.5)).toFixed(3), renderRatio: +(pct(b.render, 0.5) / pct(a.render, 0.5)).toFixed(3), offCb: pct(a.cb, 0.5), onCb: pct(b.cb, 0.5),
        offGpu: pct(a.gpu, 0.5), onGpu: pct(b.gpu, 0.5), gpuRatio: pct(a.gpu, 0.5) ? +(pct(b.gpu, 0.5) / pct(a.gpu, 0.5)).toFixed(3) : null });
    }
  }
  report.sides = sides;
  report.dynResTrace = data.frames.filter((f, i) => i % 15 === 0).map((f) => [f.dyn, f.bound, f.dynOn, f.dynEl, f.why, Math.round(f.dt), Math.round(f.cb || 0), f.gpu != null ? Math.round(f.gpu) : null]);
  report.longFrames = data.frames.filter((f) => f.dt > 50).slice(0, 60).map((f) => ({ dt: f.dt, cb: f.cb, side: f.side, mode: f.mode, programs: f.programs }));
  if (WATCH.length) {
    const names = await Promise.resolve(WATCH);
    report.watch = names.map((name, k) => {
      const rows = data.frames.filter((f) => f.w && f.w[k]).map((f) => f.w[k]);
      const notDrawn = rows.filter((r) => r[0] === 0);
      return { name, frames: rows.length, drawnFrames: rows.length - notDrawn.length,
        notDrawnVisibleChain: notDrawn.filter((r) => r[1] && r[2] && r[3] !== 0).length,
        hiddenSelf: rows.filter((r) => !r[1]).length, hiddenAncestor: rows.filter((r) => !r[2]).length,
        layerMasked: rows.filter((r) => r[3] === 0).length, residencyHeld: rows.filter((r) => r[4]).length };
    });
  }
  report.modes = [...new Set(data.frames.map((f) => f.mode))];
  ok = timed.length > 20;
} catch (e) {
  report.errors.push(`probe: ${e && (e.stack || e.message)}`);
} finally {
  try { await browser?.close(); } catch {}
  try { server.kill(); } catch {}
}
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ tag: TAG, setup: report.setup, sides: report.sides && Object.fromEntries(Object.entries(report.sides).map(([k, v]) => [k, { ...v, glPerFrame: undefined }])), pairs: report.pairs, modes: report.modes, errors: report.errors }, null, 1));
process.exit(ok ? 0 : 1);
