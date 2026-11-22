// SMOOTHNESS probe (referee, 2026-11-22). Plays the DESKTOP build the way the owner does and
// measures what he feels: presented frames, not simulation counters.
//
//   his configuration: the player's ONE-file sim worker bundle, a 1920x1080 drawing buffer
//   (1536x864 CSS px @1.25), his saved video settings (copied read-only; never his saves), a window
//   that never takes focus, dense hand-like input (scripts/lib/playHand.mjs).
//
// The run is asserted before any number is printed: wrong window size, loose worker modules, a
// different GPU tier or a route that is not the fight it claims exits non-zero with no numbers.
//
// What is recorded, from before the run is launched (so run starts and post-pause moments count):
//   - every presented frame (state.render.worldSubmittedFrames moving), tagged live / transition /
//     menu. "Live" = flight, time scale > 0, not docked, no reveal veil. A "transition" is the first
//     3 s after the world becomes live (run start, level-up pick, shop, pause) and any frame that
//     straddles the change;
//   - every Long Animation Frame (>= 50 ms) with its scripts, every long task, every hole in a
//     20 Hz in-page timer;
//   - main-thread busy time (CDP Performance.getMetrics), the game callback's own duration;
//   - world speed (simulation seconds per wall second), worker step times, the freeze criteria.
// The judged window alternates 10 s segments "as he has it" (the game's own frame cap) and "cap
// lifted" (--cap, default 60) in ONE run, so the two are measured under the same load.
// GPU timer queries run only in a tail window after the judged one (his build has them off).
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-smooth-electron.mjs \
//     --route=swarm|adventure [--round=6] [--arena=helios_core] [--hull=ship_hornet] \
//     [--sector=sector_helios_prime] [--seed=4242] [--seconds=60] [--cap=60] [--trace] [--profile] --out=<dir>
//
// --profile: a sampling CPU profile of the main thread across the judged window, counted only while
// the world is live, written as <out>/profile.txt (+ profile.json, main.cpuprofile): self, by-file,
// inclusive and entry-point tables in ms per presented frame, for all frames and split by display
// refreshes taken (scripts/lib/smoothProfile.mjs). The sampler costs a few percent, so a profiled
// run is for finding owners, not for the scoreboard.
//
// --census: after the judged window, a few seconds with the renderer wrapped: WebGL calls by name,
// every draw with its owner, material, program and geometry, and the scene-graph size, per presented
// frame (<out>/census.txt; scripts/lib/smoothCensus.mjs).
// --eval-file=<path>: JavaScript run in the page before the route starts, for an on/off experiment
// in the referee's own setup (a live switch, a style rule). The run is marked as an experiment.
//
// Writes <out>/report.json (+ frames.json, loaf.json, samples.json). npm run check:smooth judges.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROUTE = String(argv.route || 'swarm');
const ROUND = Number(argv.round || 6);
const ARENA = argv.arena ? String(argv.arena) : '';
const HULL = argv.hull ? String(argv.hull) : '';
const SECTOR = String(argv.sector || 'sector_helios_prime');
const SEED = Number(argv.seed || 4242);
const SECONDS = Number(argv.seconds || 60);
const LIFT_CAP = Number(argv.cap ?? 60);
const SEGMENT_S = Number(argv.segment || 10);
const TRACE = argv.trace === true;
const PROFILE = argv.profile === true || (typeof argv.profile === 'string' && argv.profile !== '0');
const PROFILE_INTERVAL_US = Math.max(100, Number(argv['profile-interval'] || 500));
const CENSUS = argv.census === true;
const EVAL_FILE = typeof argv['eval-file'] === 'string' ? resolve(ROOT, argv['eval-file']) : '';
const WANT = { w: 1536, h: 864, dpr: 1.25 };
const TRANSITION_S = 3;
const OUT = resolve(ROOT, String(argv.out || `.devshots/smooth/adhoc-${ROUTE}`));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { createIsolatedElectronLaunch } = await import('./lib/electronTestIsolation.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { installCspSafePlaywrightPolling } = await import('./lib/playwrightCspPolling.mjs');
const { installFirstLightPromptHandler } = await import('./player-truth/routes.mjs');
const { createHand, PRESS_THROUGH_SCREENS } = await import('./lib/playHand.mjs');
const { summarizeSmoothProfile, formatSmoothProfile, summarizeSmoothTrace, formatSmoothTrace, SMOOTH_PROFILE_SYNC_FN } = await import('./lib/smoothProfile.mjs');
const { installSmoothCensus, collectSmoothCensus, formatSmoothCensus } = await import('./lib/smoothCensus.mjs');
const { _electron: electron } = await loadPlaywright();

// His video settings, read-only. Only the settings profile is copied; saves are never touched.
function readOwnerSettings() {
  try {
    const { resolvePlayerSaveDir } = createRequire(import.meta.url)('./lib/playerSaveStore.cjs');
    const file = join(resolvePlayerSaveDir(process.env), 'sf.settings.profile.v1.json');
    const text = readFileSync(file, 'utf8');
    const parsed = JSON.parse(text);
    return { text, video: (parsed.settings && parsed.settings.video) || null };
  } catch (_) { return null; }
}
const ownerSettings = readOwnerSettings();

const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: `smooth-${ROUTE}`, timeout: 180000, baseEnv: {
  ...process.env,
  SPACEFACE_EVIDENCE_SHOW_INACTIVE: '1',
  SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
  SPACEFACE_EVIDENCE_PLAYER_WORKER_BUNDLE: '1',
  SPACEFACE_EVIDENCE_CONTENT_SIZE: `${WANT.w}x${WANT.h}`,
} });

const report = { schema: 'spaceface.smooth.v1', route: ROUTE, round: ROUTE === 'swarm' ? ROUND : null,
  arena: ARENA || null, hull: HULL || null, sector: ROUTE === 'adventure' ? SECTOR : null,
  seconds: SECONDS, liftCap: LIFT_CAP, errors: [], notes: [] };
let app = null;
const fail = (why) => { const e = new Error(why); e.smoothAssert = true; throw e; };
const pct = (values, p) => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? +a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))].toFixed(1) : null;
};
function cpuTimes() {
  let idle = 0; let total = 0;
  for (const c of os.cpus()) { for (const v of Object.values(c.times)) total += v; idle += c.times.idle; }
  return { idle, total };
}

try {
  app = await electron.launch(launch.options);
  const page = await app.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await installFirstLightPromptHandler(page, () => {});
  page.on('pageerror', (e) => { if (report.errors.length < 30) report.errors.push(String(e.message || e).slice(0, 300)); });
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate((settingsText) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      if (settingsText) localStorage.setItem('sf.settings.profile.v1', settingsText);
    } catch { /* storage gated */ }
  }, ownerSettings ? ownerSettings.text : null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.SF.simLaneDiag === 'function', null, { timeout: 240000 });
  const readVideo = () => page.evaluate(() => { const v = (window.SF.state.settings && window.SF.state.settings.video) || {}; return { qualityMode: v.qualityMode, qualityPreset: v.qualityPreset, frameCap: v.frameCap, renderScale: v.renderScale, dynamicResolution: v.dynamicResolution, bloom: v.bloom, shadows: v.shadows, pixelRatioCap: v.pixelRatioCap, vsync: v.vsync }; });
  const bootVideo = await readVideo();
  const cdp = await page.context().newCDPSession(page);
  // The window is never activated; tell the page it has focus, as a player's window does.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await cdp.send('Performance.enable').catch(() => {});
  if (EVAL_FILE) {
    // An experiment: run the file's JavaScript in the page (through the debugger, so the page's
    // script policy does not apply). The report says so; it is never a scoreboard row.
    const res = await cdp.send('Runtime.evaluate', { expression: readFileSync(EVAL_FILE, 'utf8'), returnByValue: true, awaitPromise: true }).catch((e) => ({ exceptionDetails: { text: String(e) } }));
    if (res.exceptionDetails) fail(`--eval-file threw: ${JSON.stringify(res.exceptionDetails).slice(0, 300)}`);
    report.experiment = { file: EVAL_FILE.replace(ROOT, '').replace(/\\/g, '/'), returned: res.result ? res.result.value ?? null : null };
    report.notes.push(`EXPERIMENT: ${report.experiment.file} was run in the page before the route started`);
    console.log('experiment', JSON.stringify(report.experiment));
  }

  // ---- his screen: 1536x864 CSS px at 1.25 = a 1920x1080 drawing buffer ----
  const readRealm = () => page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: globalThis.devicePixelRatio || 1,
    coi: globalThis.crossOriginIsolated === true }));
  let realm = await readRealm();
  let sizedBy = 'window (frameless, content size)';
  const sizeOk = (r) => r.w === WANT.w && r.h === WANT.h && Math.abs(r.dpr - WANT.dpr) < 0.01;
  if (!sizeOk(realm)) {
    report.notes.push(`window opened at ${realm.w}x${realm.h}@${realm.dpr}; drawing size forced through device-metrics override`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: WANT.w, height: WANT.h, deviceScaleFactor: WANT.dpr, mobile: false });
    await sleep(800);
    realm = await readRealm();
    sizedBy = 'device-metrics override';
  }
  if (!sizeOk(realm)) fail(`could not get his screen size: ${realm.w}x${realm.h}@${realm.dpr}, wanted ${WANT.w}x${WANT.h}@${WANT.dpr}`);
  report.realm = { ...realm, sizedBy };
  report.realm.workerBundleDigest = await page.evaluate(async () => {
    try {
      const res = await fetch('/src/core/wholeSimBrowserWorker.js', { method: 'HEAD', cache: 'no-store' });
      return res.headers.get('X-SpaceFace-Dev-Sim-Worker-Digest') || null;
    } catch (_) { return null; }
  }).catch(() => null);
  if (!report.realm.workerBundleDigest) fail('this launch is not running the player\'s bundled sim worker (no bundle digest)');
  console.log('realm', JSON.stringify(report.realm));

  // ---- recorder: installed BEFORE the run is launched ----
  await page.evaluate(() => {
    const N = 90000;
    const R = { n: 0, t: new Float64Array(N), tn: new Float64Array(N), scr: new Uint8Array(N), pres: new Uint32Array(N), flags: new Uint8Array(N), cb: new Float32Array(N),
      rnd: new Float32Array(N), ui: new Float32Array(N), sim: new Float64Array(N), seg: 0, callsMax: 0, loaf: [], tasks: [], samples: [], on: true, sample: {}, loafOk: null };
    window.__sm = R;
    const S = window.SF.state;
    const live = () => S.mode === 'flight' && S.timeScale > 0 && !(S.ui && S.ui.docked === true)
      && !(S.render && S.render.flightVeilHoldsSim === true);
    const loop = (now) => {
      if (!R.on) return;
      const i = R.n;
      if (i < N) {
        R.t[i] = now;
        R.tn[i] = performance.now(); // when this callback really ran (the profile is attributed on this clock)
        R.scr[i] = Math.min(255, (S.ui && S.ui.screenStack && S.ui.screenStack.length) || 0);
        R.pres[i] = (S.render && S.render.worldSubmittedFrames) | 0;
        R.flags[i] = (live() ? 1 : 0) | (R.seg << 1);
        R.sim[i] = S.simTime || 0;
        if ((i & 15) === 0 && R.seg) { const d = window.__THREE_GAME_DIAGNOSTICS__; const c = d && d.info ? d.info.calls | 0 : 0; if (c > R.callsMax) R.callsMax = c; }
        const perf = S.perfRuntime;
        if (perf && perf.readFrameSample) {
          const s = perf.readFrameSample(R.sample);
          R.cb[i] = s.callbackMs || 0; R.rnd[i] = s.renderMs || 0; R.ui[i] = s.uiMs || 0;
        }
        R.n = i + 1;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (R.loaf.length >= 6000) return;
          const end = e.startTime + e.duration;
          R.loaf.push({ at: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1), blocking: Math.round(e.blockingDuration || 0),
            layoutMs: e.styleAndLayoutStart ? +(end - e.styleAndLayoutStart).toFixed(1) : 0,
            scripts: (e.scripts || []).map((x) => ({ ms: +x.duration.toFixed(1), invoker: String(x.invoker || '').slice(0, 80), type: x.invokerType,
              fn: x.sourceFunctionName || '', url: String(x.sourceURL || '').replace(/^.*\/(src|scripts|vendor)\//, '$1/').replace(/^https?:\/\/[^/]+\//, ''),
              at: x.sourceCharPosition, forcedLayoutMs: +(x.forcedStyleAndLayoutDuration || 0).toFixed(1), pauseMs: +(x.pauseDuration || 0).toFixed(1) }))
              .sort((a, b) => b.ms - a.ms).slice(0, 5) });
        }
      }).observe({ type: 'long-animation-frame', buffered: false });
      R.loafOk = true;
    } catch (err) { R.loafOk = String(err); }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (R.tasks.length < 8000) R.tasks.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]);
      }).observe({ type: 'longtask', buffered: false });
    } catch (_) { /* optional */ }
    let k = 0;
    R.timer = setInterval(() => {
      let g = null; try { g = window.SF.simLaneDiag(); } catch (_) {}
      const pt = g && g.poseTable;
      const c = (g && g.workerClockLastDiagnostics) || {};
      const pw = c.perfWindow || null;
      const row = { t: performance.now(), live: live(), mode: S.mode, ts: S.timeScale, seg: R.seg,
        sim: pt && pt.active ? pt.simTime : S.simTime, cap: (S.render && S.render.frameCap) || 0,
        pw: pw ? pw.index : null, workP50: pw ? pw.workMsP50 : null, workP95: pw ? pw.workMsP95 : null,
        stepP50: pw ? pw.stepMsP50 : null, stepP95: pw ? pw.stepMsP95 : null, screens: (S.ui && S.ui.screenStack && S.ui.screenStack.length) || 0 };
      if (k++ % 10 === 0) {
        let hostile = 0;
        try { for (const e of S.entities.values()) if (e && e.type === 'ship' && e.id !== S.playerId && e.alive !== false) hostile++; } catch (_) {}
        row.ships = hostile; row.ents = S.entities && S.entities.size;
        row.wave = S.run && Number.isInteger(S.run.wave) ? S.run.wave : null;
        row.arena = (S.run && S.run.arenaId) || null;
        row.sector = (S.world && S.world.currentSectorId) || null;
        const r = S.render && S.render.renderer;
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        row.calls = d && d.info ? d.info.calls : (r && r.info && r.info.render ? r.info.render.calls : null);
      }
      R.samples.push(row);
    }, 50);
  });

  // ---- start the route on the game's own launch seam (Electron forbids query strings) ----
  const launchRoute = async () => {
    if (ROUTE === 'swarm') {
      return page.evaluate(async ([round, arena, hull]) => {
        const { swarmStartAtRound, swarmArcadeSeedFor } = await import('/src/data/swarmLadder.js');
        const L = await import('/src/ui/crucibleLaunch.js');
        const { SWARM_RULESET } = await import('/src/data/swarmMode.js');
        const start = swarmStartAtRound(String(round));
        const arenaId = (arena && L.crucibleArenaIdForName(arena)) || L.CRUCIBLE_ARENA_ID;
        const args = { seed: swarmArcadeSeedFor(arenaId) || L.freshSeed(), arenaId, ruleset: SWARM_RULESET, startWave: start.startWave };
        const setup = hull ? L.crucibleHullSetupFor({ hullId: hull, ...args }) : L.crucibleSetupFor({ starterId: L.CRUCIBLE_DEFAULT_STARTER_ID, ...args });
        if (!setup.ok) return { ok: false, issues: (setup.issues || []).map((i) => i.message) };
        const access = window.SF.state.settings && window.SF.state.settings.accessibility;
        if (access) access.firstLightOffered = true;
        L.requestCrucibleRun(window.SF.bus, setup, SWARM_RULESET);
        return { ok: true, wave: start.startWave, arenaId };
      }, [ROUND, ARENA, HULL]).catch((e) => ({ ok: false, error: String(e).slice(0, 200) }));
    }
    return page.evaluate(async ([sector, seed]) => {
      const { applyDevSectorJump } = await import('/src/systems/devSectorJump.js');
      const r = await applyDevSectorJump({ searchParams: new URLSearchParams(`sector=${sector}&seed=${seed}`),
        state: window.SF.state, bus: window.SF.bus, registry: window.SF.registry });
      return { ok: !!r.launched || !!r.targetSectorId, ...r };
    }, [SECTOR, SEED]).catch((e) => ({ ok: false, error: String(e).slice(0, 200) }));
  };
  const t0 = Date.now();
  if (ROUTE === 'swarm') {
    await page.waitForFunction(() => {
      const ui = window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const m = ui && (ui.screenManager || ui.manager);
      return !!(m && typeof m.hasScreen === 'function' && m.hasScreen('crucibleDraft'));
    }, null, { timeout: 120000 }).catch(() => {});
  }
  report.launch = await launchRoute();
  console.log('launch', JSON.stringify(report.launch));
  if (!report.launch || report.launch.ok === false) fail(`route did not launch: ${JSON.stringify(report.launch)}`);
  const isLive = () => page.evaluate(() => {
    const s = window.SF.state;
    return s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt) && s.timeScale > 0;
  }).catch(() => false);
  for (;;) {
    if (await isLive()) break;
    await page.evaluate(PRESS_THROUGH_SCREENS).catch(() => {});
    if (Date.now() - t0 > 300000) {
      await page.screenshot({ path: join(OUT, 'no-flight.png') }).catch(() => {});
      fail(`no live flight after 300 s (mode ${await page.evaluate(() => window.SF.state.mode).catch(() => '?')})`);
    }
    await sleep(500);
  }
  report.loadS = +((Date.now() - t0) / 1000).toFixed(1);

  // ---- assert the configuration before a single number is judged ----
  report.config = await page.evaluate(() => {
    const S = window.SF.state; const v = (S.settings && S.settings.video) || {};
    const r = S.render && S.render.renderer;
    return { gpu: S.render.gpu || null, canvas: r && r.domElement ? [r.domElement.width, r.domElement.height] : null,
      pixelRatio: r && r.getPixelRatio ? r.getPixelRatio() : null, frameCap: S.render.frameCap, displayHz: S.render.displayHz || null,
      video: { qualityMode: v.qualityMode, qualityPreset: v.qualityPreset, frameCap: v.frameCap, renderScale: v.renderScale,
        dynamicResolution: v.dynamicResolution, bloom: v.bloom, shadows: v.shadows, pixelRatioCap: v.pixelRatioCap, vsync: v.vsync },
      gpuTimersOn: !!(S.render.gpuTimers && S.render.gpuTimers.getCapability && S.render.gpuTimers.getCapability().enabled) };
  });
  console.log('config', JSON.stringify(report.config));
  if (!report.config.gpu || report.config.gpu.tier !== 'integrated') fail(`GPU tier is ${report.config.gpu && report.config.gpu.tier}, his is integrated`);
  if (ownerSettings && ownerSettings.video) {
    for (const k of ['qualityMode', 'qualityPreset', 'frameCap', 'renderScale', 'dynamicResolution', 'bloom', 'shadows']) {
      if (ownerSettings.video[k] !== undefined && bootVideo[k] !== ownerSettings.video[k]) {
        // Not a refusal: on integrated graphics with the Auto policy the renderer itself applies the
        // High performance preset (and its explicit 30 cap) at every boot, his included.
        report.notes.push(`${k}: his file says ${ownerSettings.video[k]}, the game booted it as ${bootVideo[k]} (the game's own integrated-graphics policy)`);
      }
      // The game moves some of these itself (the slow-frame posture, the Auto cap): that is his game too.
      if (report.config.video[k] !== bootVideo[k]) report.notes.push(`the game itself changed ${k}: ${bootVideo[k]} -> ${report.config.video[k]} before the fight`);
    }
    report.config.ownerSettings = 'copied';
  } else {
    report.config.ownerSettings = 'not found (game defaults)';
    report.notes.push('his settings file was not found; the game\'s default video settings were used');
  }

  // ---- the judged window: dense input, segments alternating his cap / cap lifted ----
  const vp = { w: WANT.w, h: WANT.h };
  const hand = createHand(cdp, vp);
  if (ROUTE === 'adventure') hand.setAim(() => ({ x: vp.w * 0.86, y: vp.h * 0.5 })); // fly one way: out across the sector edge
  hand.start();
  const setSeg = (seg, cap) => page.evaluate(([s, c]) => {
    const S = window.SF.state; const v = S.settings && S.settings.video;
    if (v && c != null) { v.frameCap = c; try { window.SF.bus.emit('settings:changed', { section: 'video', key: 'frameCap' }); } catch (_) {} }
    window.__sm.seg = s;
  }, [seg, cap]);
  const metrics = async () => {
    const m = await cdp.send('Performance.getMetrics').catch(() => null);
    const o = {}; for (const x of (m && m.metrics) || []) o[x.name] = x.value;
    return { at: o.Timestamp, task: o.TaskDuration, script: o.ScriptDuration, layout: o.LayoutDuration, style: o.RecalcStyleDuration };
  };
  await page.evaluate(() => { window.__SF_POSE_AGE__ && window.__SF_POSE_AGE__.reset(); try { window.SF.state.perfRuntime.setHitchAttributionEnabled(true); } catch (_) {} });
  const freezeBefore = await page.evaluate(() => (window.__SF_FREEZE_LOG__ || []).length).catch(() => 0);
  // ---- optional main-thread profile: started before the judged window (the start itself can hitch) ----
  const profSyncs = [];
  const profSync = async () => {
    // A named 12 ms spin at a known performance.now(): the samples that land in it tie the profiler's clock to the page's.
    // Through the debugger protocol directly: it is not subject to the page's script policy.
    const r = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(function ${SMOOTH_PROFILE_SYNC_FN}() { const a = performance.now(); let x = 0; while (performance.now() - a < 12) x += Math.sqrt(x + 1); return { a, b: performance.now() }; })()` }).catch(() => null);
    if (r && r.result && r.result.value) profSyncs.push(r.result.value);
  };
  let profiling = false;
  if (PROFILE) {
    try {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: PROFILE_INTERVAL_US });
      await cdp.send('Profiler.start');
      profiling = true;
      await sleep(400);
      await profSync();
      await sleep(200);
    } catch (e) { report.notes.push(`profile could not start: ${String(e).slice(0, 120)}`); }
  }
  const cpu0 = cpuTimes();
  await app.evaluate(({ app: a }) => a.getAppMetrics().length).catch(() => 0);
  const judgedEnd = Date.now() + SECONDS * 1000;
  // 'As he has it' is whatever the game holds when the fight starts (it may have set a cap itself).
  const ownerCap = Number.isFinite(report.config.video.frameCap) ? report.config.video.frameCap : 0;
  const segments = [];
  let pauseDone = false; let relaunches = 0; let notFlying = 0;
  const pauseAt = Date.now() + SECONDS * 1000 * 0.42;
  const playing = (async () => {
    let beat = 0;
    while (Date.now() < judgedEnd) {
      const phase = beat % 6;
      hand.down('KeyW');
      if (ROUTE !== 'adventure') {
        if (phase === 1 || phase === 2) hand.down('KeyA'); else hand.up('KeyA');
        if (phase === 3) hand.down('KeyD'); else hand.up('KeyD');
      }
      hand.trigger(phase !== 4);
      if (phase === 2) hand.tap(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'][Math.floor(beat / 6) % 5]);
      if (phase === 5 && ROUTE !== 'adventure') hand.releaseAll();
      beat++;
      await sleep(Math.min(1200, Math.max(0, judgedEnd - Date.now())));
      // One deliberate pause and resume (Esc, two seconds, Esc), like a player checking something.
      if (!pauseDone && Date.now() >= pauseAt && await isLive()) {
        pauseDone = true;
        hand.releaseAll();
        hand.tap('Escape');
        await sleep(2000);
        const paused = await page.evaluate(() => !(window.SF.state.timeScale > 0)).catch(() => false);
        report.pause = { paused };
        if (paused) {
          hand.tap('Escape');
          await sleep(700);
          if (!(await isLive())) await page.evaluate(PRESS_THROUGH_SCREENS).catch(() => {});
        }
      }
      // Take a level-up pick / next round / respawn if the run stopped on a screen.
      await page.evaluate(PRESS_THROUGH_SCREENS).catch(() => {});
      const mode = await page.evaluate(() => window.SF.state.mode).catch(() => 'flight');
      notFlying = mode === 'flight' || mode === 'loading' ? 0 : notFlying + 1;
      if (ROUTE === 'swarm' && notFlying >= 4) { notFlying = 0; relaunches++; await launchRoute().catch(() => {}); }
    }
    hand.releaseAll();
  })();
  if (TRACE) {
    report.__trace = [];
    cdp.on('Tracing.dataCollected', (ev) => { for (const e of ev.value || []) report.__trace.push(e); });
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: {
      includedCategories: ['__metadata', 'toplevel', 'devtools.timeline', 'v8', 'disabled-by-default-v8.gc', 'gpu', 'viz', 'blink.user_timing'],
      excludedCategories: ['*'] } }).catch((e) => console.log('tracing start', String(e)));
    // A named mark at a known page time ties the trace clock to the page clock.
    const mark = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "performance.mark('__smTraceSync').startTime" }).catch(() => null);
    report.__traceSyncPageMs = mark && mark.result ? Number(mark.result.value) : NaN;
  }
  let which = 0;
  while (Date.now() < judgedEnd) {
    const lifted = LIFT_CAP > 0 && which % 2 === 1;
    await setSeg(3, lifted ? LIFT_CAP : ownerCap); // settle: not judged
    await sleep(300);
    await setSeg(lifted ? 2 : 1, null);
    const m0 = await metrics();
    const segEnd = Math.min(judgedEnd, Date.now() + SEGMENT_S * 1000);
    await sleep(Math.max(0, segEnd - Date.now()));
    const m1 = await metrics();
    segments.push({ mode: lifted ? 'lift' : 'asis', m0, m1 });
    which++;
  }
  await setSeg(0, ownerCap);
  await playing;
  let cpuProfile = null;
  if (profiling) {
    await profSync();
    await sleep(100);
    try { cpuProfile = (await cdp.send('Profiler.stop')).profile; } catch (e) { report.notes.push(`profile could not stop: ${String(e).slice(0, 120)}`); }
    await cdp.send('Profiler.disable').catch(() => {});
  }
  const cpu1 = cpuTimes();
  const appCpu = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu && m.cpu.percentCPUUsage }))).catch(() => []);
  report.relaunches = relaunches;
  const age = await page.evaluate(() => (window.__SF_POSE_AGE__ ? window.__SF_POSE_AGE__.read() : null)).catch(() => null);
  const freezeAfter = await page.evaluate(() => JSON.parse(JSON.stringify(window.__SF_FREEZE_LOG__ || []))).catch(() => []);
  await page.screenshot({ path: join(OUT, 'end.png') }).catch(() => {});
  if (TRACE) {
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end').catch(() => {});
    await Promise.race([done, sleep(30000)]);
  }

  // ---- tail window: GPU time per pass (timer queries are OFF in his build, so never in the judged window) ----
  hand.down('KeyW'); hand.trigger(true);
  report.gpu = await page.evaluate(async () => {
    const g = window.SF.state.render.gpuTimers;
    if (!g || !g.setEnabled) return { status: 'unavailable' };
    try { g.reset && g.reset(); g.setEnabled(true); } catch (e) { return { status: String(e) }; }
    await new Promise((r) => setTimeout(r, 5000));
    const rep = g.getReport();
    try { g.setEnabled(false); } catch (_) {}
    const passes = {};
    for (const [k, v] of Object.entries(rep.passes || {})) if (v.samples > 0) passes[k] = { avg: +v.avg.toFixed(2), max: +v.max.toFixed(2), samples: v.samples };
    return { status: rep.status, passes };
  }).catch((e) => ({ status: String(e).slice(0, 120) }));
  if (CENSUS) {
    try {
      await page.evaluate(installSmoothCensus);
      await sleep(3500);
      const census = await page.evaluate(collectSmoothCensus);
      writeFileSync(join(OUT, 'census.json'), JSON.stringify(census, null, 1));
      writeFileSync(join(OUT, 'census.txt'), formatSmoothCensus(census, { title: `${ROUTE}${ROUTE === 'swarm' ? ` round ${ROUND}` : ''}` }));
      report.census = census ? { file: 'census.txt', drawsPerFrame: census.drawsPerFrame, materialChangesPerFrame: census.materialChangesPerFrame, programChangesPerFrame: census.programChangesPerFrame,
        uniformCallsPerFrame: census.uniformCallsPerFrame, bufferSubDataPerFrame: census.gl.bufferSubData || 0, sceneNodes: census.scene.nodes, visibleNodes: census.scene.visibleNodes } : null;
      console.log(`smooth probe census in ${join(OUT, 'census.txt')}`);
    } catch (e) { report.notes.push(`census failed: ${String(e).slice(0, 200)}`); }
  }
  hand.releaseAll(); hand.stop();

  // ---- collect ----
  const raw = await page.evaluate(() => {
    const R = window.__sm; R.on = false; clearInterval(R.timer);
    const n = R.n;
    return { n, t: Array.from(R.t.subarray(0, n)), tn: Array.from(R.tn.subarray(0, n)), scr: Array.from(R.scr.subarray(0, n)), pres: Array.from(R.pres.subarray(0, n)), flags: Array.from(R.flags.subarray(0, n)),
      cb: Array.from(R.cb.subarray(0, n)).map((x) => +x.toFixed(2)), rnd: Array.from(R.rnd.subarray(0, n)).map((x) => +x.toFixed(2)),
      ui: Array.from(R.ui.subarray(0, n)).map((x) => +x.toFixed(2)), sim: Array.from(R.sim.subarray(0, n)), callsMax: R.callsMax, loaf: R.loaf, loafOk: R.loafOk, tasks: R.tasks, samples: R.samples };
  });
  report.end = await page.evaluate(() => {
    const g = window.SF.simLaneDiag(); const S = window.SF.state;
    return { clock: g.workerClockLastDiagnostics ? { perfWindow: g.workerClockLastDiagnostics.perfWindow, staleAckRecoveries: g.workerClockLastDiagnostics.staleAckRecoveries } : null,
      maxApplyMs: g.workerApplyMaxMs, dynResScale: S.render.dynResScale ?? null, frameCap: S.render.frameCap,
      canvas: S.render.renderer && S.render.renderer.domElement ? [S.render.renderer.domElement.width, S.render.renderer.domElement.height] : null };
  }).catch(() => null);

  // ---- is this the fight it claims to be? ----
  const judgedSamples = raw.samples.filter((s) => s.seg === 1 || s.seg === 2);
  const rich = judgedSamples.filter((s) => s.ships !== undefined);
  report.fight = {
    wave: [Math.min(...rich.map((s) => s.wave ?? Infinity)), Math.max(...rich.map((s) => s.wave ?? -Infinity))],
    arenas: [...new Set(rich.map((s) => s.arena).filter(Boolean))], sectors: [...new Set(rich.map((s) => s.sector).filter(Boolean))],
    shipsMedian: pct(rich.map((s) => s.ships), 0.5), shipsMax: Math.max(0, ...rich.map((s) => s.ships || 0)),
    entsMedian: pct(rich.map((s) => s.ents), 0.5), drawCallsMedian: pct(rich.map((s) => s.calls).filter((c) => c > 0), 0.5) || raw.callsMax, drawCallsMax: raw.callsMax,
    liveFraction: (() => { let a = 0; let b = 0; for (let i = 1; i < raw.n; i++) { const sg = (raw.flags[i] >> 1) & 3; if (sg !== 1 && sg !== 2) continue; const d = raw.t[i] - raw.t[i - 1]; b += d; if (raw.flags[i] & 1) a += d; } return b > 0 ? +(a / b).toFixed(2) : 0; })(),
  };
  console.log('fight', JSON.stringify(report.fight));
  if (!(report.fight.drawCallsMax > 0 || report.fight.drawCallsMedian > 0)) fail('the scene drew nothing (0 draw calls): not a fight');
  if (report.fight.liveFraction < 0.5) fail(`the world was live only ${Math.round(report.fight.liveFraction * 100)} % of the judged window`);
  if (ROUTE === 'swarm') {
    const wantArena = report.launch.arenaId;
    if (!report.fight.arenas.includes(wantArena)) fail(`arena is ${report.fight.arenas.join(',') || 'unknown'}, wanted ${wantArena}`);
    if (!(report.fight.wave[1] >= ROUND)) fail(`reached round ${report.fight.wave[1]}, wanted ${ROUND}`);
    if (!(report.fight.shipsMax >= 1)) fail('no enemy ship was ever alive');
  } else {
    if (!report.fight.sectors.includes(SECTOR)) fail(`sector is ${report.fight.sectors.join(',') || 'unknown'}, wanted ${SECTOR}`);
    report.fight.crossedBoundary = report.fight.sectors.length > 1;
  }

  // ---- presented frames ----
  const { t, pres, flags } = raw;
  const liveAt = new Uint8Array(raw.n);
  for (let i = 0; i < raw.n; i++) liveAt[i] = flags[i] & 1;
  // A non-live blink shorter than 250 ms (hit-stop) is still the live world.
  for (let i = 0; i < raw.n;) {
    if (liveAt[i]) { i++; continue; }
    let j = i; while (j < raw.n && !liveAt[j]) j++;
    if (i > 0 && j < raw.n && t[j] - t[i] < 250) for (let k = i; k < j; k++) liveAt[k] = 1;
    i = j;
  }
  const liveSpans = []; // [start, end] in page ms
  let becameLiveAt = -Infinity;
  const frames = []; // presented intervals
  let prev = -1;
  for (let i = 1; i < raw.n; i++) {
    if (liveAt[i] && !liveAt[i - 1]) { becameLiveAt = t[i]; liveSpans.push([t[i], t[i]]); }
    if (liveAt[i] && liveSpans.length) liveSpans.at(-1)[1] = t[i];
    if (i === 1 && liveAt[0]) liveSpans.push([t[0], t[1]]);
    if (pres[i] === pres[i - 1]) continue;
    if (prev >= 0) {
      const seg = (flags[i] >> 1) & 3;
      const a = liveAt[prev]; const b = liveAt[i];
      if ((a || b) && (seg === 1 || seg === 2)) {
        const edge = !(a && b);
        const kind = edge || t[i] - becameLiveAt < TRANSITION_S * 1000 ? 'transition' : 'steady';
        // A frame that straddles a pause: the game may stop presenting while paused, so the present
        // interval would count the whole pause. Use the longest gap between animation callbacks instead.
        let ms = t[i] - t[prev];
        if (edge) { ms = 0; for (let k = prev + 1; k <= i; k++) ms = Math.max(ms, t[k] - t[k - 1]); }
        frames.push({ at: +t[prev].toFixed(1), ms: +ms.toFixed(2), mode: seg === 2 ? 'lift' : 'asis', kind, cb: raw.cb[i], i0: prev, i1: i });
      }
    }
    prev = i;
  }
  const inLive = (ms) => liveSpans.some(([a, b]) => ms >= a - 20 && ms <= b + 20);
  // ---- owners: the long animation frame under each long presented frame ----
  const ownerOf = (f) => {
    const a = f.at; const b = f.at + f.ms;
    let best = null; let bestOv = 0;
    for (const L of raw.loaf) {
      const ov = Math.min(b, L.at + L.ms) - Math.max(a, L.at);
      if (ov > bestOv) { bestOv = ov; best = L; }
    }
    if (!best || bestOv < Math.min(25, f.ms * 0.25)) {
      return { kind: 'outside JavaScript', what: 'main thread idle: GPU, compositor or the operating system held the frame' };
    }
    const scriptMs = best.scripts.reduce((s, x) => s + x.ms, 0);
    const forced = best.scripts.reduce((s, x) => s + x.forcedLayoutMs, 0);
    const top = best.scripts[0];
    const name = top ? `${top.fn || top.invoker} ${top.url}`.trim() : '';
    const second = best.scripts[1] ? `; then ${best.scripts[1].fn || best.scripts[1].invoker} ${best.scripts[1].url} ${Math.round(best.scripts[1].ms)} ms` : '';
    const rest = best.ms - scriptMs - best.layoutMs;
    let kind = 'script';
    if (forced >= best.ms * 0.3) kind = 'forced layout';
    else if (best.layoutMs >= best.ms * 0.4) kind = 'style and layout';
    else if (rest >= best.ms * 0.5) kind = 'outside JavaScript inside the frame (collector, GPU call or compositor)';
    return { kind, what: `${name} ${top ? Math.round(top.ms) + ' ms' : ''}${second}`.trim(), loafMs: best.ms, scriptMs: +scriptMs.toFixed(0),
      forcedLayoutMs: +forced.toFixed(0), layoutMs: +best.layoutMs.toFixed(0) };
  };
  const stats = (rows) => {
    const ms = rows.map((f) => f.ms);
    const total = ms.reduce((s, v) => s + v, 0);
    return { frames: rows.length, seconds: +(total / 1000).toFixed(1), fps: total > 0 ? +(rows.length / (total / 1000)).toFixed(1) : null,
      p50: pct(ms, 0.5), p95: pct(ms, 0.95), p99: pct(ms, 0.99), max: ms.length ? +Math.max(...ms).toFixed(1) : null,
      over50: ms.filter((v) => v > 50).length, over100: ms.filter((v) => v > 100).length,
      cbP50: pct(rows.map((f) => f.cb), 0.5), cbP95: pct(rows.map((f) => f.cb), 0.95) };
  };
  report.modes = {};
  for (const mode of ['asis', 'lift']) {
    const rows = frames.filter((f) => f.mode === mode);
    if (!rows.length) continue;
    const segs = segments.filter((s) => s.mode === mode && s.m0.at && s.m1.at);
    const wall = segs.reduce((s, x) => s + (x.m1.at - x.m0.at), 0);
    const sum = (k) => segs.reduce((s, x) => s + (x.m1[k] - x.m0[k]), 0);
    const hitches = rows.filter((f) => f.ms > 50).sort((x, y) => y.ms - x.ms).map((f) => ({ ...f, owner: ownerOf(f) }));
    report.modes[mode] = {
      all: stats(rows), steady: stats(rows.filter((f) => f.kind === 'steady')), transitions: stats(rows.filter((f) => f.kind === 'transition')),
      busy: wall > 0 ? { fraction: +(sum('task') / wall).toFixed(3), script: +(sum('script') / wall).toFixed(3), layoutAndStyle: +((sum('layout') + sum('style')) / wall).toFixed(3) } : null,
      hitches,
    };
  }
  // The cap the game itself chose while left alone.
  {
    const caps = {};
    for (const s of raw.samples) if (s.seg === 1 && s.live) caps[s.cap] = (caps[s.cap] || 0) + 1;
    const total = Object.values(caps).reduce((a, b) => a + b, 0);
    report.capChosen = Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, +(v / Math.max(1, total)).toFixed(2)]));
  }
  // ---- main-thread long tasks while the world was live ----
  {
    const judged = (ms) => raw.samples.some((s) => (s.seg === 1 || s.seg === 2) && Math.abs(s.t - ms) < 400);
    const liveTasks = raw.tasks.filter(([at]) => inLive(at) && judged(at)).sort((a, b) => b[1] - a[1]);
    report.longTasks = { over50: liveTasks.length, longestMs: liveTasks.length ? liveTasks[0][1] : 0,
      top: liveTasks.slice(0, 8).map(([at, ms]) => ({ at, ms, owner: ownerOf({ at, ms }) })) };
    const holes = [];
    for (let i = 1; i < raw.samples.length; i++) {
      const gap = raw.samples[i].t - raw.samples[i - 1].t;
      if (gap > 150 && (raw.samples[i].seg === 1 || raw.samples[i].seg === 2)) holes.push({ at: +raw.samples[i - 1].t.toFixed(0), ms: +gap.toFixed(0), liveBefore: raw.samples[i - 1].live, liveAfter: raw.samples[i].live });
    }
    report.timerHoles = holes.sort((a, b) => b.ms - a.ms).slice(0, 12);
  }
  // ---- world speed and worker step ----
  {
    // From the per-frame record (simulation time as the main thread holds it): the 20 Hz timer
    // starves for seconds when the main thread is saturated, the animation callback does not.
    const acc = [{ w: 0, sim: 0 }]; let w = 0; let sim = 0;
    const ok = (k) => liveAt[k] && (((flags[k] >> 1) & 3) === 1 || ((flags[k] >> 1) & 3) === 2);
    for (let k = 1; k < raw.n; k++) {
      if (!ok(k - 1) || !ok(k)) continue;
      const dt = (t[k] - t[k - 1]) / 1000; const ds = raw.sim[k] - raw.sim[k - 1];
      // The main thread receives simulation time in bursts (a reply can carry many steps), so a
      // jump is real time catching up, not an error: only a reset (negative) or a relaunch is dropped.
      if (!(dt > 0) || dt > 3 || ds < 0 || ds > 8) continue;
      w += dt; sim += ds; acc.push({ w, sim });
    }
    let worst = null;
    if (w >= 20) {
      for (let i = 0; i < acc.length; i += 5) {
        const j = acc.findIndex((d, k) => k > i && d.w - acc[i].w >= 10);
        if (j < 0) break;
        const v = (acc[j].sim - acc[i].sim) / (acc[j].w - acc[i].w);
        if (worst == null || v < worst) worst = v;
      }
    }
    const windows = new Map();
    for (const s of judgedSamples) if (s.pw != null && s.stepP50 != null) windows.set(s.pw, s);
    const ws = [...windows.values()];
    report.world = { speed: w > 0 ? +(sim / w).toFixed(3) : null, worst10s: worst == null ? null : +worst.toFixed(3), liveSeconds: +w.toFixed(1) };
    report.worker = { windows: ws.length, stepP50: pct(ws.map((s) => s.stepP50), 0.5), stepP95: ws.length ? +Math.max(...ws.map((s) => s.stepP95)).toFixed(1) : null,
      workP50: pct(ws.map((s) => s.workP50), 0.5), workP95: ws.length ? +Math.max(...ws.map((s) => s.workP95)).toFixed(1) : null };
  }
  report.freeze = { logEntries: Math.max(0, freezeAfter.length - freezeBefore), episodes: freezeAfter.slice(freezeBefore),
    dataAgeMaxMs: age ? age.worstDataAgeMs : null, silentHoldMs: age ? age.worstSilentHoldMs : null,
    netPoseAgeMs: age ? age.worstNetPoseAgeMs : null, uncoveredStopMs: age ? age.worstUncoveredDataAgeMs : null };
  // ---- how busy was the machine with other things ----
  {
    const total = cpu1.total - cpu0.total; const idle = cpu1.idle - cpu0.idle;
    const game = appCpu.reduce((s, m) => s + (Number(m.cpu) || 0), 0);
    const cores = os.cpus().length;
    // Electron reports each process as a share of the WHOLE machine (all cores = 100).
    report.machine = { cores, busyFraction: total > 0 ? +(1 - idle / total).toFixed(3) : null, gameShareOfMachine: +(game / 100).toFixed(3),
      otherLoadFraction: total > 0 ? +Math.max(0, (1 - idle / total) - game / 100).toFixed(3) : null };
  }
  if (TRACE) {
    // Main-thread tasks over 50 ms: wall time against thread CPU time (a large gap = descheduled or blocked, not working).
    const ev = report.__trace; delete report.__trace;
    const names = new Map();
    for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args && e.args.name);
    const main = [...names.entries()].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
    const xs = ev.filter((e) => e.ph === 'X' && e.dur > 0);
    const byMain = main.map((k) => [k, xs.filter((e) => `${e.pid}:${e.tid}` === k).length]).sort((a, b) => b[1] - a[1])[0];
    if (byMain) {
      const mine = xs.filter((e) => `${e.pid}:${e.tid}` === byMain[0]);
      const tops = mine.filter((e) => /RunTask/.test(e.name) && e.dur > 50000).sort((a, b) => b.dur - a.dur).slice(0, 15);
      report.traceLongTasks = tops.map((tk) => {
        const end = tk.ts + tk.dur;
        const kids = mine.filter((e) => e !== tk && e.ts >= tk.ts && e.ts + e.dur <= end + 1 && e.dur > 8000 && !/RunTask/.test(e.name))
          .sort((a, b) => b.dur - a.dur).slice(0, 8).map((e) => {
            const d = (e.args && e.args.data) || {};
            const where = d.functionName ? `${d.functionName} ${String(d.url || '').replace(/^.*\/(src|scripts)\//, '$1/')}:${d.lineNumber}` : (d.type || '');
            return `${e.name}${where ? `(${where})` : ''} ${(e.dur / 1000).toFixed(0)}ms${e.tdur != null ? ` cpu ${(e.tdur / 1000).toFixed(0)}` : ''}`;
          });
        return { wallMs: +(tk.dur / 1000).toFixed(0), cpuMs: tk.tdur != null ? +(tk.tdur / 1000).toFixed(0) : null, parts: kids };
      });
    }
    // What the browser does around the game's JavaScript, per presented frame, live world only.
    try {
      const sync = ev.find((e) => e.name === '__smTraceSync' && Number.isFinite(e.ts));
      const tb = summarizeSmoothTrace({ events: ev, syncTs: sync ? sync.ts : NaN, syncPageMs: report.__traceSyncPageMs, ticks: { tn: raw.tn, flags }, liveAt, frames });
      writeFileSync(join(OUT, 'trace-breakdown.txt'), formatSmoothTrace(tb, { title: `${ROUTE}${ROUTE === 'swarm' ? ` round ${ROUND}` : ''}, ${SECONDS} s` }));
      report.traceBreakdown = tb.ok ? { ok: true, file: 'trace-breakdown.txt', threads: tb.threads.map((t) => ({ thread: t.thread, busyMsPerFrame: t.busyMsPerFrame, self: t.self.slice(0, 12) })) } : { ok: false, why: tb.why };
      console.log(tb.ok ? `smooth probe trace breakdown in ${join(OUT, 'trace-breakdown.txt')}` : `smooth probe trace breakdown NOT MADE: ${tb.why}`);
    } catch (e) { report.notes.push(`trace breakdown failed: ${String(e).slice(0, 160)}`); }
    delete report.__traceSyncPageMs;
    report.traced = true;
    writeFileSync(join(OUT, 'trace.json'), JSON.stringify(ev));
  }
  // The game's own ten-second frame-rate lines for this run (what the owner's next launch will log):
  // a cross-check of the recorder against this probe's measurement.
  try {
    report.gameFrameRateLog = readFileSync(join(launch.userDataDir, 'frame-rate-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => JSON.parse(l)).filter((r) => r.fps != null).map((r) => ({ fps: r.fps, p50: r.p50, p95: r.p95, worst: r.worst, world: r.world, cap: r.cap }));
  } catch (_) { report.gameFrameRateLog = null; }
  if (PROFILE) {
    // ---- per-function tables, live world only, ms per presented frame ----
    let prof = { ok: false, why: 'the profiler returned nothing' };
    if (cpuProfile) {
      try {
        prof = summarizeSmoothProfile({ profile: cpuProfile, syncs: profSyncs, ticks: { tn: raw.tn, flags, scr: raw.scr }, liveAt, frames,
          refreshMs: 1000 / (Number(report.config.displayHz) || 60) });
      } catch (e) { prof = { ok: false, why: String((e && e.stack) || e).slice(0, 300) }; }
      try { writeFileSync(join(OUT, 'main.cpuprofile'), JSON.stringify(cpuProfile)); } catch (_) { /* evidence only */ }
    }
    const title = `${ROUTE}${ROUTE === 'swarm' ? ` round ${ROUND}` : ''}, ${SECONDS} s, sampled every ${PROFILE_INTERVAL_US} us`;
    writeFileSync(join(OUT, 'profile.json'), JSON.stringify(prof, null, 1));
    writeFileSync(join(OUT, 'profile.txt'), formatSmoothProfile(prof, { title }));
    report.profiled = true;
    report.profile = prof.ok ? { ok: true, file: 'profile.txt', clock: prof.clock, buckets: prof.buckets, entryPoints: prof.entryPoints.slice(0, 8), byFile: prof.byFile.slice(0, 14), self: prof.self.slice(0, 30) } : { ok: false, why: prof.why };
    console.log(prof.ok ? `smooth probe profile: ${prof.buckets.all.frames} live frames, busy ${prof.buckets.all.busyMs} of ${prof.buckets.all.intervalMs} ms per frame (idle ${prof.buckets.all.idleMs}); tables in ${join(OUT, 'profile.txt')}` : `smooth probe profile NOT MADE: ${prof.why}`);
  }
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify(frames));
  writeFileSync(join(OUT, 'loaf.json'), JSON.stringify({ ok: raw.loafOk, frames: raw.loaf, tasks: raw.tasks }));
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(raw.samples));
  report.ok = true;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  for (const [mode, m] of Object.entries(report.modes)) {
    console.log(`smooth probe ${mode === 'asis' ? 'as he has it' : `cap lifted to ${LIFT_CAP}`}: ${m.all.fps} fps, frame p50 ${m.all.p50} p95 ${m.all.p95} p99 ${m.all.p99} max ${m.all.max} ms, >50 ms x${m.all.over50}, >100 ms x${m.all.over100}, callback p50 ${m.all.cbP50} p95 ${m.all.cbP95}, busy ${m.busy && m.busy.fraction}`);
  }
  console.log(`smooth probe world x${report.world.speed} (worst 10 s ${report.world.worst10s}), worker step p50 ${report.worker.stepP50} p95 ${report.worker.stepP95}, longest task ${report.longTasks.longestMs} ms, freeze log ${report.freeze.logEntries}, load ${report.loadS} s, page errors ${report.errors.length}`);
} catch (e) {
  console.log(e && e.smoothAssert ? `PROBE REFUSED: ${e.message}` : `PROBE FAILED ${String((e && e.stack) || e).slice(0, 800)}`);
  report.ok = false;
  report.failed = String((e && e.message) || e);
  delete report.__trace; delete report.__traceSyncPageMs;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  process.exitCode = 2;
} finally {
  try { if (app) await app.close(); } catch { /* already gone */ }
  try { launch.cleanup({ runtimeClosed: true }); } catch { /* profile cleanup best-effort */ }
}
