// Frame-solid audit: on the real game route, everything that belongs in the
// player's frame must be drawn and solid every frame. Fly a public-controls
// route — away from the nearest non-gate station, back into it, then loiter —
// while scripts/lib/frameSolidSampler.mjs counts blinks, missing frames,
// root swaps, authored->stand-in regressions, and frames the player sat inside
// a station's dock envelope with no physics static for it.
//   node scripts/probe-frame-solid.mjs              (headed, ~3-5 min)
//   node scripts/probe-frame-solid.mjs --headless
//
// The instrument only observes; flight uses public controls (W thrust, A/D yaw).
// The dock/interact key is never pressed.
//
// Guard rail (the standing hitch/pop-in check):
//   every run writes .devshots/frame-solid/<stamp>.json with longest frame, frame p99,
//   time-to-appear, in-flight shader links, blinks and the host it ran on.
//   node scripts/probe-frame-solid.mjs --compare=.devshots/frame-solid/<baseline>.json
//     fails when any count (blinks, root swaps, regressions, stuck frames, in-flight shader
//     links, bodies that left the frame undrawn) rises. Timing regressions warn; add
//     --strict-timing to fail on them (only meaningful on a quiet machine).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { summarizeCpuProfile } from './lib/cpuProfileSummary.mjs';
import {
  compareFrameSolidMetrics,
  frameSolidMetrics,
  installFrameSolidSampler,
  resolveFrameSolidLinks,
  summarizeFrameSolid,
} from './lib/frameSolidSampler.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.argv.includes('--headless');
const CENSUS = process.argv.includes('--census');
const NO_CANON = process.argv.includes('--no-program-canon');
// Main-thread CPU profile over the flight route (sampling adds a little overhead; compare
// profiled runs only with profiled runs).
const CPU_PROFILE = process.argv.includes('--cpu-profile');
const STRICT_TIMING = process.argv.includes('--strict-timing');
const COMPARE_PATH = (process.argv.find((arg) => arg.startsWith('--compare=')) || '').slice('--compare='.length) || null;
const OUT_DIR = `${ROOT}.devshots/frame-solid`;
const AWAY_WU = 2500;
const AWAY_MS = 35_000;
const BACK_MS = 45_000;
const LOITER_MS = 20_000;
const POLL_MS = 120;
const SAMPLE_MS = 500;
const { chromium } = await loadPlaywright();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
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

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
const consoleErrors = [];
const dumpErrors = () => {
  if (!consoleErrors.length) return;
  console.log(`  page errors (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 12)) console.log(`    ${e}`);
};
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
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
  });
  await page.addInitScript((flags) => {
    // CDP inlines console string args whole — one giant log line overflows the pipe
    // transport before any listener can trim it. Truncate at the source.
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      const original = console[method].bind(console);
      console[method] = (...args) => original(...args.map((arg) => (
        typeof arg === 'string' && arg.length > 4096 ? `${arg.slice(0, 4096)}…[+${arg.length - 4096} chars]` : arg
      )));
    }
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
    } catch (_) { /* storage unavailable */ }
    // Arm the production perf counters (read once at renderer construction) so in-flight
    // shader links are counted and attributed. Unarmed, the counter reads 0 — a false pass.
    window.__SPACEFACE_PERF_COUNTERS__ = true;
    if (flags.noProgramCanon) window.__SF_PROGRAM_CANON_OFF__ = true;
    // GPU driver resets are the failure this lane has hit on this host before; count them so a
    // lost-context run cannot read as a clean measurement.
    window.__SF_CONTEXT_LOSSES__ = 0;
    document.addEventListener('webglcontextlost', () => { window.__SF_CONTEXT_LOSSES__++; }, true);
  }, { noProgramCanon: NO_CANON });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });
  await page.bringToFront();

  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Frame Solid' }));
  // Same gate as probe-solid-world: the opening cook alone can run minutes on a
  // slow host; the audit measures live flight, not boot pacing.
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
  }, null, { timeout: 600_000 });
  // { links, frame } from the armed perf seam; null when the seam is absent or unarmed.
  const readShaderLinks = () => page.evaluate(() => {
    const perf = window.__SPACEFACE_PERF__;
    const snap = perf && typeof perf.getCounterSnapshot === 'function' ? perf.getCounterSnapshot() : null;
    const links = snap && snap.enabled === true && snap.totals && snap.totals.shaderLinks;
    return Number.isFinite(links) ? { links, frame: snap.framesObserved } : null;
  });
  // Who paid for each in-flight link: admission subject, drawn object, program name.
  const readFlightLinkEvents = (sinceFrame) => page.evaluate((since) => {
    const perf = window.__SPACEFACE_PERF__;
    const snap = perf && typeof perf.getCounterSnapshot === 'function' ? perf.getCounterSnapshot() : null;
    const events = (snap && Array.isArray(snap.events)) ? snap.events : [];
    return events
      .filter((e) => e && e.kind === 'shaderLink' && Number(e.frame) >= since)
      .map((e) => ({
        frame: e.frame,
        name: e.name || null,
        subject: e.subject == null ? null : String(e.subject),
        drawObject: e.drawObject || null,
        via: /compileAsync|compileObjectPipelines|admitSubjectPipelines/.test(e.stack || '') ? 'admission'
          : (/shadow/i.test(e.stack || '') ? 'shadow-render' : 'presented-draw'),
      }));
  }, sinceFrame);
  const shaderLinksAtFlight = await readShaderLinks();
  const gpuRenderer = await page.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
    } catch (_) { return null; }
  });
  await page.evaluate(installFrameSolidSampler);
  let cdp = null;
  if (CPU_PROFILE) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }

  const station = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    let best = null;
    let bestD = Infinity;
    for (const e of s.entities.values()) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      if (e.data && (e.data.isGate || e.data.isWormhole)) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return null;
    return {
      id: best.id,
      x: best.pos.x,
      z: best.pos.z,
      radius: best.radius,
      dockRadius: (best.data && best.data.dockRadius) || best.radius || 0,
      dist0: bestD,
    };
  });
  if (!station) throw new Error('no non-gate station found in the spawn sector');
  console.log(`target station id=${station.id} at (${station.x.toFixed(0)}, ${station.z.toFixed(0)})`
    + ` dockRadius=${station.dockRadius} startDist=${station.dist0.toFixed(0)}`);

  // One evaluate per poll returns the steering snapshot and, on the ~500 ms
  // beat, the activity-runtime counters used for the perf comparison.
  const held = { w: false, a: false, d: false };
  const setHeld = async (want) => {
    if (want.w !== held.w) { held.w = want.w; await (want.w ? page.keyboard.down('KeyW') : page.keyboard.up('KeyW')); }
    if (want.a !== held.a) { held.a = want.a; await (want.a ? page.keyboard.down('KeyA') : page.keyboard.up('KeyA')); }
    if (want.d !== held.d) { held.d = want.d; await (want.d ? page.keyboard.down('KeyD') : page.keyboard.up('KeyD')); }
  };
  const releaseAll = () => setHeld({ w: false, a: false, d: false });

  const perf = {
    samples: 0,
    staticsPeak: 0, staticsSum: 0,
    dynamicsPeak: 0,
    exactPeak: 0, exactSum: 0,
    glassPeak: 0,
    frameIntervals: 0, frameIntervalMsSum: 0, frameIntervalMaxMs: 0,
    countsPeak: {},
  };
  let lastSampleAt = 0;
  let lastFrameCount = 0;
  let lastFrameAt = 0;

  const poll = async (sampleDue) => page.evaluate(({ stationId, wantSample }) => {
    const s = window.SF && window.SF.state;
    if (!s) return { mode: 'gone' };
    const p = s.entities && s.entities.get(s.playerId);
    const e = s.entities && s.entities.get(stationId);
    const out = {
      mode: s.mode,
      px: p && p.pos ? p.pos.x : NaN,
      pz: p && p.pos ? p.pos.z : NaN,
      rot: p ? p.rot : NaN,
      ex: e && e.pos ? e.pos.x : NaN,
      ez: e && e.pos ? e.pos.z : NaN,
      stationAlive: !!(e && e.alive !== false),
    };
    if (wantSample) {
      const ar = s.activityRuntime || {};
      const c = ar.counts || {};
      out.metrics = {
        statics: ar.physicsStaticCount | 0,
        dynamics: ar.physicsDynamicCount | 0,
        exact: ar.exactCount | 0,
        glass: ar.glassCount | 0,
        counts: { s0: c.s0 | 0, s1: c.s1 | 0, s2: c.s2 | 0, s3: c.s3 | 0, s4: c.s4 | 0, r0: c.r0 | 0, r1: c.r1 | 0, r2: c.r2 | 0, r3: c.r3 | 0 },
        frames: (window.__SF_FRAME__ && window.__SF_FRAME__.frames) | 0,
      };
    }
    return out;
  }, { stationId: station.id, wantSample: sampleDue });

  const recordMetrics = (m) => {
    if (!m) return;
    perf.samples++;
    if (m.statics > perf.staticsPeak) perf.staticsPeak = m.statics;
    perf.staticsSum += m.statics;
    if (m.dynamics > perf.dynamicsPeak) perf.dynamicsPeak = m.dynamics;
    if (m.exact > perf.exactPeak) perf.exactPeak = m.exact;
    perf.exactSum += m.exact;
    if (m.glass > perf.glassPeak) perf.glassPeak = m.glass;
    for (const [k, v] of Object.entries(m.counts)) {
      if (v > (perf.countsPeak[k] || 0)) perf.countsPeak[k] = v;
    }
    const now = performance.now();
    if (lastFrameAt > 0 && m.frames > lastFrameCount) {
      const per = (now - lastFrameAt) / (m.frames - lastFrameCount);
      perf.frameIntervals += m.frames - lastFrameCount;
      perf.frameIntervalMsSum += now - lastFrameAt;
      if (per > perf.frameIntervalMaxMs) perf.frameIntervalMaxMs = per;
    }
    lastFrameCount = m.frames;
    lastFrameAt = now;
  };

  const phases = [];
  const modeLeaves = [];
  // Steer toward a desired bearing each poll: turn-in-place while the error is
  // large (A/D yaw at full authority only while not thrusting in the pilot
  // scheme), burn W once roughly aligned.
  const flyPhase = async ({ name, bearingOf, done, limitMs, weave = false }) => {
    const start = Date.now();
    let minDist = Infinity;
    let maxDist = 0;
    let lastDist = NaN;
    let stallSince = 0;
    let loggedMode = null;
    let beat = 0;
    while (Date.now() - start < limitMs) {
      const wantSample = Date.now() - lastSampleAt >= SAMPLE_MS;
      const snap = await poll(wantSample);
      if (wantSample) { lastSampleAt = Date.now(); recordMetrics(snap.metrics); }
      if (snap.mode !== 'flight') {
        if (snap.mode !== loggedMode) {
          loggedMode = snap.mode;
          modeLeaves.push({ phase: name, mode: snap.mode, at: Date.now() - start });
          console.log(`  ${name}: mode=${snap.mode} — releasing keys, waiting for flight`);
        }
        await releaseAll();
        await page.waitForTimeout(POLL_MS);
        continue;
      }
      loggedMode = null;
      if (!snap.stationAlive || !Number.isFinite(snap.ex)) {
        console.log(`  ${name}: station ${station.id} gone/dead — ending phase`);
        break;
      }
      const dist = Math.hypot(snap.ex - snap.px, snap.ez - snap.pz);
      if (dist < minDist) minDist = dist;
      if (dist > maxDist) maxDist = dist;
      const arrived = done && done(dist, snap);
      if (arrived) { lastDist = dist; break; }
      // Stall watchdog for the BACK leg, armed only once the ship is at the
      // hull: pinned against a collider (or wedged on the station that
      // correctly has one) is a successful arrival, not a hang. Far out the
      // ship is legitimately still killing outbound momentum, so distance not
      // closing there is flight, not a stall.
      if (name === 'back' && dist < Math.max(300, station.dockRadius * 2.5)
        && Number.isFinite(lastDist) && lastDist - dist < 0.5) {
        if (!stallSince) stallSince = Date.now();
        else if (Date.now() - stallSince > 4000) { lastDist = dist; break; }
      } else {
        stallSince = 0;
      }
      lastDist = dist;
      let desired = bearingOf(snap);
      if (weave) {
        // Alternate weave offsets around the station bearing (~1.2 s cadence),
        // turning back inward whenever the drift carries past ~500 WU.
        const toward = Math.atan2(snap.ez - snap.pz, snap.ex - snap.px);
        desired = dist > 500 ? toward : toward + (Math.floor(beat / 10) % 2 === 0 ? 0.9 : -0.9);
      }
      const err = wrapAngle(desired - snap.rot);
      const aligned = Math.abs(err) < 0.5;
      // W taps: thrust on alternating beats during loiter, held otherwise.
      const wantW = weave ? (aligned && beat % 2 === 0) : aligned;
      await setHeld({
        w: wantW,
        a: err < -0.08,
        d: err > 0.08,
      });
      beat++;
      await page.waitForTimeout(POLL_MS);
    }
    await releaseAll();
    const rec = { phase: name, ms: Date.now() - start, endDist: lastDist, minDist, maxDist };
    phases.push(rec);
    console.log(`  ${name}: ${(rec.ms / 1000).toFixed(1)}s end dist=${Number.isFinite(lastDist) ? lastDist.toFixed(0) : '?'}`
      + ` min=${Number.isFinite(minDist) ? minDist.toFixed(0) : '?'} max=${maxDist.toFixed(0)}`);
    return rec;
  };

  await flyPhase({
    name: 'away',
    bearingOf: (s) => Math.atan2(s.pz - s.ez, s.px - s.ex),
    done: (dist) => dist > AWAY_WU,
    limitMs: AWAY_MS,
  });
  await flyPhase({
    name: 'back',
    bearingOf: (s) => Math.atan2(s.ez - s.pz, s.ex - s.px),
    done: (dist) => dist <= station.dockRadius * 0.5,
    limitMs: BACK_MS,
  });
  await flyPhase({
    name: 'loiter',
    bearingOf: (s) => Math.atan2(s.ez - s.pz, s.ex - s.px),
    done: null,
    limitMs: LOITER_MS,
    weave: true,
  });

  if (CENSUS) {
    // One line per resident non-player ship: which whole-ship LOD family is
    // installed, which level is active, and the last projected pixel width the
    // LOD logic recorded. Resident means a bound mesh root (e.mesh).
    const census = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      const rows = [];
      if (!s || !s.entities) return rows;
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || e.type !== 'ship' || e.id === s.playerId) continue;
        const mesh = e.mesh || null;
        if (!mesh) continue;
        const ud = mesh.userData || {};
        const lod = ud.lod || {};
        rows.push({
          id: e.id,
          defId: (e.data && (e.data.defId || e.data.shipId)) || null,
          lodFamilyInstalled: ud.wholeShipLodFamilyInstalled ?? null,
          lodActiveLevel: ud.wholeShipLodActiveLevel ?? null,
          lastPx: Number.isFinite(lod.lastPx) ? lod.lastPx : null,
        });
      }
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return rows;
    });
    console.log(`  ship census — ${census.length} resident non-player ships:`);
    for (const r of census) {
      console.log(`    id=${r.id} defId=${r.defId} lodFamilyInstalled=${r.lodFamilyInstalled}`
        + ` lodActiveLevel=${r.lodActiveLevel} lastPx=${r.lastPx}`);
    }
  }

  let cpuProfile = null;
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    mkdirSync(OUT_DIR, { recursive: true });
    const profilePath = `${OUT_DIR}/${new Date().toISOString().replace(/[:.]/g, '-')}.cpuprofile`;
    writeFileSync(profilePath, JSON.stringify(profile));
    cpuProfile = { path: profilePath, ...summarizeCpuProfile(profile, { top: 30 }) };
  }
  await page.evaluate(() => { window.__SF_FRAME_STOP__ = true; });
  const rec = await page.evaluate(() => window.__SF_FRAME__);
  const summary = summarizeFrameSolid(rec);
  const shaderLinksAtEnd = await readShaderLinks();
  const flightShaderLinks = shaderLinksAtFlight && shaderLinksAtEnd
    ? shaderLinksAtEnd.links - shaderLinksAtFlight.links
    : null;
  // Prefer the sampler's own witness (every link, named by program); the perf ring is the fallback.
  const resolvedLinks = await page.evaluate(resolveFrameSolidLinks).catch(() => []);
  const flightLinkEvents = resolvedLinks.length
    ? resolvedLinks
    : (shaderLinksAtFlight ? await readFlightLinkEvents(shaderLinksAtFlight.frame) : []);
  const metrics = frameSolidMetrics(summary, { flightShaderLinks });
  // Authored-body composition jobs that ran in flight: service time per job (the lane is serial).
  const upgradeJobs = await page.evaluate(() => {
    const scene = window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.scene;
    const diag = scene && scene.userData && scene.userData.authoredUpgradeDiagnostics;
    const jobs = (diag && Array.isArray(diag.jobs) ? diag.jobs : [])
      .filter((j) => j && j.modeAtStart === 'flight' && Number.isFinite(j.durationMs));
    const sorted = jobs.map((j) => j.durationMs).sort((a, b) => a - b);
    const pct = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]) : null);
    const byKind = {};
    for (const j of jobs) {
      const k = `${j.entityType || '?'}|${j.cacheStatus || '?'}|${j.status || '?'}`;
      const row = byKind[k] || (byKind[k] = { n: 0, totalMs: 0, maxMs: 0 });
      row.n++; row.totalMs += j.durationMs; row.maxMs = Math.max(row.maxMs, j.durationMs);
    }
    for (const row of Object.values(byKind)) { row.totalMs = Math.round(row.totalMs); row.maxMs = Math.round(row.maxMs); }
    return { count: jobs.length, p50Ms: pct(0.5), p95Ms: pct(0.95), maxMs: sorted.length ? Math.round(sorted[sorted.length - 1]) : null, byKind };
  }).catch(() => null);

  console.log('\nframe-solid audit — everything in the player frame stays drawn and solid');
  console.log(`  phases: ${JSON.stringify(phases.map((p) => ({ phase: p.phase, ms: p.ms, endDist: Math.round(p.endDist || 0), minDist: Math.round(p.minDist || 0), maxDist: Math.round(p.maxDist || 0) })))}`);
  if (modeLeaves.length) console.log(`  mode left flight: ${JSON.stringify(modeLeaves)}`);
  console.log(`  perf: samples=${perf.samples}`
    + ` physicsStaticCount peak=${perf.staticsPeak} mean=${(perf.staticsSum / Math.max(1, perf.samples)).toFixed(1)}`
    + ` dynamicsPeak=${perf.dynamicsPeak}`
    + ` exactCount peak=${perf.exactPeak} mean=${(perf.exactSum / Math.max(1, perf.samples)).toFixed(1)}`
    + ` glassCountPeak=${perf.glassPeak}`
    + ` countsPeak=${JSON.stringify(perf.countsPeak)}`
    + ` frameInterval mean=${(perf.frameIntervalMsSum / Math.max(1, perf.frameIntervals)).toFixed(2)}ms max=${perf.frameIntervalMaxMs.toFixed(2)}ms`);
  console.log(`  summary: ${JSON.stringify(summary)}`);
  console.log(`  lodFrames=${JSON.stringify((summary && summary.lodFrames) || {})}`
    + ` lodSwapsOnScreen=${(summary && summary.lodSwapsOnScreen) | 0}`
    + ` lodSwapKinds=${JSON.stringify((summary && summary.lodSwapKinds) || {})}`);
  console.log(`  stationBounds=${JSON.stringify((summary && summary.stationBounds) || {}, null, 2)}`);
  for (const o of (summary && summary.offenders) || []) {
    console.log(`  offender id=${o.id} type=${o.type} defId=${o.defId} radius=${o.radius}`
      + ` blinks=${o.blinks} missing=${o.missingFrames} stuck=${o.stuckMissing}`
      + ` swaps=${o.rootSwaps} regressions=${o.regressions}`
      + ` reasons=${JSON.stringify(o.reasons || {}, null, 2)}`);
  }

  const timing = summary && summary.timing;
  if (timing) {
    console.log(`  frames: count=${timing.frame.count} p50=${timing.frame.p50Ms}ms p95=${timing.frame.p95Ms}ms`
      + ` p99=${timing.frame.p99Ms}ms longest=${timing.frame.longestMs}ms`
      + ` >50ms=${timing.frame.over50Ms} >100ms=${timing.frame.over100Ms}`);
    console.log(`  time-to-appear: episodes=${timing.appear.episodes} onTime=${timing.appear.onTime}`
      + ` (${timing.appear.onTimeRate}) late=${timing.appear.late} leftUndrawn=${timing.appear.leftUndrawn}`
      + ` lateP50=${timing.appear.lateP50Ms}ms lateP95=${timing.appear.lateP95Ms}ms lateMax=${timing.appear.lateMaxMs}ms`);
    console.log(`  time-to-appear by type: ${JSON.stringify(timing.appear.byType)}`);
  }
  const contextLosses = await page.evaluate(() => window.__SF_CONTEXT_LOSSES__ || 0).catch(() => null);
  console.log(`  admission lanes: ${JSON.stringify((summary && summary.lanes) || null)}`);
  console.log(`  authored composition jobs in flight: ${JSON.stringify(upgradeJobs)}`);
  console.log(`  context losses: ${contextLosses == null ? 'NOT MEASURED' : contextLosses}`);
  if (cpuProfile) {
    console.log(`  cpu profile: ${cpuProfile.path} wall=${cpuProfile.wallMs}ms busy=${cpuProfile.busyMs}ms`
      + ` idle=${cpuProfile.idleMs}ms gc=${cpuProfile.gcMs}ms program=${cpuProfile.programMs}ms`);
    console.log('  cpu by file (self):');
    for (const row of cpuProfile.byFile.slice(0, 15)) console.log(`    ${row.ms}ms  ${row.fn}`);
    console.log('  cpu top self:');
    for (const row of cpuProfile.topSelf.slice(0, 20)) console.log(`    ${row.ms}ms  ${row.fn}`);
    console.log('  cpu top inclusive (game source):');
    for (const row of cpuProfile.topTotalInGameSource.slice(0, 30)) console.log(`    ${row.ms}ms  ${row.fn}`);
    console.log('  longest busy stretches (what paid for the longest frames):');
    for (const stretch of cpuProfile.longestStretches || []) {
      console.log(`    ${stretch.ms}ms at +${stretch.atMs}ms`);
      for (const row of stretch.top.slice(0, 8)) console.log(`      ${row.ms}ms  ${row.fn}`);
    }
  }
  console.log(`  in-flight shader links: ${flightShaderLinks == null ? 'NOT MEASURED (perf seam absent or unarmed)' : flightShaderLinks}`);
  for (const e of flightLinkEvents.slice(0, 40)) {
    console.log(`    link frame=${e.frame} subject=${e.subject} program=${e.program || e.name || '?'}`
      + ` nearest=${e.nearestProgram || '-'}`
      + ` differs=${JSON.stringify(e.differsFromNearest || null)}`
      + `${e.stack ? `\n      ${e.stack.slice(-1)[0] || ''}` : ` via=${e.via}`}`);
  }

  let head = null;
  try { head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { /* no git */ }
  const report = {
    at: new Date().toISOString(),
    head,
    headless: HEADLESS,
    programCanon: !NO_CANON,
    contextLosses,
    cpuProfile,
    host: {
      cpu: (cpus()[0] && cpus()[0].model) || null,
      logicalCores: cpus().length,
      loadavg: loadavg(),
      gpuRenderer,
    },
    metrics,
    timing: timing || null,
    lanes: (summary && summary.lanes) || null,
    upgradeJobs,
    flightLinkEvents,
    offenders: (summary && summary.offenders) || [],
    phases,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = `${OUT_DIR}/${report.at.replace(/[:.]/g, '-')}.json`;
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`  report: ${outPath}`);

  let comparePass = true;
  if (COMPARE_PATH) {
    const baseline = JSON.parse(readFileSync(COMPARE_PATH, 'utf8'));
    const verdict = compareFrameSolidMetrics(baseline.metrics || {}, metrics, { strictTiming: STRICT_TIMING });
    console.log(`  compare vs ${COMPARE_PATH} (baseline head ${baseline.head || '?'}):`);
    for (const row of verdict.rows) console.log(`    ${row.key}: ${row.before} -> ${row.after}`);
    for (const w of verdict.warnings) console.log(`    WARN ${w}`);
    for (const f of verdict.failures) console.log(`    FAIL ${f}`);
    comparePass = verdict.failures.length === 0;
  }

  const pass = !!(summary && summary.frames > 0)
    && summary.blinks === 0
    && summary.rootSwaps === 0
    && summary.regressions === 0
    && summary.stuckMissing === 0
    && summary.stationNoCollider === 0;
  dumpErrors();
  console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  if (COMPARE_PATH) console.log(comparePass ? 'COMPARE: PASS' : 'COMPARE: FAIL');
  if (!pass || !comparePass) process.exitCode = 1;
} catch (error) {
  dumpErrors();
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill();
}
