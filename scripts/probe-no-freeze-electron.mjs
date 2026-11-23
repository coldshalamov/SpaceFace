// NO-FREEZE probe (owner bug 2026-11-21): the DESKTOP build, driven the way a hand drives it, and
// forced stalls produced on demand. It measures what the player sees, not simulation counters:
//   presented-pose age  — how long since the drawn pose of the player's ship / moving bodies last
//                         changed while unpaused and moving (src/render/poseAgeRecorder.js);
//   data age            — how old the newest simulation sample behind the frame is;
//   frame gap           — the longest presented-frame interval (a main-thread hitch);
//   world speed         — simulation seconds per wall second over every 10 s window;
//   freeze log          — the lane's own recorder (window.__SF_FREEZE_LOG__).
//
// Input is dispatched through the Chrome DevTools protocol directly (Input.dispatchMouseEvent /
// dispatchKeyEvent): the mouse moves continuously at ~125 Hz, held keys auto-repeat at ~30 Hz like
// an operating system, the trigger is held, and powers are pressed.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-no-freeze-electron.mjs \
//     [--route=swarm|adventure] [--seconds=180] [--forced] [--legacy] [--round=3] [--out=<dir>]
//
// --legacy turns the 2026-11-21 fix off in the same build (localStorage sf.laneLegacy=1: the old
// stop-and-wait worker clock, no shared pose table) so before/after can be measured in one minute.
// Writes <out>/report.json and prints one table row per phase. Exit code 0; the gate judges.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
const require_ = () => nodeModule;
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROUTE = String(argv.route || 'swarm');
const SECONDS = Number(argv.seconds || 180);
const FORCED = argv.forced === true || argv.forced === '1';
const LEGACY = argv.legacy === true || argv.legacy === '1';
const ROUND = Number(argv.round || 3);
// Real-device conditions (owner, 2026-11-21: "maybe it has something to do with the physical keyboard"):
//   --pad=noisy|quiet   navigator.getGamepads reports a connected pad (drifting axes, or perfectly still)
//   --real-profile      the player's own settings profile and saves, COPIED read-only into this isolated
//                       profile's storage (the real store is never opened for writing)
//   --visible           a normal activated window; default is a never-activated window (showInactive)
const PAD = argv.pad ? String(argv.pad) : null;
const REAL_PROFILE = argv['real-profile'] === true;
const VISIBLE = argv.visible === true;
const PROFILE = argv.profile === true;
// --ab=detail [--ab-seg=30] [--ab-rounds=4]: interleaved A/B segments inside one dense run.
const AB = argv.ab ? String(argv.ab) : null;
const AB_SEG_S = Number(argv['ab-seg'] || 30);
const AB_ROUNDS = Number(argv['ab-rounds'] || 4);
// --alloc: garbage-collector trace (every isolate) and a heap-sampling profile of the SIM WORKER.
const ALLOC = argv.alloc === true;
// --gctrace: a DevTools performance trace (v8 GC categories) over the dense phase; every minor and
// major collection on the sim worker's thread is counted with its length and time.
const GCTRACE = argv.gctrace === true;
// --cpuprof: a sampling CPU profile of the SIM WORKER; the ten longest busy stretches (worst steps)
// are listed with the functions that own their time (self and inclusive).
const CPUPROF = argv.cpuprof === true || argv.worst === true;
// --worst: per-directive markers + DevTools trace + worker CPU profile; names the ten worst
// directives with the compile/deopt, collector and function time inside each.
const WORST = argv.worst === true;
// --semi=<MB> / --old=<MB>: heap-shape experiment for every isolate (launcher js-flags override).
const SEMI_MB = argv.semi ? String(argv.semi) : null;
const OLD_MB = argv.old ? String(argv.old) : null;
const OUT = resolve(ROOT, String(argv.out || `.devshots/no-freeze/${ROUTE}${LEGACY ? '-legacy' : ''}`));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { createIsolatedElectronLaunch } = await import('./lib/electronTestIsolation.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { installCspSafePlaywrightPolling } = await import('./lib/playwrightCspPolling.mjs');
const { installFirstLightPromptHandler } = await import('./player-truth/routes.mjs');
const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: `no-freeze-${ROUTE}`, timeout: 180000, baseEnv: {
  ...process.env,
  // Never steal focus from what the owner is watching: shown inactive, never activated, and kept
  // un-throttled so it renders and measures like a foreground window.
  ...(VISIBLE ? {} : { SPACEFACE_EVIDENCE_SHOW_INACTIVE: '1', SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' }),
  ...(ALLOC ? { SPACEFACE_EVIDENCE_TRACE_GC: '1', ELECTRON_ENABLE_LOGGING: '1' } : {}),
  ...(SEMI_MB ? { SPACEFACE_SEMI_SPACE_MB: SEMI_MB } : {}),
  ...(OLD_MB ? { SPACEFACE_EVIDENCE_OLD_SPACE_MB: OLD_MB } : {}),
} });
function readPlayerProfilePairs() {
  const { createRequire } = require_();
  const req = createRequire(import.meta.url);
  const { resolvePlayerSaveDir } = req('./lib/playerSaveStore.cjs');
  const dir = resolvePlayerSaveDir(process.env);
  const pairs = {};
  for (const file of readdirSync(dir)) {
    if (!file.startsWith('sf.') || !file.endsWith('.json')) continue;
    pairs[file.slice(0, -'.json'.length)] = readFileSync(join(dir, file), 'utf8');
  }
  return { dir, pairs };
}

const report = { route: ROUTE, seconds: SECONDS, forced: FORCED, legacy: LEGACY, pad: PAD, realProfile: REAL_PROFILE, visible: VISIBLE, errors: [], phases: [], rows: [] };
let app = null;

// ---- the hand: CDP input (shared with the smoothness probe) ----
const { createHand } = await import('./lib/playHand.mjs');

try {
  app = await electron.launch(launch.options);
  const gcLines = [];
  if (ALLOC) {
    const t0gc = Date.now();
    const onOut = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (/ ms: (Scavenge|Mark-Compact|Mark-Sweep|Minor)/.test(line)) gcLines.push([Date.now() - t0gc, line]);
      }
    };
    try { app.process().stdout.on('data', onOut); app.process().stderr.on('data', onOut); } catch (_) { /* no stdio */ }
  }
  const page = await app.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await installFirstLightPromptHandler(page, () => {});
  page.on('pageerror', (e) => { if (report.errors.length < 30) report.errors.push(String(e.message || e).slice(0, 300)); });
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  // A/B switch and first-run state live in this isolated profile's storage; reload to apply.
  if (REAL_PROFILE) {
    const prof = readPlayerProfilePairs();
    report.realProfileKeys = Object.keys(prof.pairs);
    await page.evaluate((pairs) => { for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v); }, prof.pairs);
    console.log('real profile copied (read-only) from', prof.dir, Object.keys(prof.pairs).join(','));
  }
  await page.evaluate(([legacy, profile, worst]) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      if (legacy) sessionStorage.setItem('sf.laneLegacy', '1'); else sessionStorage.removeItem('sf.laneLegacy');
      if (worst) sessionStorage.setItem('sf.directiveMarks', '1'); else sessionStorage.removeItem('sf.directiveMarks');
      // The per-system profiler times every system call; it costs step time, so it is opt-in
      // (--profile) and never on in the gate's world-speed measurement.
      if (profile) localStorage.setItem('sf.simProfile', '1'); else localStorage.removeItem('sf.simProfile');
    } catch { /* storage gated */ }
  }, [LEGACY, PROFILE, WORST]);
  {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  }
  await page.waitForFunction(() => typeof window.SF.simLaneDiag === 'function', null, { timeout: 240000 })
    .catch(async () => { console.log('no simLaneDiag', await page.evaluate(() => Object.keys(window.SF || {}).join(','))); });
  const cdp0 = await page.context().newCDPSession(page);
  // The window is never activated; tell the page it has focus, as a player's window does.
  await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  if (PAD) {
    await page.evaluate((mode) => {
      let t = 0;
      const pad = () => ({
        id: 'Probe HID pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
        axes: [0, 1, 2, 3].map(() => (mode === 'noisy' ? (Math.random() - 0.5) * 0.06 : 0)),
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      });
      navigator.getGamepads = () => { t++; return [pad(), null, null, null]; };
      try { window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad() })); } catch (_) {}
      window.__padCalls = () => t;
    }, PAD);
  }
  report.realm = await page.evaluate(() => ({
    coi: globalThis.crossOriginIsolated === true, sab: typeof SharedArrayBuffer === 'function',
    ua: navigator.userAgent.slice(0, 90), w: innerWidth, h: innerHeight,
    dpr: globalThis.devicePixelRatio || 1,
  }));
  // Which sim worker artifact this run executes: the player's launch serves ONE bundled file
  // (digest header present); isolated probes serve loose source modules unless
  // SPACEFACE_EVIDENCE_PLAYER_WORKER_BUNDLE=1 asks for the player's artifact.
  report.realm.workerBundleDigest = await page.evaluate(async () => {
    try {
      const res = await fetch('/src/core/wholeSimBrowserWorker.js', { method: 'HEAD', cache: 'no-store' });
      return res.headers.get('X-SpaceFace-Dev-Sim-Worker-Digest') || null;
    } catch (_) { return null; }
  }).catch(() => null);
  console.log('realm', JSON.stringify(report.realm));

  // ---- reach flight on the ordinary route's own launch seams (Electron forbids query strings) ----
  const launchSwarm = async () => {
    return page.evaluate(async (round) => {
      const { swarmStartAtRound, swarmArcadeSeedFor } = await import('/src/data/swarmLadder.js');
      const L = await import('/src/ui/crucibleLaunch.js');
      const { SWARM_RULESET } = await import('/src/data/swarmMode.js');
      const start = swarmStartAtRound(String(round));
      const arenaId = L.CRUCIBLE_ARENA_ID;
      const setup = L.crucibleSetupFor({ starterId: L.CRUCIBLE_DEFAULT_STARTER_ID,
        seed: swarmArcadeSeedFor(arenaId) || L.freshSeed(), arenaId, ruleset: SWARM_RULESET, startWave: start.startWave });
      if (!setup.ok) return { ok: false, issues: (setup.issues || []).map((i) => i.message) };
      const access = window.SF.state.settings && window.SF.state.settings.accessibility;
      if (access) access.firstLightOffered = true;
      L.requestCrucibleRun(window.SF.bus, setup, SWARM_RULESET);
      return { ok: true, wave: start.startWave };
    }, ROUND).catch((e) => ({ ok: false, error: String(e).slice(0, 200) }));
  };

  const t0 = Date.now();
  if (ROUTE === 'swarm') {
    await page.waitForFunction(() => {
      const ui = window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
      const m = ui && (ui.screenManager || ui.manager);
      return !!(m && typeof m.hasScreen === 'function' && m.hasScreen('crucibleDraft'));
    }, null, { timeout: 120000 }).catch(() => {});
    const launched = await launchSwarm();
    console.log('swarm launch', JSON.stringify(launched));
  } else if (REAL_PROFILE) {
    // The player's own campaign: press Continue on the title like he does.
    const ok = await page.getByRole('button', { name: /^Continue/i }).first().click({ timeout: 60000 }).then(() => true).catch(() => false);
    console.log('continue pressed', ok);
    if (!ok) await page.evaluate(() => window.SF.bus.emit('game:new', { seed: 4242 })).catch(() => {});
  } else {
    await page.evaluate(() => window.SF.bus.emit('game:new', { seed: 4242 })).catch(() => {});
  }
  for (;;) {
    const st = await page.evaluate(() => {
      const s = window.SF.state;
      return { flight: s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt) && s.timeScale > 0, mode: s.mode };
    }).catch(() => ({}));
    if (st.flight) break;
    await page.evaluate(() => {
      const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
        && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run|Begin|Undock|Skip)/i.test(n(x.textContent)));
      if (b) b.click();
    }).catch(() => {});
    if (Date.now() - t0 > 300000) {
      await page.screenshot({ path: join(OUT, 'no-flight.png') }).catch(() => {});
      throw new Error(`no flight (mode ${st.mode})`);
    }
    await sleep(1000);
  }
  report.loadS = +((Date.now() - t0) / 1000).toFixed(1);
  await page.evaluate(() => { try { window.SF.state.perfRuntime.setHitchAttributionEnabled(true); } catch (_) {} }).catch(() => {});
  await sleep(3000);
  report.lane0 = await page.evaluate(() => {
    const g = window.SF.simLaneDiag();
    return { poseTable: g.poseTable, sabEnvelope: g.sabEnvelopeActive, clockOwner: g.clockOwner };
  }).catch(() => null);
  console.log('lane', JSON.stringify(report.lane0));

  await page.evaluate(() => { window.__SF_LIFE_FORENSICS__ = []; window.__SF_PACK_ARRIVALS__ = []; });
  // ---- in-page sampler: 20 Hz, so a stalled probe process cannot hide a stall in the game ----
  await page.evaluate(() => {
    const w = { samples: [], phase: 'boot' };
    window.__nf = w;
    w.timer = setInterval(() => {
      const s = window.SF.state;
      let g = null; try { g = window.SF.simLaneDiag(); } catch (_) {}
      const pt = g && g.poseTable;
      const c = (g && g.workerClockLastDiagnostics) || {};
      const sim = pt && pt.active ? pt.simTime : s.simTime;
      w.samples.push({
        t: performance.now(), ph: w.phase, mode: s.mode, ts: s.timeScale, docked: !!(s.ui && s.ui.docked),
        sim, replySim: s.simTime, ents: s.entities && s.entities.size,
        unacked: c.unacked ?? null, bp: c.backpressured === true, stale: c.staleAckRecoveries ?? null,
        workP95: c.perfWindow ? c.perfWindow.workMsP95 : null, dil: c.dilation ?? null,
        held: g ? g.heldReplies : 0,
        wSeq: pt ? pt.workerReplySequence : null, mSeq: pt ? pt.mainReceivedSequence : null, wUnacked: pt ? pt.workerUnacked : null, wRet: pt ? pt.workerRetained : null, tick: pt ? pt.tick : null, wSim: pt ? pt.simTime : null, wWall: pt ? pt.workerWallMs : null,
      });
    }, 50);
  });
  const vp = { w: report.realm.w || 1280, h: report.realm.h || 720 };
  const cdp = cdp0;
  // ---- sim-worker heap sampling over CDP (child-target session, non-flattened) ----
  const workerCdp = { sessionId: null, nextId: 1, pending: new Map() };
  const workerSend = (method, params = {}) => new Promise((resolve, reject) => {
    if (!workerCdp.sessionId) { reject(new Error('no worker session')); return; }
    const id = workerCdp.nextId++;
    workerCdp.pending.set(id, { resolve, reject });
    cdp.send('Target.sendMessageToTarget', { sessionId: workerCdp.sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
  });
  if (ALLOC || CPUPROF) {
    cdp.on('Target.receivedMessageFromTarget', (ev) => {
      if (ev.sessionId !== workerCdp.sessionId) return;
      let msg = null;
      try { msg = JSON.parse(ev.message); } catch (_) { return; }
      const w = msg && workerCdp.pending.get(msg.id);
      if (!w) return;
      workerCdp.pending.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message)); else w.resolve(msg.result);
    });
    const attached = new Promise((resolve) => {
      cdp.on('Target.attachedToTarget', (ev) => {
        const info = ev.targetInfo || {};
        if (info.type === 'worker' && /wholeSimBrowserWorker|simLane/i.test(info.url || '')) {
          workerCdp.sessionId = ev.sessionId;
          resolve(info.url);
        }
      });
    });
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false })
      .catch((e) => console.log('autoattach', String(e)));
    const url = await Promise.race([attached, new Promise((r) => setTimeout(() => r(null), 5000))]);
    console.log('sim worker attached', url);
    if (workerCdp.sessionId && CPUPROF) {
      await workerSend('Profiler.enable').catch((e) => console.log('profiler enable', String(e)));
      await workerSend('Profiler.setSamplingInterval', { interval: 250 }).catch(() => {});
      await workerSend('Profiler.start').catch((e) => console.log('profiler start', String(e)));
    }
    if (workerCdp.sessionId && ALLOC) {
      await workerSend('HeapProfiler.enable').catch((e) => console.log('heap enable', String(e)));
      await workerSend('HeapProfiler.startSampling', { samplingInterval: 16384,
        includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
        .catch((e) => console.log('sampling', String(e)));
      report.allocStart = { atMs: Date.now(), ticks: await page.evaluate(() => window.SF.simLaneDiag().poseTable.tick).catch(() => null) };
    }
  }
  // Long animation frames (Chromium LoAF): every main-thread frame over 150 ms with the scripts
  // that ran inside it (invoker, function, file) and its render/layout share — the owners of the
  // frame gaps, without a trace.
  await page.evaluate(() => {
    window.__nfLoaf = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration < 150) continue;
          const end = e.startTime + e.duration;
          window.__nfLoaf.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0),
            renderMs: e.renderStart ? Math.round(end - e.renderStart) : 0,
            layoutMs: e.styleAndLayoutStart ? Math.round(end - e.styleAndLayoutStart) : 0,
            scripts: (e.scripts || []).map((x) => ({ ms: Math.round(x.duration), invoker: x.invoker, type: x.invokerType,
              fn: x.sourceFunctionName || '', url: String(x.sourceURL || '').replace(/^.*\/(src|scripts|vendor)\//, '$1/'),
              at: x.sourceCharPosition, forcedLayoutMs: Math.round(x.forcedStyleAndLayoutDuration || 0) }))
              .sort((a, b) => b.ms - a.ms).slice(0, 6) });
          if (window.__nfLoaf.length > 400) window.__nfLoaf.shift();
        }
      }).observe({ type: 'long-animation-frame', buffered: false });
      window.__nfLoafOk = true;
    } catch (err) { window.__nfLoafOk = String(err); }
  });
  // --worst: a sampling CPU profile of the page too, sliced later by the long frames.
  let pageProfStart = null;
  if (WORST) {
    await cdp.send('Profiler.enable').catch(() => {});
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 }).catch(() => {});
    await cdp.send('Profiler.start').catch((e) => console.log('page profiler start', String(e)));
    pageProfStart = await page.evaluate(() => performance.now()).catch(() => null);
  }
  const hand = createHand(cdp, vp);
  hand.start();
  const setPhase = (name) => page.evaluate((n) => { window.__nf.phase = n; window.__SF_POSE_AGE__ && window.__SF_POSE_AGE__.reset(); }, name);
  const readAge = () => page.evaluate(() => (window.__SF_POSE_AGE__ ? window.__SF_POSE_AGE__.read() : null));
  const force = (opts) => page.evaluate((o) => (window.__SF_LANE_FORCE__ ? window.__SF_LANE_FORCE__(o) : null), opts);

  // A busy hand: thrust + turn held (+ strafe), the trigger held, powers tapped, fingers lifted.
  let notFlying = 0;
  let loadingBeats = 0;
  const play = async (ms) => {
    const end = Date.now() + ms;
    let beat = 0;
    while (Date.now() < end) {
      const phase = beat % 6;
      hand.down('KeyW');
      if (phase === 1 || phase === 2) hand.down('KeyA'); else hand.up('KeyA');
      if (phase === 3) hand.down('KeyD'); else hand.up('KeyD');
      hand.trigger(phase !== 4);
      if (phase === 2) hand.tap(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'][Math.floor(beat / 6) % 5]);
      if (phase === 5) { hand.releaseAll(); } // fingers off the controls
      beat++;
      if (PROFILE && beat % 8 === 0) {
        const d = await page.evaluate(async () => { try { const r = await window.SF.laneRpc('probeState'); const q = r && (r.result || r); return q && q.physicsDiag; } catch (_) { return null; } }).catch(() => null);
        if (d && typeof d === 'object') (report.physicsSamples || (report.physicsSamples = [])).push({ bodies: d.bodies, dyn: d.dynamicCount, sleeping: d.sleepingCount, ccd: d.ccdBodies, colliders: d.colliders, syncMode: d.syncMode, syncDyn: d.syncDynamicEntities, syncFull: d.syncFullEntities });
      }
      await sleep(Math.min(1500, Math.max(0, end - Date.now())));
      // Respawn / next round / take a level-up pick if the run paused on a screen.
      await page.evaluate(() => {
        const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const take = [...document.querySelectorAll('#screens button, #screens [role="button"]')]
          .find((x) => x.offsetParent && !x.disabled && /TAKE$/i.test(n(x.textContent)));
        if (take) { take.click(); return; }
        const again = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
          && /^(Retry|Restart|Run it again|Run again|Play again|New run|Try again)/i.test(n(x.textContent)));
        if (again) { again.click(); return; }
        const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
          && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run|Retry|Restart|Respawn|Undock)/i.test(n(x.textContent)));
        if (b) b.click();
      }).catch(() => {});
      // Population census every ~15 s: what the world is made of while the hand plays (the
      // screen-side facade, i.e. what is really alive in the run, not a bench bot's leftovers).
      if (beat % 10 === 5) {
        const c = await page.evaluate(() => {
          const s = window.SF.state; const by = {};
          for (const e of s.entityList || []) {
            if (!e || e.alive === false) continue;
            const k = e.type === 'pickup' || e.type === 'projectile' || e.type === 'payload'
              ? e.type + ':' + ((e.data && (e.data.kind || e.data.weaponId || e.data.commodityId)) || '-')
              : e.type === 'asteroid' ? (e.data && e.data.materialFragment ? 'asteroid:fragment' : 'asteroid') : e.type;
            by[k] = (by[k] || 0) + 1;
          }
          return { wave: s.run && s.run.wave, mode: s.mode, total: (s.entityList || []).length, by };
        }).catch(() => null);
        if (c) (report.census || (report.census = [])).push({ atS: Math.round((Date.now() - t0) / 1000), ...c });
      }
      // A Swarm run that ended (death, results screen) is relaunched so every phase flies.
      const mode = await page.evaluate(() => window.SF.state.mode).catch(() => 'flight');
      // A run that is loading is left to load (relaunching over it restarts the load); one that has
      // sat on the loading screen for a minute is a stuck load, counted as such, then relaunched.
      if (mode === 'loading') {
        loadingBeats++;
        if (loadingBeats * 1.5 >= 60) { report.stuckLoads = (report.stuckLoads || 0) + 1; loadingBeats = 0; notFlying = 3; }
      } else {
        loadingBeats = 0;
        notFlying = mode === 'flight' ? 0 : notFlying + 1;
      }
      if (ROUTE === 'swarm' && notFlying >= 3) {
        notFlying = 0;
        report.relaunches = (report.relaunches || 0) + 1;
        await launchSwarm().catch(() => {});
      }
    }
    hand.releaseAll();
  };

  // Forced stalls first, while the run is young (a long dense phase often ends the run).
  const phases = [];
  if (FORCED) {
    phases.push(['forced: ACKs withheld 4 s', async () => { await force({ withholdAcksMs: 4000 }); await play(6000); }]);
    phases.push(['forced: replies held 3 s', async () => { await force({ holdRepliesMs: 3000 }); await play(6000); }]);
    phases.push(['forced: dense replies 2000 rows', async () => { await force({ padRows: 2000 }); await play(6000); await force({ padRows: 0 }); await play(2000); }]);
  }
  const ensureFlight = async () => {
    for (let i = 0; i < 60; i++) {
      const live = await page.evaluate(() => window.SF.state.mode === 'flight' && window.SF.state.timeScale > 0).catch(() => false);
      if (live) return true;
      await play(1500);
    }
    return false;
  };
  if (AB === 'detail') {
    // Interleaved A/B in ONE run (the machine's load swings too much between runs): the old rule
    // (every command batch builds the full reply detail) against the new one, ABBA order.
    for (let r = 0; r < AB_ROUNDS; r++) {
      const arms = r % 2 === 0 ? [true, false] : [false, true];
      for (const old of arms) {
        phases.push([`ab ${old ? 'old' : 'new'} ${r}`, async () => { await force({ detailEveryCommand: old }); await play(AB_SEG_S * 1000); }]);
      }
    }
    phases.push(['ab reset', async () => { await force({ detailEveryCommand: false }); }]);
  } else phases.push(['dense input', async () => play(SECONDS * 1000)]);
  const traceChunks = [];
  if (GCTRACE || WORST) {
    cdp.on('Tracing.dataCollected', (ev) => { for (const e of ev.value || []) traceChunks.push(e); });
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: {
      includedCategories: ['__metadata', 'v8', 'devtools.timeline', 'disabled-by-default-v8.gc', 'blink.user_timing', 'v8.compile', 'disabled-by-default-v8.compile'],
      excludedCategories: ['*'] } }).catch((e) => console.log('tracing start', String(e)));
  }
  for (const [name, run] of phases) {
    await ensureFlight();
    await setPhase(name);
    const freezeBefore = await page.evaluate(() => (window.__SF_FREEZE_LOG__ || []).length).catch(() => 0);
    await run();
    const age = await readAge();
    const freezeAfter = await page.evaluate(() => JSON.parse(JSON.stringify(window.__SF_FREEZE_LOG__ || []))).catch(() => []);
    await page.screenshot({ path: join(OUT, `${String(report.phases.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {});
    const clockEnd = await page.evaluate(() => {
      const c = window.SF.simLaneDiag().workerClockLastDiagnostics || {};
      return { directives: c.directiveTicks, steps: c.steps, detail: c.detailDirectives, forced: c.detailForcedByCommands,
        skipped: c.detailSkippedHandOnly, stepMsP50: c.perfWindow && c.perfWindow.stepMsP50, workMsP50: c.perfWindow && c.perfWindow.workMsP50 };
    }).catch(() => null);
    report.phases.push({ name, age, freezeEpisodes: freezeAfter.slice(freezeBefore), clockEnd });
  }
  hand.stop();
  {
    const loaf = await page.evaluate(() => ({ ok: window.__nfLoafOk, frames: window.__nfLoaf || [] })).catch(() => ({ ok: 'read failed', frames: [] }));
    report.longFrames = loaf;
    if (WORST && pageProfStart != null) {
      const res = await cdp.send('Profiler.stop').catch(() => null);
      const prof = res && res.profile;
      if (prof) {
        const byId = new Map(); for (const n of prof.nodes) byId.set(n.id, n);
        for (const n of prof.nodes) for (const c of n.children || []) { const ch = byId.get(c); if (ch) ch.parent = n.id; }
        const label = (n) => { const cf = n.callFrame || {}; const u = String(cf.url || '').replace(/^.*\/(src|scripts|vendor)\//, '$1/'); return (cf.functionName || '(anon)') + (u ? ' ' + u + ':' + ((cf.lineNumber | 0) + 1) : ''); };
        const samples = []; let t = prof.startTime;
        for (let i = 0; i < prof.samples.length; i++) { t += prof.timeDeltas[i] || 0; samples.push([pageProfStart + (t - prof.startTime) / 1000, prof.samples[i]]); }
        const generic = /presentationRunner|^frame |^\(anon\) $|requestAnimationFrame/;
        report.longFrameOwners = [];
        for (const f of [...loaf.frames].sort((a, b) => b.ms - a.ms).slice(0, 6)) {
          const self = new Map(); const incl = new Map(); let n = 0;
          for (const [ms, id] of samples) {
            if (ms < f.at || ms > f.at + f.ms) continue;
            const node = byId.get(id); if (!node) continue; n++;
            self.set(label(node), (self.get(label(node)) || 0) + 1);
            const seen = new Set();
            for (let k = node; k; k = k.parent != null ? byId.get(k.parent) : null) { const L = label(k); if (seen.has(L) || !(k.callFrame && k.callFrame.url) || generic.test(L)) continue; seen.add(L); incl.set(L, (incl.get(L) || 0) + 1); }
          }
          const share = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, c]) => x + ' ' + Math.round(c / Math.max(1, n) * 100) + '%');
          const row = { ms: f.ms, atS: +(f.at / 1000).toFixed(1), samples: n, self: share(self, 6), inclusive: share(incl, 10) };
          report.longFrameOwners.push(row);
          console.log('  long frame ' + row.ms + ' ms at ' + row.atS + ' s (' + n + ' samples) self: ' + row.self.join(' | '));
          console.log('      incl: ' + row.inclusive.join(' | '));
        }
      }
    }
    report.bootRehearsal = await page.evaluate(() => window.__SF_BOOT_REHEARSAL__ || null).catch(() => null);
    console.log('boot rehearsal: ' + JSON.stringify(report.bootRehearsal));
    console.log('main-thread long frames (' + (loaf.ok === true ? loaf.frames.length + ' over 150 ms' : 'LoAF unavailable: ' + loaf.ok) + '):');
    for (const f of [...loaf.frames].sort((a, b) => b.ms - a.ms).slice(0, 12)) {
      const scriptMs = f.scripts.reduce((t, x) => t + x.ms, 0);
      console.log('  ' + f.ms + ' ms at ' + (f.at / 1000).toFixed(1) + ' s  scripts ' + scriptMs + '  render ' + f.renderMs + '  layout ' + f.layoutMs
        + '  | ' + f.scripts.map((x) => x.ms + 'ms ' + x.type + ':' + x.invoker + (x.fn ? ' ' + x.fn : '') + (x.url ? ' ' + x.url : '') + (x.forcedLayoutMs ? ' forcedLayout ' + x.forcedLayoutMs : '')).join(' | '));
    }
  }
  if (CPUPROF && workerCdp.sessionId) {
    const res = await workerSend('Profiler.stop').catch((e) => ({ error: String(e) }));
    const prof = res && res.profile;
    report.__cpuProfile = prof || null;
    if (prof && !WORST) {
      const byId = new Map();
      for (const n of prof.nodes) byId.set(n.id, n);
      for (const n of prof.nodes) for (const c of n.children || []) { const ch = byId.get(c); if (ch) ch.parent = n.id; }
      const label = (n) => {
        const cf = n.callFrame || {};
        const u = String(cf.url || '').replace(/^.*\/(src|scripts|vendor)\//, '$1/');
        return (cf.functionName || '(anon)') + (u ? ' ' + u + ':' + ((cf.lineNumber | 0) + 1) : '');
      };
      const idle = (n) => /^\((idle|program|root)\)$/.test((n.callFrame || {}).functionName || '');
      // Busy stretches: consecutive non-idle samples (gaps under 2 ms) on the worker.
      const runs = [];
      let cur = null; let t = prof.startTime;
      for (let i = 0; i < prof.samples.length; i++) {
        t += prof.timeDeltas[i] || 0;
        const n = byId.get(prof.samples[i]);
        if (!n || idle(n)) { if (cur && t - cur.end > 2000) { runs.push(cur); cur = null; } continue; }
        if (!cur) cur = { start: t, end: t, samples: [] };
        cur.end = t; cur.samples.push({ id: n.id, dt: prof.timeDeltas[i + 1] || 250 });
      }
      if (cur) runs.push(cur);
      runs.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      report.worstSteps = runs.slice(0, 10).map((r) => {
        const self = new Map(); const incl = new Map();
        for (const smp of r.samples) {
          const n = byId.get(smp.id);
          self.set(label(n), (self.get(label(n)) || 0) + smp.dt);
          const seen = new Set();
          for (let k = n; k; k = k.parent != null ? byId.get(k.parent) : null) {
            const L = label(k);
            if (seen.has(L) || !(k.callFrame && k.callFrame.url)) continue;
            seen.add(L); incl.set(L, (incl.get(L) || 0) + smp.dt);
          }
        }
        const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +(v / 1000).toFixed(1)]);
        return { ms: +((r.end - r.start) / 1000).toFixed(1), self: top(self, 6), inclusive: top(incl, 14) };
      });
      console.log('worker worst busy stretches:');
      for (const w of report.worstSteps) {
        console.log('  ' + w.ms + ' ms  self: ' + w.self.map(([k, v]) => k + ' ' + v).join(' | '));
        console.log('     incl: ' + w.inclusive.map(([k, v]) => k + ' ' + v).join(' | '));
      }
    } else console.log('cpu profile failed', JSON.stringify(res).slice(0, 200));
  }
  if (GCTRACE || WORST) {
    const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end').catch((e) => console.log('tracing end', String(e)));
    await Promise.race([done, new Promise((r) => setTimeout(r, 20000))]);
    const threadNames = new Map();
    for (const e of traceChunks) if (e.ph === 'M' && e.name === 'thread_name') threadNames.set(e.pid + ':' + e.tid, e.args && e.args.name);
    const gcByThread = new Map();
    for (const e of traceChunks) {
      if (e.ph !== 'X' || !(e.dur > 0)) continue;
      const kind = /^(MinorGC|V8\.GC_SCAVENGER|ScavengeGC)$/.test(e.name) ? 'minor'
        : /^(MajorGC|V8\.GC_MARK_COMPACTOR|V8\.GC_FINALIZE_MC)$/.test(e.name) ? 'major' : null;
      if (!kind) continue;
      const key = e.pid + ':' + e.tid;
      const r = gcByThread.get(key) || { thread: threadNames.get(key) || key, minor: [], major: [] };
      r[kind].push(e.dur / 1000);
      gcByThread.set(key, r);
    }
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    report.gcTrace = [...gcByThread.values()].map((r) => ({
      thread: r.thread,
      minorCount: r.minor.length, minorMaxMs: +Math.max(0, ...r.minor).toFixed(1), minorTotalMs: +sum(r.minor).toFixed(1),
      majorCount: r.major.length, majorMaxMs: +Math.max(0, ...r.major).toFixed(1), majorTotalMs: +sum(r.major).toFixed(1),
      over8: r.minor.concat(r.major).filter((d) => d > 8).length,
      majorDurations: r.major.map((d) => +d.toFixed(1)).slice(0, 40),
    }));
    // Long tasks on the busiest worker thread: wall (dur) vs thread CPU time (tdur). A large gap
    // means the thread was descheduled (CPU contention), not doing work.
    {
      const counts = new Map();
      for (const e of traceChunks) if (e.ph === 'X') { const k = e.pid + ':' + e.tid; counts.set(k, (counts.get(k) || 0) + 1); }
      const busiest = [...counts.entries()].filter(([k]) => /DedicatedWorker/.test(threadNames.get(k) || '')).sort((a, b) => b[1] - a[1])[0];
      if (busiest) {
        const long = traceChunks.filter((e) => e.ph === 'X' && (e.pid + ':' + e.tid) === busiest[0] && e.dur > 25000)
          .sort((a, b) => b.dur - a.dur).slice(0, 15).map((e) => ({ name: e.name, wallMs: +(e.dur / 1000).toFixed(1), cpuMs: e.tdur ? +(e.tdur / 1000).toFixed(1) : null }));
        report.workerLongTasks = long;
        console.log('worker long tasks (wall vs cpu):', JSON.stringify(long).slice(0, 1200));
      }
    }
    console.log('gc trace (' + traceChunks.length + ' events)');
    {
      const mainKey = [...threadNames.entries()].find(([, n]) => n === 'CrRendererMain');
      if (mainKey) {
        const [mk] = mainKey;
        const evs = traceChunks.filter((e) => e.ph === 'X' && (e.pid + ':' + e.tid) === mk && e.dur > 0);
        const tops = evs.filter((e) => /^(ThreadControllerImpl::RunTask|RunTask)$/.test(e.name) && e.dur > 150000).sort((a, b) => b.dur - a.dur).slice(0, 8);
        report.mainLongTasks = tops.map((t) => {
          const end = t.ts + t.dur;
          const kids = evs.filter((e) => e !== t && e.ts >= t.ts && e.ts + e.dur <= end + 1 && e.dur > 15000
            && /FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|v8\.callFunction|ParseHTML|UpdateLayoutTree|Layout|Paint|CompositeLayers|GPUTask|MinorGC|MajorGC|V8\.Compile|v8\.compile|HandlePostMessage|RunMicrotasks|Commit/.test(e.name));
          const name = (e) => {
            const d = (e.args && e.args.data) || {};
            const where = d.functionName ? d.functionName + (d.url ? ' ' + String(d.url).replace(/^.*\/(src|scripts)\//, '$1/') + ':' + d.lineNumber : '') : (d.type || '');
            return e.name + (where ? '(' + where + ')' : '') + ' ' + (e.dur / 1000).toFixed(0) + 'ms';
          };
          return { ms: +(t.dur / 1000).toFixed(0), parts: kids.sort((a, b) => b.dur - a.dur).slice(0, 6).map(name) };
        });
        console.log('main-thread long tasks:');
        for (const t of report.mainLongTasks) console.log('  ' + t.ms + ' ms: ' + t.parts.join(' | '));
      }
    }
    if (WORST) {
      const begins = new Map(); const dirs = [];
      for (const e of traceChunks) {
        if (e.name !== 'sf-directive') continue;
        const key = e.pid + ':' + e.tid + ':' + (e.id2 ? JSON.stringify(e.id2) : e.id);
        if (e.ph === 'b') begins.set(key, e);
        else if (e.ph === 'e' && begins.has(key)) { const b = begins.get(key); dirs.push({ ts: b.ts, dur: e.ts - b.ts, pid: b.pid, tid: b.tid }); begins.delete(key); }
        else if (e.ph === 'X') dirs.push({ ts: e.ts, dur: e.dur, pid: e.pid, tid: e.tid });
      }
      const prof = report.__cpuProfile;
      if (!dirs.length && prof) {
        const nodes = new Map();
        for (const n of prof.nodes) nodes.set(n.id, n);
        for (const n of prof.nodes) for (const c of n.children || []) { const ch = nodes.get(c); if (ch) ch.parent = n.id; }
        const inTick = new Map();
        const isTick = (id) => {
          if (inTick.has(id)) return inTick.get(id);
          let v = false;
          for (let k = nodes.get(id); k; k = k.parent != null ? nodes.get(k.parent) : null) {
            if ((k.callFrame || {}).functionName === 'handleTick') { v = true; break; }
          }
          inTick.set(id, v); return v;
        };
        let t = prof.startTime; let cur = null;
        for (let i = 0; i < prof.samples.length; i++) {
          t += prof.timeDeltas[i] || 0;
          if (isTick(prof.samples[i])) { if (!cur) cur = { ts: t, end: t }; cur.end = t; }
          else if (cur) { dirs.push({ ts: cur.ts, dur: cur.end - cur.ts, pid: null, tid: null, fromSamples: true }); cur = null; }
        }
        if (cur) dirs.push({ ts: cur.ts, dur: cur.end - cur.ts, pid: null, tid: null, fromSamples: true });
      }
      dirs.sort((a, b) => b.dur - a.dur);
      let samples = [];
      const byId = new Map();
      if (prof) {
        for (const n of prof.nodes) byId.set(n.id, n);
        for (const n of prof.nodes) for (const c of n.children || []) { const ch = byId.get(c); if (ch) ch.parent = n.id; }
        let t = prof.startTime;
        for (let i = 0; i < prof.samples.length; i++) { t += prof.timeDeltas[i] || 0; samples.push([t, prof.samples[i]]); }
      }
      const label = (n) => { const cf = n.callFrame || {}; const u = String(cf.url || '').replace(/^.*\/(src|scripts|vendor)\//, '$1/'); return (cf.functionName || '(anon)') + (u ? ' ' + u + ':' + ((cf.lineNumber | 0) + 1) : ''); };
      const generic = /runLocalClockTick|handleTick|^tick |wholeSimBrowserWorker.js|^step src\/core\/authoritativeSimStep|dispatchRange|invokeBusListener|^emit src\/core\/eventBus|^bus\.emit/;
      let simWorkerThreadKey = null;
      {
        const gcCount = new Map();
        for (const e of traceChunks) if (e.ph === 'X' && /^(MinorGC|MajorGC)$/.test(e.name)) gcCount.set(e.pid + ':' + e.tid, (gcCount.get(e.pid + ':' + e.tid) || 0) + 1);
        const workerKeys = [...gcCount.entries()].filter(([k]) => /DedicatedWorker/.test(threadNames.get(k) || ''));
        workerKeys.sort((a, b) => b[1] - a[1]);
        simWorkerThreadKey = workerKeys.length ? workerKeys[0][0] : null;
      }
      {
        // Every compile on the sim worker over the run, by file: what still compiles mid-play.
        const byFile = new Map(); let total = 0; let count = 0;
        for (const e of traceChunks) {
          if (e.ph !== 'X' || !(e.dur > 0) || (e.pid + ':' + e.tid) !== simWorkerThreadKey) continue;
          if (!/Compile|Optimize|Deopt|Lazy|Maglev|Turbofan|Sparkplug/i.test(e.name) || /GC/.test(e.name)) continue;
          const d = (e.args && (e.args.data || e.args)) || {};
          const url = String(d.url || d.fileName || d.scriptName || '?').replace(/^.*\/(src|scripts|vendor)\//, '$1/');
          const k = e.name + ' ' + url;
          byFile.set(k, (byFile.get(k) || 0) + e.dur); total += e.dur; count++;
        }
        report.workerCompile = { totalMs: +(total / 1000).toFixed(1), events: count,
          top: [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ' + (v / 1000).toFixed(1) + 'ms') };
        console.log('sim worker compile over the run: ' + report.workerCompile.totalMs + ' ms in ' + count + ' events: ' + report.workerCompile.top.join(' | '));
      }
      report.worstDirectives = dirs.slice(0, 10).map((d) => {
        const end = d.ts + d.dur;
        let compile = 0; let gc = 0;
        for (const e of traceChunks) {
          if (e.ph !== 'X' || !(e.dur > 0)) continue;
          if (d.tid != null ? (e.tid !== d.tid || e.pid !== d.pid) : (e.pid + ':' + e.tid) !== simWorkerThreadKey) continue;
          if (e.ts < d.ts || e.ts > end) continue;
          if (/Compile|Optimize|Deopt|Lazy|Maglev|Turbofan|Sparkplug/i.test(e.name) && !/GC/.test(e.name)) compile += e.dur;
          else if (/^(MinorGC|MajorGC)$/.test(e.name)) gc += e.dur;
        }
        const self = new Map(); const incl = new Map(); let n = 0; let programIdle = 0;
        for (const [ts, id] of samples) {
          if (ts < d.ts || ts > end) continue;
          const node = byId.get(id); if (!node) continue;
          n++;
          const fn = (node.callFrame || {}).functionName || '';
          if (/^\((program|idle|garbage collector)\)$/.test(fn)) { programIdle++; self.set(fn, (self.get(fn) || 0) + 1); continue; }
          self.set(label(node), (self.get(label(node)) || 0) + 1);
          const seen = new Set();
          for (let k = node; k; k = k.parent != null ? byId.get(k.parent) : null) {
            const L = label(k);
            if (seen.has(L) || !(k.callFrame && k.callFrame.url) || generic.test(L)) continue;
            seen.add(L); incl.set(L, (incl.get(L) || 0) + 1);
          }
        }
        const share = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, c]) => x + ' ' + Math.round((c / Math.max(1, n)) * 100) + '%');
        return { ms: +(d.dur / 1000).toFixed(1), compileMs: +(compile / 1000).toFixed(1), gcMs: +(gc / 1000).toFixed(1), samples: n, programOrIdle: programIdle, self: share(self, 5), inclusive: share(incl, 8) };
      });
      // The busiest 5 s of the worker (sustained overload, e.g. a sector materialising over many
      // directives): which functions own it.
      if (prof && samples.length) {
        const busy = samples.map(([ts, id]) => { const n = byId.get(id); const fn = n && (n.callFrame || {}).functionName; return [ts, n && !/^\((idle|program)\)$/.test(fn || '') ? 1 : 0, id]; });
        const wins = []; let j = 0; let busyCount = 0;
        for (let i = 0; i < busy.length; i++) {
          while (j < busy.length && busy[j][0] - busy[i][0] < 5e6) { busyCount += busy[j][1]; j++; }
          // Only windows that really span 5 s (the tail of the profile would score a handful of samples).
          if (j < busy.length || (busy[j - 1][0] - busy[i][0]) >= 4.9e6) wins.push({ i, j, frac: busyCount / Math.max(1, j - i) });
          busyCount -= busy[i][1];
        }
        wins.sort((a, b) => b.frac - a.frac);
        const picked = [];
        for (const w of wins) { if (picked.length >= 3) break; if (picked.every((p) => w.j <= p.i || w.i >= p.j)) picked.push(w); }
        report.busiestWindows = [];
        for (const best of picked) {
          const incl = new Map(); let n = 0;
          for (let k = best.i; k < best.j; k++) {
            if (!busy[k][1]) continue;
            n++;
            const seen = new Set();
            for (let node = byId.get(busy[k][2]); node; node = node.parent != null ? byId.get(node.parent) : null) {
              const L = label(node);
              if (seen.has(L) || !(node.callFrame && node.callFrame.url) || generic.test(L)) continue;
              seen.add(L); incl.set(L, (incl.get(L) || 0) + 1);
            }
          }
          const bw = { busyFraction: +best.frac.toFixed(2), atS: +((busy[best.i][0] - busy[0][0]) / 1e6).toFixed(1), busySamples: n,
            inclusive: [...incl.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, c]) => k + ' ' + Math.round(c / Math.max(1, n) * 100) + '%') };
          report.busiestWindows.push(bw);
          console.log('busy 5 s of the worker (busy ' + bw.busyFraction + ' at ' + bw.atS + ' s, ' + n + ' samples): ' + bw.inclusive.join(' | '));
        }
      }
      console.log('worst directives (' + dirs.length + ' measured):');
      for (const w of report.worstDirectives) {
        console.log('  ' + w.ms + ' ms  compile ' + w.compileMs + '  gc ' + w.gcMs + '  samples ' + w.samples + '  self: ' + w.self.join(' | '));
        console.log('      incl: ' + w.inclusive.join(' | '));
      }
    }
    for (const r of report.gcTrace) console.log('   ' + JSON.stringify(r).slice(0, 400));
  }
  if (ALLOC && workerCdp.sessionId) {
    const ticks = await page.evaluate(() => window.SF.simLaneDiag().poseTable.tick).catch(() => null);
    const prof = await workerSend('HeapProfiler.stopSampling').catch((e) => ({ error: String(e) }));
    const sites = new Map();
    let total = 0;
    const short = (u) => String(u || '').replace(/^.*\/(src|scripts|vendor)\//, '$1/');
    // Builtins (push, join, Map.set...) carry no url: charge them to the nearest JS caller.
    const walk = (node, owner) => {
      if (!node) return;
      const cf = node.callFrame || {};
      const own = cf.url ? (cf.functionName || '(anon)') + ' ' + short(cf.url) + ':' + ((cf.lineNumber | 0) + 1) : null;
      const key = own || ((owner || '(root)') + ' [' + (cf.functionName || 'native') + ']');
      if (node.selfSize) { sites.set(key, (sites.get(key) || 0) + node.selfSize); total += node.selfSize; }
      for (const c of node.children || []) walk(c, own || owner);
    };
    walk(prof && prof.profile && prof.profile.head, null);
    const steps = Number.isFinite(ticks) && Number.isFinite(report.allocStart && report.allocStart.ticks)
      ? ticks - report.allocStart.ticks : null;
    report.alloc = {
      sampledBytes: total, steps, wallS: (Date.now() - report.allocStart.atMs) / 1000,
      bytesPerStep: steps ? Math.round(total / steps) : null,
      top: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80)
        .map(([k, v]) => [k, v, steps ? Math.round(v / steps) : null]),
      error: prof && prof.error ? prof.error : undefined,
    };
    console.log('worker alloc', JSON.stringify({ bytesPerStep: report.alloc.bytesPerStep, steps, MB: +(total / 1048576).toFixed(1), error: report.alloc.error }));
    for (const [k, , per] of report.alloc.top.slice(0, 15)) console.log('   ' + String(per).padStart(8) + ' B/step  ' + k);
  }
  if (ALLOC) {
    const iso = new Map();
    const re = /\[(\d+):([0-9a-fA-Fx]+)\]\s+(\d+) ms: (\S+)[^,]*?([\d.]+) \(([\d.]+)\) -> ([\d.]+) \(([\d.]+)\) MB, (?:pooled: [\d.]+ MB, )?([\d.]+) \/ ([\d.]+) ms/;
    for (const [, line] of gcLines) {
      const m = line.match(re);
      if (!m) continue;
      const key = m[1] + ':' + m[2];
      const r = iso.get(key) || { kinds: {}, count: 0, maxPause: 0, totalPause: 0, over8: 0, allocMB: 0, lastAfter: null };
      const kind = m[4]; const before = +m[5]; const after = +m[7]; const pause = +m[9];
      r.kinds[kind] = (r.kinds[kind] || 0) + 1;
      r.count++; r.totalPause += pause;
      if (pause > r.maxPause) r.maxPause = pause;
      if (pause > 8) r.over8++;
      if (r.lastAfter != null) r.allocMB += Math.max(0, before - r.lastAfter);
      r.lastAfter = after;
      iso.set(key, r);
    }
    report.gc = [...iso.entries()].map(([k, r]) => ({ isolate: k, ...r, totalPause: +r.totalPause.toFixed(1), allocMB: +r.allocMB.toFixed(1) }));
    report.gcLinesSample = gcLines.slice(0, 6).map((x) => x[1]);
    console.log('gc lines', gcLines.length, JSON.stringify(report.gc));
  }
  report.hand = hand.counts();
  report.realmEnd = await page.evaluate(() => ({ hasFocus: document.hasFocus(), visibility: document.visibilityState,
    padCalls: window.__padCalls ? window.__padCalls() : null })).catch(() => null);
  const samples = await page.evaluate(() => { clearInterval(window.__nf.timer); return window.__nf.samples; });
  report.workerProbe = await page.evaluate(async () => { try { const r = await window.SF.laneRpc('probeState'); const q = r && (r.result || r); const g = window.SF.simLaneDiag(); const rr = window.SF.registry.get('render'); const samples = []; for (let i = 0; i < 20; i++) { const r2 = await window.SF.laneRpc('probeState'); const q2 = r2 && (r2.result || r2); samples.push({ worker: q2.committedJournalSequence, main: window.SF.simLaneDiag().journal.writeSequence, presented: rr && rr._presentationPublisher ? rr._presentationPublisher.getLastAppliedSequence() : null }); await new Promise((ok) => setTimeout(ok, 100)); } return { journalRebuildReasons: q.journalRebuildReasons, physicsDiag: q.physicsDiag, lag: samples.slice(-3) }; } catch (e) { return String(e); } }).catch(() => null);
  console.log('worker journal rebuilds', JSON.stringify(report.workerProbe));
  // Identity forensics for the worst stale bodies: what the worker journaled vs what main applied.
  {
    const worstIds = [...new Set(report.phases.flatMap((ph) => (ph.age && ph.age.episodes) || [])
      .filter((e) => e.worst && e.poseAgeMs > 300).sort((x, y) => y.poseAgeMs - x.poseAgeMs).map((e) => e.worst.id))].slice(0, 4);
    if (worstIds.length) {
      report.lifeForensics = await page.evaluate(async (ids) => {
        const r = await window.SF.laneRpc('probeState', { lifeFor: ids });
        const q = r && (r.result || r);
        const main = (window.__SF_LIFE_FORENSICS__ || []).filter((x) => ids.includes(x[1]));
        const facade = ids.map((id) => { const e = window.SF.state.entities.get(id); return e ? { id, occ: e.occupantGeneration, type: e.type, alive: e.alive } : { id, missing: true }; });
        const w = window.SF.registry.get('render')._presentationWorld; const world = ids.map((id) => { const sl = w.getSlotForEntityId(id); return { id, slot: sl, gen: sl >= 0 ? w.sourceGenerations[sl] : null, occ: sl >= 0 ? w.occupantGenerations[sl] : null }; }); const arrivals = window.__SF_PACK_ARRIVALS__ || []; const arrivalOf = (seq) => { const a = arrivals.find((r) => seq > r[0] && seq <= r[1]); return a || null; }; const mainWithArrival = main.map((x) => [...x, arrivalOf(x[3])]); return { ids, worker: q && q.lifeLog, main: mainWithArrival, facade, world, now: Math.round(performance.now()), lastArrivals: arrivals.slice(-5) };
      }, worstIds).catch((e) => String(e));
      console.log('life forensics', JSON.stringify(report.lifeForensics).slice(0, 4000));
    }
  }
  report.end = await page.evaluate(() => {
    const g = window.SF.simLaneDiag();
    return { clock: g.workerClockLastDiagnostics, poseTable: g.poseTable, profile: g.workerSystemProfile || null,
      slowApplies: g.workerSlowApplies, publisher: (() => { try { const r = window.SF.registry.get('render'); const d = r && r._presentationPublisher && r._presentationPublisher.getDiagnostics(); return d ? JSON.parse(JSON.stringify(d)) : null; } catch (_) { return null; } })(),
      presentationRunner: (() => { try { const l = window.SF.loop && window.SF.loop.diagnostics ? window.SF.loop.diagnostics() : null; return l ? JSON.parse(JSON.stringify(l)) : null; } catch (_) { return null; } })(), replyLag: (g.replyLagEpisodes || []).slice(-8), maxApplyMs: g.workerApplyMaxMs };
  }).catch(() => null);

  // ---- per-phase table ----
  for (const ph of report.phases) {
    const s = samples.filter((d) => d.ph === ph.name && d.mode === 'flight' && d.ts > 0 && !d.docked);
    // Gate rule (coordinator, 2026-11-21): simulation time is accumulated per consecutive sample
    // pair, never across a reset (a relaunched run) or a pause gap; the worst ten-second window is
    // judged only for phases of thirty seconds or more.
    const acc = [{ w: 0, sim: 0 }];
    let wAcc = 0; let simAcc = 0;
    // Consecutive RAW samples only (a pause or a screen between two kept samples is not a pair).
    const live = (d) => d && d.ph === ph.name && d.mode === 'flight' && d.ts > 0 && !d.docked;
    for (let k = 1; k < samples.length; k++) {
      const a0 = samples[k - 1]; const a1 = samples[k];
      if (!live(a0) || !live(a1)) continue;
      const dt = (a1.t - a0.t) / 1000;
      const ds = a1.sim - a0.sim;
      // A late sampler turn is still a real interval; a negative or impossible delta is a reset.
      if (!(dt > 0) || dt > 1.5 || ds < 0 || ds > dt * 1.5 + 0.1) continue;
      wAcc += dt; simAcc += ds; acc.push({ w: wAcc, sim: simAcc });
    }
    let minWin = null;
    if (wAcc >= 30) {
      for (let i = 0; i < acc.length; i += 20) {
        const j = acc.findIndex((d, k) => k > i && d.w - acc[i].w >= 10);
        if (j < 0) break;
        const v = (acc[j].sim - acc[i].sim) / (acc[j].w - acc[i].w);
        if (minWin == null || v < minWin) minWin = v;
      }
    }
    // World speed on the WORKER's own clock: sim time against the worker's wall stamp written with it.
    let wwAcc = 0; let wsAcc = 0; const wacc = [{ w: 0, sim: 0 }];
    {
      let prev = null;
      for (const d of samples) {
        if (!live(d) || !Number.isFinite(d.wWall) || !Number.isFinite(d.wSim)) { prev = null; continue; }
        if (prev && d.wWall !== prev.wWall) {
          const dt = (d.wWall - prev.wWall) / 1000; const ds = d.wSim - prev.wSim;
          if (dt > 0 && dt <= 1.5 && ds >= 0 && ds <= dt * 1.5 + 0.1) { wwAcc += dt; wsAcc += ds; wacc.push({ w: wwAcc, sim: wsAcc }); }
        }
        if (!prev || d.wWall !== prev.wWall) prev = d;
      }
    }
    let workerMinWin = null;
    if (wwAcc >= 30) {
      for (let i = 0; i < wacc.length; i += 20) {
        const j = wacc.findIndex((d, k) => k > i && d.w - wacc[i].w >= 10);
        if (j < 0) break;
        const v = (wacc[j].sim - wacc[i].sim) / (wacc[j].w - wacc[i].w);
        if (workerMinWin == null || v < workerMinWin) workerMinWin = v;
      }
    }
    const workerSpeed = wwAcc > 0 ? wsAcc / wwAcc : null;
    const wall = +wAcc.toFixed(1);
    const speed = wAcc > 0 ? simAcc / wAcc : null;
    report.rows.push({
      phase: ph.name,
      wallS: +wall.toFixed(1),
      worldSpeed: speed == null ? null : +speed.toFixed(3),
      worstWindow10s: minWin == null ? null : +minWin.toFixed(3),
      workerWorldSpeed: workerSpeed == null ? null : +workerSpeed.toFixed(3),
      workerWorstWindow10s: workerMinWin == null ? null : +workerMinWin.toFixed(3),
      workerWallS: +wwAcc.toFixed(1),
      poseAgeMaxMs: ph.age ? ph.age.worstPoseAgeMs : null,
      playerPoseAgeMaxMs: ph.age ? ph.age.worstPlayerPoseAgeMs : null,
      dataAgeMaxMs: ph.age ? ph.age.worstDataAgeMs : null,
      frameGapMaxMs: ph.age ? ph.age.worstFrameGapMs : null,
      poseAgeOver100Frames: ph.age ? ph.age.poseAgeOver100Frames : null,
      tracked: ph.age ? ph.age.tracked : null,
      worstId: ph.age ? ph.age.worstId : null,
      silentHoldMs: ph.age ? ph.age.worstSilentHoldMs : null,
      ghostMs: ph.age ? ph.age.worstGhostMs : null,
      uncoveredStopMs: ph.age ? ph.age.worstUncoveredDataAgeMs : null,
      netPoseAgeMs: ph.age ? ph.age.worstNetPoseAgeMs : null,
      frameGapsOver100: ph.age ? ph.age.frameGapsOver100 : null,
      frameGapList: ph.age ? ph.age.frameGapList : null,
      freezeLog: ph.freezeEpisodes.length,
      maxUnacked: Math.max(0, ...s.map((d) => d.unacked || 0)),
      backpressuredSamples: s.filter((d) => d.bp).length,
      workP95: s.length ? s.at(-1).workP95 : null,
      ents: s.length ? s.at(-1).ents : null,
    });
  }
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(samples));
  // The whole worker profile is kept beside the report (open it in DevTools, or aggregate it
  // with summarizeCpuProfile in scripts/lib/cpuProfileSummary.mjs) — the worst stretches alone
  // miss steady cost.
  if (report.__cpuProfile) writeFileSync(join(OUT, 'worker.cpuprofile'), JSON.stringify(report.__cpuProfile));
  delete report.__cpuProfile;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`no-freeze probe: ${ROUTE}${LEGACY ? ' LEGACY (fix off)' : ''}${PAD ? ` pad=${PAD}` : ''}${REAL_PROFILE ? ' real-profile' : ''}${VISIBLE ? ' visible' : ' inactive-window'} realmEnd ${JSON.stringify(report.realmEnd)}, load ${report.loadS}s, hand ${JSON.stringify(report.hand)}, page errors ${report.errors.length}`);
  for (const r of report.rows) {
    console.log(`  ${r.phase.padEnd(32)} poseAge ${String(r.poseAgeMaxMs).padStart(5)} ms net ${r.netPoseAgeMs} (player ${r.playerPoseAgeMaxMs}, >100ms frames ${r.poseAgeOver100Frames}, tracked ${r.tracked}, worst ${r.worstId})  dataAge ${r.dataAgeMaxMs}  frameGap ${r.frameGapMaxMs} (>100ms x${r.frameGapsOver100})  world x${r.worldSpeed} (worst 10s ${r.worstWindow10s}; worker clock x${r.workerWorldSpeed}, worst 10s ${r.workerWorstWindow10s})  freezeLog ${r.freezeLog}  silentHold ${r.silentHoldMs}  ghost ${r.ghostMs}  uncoveredStop ${r.uncoveredStopMs}  unacked<=${r.maxUnacked} bp ${r.backpressuredSamples} workP95 ${r.workP95} ents ${r.ents}`);
  }
  if (report.errors.length) console.log('page errors:', report.errors.slice(0, 5).join(' | '));
} catch (e) {
  console.log('PROBE FAILED', String((e && e.stack) || e).slice(0, 800));
  report.failed = String((e && e.message) || e);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  process.exitCode = 2;
} finally {
  try { if (app) await app.close(); } catch { /* already gone */ }
  try { launch.cleanup({ runtimeClosed: true }); } catch { /* profile cleanup best-effort */ }
}
