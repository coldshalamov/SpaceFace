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
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { installFrameSolidSampler, summarizeFrameSolid } from './lib/frameSolidSampler.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.argv.includes('--headless');
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
  await page.addInitScript(() => {
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
  });
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
  await page.evaluate(installFrameSolidSampler);

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

  await page.evaluate(() => { window.__SF_FRAME_STOP__ = true; });
  const rec = await page.evaluate(() => window.__SF_FRAME__);
  const summary = summarizeFrameSolid(rec);

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
  for (const o of (summary && summary.offenders) || []) {
    console.log(`  offender id=${o.id} type=${o.type} defId=${o.defId} radius=${o.radius}`
      + ` blinks=${o.blinks} missing=${o.missingFrames} stuck=${o.stuckMissing}`
      + ` swaps=${o.rootSwaps} regressions=${o.regressions}`
      + ` reasons=${JSON.stringify(o.reasons || {}, null, 2)}`);
  }

  const pass = !!(summary && summary.frames > 0)
    && summary.blinks === 0
    && summary.rootSwaps === 0
    && summary.regressions === 0
    && summary.stuckMissing === 0
    && summary.stationNoCollider === 0;
  dumpErrors();
  console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  if (!pass) process.exitCode = 1;
} catch (error) {
  dumpErrors();
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill();
}
