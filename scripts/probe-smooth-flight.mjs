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
// --with-kill: the weave-and-shoot pilot aims at the nearest hostile (same input channel a
// player drives) so the sample contains a real entity:killed — the dead-hulk attach's
// program/buffer coverage is only measured when a kill actually happens.
const WITH_KILL = process.argv.includes('--with-kill');
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

async function waitForServer(url, timeoutMs = 120_000) {
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
  const gpuBricks = [];
  page.on('console', (msg) => {
    // GPU-brick warnings carry a host-wall stamp so a multi-second present stall can be named
    // bloom/GPU-side even though it never shows up inside the game's own callback budget.
    if (/\[GPU brick\]/.test(msg.text())) gpuBricks.push({ at: Date.now(), text: msg.text().slice(0, 80) });
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
  // domcontentloaded is cheap on a quiet box but Chromium itself is starved on a contended
  // one — the cook wait below already tolerates that class of host, so the navigation does too.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 300_000 });
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
  // Wave lifecycle listeners attach BEFORE the flight wait: a crucible wave-1 cohort
  // materializes on the first flight sim ticks — ahead of firstPlayableFrameAt — so a
  // subscription deferred to sample start reports 'NOT COVERED' for an arrival the
  // counters did in fact measure. Stamps use the same performance.now() clock as the
  // frame recorder, with simTime alongside for alignment against sim-gated events.
  await page.evaluate(() => {
    const waves = [];
    window.__SF_SMOOTH_WAVES__ = waves;
    for (const event of ['run:wavePlanned', 'run:waveStarted', 'run:waveMaterialized']) {
      window.SF.bus.on(event, (p) => waves.push({
        t: performance.now(),
        sim: window.SF.state && window.SF.state.simTime,
        event,
        wave: p && p.wave,
        enemyId: p && p.enemyId,
        count: p && p.admitted,
      }));
    }
  });
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
    const record = {
      dts: [], ats: [], costs: [],
      waves: Array.isArray(window.__SF_SMOOTH_WAVES__) ? window.__SF_SMOOTH_WAVES__ : [],
      last: 0,
    };
    window.__SF_SMOOTH__ = record;
    // Long tasks are the main-thread work that runs BETWEEN display callbacks — decode, parse,
    // clone and reconcile bursts all land here. A multi-second interval with a quiet callback is
    // unexplained without this list; attribution.name/container point at the responsible context.
    record.longTasks = [];
    try {
      record.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          record.longTasks.push({
            t: entry.startTime,
            ms: entry.duration,
            name: entry.name,
            attribution: (entry.attribution || []).map((a) => (
              `${a.name || '?'}:${(a.containerName || a.containerSrc || a.containerId || '').toString().slice(0, 80)}`
            )),
          });
        }
      });
      record.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch { /* longtask unsupported */ }
    const scratch = {};
    // Program handles are released from renderer.info.programs when the last material using them
    // is disposed, so a link event looked up only at sample end can come back nameless. Track
    // handle -> {name, cacheKey} every frame: a link whose key was seen before resolves even
    // after the program is released, separating "novel variant" from "released and relinked".
    record.programsSeen = new Map();
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
            scratch.untrackedMs || 0, scratch.externalCallbackGapMs || 0,
            scratch.callbackDispatchLagMs || 0, scratch.callbackIntervalMs || 0,
          ]);
        } else {
          record.costs.push(null);
        }
        try {
          const programs = window.SF && window.SF.state && window.SF.state.render
            && window.SF.state.render.renderer && window.SF.state.render.renderer.info
            && window.SF.state.render.renderer.info.programs;
          if (Array.isArray(programs)) {
            for (const p of programs) {
              if (p && p.program && !record.programsSeen.has(p.program)) {
                record.programsSeen.set(p.program, {
                  name: p.name || '',
                  cacheKey: String(p.cacheKey || ''),
                });
              }
            }
          }
        } catch { /* diagnostic only */ }
        try {
          // Long-lived rounds (>=16 s) make the LIVE projectile count a frame-cost input, not
          // just an end-state number — the peak is what the physics/presenter had to carry.
          const list = window.SF && window.SF.state && window.SF.state.entityList;
          if (Array.isArray(list)) {
            let live = 0;
            for (const e of list) if (e && e.type === 'projectile' && e.alive !== false) live++;
            if (live > (record.projPeak || 0)) record.projPeak = live;
          }
        } catch { /* diagnostic only */ }
      }
      record.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // The in-game hitch classifier (opt-in; zero cost when off) names each >32 ms frame's owner
    // — compile/upload/bloom/sim/externalScheduling — from phases only it can see. Its histogram
    // is the report's authoritative owner tally for the whole window.
    const perf = window.SF && window.SF.state && window.SF.state.perfRuntime;
    if (perf) {
      // Both flags: detailed owners (compile/upload/bloom/meshBuild) only accumulate when
      // renderWork is on, and classification runs only when hitch attribution is on.
      if (typeof perf.setRenderWorkEnabled === 'function') perf.setRenderWorkEnabled(true);
      if (typeof perf.setHitchAttributionEnabled === 'function') perf.setHitchAttributionEnabled(true);
      record.attributionRestorable = {
        renderWork: perf.renderWorkEnabled === true,
      };
    }
  });
  const before = await page.evaluate(() => ({ ...window.SF.loop.getDiagnostics() }));
  const clockBefore = await page.evaluate(() => ({ sim: window.SF.state.simTime, wall: performance.now() }));
  // Host wall-clock pair for the same instant: GPU-brick stamps (Date.now) map back onto the
  // page's performance.now frame clock through this offset.
  const clockBeforeHostAt = Date.now();
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
    // Every program key linked so far. An in-flight link whose key is absent here is a NOVEL
    // variant (never warmed); one present is a RELINK — the program was compiled during the
    // cook and released before the draw (an eviction/refcount defect, not a coverage hole).
    const programKeysAtStart = [];
    try {
      const programs = render && render.renderer && render.renderer.info
        && render.renderer.info.programs;
      if (Array.isArray(programs)) {
        for (const p of programs) {
          if (p && p.cacheKey) programKeysAtStart.push(String(p.cacheKey));
        }
      }
    } catch { /* diagnostic only */ }
    return {
      pendingPipelines: render && typeof render.pendingPipelineAdmissions === 'function'
        ? render.pendingPipelineAdmissions() : null,
      pendingResidency: render && typeof render.pendingAuthoredGpuResidency === 'function'
        ? render.pendingAuthoredGpuResidency() : null,
      upgradeQueue: (render && render.scene && render.scene.userData
        && render.scene.userData.authoredUpgradeDiagnostics) || null,
      programKeysAtStart,
    };
  });
  // Direct evidence the roster prewarm actually finished: for every hidden exemplar root still
  // mounted at flight start, count materials with no linked program yet. Anything >0 means the
  // warm was admitted but not compiled — the wave spawn will pay that link inside the fight.
  const sweepKeysAtStart = await page.evaluate(() => (
    (window.SF.state && window.SF.state.render && window.SF.state.render.survivalDepthSweepKeys) || null
  ));
  const prewarmAudit = await page.evaluate(() => {
    const render = window.SF.state && window.SF.state.render;
    const scene = render && render.scene;
    const r = render && render.renderer;
    if (!scene || !r || !r.properties) return null;
    const rows = [];
    // Warm roots on the scene, plus the bounded warm roots the renderer parks off the graph once
    // the loading cook is done with them (render._parkBoundedWarmRoots) — parked roots still hold
    // every program the warm linked, so they belong in the audit.
    const warmRoots = [];
    scene.traverse((object) => {
      const tag = object.userData && object.userData.rosterPrewarm;
      if (tag && object.parent === scene) warmRoots.push(object);
    });
    for (const parked of Array.isArray(render.parkedWarmRoots) ? render.parkedWarmRoots : []) {
      if (parked && !warmRoots.includes(parked)) warmRoots.push(parked);
    }
    warmRoots.forEach((object) => {
      const tag = object.userData && object.userData.rosterPrewarm;
      let materials = 0;
      let unready = 0;
      let meshes = 0;
      const warmKeys = new Set();
      object.traverse((child) => {
        if (child && child.isMesh) meshes++;
        const list = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
        for (const material of list) {
          materials++;
          try {
            const props = r.properties.get(material);
            if (!props || !props.currentProgram) unready++;
            // The exact key the warm compile produced. A later link event whose cacheKey is
            // NOT in this set is a program variant the warm never built — drift, not a miss.
            else if (props.currentProgram.cacheKey) warmKeys.add(String(props.currentProgram.cacheKey));
          } catch { unready++; }
        }
      });
      rows.push({
        id: tag,
        state: object.userData.authoredAssetState || null,
        meshes,
        materials,
        unready,
        warmKeys: [...warmKeys],
      });
    });
    return rows;
  });

  // Boundary census at flight start: every mounted mesh that still carries an authored boundary
  // gets one row — id/type/place identity, admission state, and whether the boundary is still
  // under the live scene. A boundary that later links in-flight must show here as
  // awaiting/cancelled (never requested), or 'authored' (composed but its draw still missed).
  const boundaryCensusAtStart = await page.evaluate(() => {
    const render = window.SF.state && window.SF.state.render;
    const meshes = render && render.meshes;
    const scene = render && render.scene;
    if (!meshes || !scene) return null;
    const rows = [];
    for (const [id, mesh] of meshes) {
      const data = mesh && mesh.userData;
      if (!data) continue;
      const state = data.authoredAssetState;
      const hasHook = typeof data.requestAuthoredUpgrade === 'function';
      if (!state && !hasHook) continue;
      const entity = window.SF.state.entities && window.SF.state.entities.get(id);
      const ed = entity && entity.data || {};
      let inScene = false;
      for (let node = mesh; node; node = node.parent) { if (node === scene) { inScene = true; break; } }
      // Program-key fingerprint: the compiled variant each subtree material holds at flight
      // start, keyed by material uuid. The end census repeats it — a material whose key changed
      // names the drifting program parameter instead of guessing it.
      const r = render.renderer;
      const progMap = {};
      if (r && r.properties && typeof mesh.traverse === 'function') {
        mesh.traverse((child) => {
          if (!child) return;
          const list = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
          for (const material of list) {
            try {
              const props = r.properties.get(material);
              const key = props && props.currentProgram && props.currentProgram.cacheKey;
              if (key && progMap[material.uuid] === undefined) {
                progMap[material.uuid] = String(key).slice(0, 160);
              }
            } catch { /* probe read only */ }
          }
        });
      }
      rows.push({
        id,
        type: entity && entity.type || null,
        key: ed.placeId || ed.stationId || ed.poiId || ed.worldRecordId || ed.siteId || ed.defId || null,
        state: state || null,
        phase: data.authoredPreparePhase || null,
        inScene,
        promise: !!data.authoredUpgradePromise,
        meshIsEntityMesh: !!(entity && entity.mesh === mesh),
        // 'awaiting + nopromise' means either never requested (mounted after the last kick pass)
        // or a lifecycle-aborted request reset — the reason string separates the two.
        readmission: data.authoredReadmissionReason || null,
        requestedAt: data.authoredUpgradeRequestedAt != null ? Number(data.authoredUpgradeRequestedAt) : null,
        progMap,
      });
    }
    return rows;
  });

  // The cook ledger owns the "why was the shell released with work outstanding" answer:
  // which prep step timed out, and how much of the catalog/pipeline backlog was left.
  const cookLedger = await page.evaluate(() => {
    const render = window.SF.state && window.SF.state.render;
    const ledger = Array.isArray(render && render.openingCookLedger) ? render.openingCookLedger : [];
    return {
      // PQ-210.02 counted exit: the boot-order tail settle's receipt (kicks, wait, final
      // queue/residency counters) — proof the shell, not the first 20 s, paid the leftover
      // opening composition.
      openingTail: (render && render.openingCompositionTail) || null,
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
      crucibleWarm: render && render.crucibleWarmProgress || null,
      pendingPipelines: typeof render.pendingPipelineAdmissions === 'function'
        ? render.pendingPipelineAdmissions() : null,
      pendingResidency: typeof render.pendingAuthoredGpuResidency === 'function'
        ? render.pendingAuthoredGpuResidency() : null,
      // Which instance-pool chunks already exist when flight starts? A wave-1 hull pool
      // present here means the launch warm promoted it; absent means the first live spawn
      // still pays chunk creation (instanceMatrix bufferData) in-round.
      shipPoolsAtFlight: (() => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const dumpScenePools = (diag && typeof diag.scenePoolDump === 'function')
          ? diag.scenePoolDump
          : (render && typeof render.scenePoolDump === 'function' ? render.scenePoolDump : null);
        if (!dumpScenePools) return null;
        const dump = dumpScenePools();
        if (!dump || !Array.isArray(dump.pools)) return null;
        const shipPools = [];
        for (const pool of dump.pools) {
          for (const chunk of pool.chunks || []) {
            const name = String(chunk.name || '');
            if (!name.includes('WHOLESHIP') && !name.includes('WEAPON')) continue;
            shipPools.push({
              name: name.slice(0, 96),
              inScene: !!chunk.inScene,
              count: chunk.count,
              slots: chunk.slots,
              retired: !!chunk.retired,
              owners: (chunk.slotOwners || []).slice(0, 4),
            });
          }
        }
        const candidates = [];
        for (const candidate of dump.candidates || []) {
          const key = String(candidate.key || '');
          const label = String(candidate.label || '');
          if (!key.includes('WHOLESHIP') && !key.includes('WEAPON')
              && !label.includes('WHOLESHIP') && !label.includes('WEAPON')) continue;
          candidates.push({ label: label.slice(0, 96), owner: String(candidate.owner || '').slice(0, 64) });
        }
        return {
          pools: shipPools.length,
          chunks: shipPools,
          owners: (dump.owners || []).length,
          candidateCount: (dump.candidates || []).length,
          shipCandidates: candidates.slice(0, 16),
          diag: dump.poolDiag || null,
        };
      })(),
    };
  });

  if (WITH_KILL) {
    await page.evaluate(() => {
      window.__SF_KILL_COUNT__ = 0;
      window.SF.bus.on('entity:killed', () => { window.__SF_KILL_COUNT__ += 1; });
      // Aim the reticle at the nearest hostile every 200 ms so held LMB actually connects —
      // the crucible kill-shot script's channel, not a faked kill.
      window.__SF_AIM__ = setInterval(() => {
        const st = window.SF.state;
        const p = st.entities && st.entities.get(st.playerId);
        if (!p || !p.pos) return;
        let best = null; let bestD = Infinity;
        for (const e of st.entityList || []) {
          if (!e || e === p || e.alive === false || !e.pos) continue;
          if (e.team == null || e.team === p.team) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (!best) return;
        st.input = st.input || {};
        st.input.aimX = best.pos.x;
        st.input.aimZ = best.pos.z;
        if (st.player) st.player.targetId = best.id;
      }, 200);
    });
  }
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
  const killsInSample = WITH_KILL
    ? await page.evaluate(() => {
      clearInterval(window.__SF_AIM__);
      return window.__SF_KILL_COUNT__ || 0;
    }).catch(() => null)
    : null;

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
    // Upload events carry the CPU-side source array (see countBufferUpload); resolve it to the
    // owning "meshName.attribute" by object identity against every geometry attribute in the
    // scene — Three's GL-side buffer registry is closure-private, but the array is shared.
    const uploadArrayOwners = (() => {
      const render = state.render;
      const scene = render && render.scene;
      if (!scene || typeof scene.traverse !== 'function') return null;
      const owners = new Map();
      const note = (array, label) => {
        if (!array || (typeof array !== 'object')) return;
        const prior = owners.get(array);
        if (prior === undefined) owners.set(array, label);
        else if (!prior.split(' ').includes(label) && prior.split(' ').length < 3) {
          owners.set(array, `${prior} ${label}`);
        }
      };
      scene.traverse((child) => {
        if (!child) return;
        const meshName = child.name || child.userData && child.userData.kind || child.type || 'mesh';
        const geo = child.geometry;
        if (geo && typeof geo.getAttribute === 'function') {
          const tag = (attr, attrName) => {
            if (!attr) return;
            const interleaved = attr.isInterleavedBufferAttribute === true;
            const arr = (interleaved ? attr.data && attr.data.array : attr.array) || null;
            note(arr, `${meshName}.${attrName}`);
          };
          try { tag(geo.index, 'index'); } catch { /* probe read only */ }
          try {
            for (const attrName of Object.keys(geo.attributes || {})) tag(geo.getAttribute(attrName), attrName);
          } catch { /* probe read only */ }
        }
        if (child.isInstancedMesh === true) {
          try { note(child.instanceMatrix && child.instanceMatrix.array, `${meshName}.instanceMatrix`); } catch { /* probe read only */ }
          try { note(child.instanceColor && child.instanceColor.array, `${meshName}.instanceColor`); } catch { /* probe read only */ }
        }
      });
      return owners;
    })();
    // Link events carry the raw GL handle; resolve it to the material/program name while still
    // in-page (the handle does not serialize). renderer.info.programs is Three's live registry.
    if (countersAfter && Array.isArray(countersAfter.events)) {
      for (const e of countersAfter.events) {
        if (e && e.kind === 'bufferFullUpload' && e.sourceData) {
          e.bufferOwner = (uploadArrayOwners && uploadArrayOwners.get(e.sourceData)) || null;
        }
      }
    }
    if (countersAfter && Array.isArray(countersAfter.events)) {
      const programs = (state.render && state.render.renderer && state.render.renderer.info
        && state.render.renderer.info.programs) || [];
      // The per-frame tracker remembers handles that were since released — a relinked program
      // resolves here even though info.programs no longer lists it.
      const seen = (window.__SF_SMOOTH__ && window.__SF_SMOOTH__.programsSeen) || null;
      for (const e of countersAfter.events) {
        if (e && e.kind === 'shaderLink' && e.glProgram) {
          const remembered = seen && seen.get(e.glProgram);
          if (remembered) {
            e.name = e.name || remembered.name || '';
            e.cacheKey = e.cacheKey || String(remembered.cacheKey || '');
            e.programReleasedBeforeSampleEnd = !programs.some((p) => p && p.program === e.glProgram);
          } else {
            const found = programs.find((p) => p && p.program === e.glProgram);
            if (found) {
              e.name = e.name || found.name || '';
              e.cacheKey = e.cacheKey || String(found.cacheKey || '');
            }
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
      // Every frame over 50 ms with its full cost row: the report prints each one with a
      // named owner and the nearest wave event, instead of only the top-10 freezes.
      longFrameRows: (() => {
        const rows = [];
        for (let i = 1; i < dts.length; i++) {
          if (dts[i] > 50 && costs[i - 1]) rows.push({ at: i, t: ats[i], dt: dts[i], cost: costs[i - 1] });
        }
        return rows;
      })(),
      waves,
      frameClockStart: ats.length ? ats[0] : null,
      countersAfter,
      boundaryCensusAtEnd: (() => {
        const render = state.render;
        const meshes = render && render.meshes;
        const scene = render && render.scene;
        if (!meshes || !scene) return null;
        const rows = [];
        for (const [id, mesh] of meshes) {
          const data = mesh && mesh.userData;
          if (!data) continue;
          const st = data.authoredAssetState;
          const hasHook = typeof data.requestAuthoredUpgrade === 'function';
          if (!st && !hasHook) continue;
          const entity = state.entities && state.entities.get(id);
          const ed = entity && entity.data || {};
          let inScene = false;
          for (let node = mesh; node; node = node.parent) { if (node === scene) { inScene = true; break; } }
          const r = render.renderer;
          const progMap = {};
          if (r && r.properties && typeof mesh.traverse === 'function') {
            mesh.traverse((child) => {
              if (!child) return;
              const list = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
              for (const material of list) {
                try {
                  const props = r.properties.get(material);
                  const key = props && props.currentProgram && props.currentProgram.cacheKey;
                  if (key && progMap[material.uuid] === undefined) {
                    progMap[material.uuid] = String(key).slice(0, 160);
                  }
                } catch { /* probe read only */ }
              }
            });
          }
          rows.push({
            id,
            type: entity && entity.type || null,
            key: ed.placeId || ed.stationId || ed.poiId || ed.worldRecordId || ed.siteId || ed.defId || null,
            state: st || null,
            phase: data.authoredPreparePhase || null,
            inScene,
            promise: !!data.authoredUpgradePromise,
            meshIsEntityMesh: !!(entity && entity.mesh === mesh),
            progMap,
          });
        }
        return rows;
      })(),
      atsRaw: ats,
      longTasks: (window.__SF_SMOOTH__ && Array.isArray(window.__SF_SMOOTH__.longTasks)
        ? window.__SF_SMOOTH__.longTasks : []),
      hitchHistogram: state.perfRuntime && typeof state.perfRuntime.getHitchHistogram === 'function'
        ? state.perfRuntime.getHitchHistogram()
        : null,
      hitchVerdicts: state.perfRuntime && typeof state.perfRuntime.getHitchVerdicts === 'function'
        ? state.perfRuntime.getHitchVerdicts()
        : null,
      // Program → live owners: for every cacheKey still current on a material, which materials
      // and meshes hold it. A NOVEL link's cacheKey resolves here to the exact visual family
      // (material.name / mesh.name) that drew it, ending the "which variant" guesswork.
      programOwners: (() => {
        const render = state.render;
        const scene = render && render.scene;
        const r = render && render.renderer;
        if (!scene || !r || !r.properties || typeof scene.traverse !== 'function') return null;
        const owners = {};
        scene.traverse((child) => {
          if (!child) return;
          const list = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
          for (const material of list) {
            if (!material) continue;
            try {
              const props = r.properties.get(material);
              const key = props && props.currentProgram && props.currentProgram.cacheKey;
              if (!key) continue;
              const k = String(key);
              const matName = material.name || material.type || 'material';
              const meshName = child.name || child.type || 'mesh';
              const owner = `${matName}@${meshName}`;
              if (!owners[k]) owners[k] = [];
              if (owners[k].length < 4 && !owners[k].includes(owner)) owners[k].push(owner);
            } catch { /* probe read only */ }
          }
        });
        return owners;
      })(),
      scene: { mode: state.mode, ships: hostiles, projectiles, projectilePeak: window.__SF_SMOOTH__ && window.__SF_SMOOTH__.projPeak || 0, entities: (state.entityList || []).length, drawCalls: info ? info.calls : 0, triangles: info ? info.triangles : 0 },
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
      // Events captured before the sample clock starts (wave-1 materializes on the first
      // flight sim ticks, ahead of the recorder's first frame) print as negative offsets —
      // that is the arrival the window was opened to catch, not noise to drop.
      const relText = Number.isFinite(rel) ? `${rel >= 0 ? '+' : ''}${rel.toFixed(1)}s` : '+?s';
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
  const framesAtStart = countersBefore && Number.isFinite(countersBefore.framesObserved)
    ? countersBefore.framesObserved : null;
  const atsRaw = result.atsRaw || [];
  const programKeysAtStartSet = new Set(
    (admissionAtFlightStart && admissionAtFlightStart.programKeysAtStart) || [],
  );
  // Decode a program cacheKey into named fields so a NOVEL variant can be diffed against the
  // nearest warmed key — the differing field IS the program parameter the warm missed. Field
  // order mirrors WebGLPrograms.getProgramCacheKey: shaderID, defines pairs, then a fixed
  // parameter run anchored on precision, then two feature bitmasks.
  const PROGRAM_PARAM_FIELDS = [
    'precision', 'outputColorSpace', 'envMapMode', 'envMapCubeUVHeight',
    'mapUv', 'alphaMapUv', 'lightMapUv', 'aoMapUv', 'bumpMapUv', 'normalMapUv',
    'displacementMapUv', 'emissiveMapUv', 'metalnessMapUv', 'roughnessMapUv',
    'anisotropyMapUv', 'clearcoatMapUv', 'clearcoatNormalMapUv', 'clearcoatRoughnessMapUv',
    'iridescenceMapUv', 'iridescenceThicknessMapUv', 'sheenColorMapUv', 'sheenRoughnessMapUv',
    'specularMapUv', 'specularColorMapUv', 'specularIntensityMapUv', 'transmissionMapUv',
    'thicknessMapUv', 'combine', 'fogExp2', 'sizeAttenuation', 'morphTargetsCount',
    'morphAttributeCount', 'numDirLights', 'numPointLights', 'numSpotLights', 'numSpotLightMaps',
    'numHemiLights', 'numRectAreaLights', 'numDirLightShadows', 'numPointLightShadows',
    'numSpotLightShadows', 'numSpotLightShadowsWithMaps', 'numLightProbes', 'shadowMapType',
    'toneMapping', 'numClippingPlanes', 'numClipIntersection', 'depthPacking',
  ];
  const FEATURE_MASK1 = [
    'instancing', 'instancingColor', 'instancingMorph', 'matcap', 'envMap',
    'normalMapObjectSpace', 'normalMapTangentSpace', 'clearcoat', 'iridescence', 'alphaTest',
    'vertexColors', 'vertexAlphas', 'vertexUv1s', 'vertexUv2s', 'vertexUv3s', 'vertexTangents',
    'anisotropy', 'alphaHash', 'batching', 'dispersion', 'batchingColor', 'gradientMap',
    'packedNormalMap', 'vertexNormals',
  ];
  const FEATURE_MASK2 = [
    'fog', 'useFog', 'flatShading', 'logarithmicDepthBuffer', 'reversedDepthBuffer',
    'skinning', 'morphTargets', 'morphNormals', 'morphColors', 'premultipliedAlpha',
    'shadowMapEnabled', 'doubleSided', 'flipSided', 'useDepthPacking', 'dithering',
    'transmission', 'sheen', 'opaque', 'pointsUvs', 'decodeVideoTexture',
    'decodeVideoTextureEmissive', 'alphaToCoverage', 'lightProbeGrids',
  ];
  const PRECISION_RE = /^(highp|mediump|lowp)$/;
  const decodeProgramKey = (key) => {
    const fields = String(key).split(',');
    let p = 1;
    while (p < fields.length && !PRECISION_RE.test(fields[p])) p += 1;
    if (p >= fields.length) return null;
    const out = { shaderID: fields[0] };
    PROGRAM_PARAM_FIELDS.forEach((name, i) => { out[name] = fields[p + i]; });
    const mask1 = Number(fields[p + PROGRAM_PARAM_FIELDS.length]);
    const mask2 = Number(fields[p + PROGRAM_PARAM_FIELDS.length + 1]);
    out.custom = fields[p + PROGRAM_PARAM_FIELDS.length + 3];
    if (Number.isFinite(mask1)) {
      FEATURE_MASK1.forEach((n, b) => { out[`feat:${n}`] = (mask1 & (1 << b)) ? '1' : '0'; });
    }
    if (Number.isFinite(mask2)) {
      FEATURE_MASK2.forEach((n, b) => { out[`feat:${n}`] = (mask2 & (1 << b)) ? '1' : '0'; });
    }
    return out;
  };
  const diffProgramKeys = (novelKey, startKey) => {
    const a = decodeProgramKey(novelKey);
    const b = decodeProgramKey(startKey);
    if (!a || !b) return null;
    const diffs = [];
    for (const name of ['shaderID', ...PROGRAM_PARAM_FIELDS, 'custom']) {
      if ((a[name] ?? '') !== (b[name] ?? '')) diffs.push(`${name}:${b[name] ?? '∅'}→${a[name] ?? '∅'}`);
    }
    const featNames = new Set(
      [...Object.keys(a), ...Object.keys(b)].filter((k) => k.startsWith('feat:')),
    );
    for (const n of featNames) {
      if ((a[n] === '1') !== (b[n] === '1')) {
        diffs.push(`${n.slice(5)}:${b[n] === '1' ? 'on' : 'off'}→${a[n] === '1' ? 'on' : 'off'}`);
      }
    }
    return diffs;
  };
  const nearestStartKeyDiff = (novelKey) => {
    const novel = decodeProgramKey(novelKey);
    if (!novel) return null;
    let best = null;
    for (const startKey of programKeysAtStartSet) {
      const start = decodeProgramKey(startKey);
      if (!start || start.shaderID !== novel.shaderID) continue;
      const diffs = diffProgramKeys(novelKey, startKey);
      if (diffs && (!best || diffs.length < best.length)) best = diffs;
    }
    return best;
  };
  const noveltyTally = { novel: 0, relink: 0, unknown: 0 };
  const linkEvents = (result.countersAfter && Array.isArray(result.countersAfter.events)
    ? result.countersAfter.events : [])
    .filter((e) => e && e.kind === 'shaderLink' && framesAtStart !== null && e.frame >= framesAtStart)
    .map((e) => {
      const k = e.frame - framesAtStart;
      const t = Number.isFinite(atsRaw[k]) ? ((atsRaw[k] - atsRaw[0]) / 1000) : NaN;
      const name = e.name ? String(e.name) : '?';
      const key = e.cacheKey ? String(e.cacheKey) : '';
      // NOVEL = this program variant did not exist at flight start (warm missed the family).
      // RELINK = the program existed at flight start — it was released and had to be rebuilt.
      const novelty = e.cacheKey
        ? (programKeysAtStartSet.has(String(e.cacheKey)) ? 'RELINK' : 'NOVEL')
        : '?';
      if (novelty === 'NOVEL') noveltyTally.novel += 1;
      else if (novelty === 'RELINK') noveltyTally.relink += 1;
      else noveltyTally.unknown += 1;
      const releasedTag = e.programReleasedBeforeSampleEnd ? ' (released before end)' : '';
      const subject = e.subject ? `  via ${String(e.subject).slice(0, 60)}` : '';
      // The mesh actually being drawn when the link fired — admission subjects name the lane,
      // not the drawable. A NOVEL inside an admission still needs this to say WHICH mesh's
      // material/geometry pair was cold.
      const drawn = e.drawObject ? `  drew ${String(e.drawObject).slice(0, 60)}` : '';
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
      // For a NOVEL variant, name exactly which program parameter the warm never built —
      // the diff against the nearest flight-start key converts "coverage hole" into a fix.
      let driftHint = '';
      if (novelty === 'NOVEL' && e.cacheKey) {
        const diffs = nearestStartKeyDiff(e.cacheKey);
        if (diffs && diffs.length) driftHint = `\n        Δ ${diffs.join(' | ')}`;
      }
      // Owner attribution: the live material/mesh names still holding this program — the
      // material family name makes the guilty visual readable without key-field decoding.
      let ownerHint = '';
      if (e.cacheKey && result.programOwners) {
        const owners = result.programOwners[String(e.cacheKey)];
        if (owners && owners.length) ownerHint = `\n        owners: ${owners.join('  ')}`;
      }
      return `    +${Number.isFinite(t) ? t.toFixed(1) : '?'}s  [${novelty}] ${name}${key ? `  (${key})` : ''}${releasedTag}${subject}${drawn}${stackHint}${driftHint}${ownerHint}`;
    });
  const linkSplitLine = linksInFrame === null
    ? 'n/a'
    : `${linksInFrame} frame(s) paid a draw-time link; ${linksOffFrame} link(s) landed off-frame (async compile)`
      + `; novelty: ${noveltyTally.novel} NOVEL, ${noveltyTally.relink} RELINK, ${noveltyTally.unknown} unkeyed`;
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
      const owner = e.bufferOwner ? `  <- ${String(e.bufferOwner).slice(0, 80)}` : '';
      return `    +${Number.isFinite(t) ? t.toFixed(1) : '?'}s  bufferData ${e.bytes || 0}B${subject}${owner}`;
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
  // Owner attribution for every frame over 50 ms. A long interval is paid by the frame before
  // it: callback ms name the JS owner; a long interval with a quiet callback is work outside
  // the game's callback (GPU process, compositor, GC, host scheduling). shaderLink and buffer
  // upload events carry the same frame counter, so they pin compile/upload to the exact frame;
  // GPU-brick warnings are wall-stamped and mapped back through the sample clock pair.
  const eventKindsByFrame = new Map();
  if (framesAtStart !== null && result.countersAfter && Array.isArray(result.countersAfter.events)) {
    for (const e of result.countersAfter.events) {
      if (!e || !Number.isFinite(e.frame) || e.frame < framesAtStart) continue;
      const k = e.frame - framesAtStart;
      if (!eventKindsByFrame.has(k)) eventKindsByFrame.set(k, []);
      eventKindsByFrame.get(k).push(e.kind);
    }
  }
  const brickFrames = new Set();
  for (const brick of gpuBricks) {
    const pageMs = (brick.at - clockBeforeHostAt) + clockBefore.wall;
    let best = -1;
    for (let k = 0; k < atsRaw.length; k++) {
      if (Math.abs(atsRaw[k] - pageMs) < 1500 && (best < 0 || Math.abs(atsRaw[k] - pageMs) < Math.abs(atsRaw[best] - pageMs))) best = k;
    }
    if (best >= 0) brickFrames.add(best);
  }
  const ownerOf = (row) => {
    const kinds = eventKindsByFrame.get(row.at) || [];
    const c = row.cost;
    const callback = c[0], sim = c[1], render = c[3], vfx = c[4], ui = c[5], admission = c[7];
    const untracked = c[8] || 0, extGap = c[9] || 0, dispLag = c[10] || 0;
    let owner;
    if (kinds.includes('shaderLink')) {
      owner = 'compile';
    } else if (callback >= 25 || callback >= row.dt * 0.5) {
      const js = [['sim', sim], ['render', render], ['vfx', vfx], ['ui', ui], ['admission', admission], ['untracked', untracked]];
      js.sort((a, b) => b[1] - a[1]);
      owner = js[0][1] >= 8 ? js[0][0] : 'unknown';
    } else if (dispLag > extGap && dispLag >= 8) {
      // The display callback fired on time but sat behind other main-thread work —
      // that is OUR non-callback JS (build/clone/decode tasks), not host starvation.
      owner = 'intraFrameTasks';
    } else {
      owner = 'externalScheduling';
    }
    if (kinds.includes('bufferFullUpload')) owner += '+upload';
    if (brickFrames.has(row.at)) owner += '+bloom';
    return owner;
  };
  const longFrameLines = (result.longFrameRows || []).map((row) => {
    const t = result.frameClockStart != null ? (row.t - result.frameClockStart) / 1000 : NaN;
    const rel = Number.isFinite(t) ? `+${t.toFixed(1)}s` : '+?s';
    const c = row.cost;
    const sched = (c[9] || c[10]) ? ` gap ${(c[9] || 0).toFixed(0)} disp ${(c[10] || 0).toFixed(0)}` : '';
    return `    ${rel.padStart(7)} #${String(row.at).padStart(4)}  ${row.dt.toFixed(0).padStart(5)}  ${ownerOf(row).padEnd(24)} cb ${c[0].toFixed(0).padStart(4)} (sim ${c[1].toFixed(0)} ren ${c[3].toFixed(0)} vfx ${c[4].toFixed(0)} ui ${c[5].toFixed(0)} adm ${c[7].toFixed(0)} untr ${(c[8] || 0).toFixed(0)})${sched}  ${nearestWaveEventLabel(row.t, waves)}`;
  });
  // The in-game classifier's own verdict: aggregate owner tally over every hitch in the window
  // plus the trailing verdict ring (atMs is the page-clock stamp of each hitch's callback).
  const hh = result.hitchHistogram;
  const hitchHistogramLine = !hh
    ? 'n/a (hitch attribution unavailable)'
    : `hitches ${hh.hitches} of ${hh.frames} frames, named ${hh.named} (coverage ${(100 * (hh.coverage || 0)).toFixed(0)} %) — `
      + Object.entries(hh.counts || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' | ')
      + (hh.schedulingFrames ? `  (scheduling split: gap-dominant ${hh.schedulingGapDominant}, dispatch-dominant ${hh.schedulingDispatchDominant}, extGap ${(hh.schedulingExternalGapMsTotal || 0).toFixed(0)} ms, dispLag ${(hh.schedulingDispatchLagMsTotal || 0).toFixed(0)} ms)` : '')
      + (hh.bySimSystem && Object.keys(hh.bySimSystem).length ? `  sim: ${Object.entries(hh.bySimSystem).map(([k, n]) => `${k}×${n}`).join(' ')}` : '');
  const verdictLines = (result.hitchVerdicts || []).map((v) => {
    const rel = result.frameClockStart != null && Number.isFinite(v.atMs) ? (v.atMs - result.frameClockStart) / 1000 : NaN;
    return `    ${(Number.isFinite(rel) ? `+${rel.toFixed(1)}s` : '+?s').padStart(7)}  ${v.frameMs.toFixed(0).padStart(5)}  ${v.owner}  ${nearestWaveEventLabel(v.atMs, waves)}`;
  });
  // Long tasks between display callbacks — the otherwise-invisible decode/parse/clone bursts.
  // Printed largest-first so a multi-second block names itself instead of reading as 'external'.
  const longTaskLines = (result.longTasks || [])
    .filter((t) => t.ms >= 100)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 15)
    .map((t) => {
      const rel = result.frameClockStart != null ? (t.t - result.frameClockStart) / 1000 : NaN;
      return `    ${(Number.isFinite(rel) ? `+${rel.toFixed(1)}s` : '+?s').padStart(7)}  ${t.ms.toFixed(0).padStart(6)} ms  ${t.name}  ${(t.attribution || []).join(' ')}`;
    });
  const lines = [
    '',
    'SMOOTH-FLIGHT WITNESS',
    `  GPU                         ${result.gpu || 'unknown'}`,
    `  whole-machine CPU busy      ${hostBusy.toFixed(0)} % of ${os.cpus().length} logical cores during the sample (the game alone is ~10-15 %)`,
    `  route                       ${CRUCIBLE ? 'CRUCIBLE swarm, seed 4242, default kit' : 'open flight, new game'}; at end: ${result.scene.ships} other ships, ${result.scene.projectiles} projectiles (peak ${result.scene.projectilePeak}), ${result.scene.entities} entities, ${result.scene.drawCalls} draw calls, ${(result.scene.triangles / 1000).toFixed(0)}k triangles`,
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
    '  every frame >50 ms: +s into sample, interval ms, owner, callback breakdown, nearest wave',
    ...longFrameLines,
    `  hitch classifier (in-game)    ${hitchHistogramLine}`,
    '  last hitch verdicts: +s into sample, frame ms, owner, nearest wave',
    ...verdictLines,
    '  long tasks ≥100 ms between callbacks (largest first)',
    ...(longTaskLines.length ? longTaskLines : ['    none']),
    // PQ-210.00, 2026-09-21: read this line BEFORE the link count. The sample opens at flight
    // start, so whether a wave arrival lands inside the 30 s window depends on how long the
    // cook took — a slower build pushes wave 1 behind the loading shell and the window then
    // reports zero links because nothing spawned, not because a prewarm worked. Four runs of
    // the same seed were compared on their link counts before anyone noticed that only one of
    // them contained a wave. Two runs are comparable only if this line says COVERED on both.
    `  wave arrival in window      ${(() => {
      const inWindow = waves.some((w) => w.event === 'run:waveMaterialized'
        && result.frameClockStart != null && w.t >= result.frameClockStart);
      if (inWindow) {
        return 'COVERED — a wave materialized inside the sample; the link count below is about a real spawn';
      }
      // A crucible wave-1 cohort materializes on the first flight sim ticks — ahead of the
      // recorder's first frame — but its entities' mesh builds, composes and uploads all land
      // inside the sample. A materialize event within 15 s before the clock start is that
      // arrival: its GPU cost is genuinely measured here.
      const nearMiss = waves.some((w) => w.event === 'run:waveMaterialized'
        && result.frameClockStart != null
        && w.t < result.frameClockStart
        && result.frameClockStart - w.t < 15000);
      if (nearMiss) {
        return 'COVERED (edge) — the wave materialized on the first flight ticks just before the'
          + ' sample clock started; its spawn cost lands inside the window via deferred mesh builds.';
      }
      return 'NOT COVERED — no wave materialized in this window. The link/upload counts below say'
        + ' nothing about wave-arrival cost, and must not be compared against a run that was covered.';
    })()}`,
    `  kills in sample             ${killsInSample == null ? 'n/a (run with --with-kill to force live kills)' : killsInSample}`,
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
    ...(cookLedger && cookLedger.crucibleWarm
      ? [`  crucible warm at flight     ${JSON.stringify(cookLedger.crucibleWarm).slice(0, 900)}`]
      : []),
    ...(cookLedger && cookLedger.shipPoolsAtFlight
      ? (() => {
          const pools = cookLedger.shipPoolsAtFlight;
          const lines = [`  ship pools at flight        ${pools.pools} chunks, ${pools.owners} slot owners, ${pools.candidateCount ?? 'n/a'} pending candidates`];
          for (const chunk of (pools.chunks || []).slice(0, 24)) {
            lines.push(`    ${chunk.name}${chunk.inScene ? '' : ' (off-scene)'} count=${chunk.count} slots=${chunk.slots}${chunk.retired ? ' RETIRED' : ''} owners=${(chunk.owners || []).join(',')}`);
          }
          for (const cand of (pools.shipCandidates || [])) {
            lines.push(`    candidate ${cand.label} owner=${cand.owner}`);
          }
          // Pool-path forensics: which package records' composes got a node factory, which
          // meshes the batch gate rejected, and what each label bucket did inside the pool
          // admission. Filters to ship parts (WHOLESHIP/WEAPON/HULL) — the arena's place
          // records churn the same counters without bearing on the fight.
          const diag = pools.diag;
          if (diag && Array.isArray(diag.admits)) {
            for (const row of diag.admits.slice(0, 20)) {
              lines.push(`    admit ${row.bucket}: calls=${row.calls} installs=${row.installs} dupOwner=${row.dupOwner} promotes=${row.promotes} errors=${row.errors} retires=${row.retires || 0}`);
            }
          }
          if (diag && Array.isArray(diag.partCalls)) {
            for (const row of diag.partCalls.slice(0, 24)) {
              lines.push(`    part ${row.assetId}: calls=${row.calls} noFactory=${row.noFactory}`);
            }
          }
          if (diag && Array.isArray(diag.poolRejects)) {
            for (const row of diag.poolRejects.slice(0, 12)) {
              lines.push(`    reject ${row.assetId}: ${row.count}× (${(row.names || []).join(',')})`);
            }
          }
          return lines;
        })()
      : []),
    ...(cookLedger && Array.isArray(cookLedger.steps) && cookLedger.steps.length
      ? [`  cook ledger                 ${cookLedger.steps.slice(-18).join(' | ')}`]
      : []),
    ...(cookLedger && cookLedger.openingTail
      ? [`  opening tail settle         ${JSON.stringify(cookLedger.openingTail)}`]
      : []),
    ...linkEvents.slice(0, 24),
    // The post-settle depth sweep's per-object keys: a NOVEL live key diffs against the staged
    // key for the same mesh to name the exact program field the live draw changed.
    ...(Array.isArray(sweepKeysAtStart) && sweepKeysAtStart.length
      ? ['  survival depth sweep keys:', ...sweepKeysAtStart.slice(0, 12).map((row) => `    ${row}`)]
      : []),
    // Boundary census: which admission state each mounted boundary held when the sample began.
    // 'authored' at start + a later link = program-key drift; 'awaiting'/'cancelled' at start =
    // the prewarm kick never reached it (not mounted, not relevant, or post-kick reset).
    ...(Array.isArray(boundaryCensusAtStart) ? (() => {
      const buckets = new Map();
      for (const r of boundaryCensusAtStart) {
        const k = r.state || 'none';
        buckets.set(k, (buckets.get(k) || 0) + 1);
      }
      const interesting = boundaryCensusAtStart.filter((r) => (
        r.state !== 'authored' && r.state !== 'procedural-settled'
        && r.state !== 'unavailable' && r.state !== 'same-semantic-fallback'
      ));
      const endById = new Map((result.boundaryCensusAtEnd || []).map((r) => [r.id, r]));
      return [
        `  boundary census at flight   ${[...buckets.entries()].map(([k, n]) => `${k}×${n}`).join(' ') || 'empty'}`,
        ...(interesting.length
          ? [`  non-terminal at start       ${interesting.slice(0, 18).map((r) => {
            const end = endById.get(r.id);
            return `${r.key || r.id}(${r.type},${r.state}${r.phase ? `:${r.phase}` : ''}${r.inScene ? '' : ',detached'}${r.promise ? '' : ',nopromise'}${r.meshIsEntityMesh ? '' : ',no-entity-mesh'}${r.readmission ? `,${r.readmission}` : ''}${r.requestedAt ? '' : ',never-req'}${end ? `->${end.state}` : '->gone'})`;
          }).join(' ')}`]
          : []),
      ];
    })() : []),
    // Program-key drift: per-material compiled-variant diffs between flight start and sample
    // end. A shared record material drifted shows the same (uuid, old->new) under every owner —
    // dedupe keeps the section readable; the two key strings make the changed parameter visible.
    ...(Array.isArray(boundaryCensusAtStart) && Array.isArray(result.boundaryCensusAtEnd) ? (() => {
      const startById = new Map(boundaryCensusAtStart.map((r) => [r.id, r]));
      const diffs = new Map();
      for (const end of result.boundaryCensusAtEnd) {
        const start = startById.get(end.id);
        if (!start || !end.progMap) continue;
        const startMap = start.progMap || {};
        for (const [uuid, newKey] of Object.entries(end.progMap)) {
          const oldKey = startMap[uuid];
          if (oldKey === newKey) continue;
          const tag = `${uuid}|${oldKey || 'none'}|${newKey}`;
          if (!diffs.has(tag)) {
            diffs.set(tag, { id: end.key || end.id, oldKey: oldKey || null, newKey });
          }
        }
      }
      // Did any warm subtree compile this exact variant? warmKeys are the full (unsliced)
      // keys collected per warm root at flight start — a drifted key absent from every set
      // is a family the exemplar never produced; a present key means the program existed
      // and the link was a release/relink, not a coverage hole.
      const warmKeys = new Set();
      for (const row of (prewarmAudit || [])) {
        for (const key of (row && row.warmKeys) || []) warmKeys.add(String(key).slice(0, 160));
      }
      const rows = [...diffs.values()].slice(0, 14);
      if (!rows.length) return [];
      return ['  program-key drift (old -> new):',
        ...rows.map((d) => {
          const covered = warmKeys.has(d.newKey) ? ' [warm-covered]'
            : ` [NOT warmed${(() => {
              const near = nearestStartKeyDiff(d.newKey);
              return near && near.length ? ` — nearest Δ ${near.slice(0, 4).join(' | ')}` : '';
            })()}]`;
          return `    ${d.id}\n      - ${d.oldKey || '(no program at start)'}\n      + ${d.newKey}${covered}`;
        })];
    })() : []),
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
