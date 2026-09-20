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
const SAMPLE_MS = Math.max(5000, Number(process.env.SPACEFACE_SMOOTH_MS || 20_000));
// Flying time to discard before sampling. 0 measures the opening (shader admission, first-flight
// holds); 25000 measures settled flight.
const SETTLE_MS = Math.max(0, Number(process.env.SPACEFACE_SMOOTH_SETTLE_MS || 0));
const HEADLESS = process.argv.includes('--headless');
const CRUCIBLE = process.argv.includes('--crucible');
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
      consoleErrors.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 300)}`));
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
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
  }, null, { timeout: 180_000 });
  const launchToFlightS = (Date.now() - bootedAt) / 1000;

  await page.bringToFront();
  await page.mouse.move(1100, 300);
  await page.keyboard.down('KeyW');
  if (SETTLE_MS > 0) await page.waitForTimeout(SETTLE_MS);

  // Frame recorder on the page's own rAF beat. The game's callback is registered first, so when
  // this one runs the perf runtime holds the phase costs of the frame that just finished.
  await page.evaluate(() => {
    const record = { dts: [], costs: [], last: 0 };
    window.__SF_SMOOTH__ = record;
    const scratch = {};
    const tick = (now) => {
      if (record.last) {
        record.dts.push(now - record.last);
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

  const result = await page.evaluate(() => {
    const state = window.SF.state;
    const after = window.SF.loop.getDiagnostics();
    const dts = window.__SF_SMOOTH__.dts.slice(30);
    const costs = window.__SF_SMOOTH__.costs.slice(30);
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
      poolVariants: pool && pool.variants
        ? pool.variants.map((v) => ({ registered: v.registered, submitted: v.submitted, retired: v.retiredOwners || 0 }))
        : null,
      worstFrames: worstFrames.slice(0, 10).map((f) => ({
        at: f.at,
        dt: f.dt,
        ...Object.fromEntries(names.map((name, k) => [name, f.cost[k]])),
      })),
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
    ...result.worstFrames.map((f) => `    #${String(f.at).padStart(4)}  ${f.dt.toFixed(0).padStart(4)} <- callback ${f.callback.toFixed(0).padStart(4)}  sim ${f.sim.toFixed(0).padStart(4)}  present ${f.present.toFixed(0).padStart(4)}  (render ${f.render.toFixed(0)}, vfx ${f.vfx.toFixed(0)}, ui ${f.ui.toFixed(0)})  admission ${f.admission.toFixed(0)}`),
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
