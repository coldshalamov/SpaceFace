// Smooth-flight witness: the live game, the real GPU, ~20 s of flying and shooting.
//
//   node scripts/probe-smooth-flight.mjs            (headed, default 20 s sample, open flight)
//   node scripts/probe-smooth-flight.mjs --crucible (swarm mode, seed 4242, default kit)
//   SPACEFACE_SMOOTH_MS=30000 node scripts/probe-smooth-flight.mjs
//
// It answers, in the owner's units, the four things the 2026-09-20 complaint named:
//   - "the ship keeps jigging back and forth"      -> presents that redrew an already-drawn moment
//   - "sometimes it hitches"                        -> frames over 50 ms, worst frame, hitch callbacks
//   - "the vfx ... doesn't even move"               -> is reduced-motion silently on? did shaders link?
//   - "asteroids pop out of existence"              -> instanced rock batches retired / blanked
// The profile it boots with is the owner's: motionPreference 'system' + motionReduce true, written
// by a Windows desktop with "Animation effects" off. Saves are isolated (no player store mounted).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.argv.includes('--headless');
const CRUCIBLE = process.argv.includes('--crucible');
// PQ-210.00's done-when samples 30 s of crucible flight — the authored wave-arrival freeze sat
// ~22 s into seed 4242, so the default 20 s window can miss it entirely.
const SAMPLE_MS = Math.max(5000, Number(process.env.SPACEFACE_SMOOTH_MS || (CRUCIBLE ? 30_000 : 20_000)));
// Flying time to discard before sampling. 0 measures the opening (shader admission, first-flight
// holds); 25000 measures settled flight.
const SETTLE_MS = Math.max(0, Number(process.env.SPACEFACE_SMOOTH_SETTLE_MS || 0));
const { chromium } = await loadPlaywright();

// Whole-machine CPU busy share between two os.cpus() snapshots. The game is one tab on a shared
// laptop: a frame-time number without the host load beside it cannot be compared with another run.
function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}
function hostBusyPct(a, b) {
  const total = b.total - a.total;
  return total > 0 ? 100 * (1 - (b.idle - a.idle) / total) : 0;
}

// The wave-lifecycle event nearest an absolute frame timestamp, in the report's own units: a
// freeze that follows a wave arrival is exactly the authored-admission suspect PQ-210.00 hunts.
function nearestWaveEventLabel(t, waves) {
  if (!Number.isFinite(t) || !Array.isArray(waves) || waves.length === 0) {
    return '— no wave event within 2s';
  }
  let best = null;
  for (const w of waves) {
    const delta = t - w.t;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, w };
  }
  if (!best || Math.abs(best.delta) > 2000) return '— no wave event within 2s';
  const wave = best.w.wave != null ? ` w${best.w.wave}` : '';
  return `— ${(Math.abs(best.delta) / 1000).toFixed(1)}s ${best.delta >= 0 ? 'after' : 'before'} ${best.w.event}${wave}`;
}

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

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`game server did not answer at ${url}`);
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  // An unset variable mounts the real shared save drawer; empty mounts nothing (AGENTS.md §9).
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
const consoleErrors = [];
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1600,900',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || /asteroid-pool|WebGLProgram|shader|\[loop\]/i.test(msg.text())) {
      const loc = msg.location && msg.location();
      const url = loc && loc.url ? ` (${String(loc.url).slice(-120)})` : '';
      consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 300)}${url}`);
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  await page.addInitScript(() => {
    // CDP inlines console string args whole — one giant log line (a megabyte-scale dump, a
    // decoded binary string) overflows the pipe transport before any listener can trim it.
    // Truncate at the source; 4 KB is far beyond anything a diagnostic needs to say.
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      const original = console[method].bind(console);
      console[method] = (...args) => original(...args.map((arg) => (
        typeof arg === 'string' && arg.length > 4096 ? `${arg.slice(0, 4096)}…[+${arg.length - 4096} chars]` : arg
      )));
    }
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      // Tier-1 GL counters are opt-in (src/core/perfCounters.js perfCountersRequested): the
      // wave/freeze correlation below needs shaderLinks + buffer uploads counted from boot.
      window.__SPACEFACE_PERF_COUNTERS__ = true;
      if (!localStorage.getItem('sf.settings.profile.v1')) {
        localStorage.setItem('sf.settings.profile.v1', JSON.stringify({
          version: 1,
          settings: { accessibility: { motionPreference: 'system' }, video: { motionReduce: true } },
        }));
      }
    } catch (_) { /* storage unavailable */ }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  const bootedAt = Date.now();
  if (CRUCIBLE) {
    // The Crucible button's own route: default starter kit, fixed seed, real New Game request.
    const launched = await page.evaluate(async () => {
      const launch = await import('/src/ui/crucibleLaunch.js');
      const setup = launch.crucibleSetupFor({ seed: 4242 });
      if (!setup || !setup.ok) return false;
      return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
    });
    if (!launched) throw new Error('Crucible run did not launch');
  } else {
    await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Smooth Flight' }));
  }
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
    // The crucible survival cook now front-loads the whole roster catalog (GLB decode +
    // program links + a whole-scene buffer census) behind the shell; on a contended box
    // that pushes launch past 300 s. What the probe measures is the flight sample, not the
    // shell — the wait budget follows the cook's real cost.
  }, null, { timeout: 560_000 });
  const launchToFlightS = (Date.now() - bootedAt) / 1000;

  await page.bringToFront();
  await page.mouse.move(1100, 300);
  await page.keyboard.down('KeyW');
  if (SETTLE_MS > 0) await page.waitForTimeout(SETTLE_MS);

  // Frame recorder on the page's own rAF beat. The game's callback is registered first, so when
  // this one runs the perf runtime holds the phase costs of the frame that just finished.
  await page.evaluate(() => {
    const record = { dts: [], ats: [], costs: [], waves: [], last: 0 };
    window.__SF_SMOOTH__ = record;
    // Wave lifecycle events on the same performance.now() clock as the frame timestamps, so
    // each worst frame can be lined up against the wave arrival that may have paid for it.
    for (const event of ['run:wavePlanned', 'run:waveStarted', 'run:waveMaterialized']) {
      window.SF.bus.on(event, (p) => record.waves.push({
        t: performance.now(),
        event,
        wave: p && p.wave,
        enemyId: p && p.enemyId,
        count: p && p.admitted,
      }));
    }
    const scratch = {};
    const tick = (now) => {
      if (record.last) {
        record.dts.push(now - record.last);
        record.ats.push(now);
        const perf = window.SF && window.SF.state && window.SF.state.perfRuntime;
        if (perf && typeof perf.readFrameSample === 'function') {
          perf.readFrameSample(scratch);
          record.costs.push([
            scratch.callbackMs || 0, scratch.simFrameMs || 0, scratch.presentationMs || 0,
            scratch.renderMs || 0, scratch.vfxMs || 0, scratch.uiMs || 0, scratch.feelMs || 0,
            scratch.admissionMs || 0,
          ]);
        } else {
          record.costs.push(null);
        }
      }
      record.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const before = await page.evaluate(() => ({ ...window.SF.loop.getDiagnostics() }));
  const clockBefore = await page.evaluate(() => ({ sim: window.SF.state.simTime, wall: performance.now() }));
  // Tier-1 GL totals BEFORE the sampling loop: the report's link/upload deltas are only
  // meaningful against a pre-sample baseline, and a disabled counter set reads as null here.
  const countersBefore = await page.evaluate(() => {
    const snap = window.SF.state.perfRuntime && typeof window.SF.state.perfRuntime.getCounterSnapshot === 'function'
      ? window.SF.state.perfRuntime.getCounterSnapshot()
      : null;
    // The baseline is only differenced on totals; event payloads (GL handles, stacks, or any
    // accidentally captured object graph) can't cross the wire safely, so drop them here.
    if (snap && Array.isArray(snap.events)) snap.events = [];
    return snap;
  });
  // Did the loading cook actually finish the admission work? Prewarm/pipeline leftovers queued at
  // the flight boundary are the difference between "warmed behind the shell" and "drains mid-fight".
  const admissionAtFlightStart = await page.evaluate(() => {
    const render = window.SF.state && window.SF.state.render;
    return {
      pendingPipelines: render && typeof render.pendingPipelineAdmissions === 'function'
        ? render.pendingPipelineAdmissions() : null,
      pendingResidency: render && typeof render.pendingAuthoredGpuResidency === 'function'
        ? render.pendingAuthoredGpuResidency() : null,
      upgradeQueue: (render && render.scene && render.scene.userData
        && render.scene.userData.authoredUpgradeDiagnostics) || null,
    };
  });
  // Direct evidence the roster prewarm actually finished: for every hidden exemplar root still
  // mounted at flight start, count materials with no linked program yet. Anything >0 means the
  // warm was admitted but not compiled — the wave spawn will pay that link inside the fight.
  const prewarmAudit = await page.evaluate(() => {
    const render = window.SF.state && window.SF.state.render;
    const scene = render && render.scene;
    const r = render && render.renderer;
    if (!scene || !r || !r.properties) return null;
    const rows = [];
    scene.traverse((object) => {
      const tag = object.userData && object.userData.rosterPrewarm;
      if (!tag || object.parent !== scene) return;
      let materials = 0;
      let unready = 0;
      let meshes = 0;
      object.traverse((child) => {
        if (child && child.isMesh) meshes++;
        const list = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
        for (const material of list) {
          materials++;
          try {
            const props = r.properties.get(material);
            if (!props || !props.currentProgram) unready++;
          } catch { unready++; }
        }
      });
      rows.push({
        id: tag,
        state: object.userData.authoredAssetState || null,
        meshes,
        materials,
        unready,
      });
    });
    return rows;
  });

  // The cook ledger owns the "why was the shell released with work outstanding" answer:
  // which prep step timed out, and how much of the catalog/pipeline backlog was left.
  const cookLedger = await page.evaluate(() => {
    const render = window.SF.state && window.SF.state.render;
    const ledger = Array.isArray(render && render.openingCookLedger) ? render.openingCookLedger : [];
    return {
      steps: ledger
        .filter((row) => row && row.step && row.step !== 'begin' && row.step !== 'lane')
        .map((row) => {
          const detail = Object.entries(row)
            .filter(([key]) => !['step', 'ms', 'outcome', 't', 'wallMs', 'startedAt'].includes(key))
            .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
            .join(',');
          return `${row.step} ${row.ms}ms ${row.outcome}${detail ? ` (${detail.slice(0, 160)})` : ''}`;
        }),
      catalog: render && render.rosterCatalogProgress || null,
      pendingPipelines: typeof render.pendingPipelineAdmissions === 'function'
        ? render.pendingPipelineAdmissions() : null,
      pendingResidency: typeof render.pendingAuthoredGpuResidency === 'function'
        ? render.pendingAuthoredGpuResidency() : null,
    };
  });

  const started = Date.now();
  const cpuBefore = cpuSnapshot();
  let phase = 0;
  while (Date.now() - started < SAMPLE_MS) {
    // Weave and shoot: turning exercises the camera lead, fire exercises the bolt shaders.
    const key = phase % 2 === 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.keyboard.up(key);
    await page.waitForTimeout(600);
    phase++;
  }
  await page.keyboard.up('KeyW');
  const hostBusy = hostBusyPct(cpuBefore, cpuSnapshot());

  // Find any event entry holding a non-serializable (giant) payload BEFORE the snapshot crosses
  // the wire — a BufferAttribute inside a detail object serializes as full base64 and can
  // outweigh the entire transport limit.
  const fatEvents = await page.evaluate(() => {
    const snap = window.SF.state.perfRuntime && window.SF.state.perfRuntime.getCounterSnapshot
      ? window.SF.state.perfRuntime.getCounterSnapshot() : null;
    const found = [];
    const seen = new Set();
    const walk = (value, path, depth) => {
      if (value === null || value === undefined || depth > 6) return;
      if (typeof value === 'object') {
        if (seen.has(value)) return;
        seen.add(value);
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
          found.push({ path, bytes: value.byteLength });
          return;
        }
        for (const k of Object.keys(value)) {
          try { walk(value[k], `${path}.${k}`, depth + 1); } catch { /* getter */ }
        }
      }
    };
    for (const e of (snap && snap.events) || []) {
      seen.clear();
      for (const k of Object.keys(e || {})) {
        if (k === 'frame' || k === 'kind') continue;
        try { walk(e[k], `${e.kind}@${e.frame}.${k}`, 0); } catch { /* getter */ }
      }
    }
    return { count: (snap && snap.events ? snap.events.length : 0), found };
  });
  if (fatEvents && fatEvents.found && fatEvents.found.length) {
    console.log('  fat event payloads:');
    for (const f of fatEvents.found.slice(0, 20)) console.log(`    ${f.path} ${(f.bytes / 1024).toFixed(0)} KB`);
  }

  const result = await page.evaluate(() => {
    const state = window.SF.state;
    const after = window.SF.loop.getDiagnostics();
    const dts = window.__SF_SMOOTH__.dts.slice(30);
    const costs = window.__SF_SMOOTH__.costs.slice(30);
    // ats[i] is the absolute timestamp whose interval produced dts[i] on the UNSLICED arrays;
    // a worstFrames `at` index is relative to the sliced dts, so it maps back with +30.
    const ats = window.__SF_SMOOTH__.ats || [];
    const waves = window.__SF_SMOOTH__.waves || [];
    const countersAfter = state.perfRuntime && typeof state.perfRuntime.getCounterSnapshot === 'function'
      ? state.perfRuntime.getCounterSnapshot()
      : null;
    // Link events carry the raw GL handle; resolve it to the material/program name while still
    // in-page (the handle does not serialize). renderer.info.programs is Three's live registry.
    if (countersAfter && Array.isArray(countersAfter.events)) {
      const programs = (state.render && state.render.renderer && state.render.renderer.info
        && state.render.renderer.info.programs) || [];
      for (const e of countersAfter.events) {
        if (e && e.kind === 'shaderLink' && e.glProgram) {
          const found = programs.find((p) => p && p.program === e.glProgram);
          if (found) {
            e.name = e.name || found.name || '';
            e.cacheKey = e.cacheKey || String(found.cacheKey || '');
          }
          delete e.glProgram;
        }
        // Admission subjects are diagnostic labels; the report only ever prints the first 60
        // chars, and a pathological batch label can grow past the CDP pipe's ~512 MB message
        // ceiling. Bound every event string before the payload crosses the wire.
        if (e && typeof e.subject === 'string' && e.subject.length > 240) {
          e.subject = `${e.subject.slice(0, 240)}…[+${e.subject.length - 240} chars]`;
        }
        if (e && typeof e.stack === 'string' && e.stack.length > 4000) {
          e.stack = e.stack.slice(0, 4000);
        }
        // Only primitives may cross the wire: a detail that accidentally captured a THREE
        // object (geometry/material/mesh) serializes whole — megabytes of base64 per event.
        for (const k of Object.keys(e || {})) {
          if (e[k] !== null && typeof e[k] === 'object') delete e[k];
        }
      }
    }
    // A long interval is paid for by the frame BEFORE it: that callback's work, or time outside it.
    const names = ['callback', 'sim', 'present', 'render', 'vfx', 'ui', 'feel', 'admission'];
    const long = { count: 0, callbackBound: 0, sums: new Array(names.length).fill(0) };
    const all = { count: 0, sums: new Array(names.length).fill(0) };
    for (let i = 1; i < dts.length; i++) {
      const cost = costs[i - 1];
      if (!cost) continue;
      all.count++;
      for (let k = 0; k < names.length; k++) all.sums[k] += cost[k];
      if (dts[i] <= 33.4) continue;
      long.count++;
      if (cost[0] >= 16.7) long.callbackBound++;
      for (let k = 0; k < names.length; k++) long.sums[k] += cost[k];
    }
    // The worst freezes, one by one: the interval, then what the frame before it spent.
    const worstFrames = [];
    for (let i = 1; i < dts.length; i++) {
      if (dts[i] > 60 && costs[i - 1]) worstFrames.push({ at: i, dt: dts[i], cost: costs[i - 1] });
    }
    worstFrames.sort((x, y) => y.dt - x.dt);
    const mean = (bucket) => Object.fromEntries(names.map((name, k) => [name, bucket.count ? bucket.sums[k] / bucket.count : 0]));
    const sorted = [...dts].sort((a, b) => a - b);
    const pick = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
    const pool = state.render && state.render.asteroidInstancePool;
    const hostiles = (state.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && e.id !== state.playerId).length;
    const projectiles = (state.entityList || []).filter((e) => e && e.alive !== false && e.type === 'projectile').length;
    const info = state.render && state.render.renderer && state.render.renderer.info && state.render.renderer.info.render;
    const player = state.entities && state.entities.get(state.playerId);
    return {
      after: { ...after },
      frames: dts.length,
      meanMs: dts.reduce((sum, dt) => sum + dt, 0) / Math.max(1, dts.length),
      p50: pick(0.5),
      p95: pick(0.95),
      p99: pick(0.99),
      worst: sorted.length ? sorted[sorted.length - 1] : 0,
      over33: dts.filter((dt) => dt > 33.4).length,
      over50: dts.filter((dt) => dt > 50).length,
      over100: dts.filter((dt) => dt > 100).length,
      osReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      motionPreference: state.settings.accessibility && state.settings.accessibility.motionPreference,
      motionReduce: !!(state.settings.video && state.settings.video.motionReduce),
      gpu: state.render && state.render.gpu ? state.render.gpu.renderer : null,
      poolVariants: (() => {
        const stats = pool && (pool.stats || (Array.isArray(pool.variants) ? pool : null));
        return stats && Array.isArray(stats.variants)
          ? stats.variants.map((v) => ({ registered: v.registered, submitted: v.submitted, retired: v.retiredOwners || 0 }))
          : null;
      })(),
      worstFrames: worstFrames.slice(0, 10).map((f) => ({
        at: f.at,
        dt: f.dt,
        t: ats[f.at + 30],
        ...Object.fromEntries(names.map((name, k) => [name, f.cost[k]])),
      })),
      waves,
      frameClockStart: ats.length ? ats[0] : null,
      countersAfter,
      atsRaw: ats,
      scene: { mode: state.mode, ships: hostiles, projectiles, entities: (state.entityList || []).length, drawCalls: info ? info.calls : 0, triangles: info ? info.triangles : 0 },
      longFrames: long.count,
      longCallbackBound: long.callbackBound,
      longMean: mean(long),
      allMean: mean(all),
      speed: player && player.vel ? Math.hypot(player.vel.x, player.vel.z) : 0,
      simTime: state.simTime,
      wallNow: performance.now(),
    };
  });

  const a = result.after;
  const executed = (a.executedFrames || 0) - (before.executedFrames || 0);
  const pct = (n) => `${(100 * n / Math.max(1, result.frames)).toFixed(1)} %`;
  // Wave events relative to the first recorded frame, and the Tier-1 GL deltas across the sample:
  // "zero program links and zero first-draw uploads during a round" is the packet's evidence line.
  const waves = result.waves || [];
  const waveLine = waves.length === 0
    ? 'none captured'
    : waves.map((w) => {
      const rel = result.frameClockStart != null ? (w.t - result.frameClockStart) / 1000 : NaN;
      const relText = Number.isFinite(rel) ? `+${rel.toFixed(1)}s` : '+?s';
      const tag = (w.enemyId != null || w.count != null) ? ` [${w.enemyId ?? ''}×${w.count ?? ''}]` : '';
      return `${relText} ${w.event} w${w.wave ?? '?'}${tag}`;
    }).join('   ');
  const counterDelta = (key) => (
    countersBefore && countersBefore.totals && result.countersAfter && result.countersAfter.totals
      ? (result.countersAfter.totals[key] || 0) - (countersBefore.totals[key] || 0)
      : null
  );
  const linksDelta = counterDelta('shaderLinks');
  const countersLine = linksDelta === null
    ? 'n/a — counters disabled'
    : `shaderLinks +${linksDelta}, bufferFullUploads +${counterDelta('bufferFullUploads')}, bufferPartialUploads +${counterDelta('bufferPartialUploads')}`;
  // Where the links landed: inside a presented frame (a draw-time miss stalls that frame) vs off
  // the frame (an async compile continuation — still a violation of the zero-link packet line, but
  // a different defect), then each link event stamped to seconds into the sample with the program
  // name so the guilty visual family is readable straight off the report.
  const splitDelta = (bag) => (
    countersBefore && countersBefore[bag] && result.countersAfter && result.countersAfter[bag]
      ? (result.countersAfter[bag].shaderLinks || 0) - (countersBefore[bag].shaderLinks || 0)
      : null
  );
  const linksInFrame = splitDelta('nonZeroFrames');
  const linksOffFrame = splitDelta('offFrame');
  const linkSplitLine = linksInFrame === null
    ? 'n/a'
    : `${linksInFrame} frame(s) paid a draw-time link; ${linksOffFrame} link(s) landed off-frame (async compile)`;
  const framesAtStart = countersBefore && Number.isFinite(countersBefore.framesObserved)
    ? countersBefore.framesObserved : null;
  const atsRaw = result.atsRaw || [];
  const linkEvents = (result.countersAfter && Array.isArray(result.countersAfter.events)
    ? result.countersAfter.events : [])
    .filter((e) => e && e.kind === 'shaderLink' && framesAtStart !== null && e.frame >= framesAtStart)
    .map((e) => {
      const k = e.frame - framesAtStart;
      const t = Number.isFinite(atsRaw[k]) ? ((atsRaw[k] - atsRaw[0]) / 1000) : NaN;
      const name = e.name ? String(e.name) : '?';
      const key = e.cacheKey ? String(e.cacheKey).slice(0, 40) : '';
      const subject = e.subject ? `  via ${String(e.subject).slice(0, 60)}` : '';
      // For a link we cannot name (program already released from info.programs), two stack
      // frames still identify the path that produced it — shadow pass, admission, or draw.
      let stackHint = '';
      if (name === '?' && typeof e.stack === 'string' && e.stack) {
        const frame = e.stack.split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('at ') && !/perfCounters|glInstrumentation|WebGLProgram|acquireProgram|Error/.test(line))
          .slice(0, 4)
          .join(' <- ')
          .replace(/https?:\/\/[^ )]+/g, '')
          .slice(0, 180);
        if (frame) stackHint = `  [${frame}]`;
      }
      return `    +${Number.isFinite(t) ? t.toFixed(1) : '?'}s  ${name}${key ? `  (${key})` : ''}${subject}${stackHint}`;
    });
  // In-flight mesh builds are the deferred-streaming tail — printing them names the entities whose
  // draws produced the link burst above.
  const buildEvents = (result.countersAfter && Array.isArray(result.countersAfter.events)
    ? result.countersAfter.events : [])
    .filter((e) => e && e.kind === 'meshBuild' && framesAtStart !== null && e.frame >= framesAtStart)
    .map((e) => {
      const k = e.frame - framesAtStart;
      const t = Number.isFinite(atsRaw[k]) ? ((atsRaw[k] - atsRaw[0]) / 1000) : NaN;
      return `    +${Number.isFinite(t) ? t.toFixed(1) : '?'}s  build ${String(e.type || '?')}:${String(e.typeId || e.entityId)}`;
    });
  // Full buffer uploads are the geometry-residency half of the same story: each one is a fresh
  // GPU allocation inside the sampled round. The subject tag names the admission that paid it.
  const uploadEvents = (result.countersAfter && Array.isArray(result.countersAfter.events)
    ? result.countersAfter.events : [])
    .filter((e) => e && e.kind === 'bufferFullUpload' && framesAtStart !== null && e.frame >= framesAtStart)
    .map((e) => {
      const k = e.frame - framesAtStart;
      const t = Number.isFinite(atsRaw[k]) ? ((atsRaw[k] - atsRaw[0]) / 1000) : NaN;
      const subject = e.subject ? `  via ${String(e.subject).slice(0, 60)}` : '';
      return `    +${Number.isFinite(t) ? t.toFixed(1) : '?'}s  bufferData ${e.bytes || 0}B${subject}`;
    });
  // Compact the upload stream: hundreds of identical allocations (e.g. a wave of the same hull)
  // would drown the report — group by second+subject and show counts.
  const uploadGroups = new Map();
  for (const line of uploadEvents) {
    const second = line.match(/\+([\d.]+)s/);
    const key = `${Math.floor(Number(second && second[1]) || 0)}s|${line.slice(line.indexOf('  bufferData'))}`;
    uploadGroups.set(key, (uploadGroups.get(key) || 0) + 1);
  }
  const uploadLines = [...uploadGroups.entries()].slice(0, 24)
    .map(([key, count]) => `    +${key.split('|')[0]}  ×${count}  ${key.split('|').slice(1).join('|')}`);
  const lines = [
    '',
    'SMOOTH-FLIGHT WITNESS',
    `  GPU                         ${result.gpu || 'unknown'}`,
    `  whole-machine CPU busy      ${hostBusy.toFixed(0)} % of ${os.cpus().length} logical cores during the sample (the game alone is ~10-15 %)`,
    `  route                       ${CRUCIBLE ? 'CRUCIBLE swarm, seed 4242, default kit' : 'open flight, new game'}; at end: ${result.scene.ships} other ships, ${result.scene.projectiles} projectiles, ${result.scene.entities} entities, ${result.scene.drawCalls} draw calls, ${(result.scene.triangles / 1000).toFixed(0)}k triangles`,
    `  launch to flight            ${launchToFlightS.toFixed(1)} s`,
    `  sample                      after ${(SETTLE_MS / 1000).toFixed(0)} s of flight: ${(SAMPLE_MS / 1000).toFixed(0)} s, ${result.frames} frames, ${(1000 / result.meanMs).toFixed(1)} fps mean`,
    `  frame time p50/p95/p99      ${result.p50.toFixed(1)} / ${result.p95.toFixed(1)} / ${result.p99.toFixed(1)} ms; worst ${result.worst.toFixed(0)} ms`,
    `  frames over 33 / 50 / 100   ${result.over33} (${pct(result.over33)}) / ${result.over50} (${pct(result.over50)}) / ${result.over100}`,
    `  typical frame costs (ms)    ${Object.entries(result.allMean).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}`,
    `  before a LONG frame (ms)    ${Object.entries(result.longMean).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}`,
    `  long frames paid in JS      ${result.longCallbackBound} of ${result.longFrames} (the rest: GPU, compositor or GC outside the game's callback)`,
    '  worst freezes (ms): interval <- callback = sim + present(render, vfx, ui) ...',
    ...result.worstFrames.map((f) => `    #${String(f.at).padStart(4)}  ${f.dt.toFixed(0).padStart(4)} <- callback ${f.callback.toFixed(0).padStart(4)}  sim ${f.sim.toFixed(0).padStart(4)}  present ${f.present.toFixed(0).padStart(4)}  (render ${f.render.toFixed(0)}, vfx ${f.vfx.toFixed(0)}, ui ${f.ui.toFixed(0)})  admission ${f.admission.toFixed(0)}  ${nearestWaveEventLabel(f.t, waves)}`),
    `  wave events (s into sample)   ${waveLine}`,
    // PQ-210.00, 2026-09-21: read this line BEFORE the link count. The sample opens at flight
    // start, so whether a wave arrival lands inside the 30 s window depends on how long the
    // cook took — a slower build pushes wave 1 behind the loading shell and the window then
    // reports zero links because nothing spawned, not because a prewarm worked. Four runs of
    // the same seed were compared on their link counts before anyone noticed that only one of
    // them contained a wave. Two runs are comparable only if this line says COVERED on both.
    `  wave arrival in window      ${waves.some((w) => w.event === 'run:waveMaterialized')
      ? 'COVERED — a wave materialized inside the sample; the link count below is about a real spawn'
      : 'NOT COVERED — no wave materialized in this window. The link/upload counts below say'
        + ' nothing about wave-arrival cost, and must not be compared against a run that was covered.'}`,
    `  program links / buffer uploads ${countersLine}`,
    `  link placement                ${linkSplitLine}`,
    `  admissions queued at flight   pipelines ${admissionAtFlightStart.pendingPipelines ?? 'n/a'}, residency ${admissionAtFlightStart.pendingResidency ?? 'n/a'}`,
    `  roster prewarm at flight      ${Array.isArray(prewarmAudit)
      ? (prewarmAudit.length === 0 ? 'no exemplar roots mounted'
        : `${prewarmAudit.length} roots, ${prewarmAudit.reduce((s, r) => s + r.unready, 0)} unready materials${(prewarmAudit.some((r) => r.unready > 0 || r.meshes === 0)) ? ` — ${prewarmAudit.filter((r) => r.unready > 0 || r.meshes === 0).map((r) => `${r.id}(${r.meshes}m,${r.unready}/${r.materials},${r.state})`).join(' ')}` : ''}`)
      : 'audit unavailable'}`,
    ...(cookLedger && (cookLedger.catalog || (cookLedger.pendingPipelines | 0) > 0 || (cookLedger.pendingResidency | 0) > 0)
      ? [`  roster catalog at flight    ${cookLedger.catalog ? `${cookLedger.catalog.loaded}/${cookLedger.catalog.total} loaded, ${cookLedger.catalog.holders} holders, ${cookLedger.catalog.compiles} compiles${cookLedger.catalog.poolCandidates != null ? `, ${cookLedger.catalog.poolCandidates} pool candidates` : ''}` : 'n/a'}; queues pipelines ${cookLedger.pendingPipelines ?? 'n/a'}, residency ${cookLedger.pendingResidency ?? 'n/a'}`]
      : []),
    ...(cookLedger && Array.isArray(cookLedger.steps) && cookLedger.steps.length
      ? [`  cook ledger                 ${cookLedger.steps.slice(-18).join(' | ')}`]
      : []),
    ...linkEvents.slice(0, 24),
    ...(buildEvents.length ? ['  mesh builds in sample:', ...buildEvents.slice(0, 30)] : []),
    ...(uploadLines.length ? ['  buffer uploads in sample:', ...uploadLines] : []),
    `  SHIP LOST ITS PLACE         ${(a.duplicateMomentPresents || 0) - (before.duplicateMomentPresents || 0)} presents redrew an already-drawn moment (must be 0)`,
    `  hitch callbacks             ${(a.hitchCappedFrameCount || 0) - (before.hitchCappedFrameCount || 0)} of ${executed} (world resumed two ticks on)`,
    `  frames that shed sim time   ${(a.shedBacklogFrames || 0) - (before.shedBacklogFrames || 0)}`,
    `  game speed vs real time     ${(100 * (result.simTime - clockBefore.sim) / Math.max(0.001, (result.wallNow - clockBefore.wall) / 1000)).toFixed(1)} % (hit-stop and hitches are the only things allowed to lower it)`,
    `  OS says reduce motion       ${result.osReducedMotion}`,
    `  game motion setting         ${result.motionPreference} -> effects ${result.motionReduce ? 'STRIPPED' : 'FULL'}`,
    `  rock batches                ${result.poolVariants ? result.poolVariants.map((v) => `${v.submitted}/${v.registered}${v.retired ? ` retired×${v.retired}` : ''}`).join('  ') : 'n/a'}`,
    `  player speed at end         ${result.speed.toFixed(0)} WU/s`,
    `  console errors              ${consoleErrors.length}`,
    ...consoleErrors.slice(0, 12).map((line) => `    ${line}`),
    '',
  ];
  console.log(lines.join('\n'));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
