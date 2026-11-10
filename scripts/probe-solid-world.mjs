// Solid-world audit (PQ-210.03): on the real game route, nothing on the live
// screen may unload and nothing pending may wait.
//   onGlassDisposals — cumulative residency evicts that disposed an on-glass
//                      mesh; must read 0 across a Crucible run and a belt flight
//   pending          — on-screen geometryPending roots must resolve inside
//                      0.25 s; a per-frame rAF sampler tracks the worst age
//
//   node scripts/probe-solid-world.mjs              (headed, ~4.5 min)
//   node scripts/probe-solid-world.mjs --headless
//   SPACEFACE_CRUCIBLE_MS=45000 SPACEFACE_BELT_MS=180000 node scripts/probe-solid-world.mjs
//   SPACEFACE_SOLID_SKIP_CRUCIBLE=1 / =1 belt only / crucible only for quick checks
//
// The instrument only observes render diagnostics; flight uses public controls
// (W thrust, A/D drift turns, G+LMB fire in the crucible phase).
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.argv.includes('--headless');
const SKIP_CRUCIBLE = process.env.SPACEFACE_SOLID_SKIP_CRUCIBLE === '1';
const SKIP_BELT = process.env.SPACEFACE_SOLID_SKIP_BELT === '1';
const CRUCIBLE_MS = Math.max(10_000, Number(process.env.SPACEFACE_CRUCIBLE_MS || 45_000));
const BELT_MS = Math.max(30_000, Number(process.env.SPACEFACE_BELT_MS || 180_000));
const PENDING_LIMIT_S = 0.25;
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
    if (msg.type() === 'error' || /live geometry|admission/i.test(msg.text())) {
      consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
    }
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

  // Per-frame sampler on the page's own rAF beat: every frame's worst
  // pending-on-glass age and the cumulative on-glass disposal counter.
  const installSampler = () => page.evaluate(() => {
    window.__SF_SOLID_STOP__ = false;
    const rec = {
      frames: 0, maxPendingS: 0, maxPendingCount: 0,
      overLimitFrames: 0, disposals: 0, diagDisposals: 0, pendingRootsSeen: 0,
      maxGeoQueued: 0, maxGeoUrgent: 0, drainingFrames: 0, lastQueued: 0,
    };
    window.__SF_SOLID__ = rec;
    let lastTickAt = 0;
    const tick = () => {
      if (window.__SF_SOLID_STOP__ === true) return;
      // A pending-age spike that coincides with a giant rAF gap is a global
      // frame freeze inflating the wall-clock gauge, not the admission lane
      // holding a root — record the gap so the verdict can tell them apart.
      const tickAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const gapMs = lastTickAt > 0 ? tickAt - lastTickAt : 0;
      lastTickAt = tickAt;
      if (gapMs > (rec.maxRafGapMs || 0)) rec.maxRafGapMs = Math.round(gapMs);
      const r = window.SF && window.SF.state && window.SF.state.render;
      const d = r && r.entityViewSync;
      if (d) {
        rec.frames++;
        const pending = Number(d.onGlassPendingMaxS) || 0;
        const count = Number(d.onGlassPendingCount) || 0;
        if (pending > rec.maxPendingS) rec.maxPendingS = pending;
        if (count > rec.maxPendingCount) rec.maxPendingCount = count;
        if (pending > 0.25) rec.overLimitFrames++;
        if (count > 0) rec.pendingRootsSeen++;
        rec.disposals = (r.onGlassDisposals | 0);
        rec.diagDisposals = (d.onGlassDisposals | 0);
        rec.lastQueued = d.liveGeometryQueued | 0;
        if (rec.lastQueued > rec.maxGeoQueued) rec.maxGeoQueued = rec.lastQueued;
        const urgent = d.liveGeometryUrgentQueued | 0;
        if (urgent > rec.maxGeoUrgent) rec.maxGeoUrgent = urgent;
        if (d.liveGeometryDraining === true) rec.drainingFrames++;
        rec.geoAdmitted = d.liveGeometryAdmitted | 0;
        rec.geoSkipped = d.liveGeometrySkipped | 0;
        rec.geoEnqueued = d.liveGeometryEnqueued | 0;
        rec.geoDeduped = d.liveGeometryDeduped | 0;
        if (pending > 0.2) {
          rec.rafGapAtPendingMax = gapMs;
          rec.stage = rec.stage || {};
          const st = String(d.liveGeometryStage || '?');
          rec.stage[st] = (rec.stage[st] || 0) + 1;
          if (d.pipelineReadinessBatchOpen === true) rec.batchOpenFrames = (rec.batchOpenFrames || 0) + 1;
        }
        rec.geoBatches = d.liveGeometryUrgentBatches | 0;
        rec.lastBatchMs = Number(d.liveGeometryLastBatchMs) || 0;
        if (pending > 0.2 && Array.isArray(d.onGlassPendingIds) && d.onGlassPendingIds.length) {
          rec.stuck = rec.stuck || {};
          for (const tag of d.onGlassPendingIds) {
            const key = String(tag).split(':')[0];
            rec.stuck[key] = (rec.stuck[key] || 0) + 1;
          }
          rec.stuckSample = d.onGlassPendingIds.slice(0, 12);
          rec.queueSample = Array.isArray(d.liveGeometryPendingIds)
            ? d.liveGeometryPendingIds.slice(0, 12) : [];
          const dbg = r && typeof r.debugGeometryPending === 'function'
            ? r.debugGeometryPending : null;
          if (dbg) {
            rec.rootStates = rec.rootStates || {};
            for (const tag of d.onGlassPendingIds) {
              const id = String(tag).split(':')[0];
              try { rec.rootStates[id] = dbg(Number(id)); } catch (e) { rec.rootStates[id] = String(e); }
            }
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const waitForFlight = () => page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
    // The opening cook alone now runs ~90-130 s on this host (foreign admission
    // work holds the pre-submit gate for hundreds of refused frames, then a
    // depth-rehearse present can take tens of seconds more); the leaf measures
    // live-glass behavior in flight, not boot pacing — give the gate room
    // rather than flake on it.
  }, null, { timeout: 600_000 });

  const results = [];
  await page.bringToFront();

  if (!SKIP_CRUCIBLE) {
    const launched = await page.evaluate(async () => {
      const launch = await import('/src/ui/crucibleLaunch.js');
      const setup = launch.crucibleSetupFor({ seed: 4242 });
      if (!setup || !setup.ok) return false;
      return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
    });
    if (!launched) throw new Error('Crucible run did not launch');
    await waitForFlight();
    await installSampler();
    // Fight with public controls: auto-target + held LMB, re-acquiring when the
    // lock dies; the sampler rides every rendered frame.
    await page.keyboard.press('KeyG');
    await page.mouse.down();
    const start = Date.now();
    while (Date.now() - start < CRUCIBLE_MS) {
      await page.evaluate(() => {
        const s = window.SF.state;
        const sel = s.player && s.player.targetId;
        const e = sel != null && s.entities ? s.entities.get(sel) : null;
        if (e && e.alive !== false) return;
        let best = null;
        let bestD = Infinity;
        const p = s.entities.get(s.playerId);
        for (const candidate of s.entities.values()) {
          if (!candidate || candidate.alive === false || candidate.type !== 'ship' || candidate.id === s.playerId) continue;
          if (!candidate.pos || !p || !p.pos) continue;
          const d = Math.hypot(candidate.pos.x - p.pos.x, candidate.pos.z - p.pos.z);
          if (d < bestD) { bestD = d; best = candidate; }
        }
        if (best) s.player.targetId = best.id; // UI-owned selection; legal direct write
      });
      await page.waitForTimeout(300);
    }
    await page.mouse.up();
    results.push({ phase: 'crucible', rec: await page.evaluate(() => window.__SF_SOLID__) });
    await page.evaluate(() => { window.__SF_SOLID_STOP__ = true; });
  }

  if (!SKIP_BELT) {
    await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Solid World' }));
    // game:new runs startNewGame through the loading mode — wait for the old
    // run to actually leave flight, or the belt phase would sample stale state.
    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      return !state || state.mode !== 'flight';
    }, null, { timeout: 60_000 });
    await waitForFlight();
    await installSampler();
    // Belt flight: hold W and weave so the look-at leads across the field in
    // both directions — the exact motion that used to evict on-glass meshes.
    await page.keyboard.down('KeyW');
    const start = Date.now();
    let steerLeft = false;
    while (Date.now() - start < BELT_MS) {
      await page.keyboard.down(steerLeft ? 'KeyA' : 'KeyD');
      await page.waitForTimeout(2500);
      await page.keyboard.up(steerLeft ? 'KeyA' : 'KeyD');
      steerLeft = !steerLeft;
      await page.waitForTimeout(2500);
    }
    await page.keyboard.up('KeyW');
    results.push({ phase: 'belt', rec: await page.evaluate(() => window.__SF_SOLID__) });
  }

  let allPass = results.length > 0;
  console.log('\nPQ-210.03 solid-world audit — live glass keeps every resident');
  for (const { phase, rec } of results) {
    if (!rec || rec.frames === 0) {
      console.log(`  ${phase}: no frames sampled`);
      allPass = false;
      continue;
    }
    const pass = rec.disposals === 0 && rec.diagDisposals === 0
      && rec.maxPendingS <= PENDING_LIMIT_S;
    if (!pass) allPass = false;
    console.log(
      `  ${phase}: ${rec.frames} frames sampled`
      + `  onGlassDisposals=${rec.disposals} (diag ${rec.diagDisposals})`
      + `  worst on-glass pending=${rec.maxPendingS.toFixed(3)} s`
      + `  pending-on-glass frames=${rec.pendingRootsSeen} (peak roots ${rec.maxPendingCount})`
      + `  geoQueue peak=${rec.maxGeoQueued} urgent=${rec.maxGeoUrgent} drainingFrames=${rec.drainingFrames}`
      + `  admitted=${rec.geoAdmitted || 0} skipped=${rec.geoSkipped || 0} enq=${rec.geoEnqueued || 0} dedup=${rec.geoDeduped || 0} batches=${rec.geoBatches || 0} lastBatchMs=${(rec.lastBatchMs || 0).toFixed(0)}`
      + `  maxRafGap=${(rec.maxRafGapMs || 0)}ms`
      + (rec.rafGapAtPendingMax ? ` rafGapAtPendingMax=${Math.round(rec.rafGapAtPendingMax)}ms` : '')
      + (rec.stuck ? `  stuck>2s=${JSON.stringify(rec.stuck).slice(0, 160)} sample=${JSON.stringify(rec.stuckSample || [])} queue=${JSON.stringify(rec.queueSample || [])} stage=${JSON.stringify(rec.stage || {}).slice(0, 200)} batchOpen=${rec.batchOpenFrames || 0} roots=${JSON.stringify(rec.rootStates || {}).slice(0, 400)}` : '')
      + (pass ? '  PASS' : `  FAIL (${rec.overLimitFrames} frames over ${PENDING_LIMIT_S} s)`),
    );
  }
  dumpErrors();
  console.log(allPass
    ? 'RESULT: PASS — nothing on the live screen unloaded or waited'
    : 'RESULT: FAIL');
} catch (error) {
  dumpErrors();
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill();
}
