#!/usr/bin/env node
// PQ-210.01 instrument: a real V8 CPU profile of the live Crucible fight.
//
//   node scripts/probe-crucible-cpu-profile.mjs            (headed, 20 s of weave-and-shoot)
//   SPACEFACE_CRUCIBLE_PROFILE_MS=30000 node scripts/probe-crucible-cpu-profile.mjs --headless
//   node scripts/probe-crucible-cpu-profile.mjs --label=pq210_01_after
//
// probe-main-thread-profile.mjs already proves the approach (an in-engine hitch classifier cannot
// see work outside its own callbacks; a CPU profile names the owner) but it drives the open-flight
// New Game route. PQ-210.01's route is the Crucible swarm: seed 4242, default kit, ten hostiles.
// This script is smooth-flight's launch path plus main-thread-profile's Profiler CDP session, and
// reports: self time per function, self time per source file, top-level entry points, the same
// phase costs the smooth-flight witness reads, and a live census of visible scene lights (the
// count three.js bakes into every lit shader program).
//
// Writes .devshots/crucible-cpu-profile/<label>/profile.cpuprofile and report.md. The .cpuprofile
// opens directly in Chrome DevTools' Performance panel (Load profile...).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  adventureToFlight,
  armoryLaunchWord,
  bootToMenu,
  clickText,
  crucibleToArmory,
  waitBootOverlayGone,
  waitForPreparationLaunch,
} from './player-truth/routes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HEADLESS = process.argv.includes('--headless');
const ADVENTURE = process.argv.includes('--adventure');
const DIAGNOSTICS_ONLY = process.argv.includes('--diagnostics-only');
const BARE_ACTIVE = process.argv.includes('--bare-active');
const argValue = (name) => {
  const hit = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};
const safeName = (value, max) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^[-_]+/, '')
  .slice(0, max);
const SAMPLE_MS = Math.max(5000, Number(process.env.SPACEFACE_CRUCIBLE_PROFILE_MS || 20_000));
const STARTUP_PROFILE_CAP_MS = 480_000;
// Wall-clock flight time to discard BEFORE the profiler starts. Wave 1 of a lesson opening holds
// its roster behind OPENING_LESSON_HOLD_TICKS = 45 sim-seconds (survivalWavePlanner.js), so the
// multi-hostile room only exists after ~65-70 s of contended wall flight. 0 profiles the opening.
const SETTLE_MS = Math.max(0, Number(process.env.SPACEFACE_CRUCIBLE_SETTLE_MS || 0));
const LABEL = safeName(argValue('--label'), 48) || 'run';
const OUT_DIR = path.join(ROOT, '.devshots', 'crucible-cpu-profile', LABEL);
const { chromium } = await loadPlaywright();

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

const NATIVE_BUCKETS = new Set(['(program)', '(idle)', '(garbage collector)', '(root)']);

function nodeLabel(node) {
  const frame = node.callFrame;
  const url = String(frame.url || '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^file:\/\/.*?([^/\\]+)$/, '$1');
  return `${frame.functionName || '(anonymous)'} @ ${url || 'native'}:${frame.lineNumber + 1}`;
}
function nodeFile(node) {
  const frame = node.callFrame;
  const url = String(frame.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/[?#].*$/, '');
  if (url) return url;
  return NATIVE_BUCKETS.has(frame.functionName) ? frame.functionName : '(native)';
}

// Self time per call frame and per source file, plus the idle/GC/(program) buckets.
function summarizeProfile(profile) {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfMicros = new Map();
  let totalMicros = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const delta = Math.max(0, profile.timeDeltas?.[i] || 0);
    totalMicros += delta;
    const id = profile.samples[i];
    selfMicros.set(id, (selfMicros.get(id) || 0) + delta);
  }
  const self = [...selfMicros.entries()]
    .map(([id, micros]) => ({ micros, node: nodesById.get(id) }))
    .filter((row) => row.node)
    .sort((a, b) => b.micros - a.micros);
  const fileMicros = new Map();
  const buckets = { program: 0, idle: 0, gc: 0 };
  for (const [id, micros] of selfMicros) {
    const node = nodesById.get(id);
    const name = node?.callFrame?.functionName;
    if (name === '(program)') buckets.program += micros;
    else if (name === '(idle)') buckets.idle += micros;
    else if (name === '(garbage collector)') buckets.gc += micros;
    if (node) {
      const file = nodeFile(node);
      fileMicros.set(file, (fileMicros.get(file) || 0) + micros);
    }
  }
  return {
    totalMicros,
    self,
    buckets,
    files: [...fileMicros.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function writeProfileSummary(name, profile) {
  const summary = summarizeProfile(profile);
  const pct = (micros) => `${((100 * micros) / (summary.totalMicros || 1)).toFixed(1)}%`;
  const ms = (micros) => (micros / 1000).toFixed(1);
  const lines = [
    `# ${name} CPU profile`, '',
    `Profiled ${ms(summary.totalMicros)} ms of V8 time. JS ${(100 * (summary.totalMicros
      - summary.buckets.idle - summary.buckets.program - summary.buckets.gc) / (summary.totalMicros || 1)).toFixed(1)}%, `
      + `(program) ${pct(summary.buckets.program)}, idle ${pct(summary.buckets.idle)}, GC ${pct(summary.buckets.gc)}.`, '',
    '## Top self time by function', '',
    ...summary.self.filter((row) => row.node.callFrame.functionName !== '(idle)')
      .slice(0, 30)
      .map((row) => `- ${ms(row.micros)} ms (${pct(row.micros)}) — \`${nodeLabel(row.node)}\``), '',
    '## Self time by source file', '',
    ...summary.files.filter(([file]) => file !== '(idle)')
      .slice(0, 25)
      .map(([file, micros]) => `- ${ms(micros)} ms (${pct(micros)}) — \`${file}\``), '',
  ];
  const stem = name.toLowerCase().replace(/\s+/g, '-');
  fs.writeFileSync(path.join(OUT_DIR, `${stem}-report.md`), lines.join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, `${stem}.cpuprofile`), JSON.stringify(profile));
  return summary;
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
let page = null;
let cdp = null;
let startupProfilerRunning = false;
let startupDiagnostics = null;
const consoleErrors = [];
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${String(error).slice(0, 200)}`));
  await page.addInitScript(({ capturePerfCounters, bareActive }) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      window.__SPACEFACE_PERF_COUNTERS__ = capturePerfCounters;
      // The established smooth-flight witness profile is useful for its launch probe, but a bare
      // active capture must leave quality and motion settings at the shipped defaults.
      if (!bareActive && !localStorage.getItem('sf.settings.profile.v1')) {
        localStorage.setItem('sf.settings.profile.v1', JSON.stringify({
          version: 1,
          settings: { accessibility: { motionPreference: 'system' }, video: { motionReduce: true } },
        }));
      }
    } catch (_) { /* storage unavailable */ }
  }, { capturePerfCounters: !DIAGNOSTICS_ONLY && !BARE_ACTIVE, bareActive: BARE_ACTIVE });
  if (!DIAGNOSTICS_ONLY) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: BARE_ACTIVE ? 200 : 1000 });
    if (!BARE_ACTIVE) {
      await cdp.send('Profiler.start');
      startupProfilerRunning = true;
    }
  }
  const startupStartedAt = Date.now();
  let startupTimeout;
  let startupRoute;
  try {
    startupRoute = await Promise.race([
      (async () => {
        const routeSteps = [];
        const step = (name, ok, detail) => {
          const row = { name, ok, detail, elapsedMs: Date.now() - startupStartedAt };
          routeSteps.push(row);
          console.log(`[crucible-cpu-profile] ${name}: ${ok ? 'PASS' : 'FAIL'} ${detail || ''}`);
        };
        await bootToMenu(page, baseUrl, step);
        await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });

        if (ADVENTURE) {
          await page.evaluate(() => {
            window.__SF_OPENING_DIAG__ = [];
            window.__SF_OPENING_DIAG_TIMER__ = setInterval(() => {
              const state = window.SF && window.SF.state;
              if (!state) return;
              const render = state.render || {};
              const phase = render.openingFirstPicturePhase;
              const ledger = Array.isArray(render.openingCookLedger) ? render.openingCookLedger : [];
              const failure = render.openingFirstPictureFailure;
              const pendingRoots = Array.isArray(failure && failure.meshes)
                ? failure.meshes.filter((row) => row && (row.pending || row.lod
                  || ['loading', 'compiling-pipelines', 'awaiting-authored-admission'].includes(row.status)))
                : [];
              const pendingIds = new Set(pendingRoots.map((row) => Number(row.id)));
              const scene = render.scene;
              const admissionJobs = scene?.userData?.authoredUpgradeDiagnostics?.jobs;
              const matchingAdmissions = Array.isArray(admissionJobs)
                ? admissionJobs.filter((job) => pendingIds.has(Number(job && job.entityId))).map((job) => ({
                  sequence: job.sequence, key: job.key, entityId: job.entityId,
                  entityType: job.entityType, status: job.status, priority: job.priority,
                  startedAtMs: job.startedAtMs, endedAtMs: job.endedAtMs,
                  durationMs: job.durationMs, phases: job.phases, error: job.error,
                  timeoutEvidence: job.timeoutEvidence,
                }))
                : [];
              window.__SF_OPENING_DIAG__.push({
                t: performance.now(),
                mode: state.mode,
                simTime: state.simTime,
                phase: phase ? {
                  stage: phase.stage, outcome: phase.outcome,
                  elapsedMs: Math.round(performance.now() - phase.startedAt),
                  budgetMs: phase.budgetMs,
                } : null,
                failure: failure ? {
                  stage: failure.stage, pass: failure.pass, pendingCount: failure.pendingCount,
                  elapsedMs: failure.elapsedMs, budgetMs: failure.budgetMs,
                  roots: pendingRoots.map((row) => {
                    const id = Number(row.id);
                    const entity = state.entities && typeof state.entities.get === 'function'
                      ? state.entities.get(id) : (state.entityList || []).find((entry) => entry && entry.id === id);
                    const root = entity && entity.mesh;
                    const data = root && root.userData || {};
                    return {
                      id, status: row.status, pending: row.pending, lod: row.lod,
                      uuid: root && root.uuid, name: root && root.name,
                      parentUuid: root && root.parent && root.parent.uuid,
                      childCount: root && Array.isArray(root.children) ? root.children.length : null,
                      authoredAssetState: data.authoredAssetState || null,
                      authoredUpgradeRequestedAt: data.authoredUpgradeRequestedAt || null,
                      authoredPreparePhase: data.authoredPreparePhase || null,
                      authoredUpgradePromise: !!data.authoredUpgradePromise,
                      requestAuthoredUpgrade: typeof data.requestAuthoredUpgrade === 'function',
                      pipelinesPending: data.pipelinesPending === true,
                      pipelinesPendingBy: data.pipelinesPendingBy || null,
                      pipelinesPendingHolds: Number(data.pipelinesPendingHolds) || 0,
                      wholeShipLodTransitionPromise: !!data.wholeShipLodTransitionPromise,
                      admissionPhaseTimings: data.__admissionPhaseTimings || null,
                    };
                  }),
                  admissions: matchingAdmissions,
                } : null,
                ledger: ledger.slice(-24).map((row) => ({
                  step: row.step, ms: row.ms, outcome: row.outcome, t: row.t,
                  budgetMs: row.budgetMs, materials: row.materials, geometries: row.geometries,
                  requiredLeaves: row.requiredLeaves, pooledLeaves: row.pooledLeaves,
                  deltaLeaves: row.deltaLeaves, issued: row.issued, touched: row.touched,
                  timedOut: row.timedOut, skipped: row.skipped, failed: row.failed,
                  reason: row.reason, stage: row.stage,
                })),
              });
              if (window.__SF_OPENING_DIAG__.length > 90) window.__SF_OPENING_DIAG__.shift();
            }, 2000);
          });
          const adventure = await adventureToFlight(page, step, { seed: 4242 });
          if (adventure.runSeed !== 4242) throw new Error(`Adventure seed mismatch: requested 4242, launched ${adventure.runSeed}`);
          step('launch', true, `Adventure seed ${adventure.runSeed}`);
        } else {
          // Wave lifecycle stamps on the page clock, including public preparation and launch.
          await page.evaluate(() => {
            const waves = [];
            window.__SF_PROFILE_WAVES__ = waves;
            for (const event of ['run:wavePlanned', 'run:waveStarted', 'run:waveMaterialized']) {
              window.SF.bus.on(event, (p) => waves.push({
                t: performance.now(), event, wave: p && p.wave, count: p && p.admitted,
              }));
            }
          });

          const door = await crucibleToArmory(page, {
            ruleset: 'swarm', arena: 'Ricochet Foundry', seed: 4242,
          }, step);
          if (door.runSeed !== 4242) throw new Error(`Swarm seed mismatch: requested 4242, launched ${door.runSeed}`);
          await waitForPreparationLaunch(page, { timeoutMs: STARTUP_PROFILE_CAP_MS });
          await waitBootOverlayGone(page);
          const launchWord = await armoryLaunchWord(page);
          if (!launchWord || !/^Launch round 1$/.test(launchWord)) {
            throw new Error(`public Swarm preparation had no enabled Launch round 1 (screen ${launchWord || 'none'})`);
          }
          step('preparation', true, `visible ${launchWord}`);
          // armoryLaunchWord intentionally strips the visible `Esc` shortcut suffix; match the
          // validated Launch label as a substring so that suffix cannot make the handoff wait
          // forever for text that is not actually rendered.
          await clickText(page, launchWord, { timeout: 30_000 });
          step('launch round 1', true, `seed ${door.runSeed}`);
        }

        await page.waitForFunction((adventureRoute) => {
          const state = window.SF && window.SF.state;
          return state && state.mode === 'flight' && (adventureRoute
            || (state.run && state.run.phase === 'active'))
            && Number.isFinite(state.simTime) && state.simTime >= 0.5;
        }, ADVENTURE, { timeout: STARTUP_PROFILE_CAP_MS });
        const activeState = await page.evaluate(() => ({
          mode: window.SF.state.mode,
          phase: window.SF.state.run && window.SF.state.run.phase,
          simTime: window.SF.state.simTime,
          wave: window.SF.state.run && window.SF.state.run.wave,
          hostiles: window.SF.state.entityList.filter((e) => e && e.alive !== false
            && e.type === 'ship' && e.id !== window.SF.state.playerId).length,
        }));
        if (activeState.mode !== 'flight' || (!ADVENTURE && activeState.phase !== 'active') || activeState.simTime < 0.5) {
          throw new Error(`${ADVENTURE ? 'Adventure' : 'Swarm'} did not reach advancing active simulation: ${JSON.stringify(activeState)}`);
        }
        routeSteps.push({ name: 'advancing active simulation', ok: true, ...activeState,
          elapsedMs: Date.now() - startupStartedAt });
        return { routeSteps, activeState };
      })(),
      new Promise((_, reject) => {
        startupTimeout = setTimeout(() => reject(
          new Error(`Swarm public route did not reach active sim within ${STARTUP_PROFILE_CAP_MS} ms`),
        ), STARTUP_PROFILE_CAP_MS);
      }),
    ]);
  } finally {
    clearTimeout(startupTimeout);
    if (page && !page.isClosed()) {
      startupDiagnostics = await page.evaluate(() => {
        clearInterval(window.__SF_OPENING_DIAG_TIMER__);
        const state = window.SF && window.SF.state;
        return {
          samples: window.__SF_OPENING_DIAG__ || [],
          finalMode: state && state.mode,
          finalSimTime: state && state.simTime,
          finalPhase: state?.render?.openingFirstPicturePhase || null,
          finalLedger: state?.render?.openingCookLedger || null,
          lastFailureSample: (window.__SF_OPENING_DIAG__ || []).slice().reverse()
            .find((sample) => sample && sample.failure)?.failure || null,
        };
      }).catch(() => null);
      if (startupDiagnostics) {
        fs.writeFileSync(path.join(OUT_DIR, 'opening-diagnostics.json'), JSON.stringify(startupDiagnostics, null, 1));
      }
    }
  }

  const startupWallMs = Date.now() - startupStartedAt;
  if (startupProfilerRunning && cdp) {
    const startupProfile = (await cdp.send('Profiler.stop')).profile;
    startupProfilerRunning = false;
    writeProfileSummary('launch', startupProfile);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'launch-timing.json'), JSON.stringify({
    route: ADVENTURE ? 'public player-truth Adventure New Game and Launch' : 'public player-truth Swarm preparation and Launch round 1',
    seed: 4242,
    arena: ADVENTURE ? null : 'Ricochet Foundry',
    startupWallMs,
    activeState: startupRoute.activeState,
    routeSteps: startupRoute.routeSteps,
  }, null, 1));
  console.log(`[crucible-cpu-profile] advancing ${ADVENTURE ? 'Adventure' : 'Swarm'} simulation reached at ${(startupWallMs / 1000).toFixed(1)}s`);

  if (BARE_ACTIVE) {
    await page.bringToFront();
    const activeAtStart = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      if (!state) return null;
      const waveOneCohort = (state.entityList || []).filter((entity) => entity && entity.alive !== false
        && entity.id !== state.playerId && (entity.type === 'ship' || entity.type === 'drone')
        && entity.data?.runCohort === 'survival' && entity.data?.runWave === 1).length;
      const brood = state.swarmBrood || null;
      return {
        mode: state.mode,
        phase: state.run && state.run.phase,
        simTime: state.simTime,
        seed: state.run && state.run.seed,
        wave: state.run && state.run.wave,
        waveOneCohort,
        broodAliveCount: Number.isFinite(brood?.aliveCount) ? brood.aliveCount : null,
        broodWave: Number.isFinite(brood?.wave) ? brood.wave : null,
      };
    });
    if (!activeAtStart || activeAtStart.mode !== 'flight' || activeAtStart.phase !== 'active'
        || !Number.isFinite(activeAtStart.simTime) || activeAtStart.simTime < 0.5
        || activeAtStart.seed !== 4242 || activeAtStart.wave !== 1 || activeAtStart.waveOneCohort < 1) {
      throw new Error(`bare active CPU window refused a non-active first-wave route: ${JSON.stringify(activeAtStart)}`);
    }
    const cpuBefore = cpuSnapshot();
    const started = Date.now();
    await cdp.send('Profiler.start');
    await page.waitForTimeout(SAMPLE_MS);
    const { profile } = await cdp.send('Profiler.stop');
    const hostBusy = hostBusyPct(cpuBefore, cpuSnapshot());
    const activeAtEnd = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      if (!state) return null;
      const list = Array.isArray(state.entityList) ? state.entityList : [];
      let waveOneCohort = 0, projectiles = 0;
      for (const entity of list) {
        if (!entity || entity.alive === false) continue;
        if ((entity.type === 'ship' || entity.type === 'drone') && entity.id !== state.playerId
            && entity.data?.runCohort === 'survival' && entity.data?.runWave === 1) waveOneCohort++;
        else if (entity.type === 'projectile') projectiles++;
      }
      const brood = state.swarmBrood || null;
      return {
        mode: state.mode,
        phase: state.run && state.run.phase,
        simTime: state.simTime,
        seed: state.run && state.run.seed,
        wave: state.run && state.run.wave,
        waveOneCohort,
        projectiles,
        entities: list.length,
        broodAliveCount: Number.isFinite(brood?.aliveCount) ? brood.aliveCount : null,
        broodWave: Number.isFinite(brood?.wave) ? brood.wave : null,
        gpu: state.render && state.render.gpu ? state.render.gpu.renderer : null,
        renderScale: state.settings?.video?.renderScale ?? null,
        pixelRatioCap: state.settings?.video?.pixelRatioCap ?? null,
      };
    });
    const windowMs = Date.now() - started;
    const activeSimDelta = Number(activeAtEnd?.simTime) - activeAtStart.simTime;
    const summary = writeProfileSummary('active', profile);
    const receipt = {
      route: 'public Swarm preparation and Launch round 1',
      seed: 4242,
      arena: 'Ricochet Foundry',
      startupWallMs,
      profileWindowMs: windowMs,
      sampleTargetMs: SAMPLE_MS,
      samplingIntervalUs: 200,
      perfCounters: false,
      domInstrumentation: false,
      screenshots: false,
      pixelReader: false,
      cpuBusyPctOfWholeMachine: hostBusy,
      logicalCpuCount: os.cpus().length,
      activeAtStart,
      activeAtEnd,
      activeSimDelta,
      profiledV8Micros: summary.totalMicros,
      routeSteps: startupRoute.routeSteps,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'active-window.json'), JSON.stringify(receipt, null, 1));
    console.log(`[crucible-cpu-profile] bare active profile: ${(windowMs / 1000).toFixed(1)}s, `
      + `sim ${activeAtStart.simTime.toFixed(2)}→${Number(activeAtEnd?.simTime || 0).toFixed(2)}s, `
      + `${activeAtEnd?.waveOneCohort ?? 0} wave-1 survival ships/drones, `
      + `Brood ${activeAtEnd?.broodAliveCount ?? 'n/a'}, ${activeAtEnd?.entities ?? 0} entities, `
      + `whole-machine CPU busy ${hostBusy.toFixed(0)}%`);
    if (!activeAtEnd || activeAtEnd.mode !== 'flight' || activeAtEnd.phase !== 'active'
        || !(activeSimDelta > 0) || activeAtEnd.seed !== 4242 || activeAtEnd.wave !== 1
        || activeAtEnd.waveOneCohort < 1) {
      throw new Error(`bare CPU profile did not remain in advancing active sim: ${JSON.stringify(receipt)}`);
    }
  } else if (ADVENTURE) {
    console.log(`[crucible-cpu-profile] public Adventure route passed startup; diagnostics saved at ${path.join(OUT_DIR, 'opening-diagnostics.json')}`);
  } else {

  await page.bringToFront();
  await page.mouse.move(1100, 300);
  await page.keyboard.down('KeyW');

  // Aim the reticle at the nearest hostile every 200 ms so held LMB connects (the crucible
  // kill-shot channel). Swarm waves advance on `resolve_hostiles`: without kills the fight
  // stalls on wave 1's single wasp and the window never sees the ten-hostile roster.
  await page.evaluate(() => {
    window.__SF_PROFILE_KILLS__ = 0;
    window.SF.bus.on('entity:killed', () => { window.__SF_PROFILE_KILLS__ += 1; });
    window.__SF_PROFILE_AIM__ = setInterval(() => {
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

  // Phase-cost recorder on the page's rAF beat (same hook the smooth-flight witness reads), so
  // the CPU profile sits beside the callback/sim/render/vfx/ui split for the SAME window.
  await page.evaluate(() => {
    const record = { costs: [], last: 0 };
    window.__SF_PROFILE_WINDOW__ = record;
    const perf = window.SF && window.SF.state && window.SF.state.perfRuntime;
    if (perf) {
      if (typeof perf.setRenderWorkEnabled === 'function') perf.setRenderWorkEnabled(true);
      if (typeof perf.setHitchAttributionEnabled === 'function') perf.setHitchAttributionEnabled(true);
    }
    const tick = (now) => {
      if (record.last) {
        const scratch = {};
        const p = window.SF && window.SF.state && window.SF.state.perfRuntime;
        if (p && typeof p.readFrameSample === 'function') {
          p.readFrameSample(scratch);
          record.costs.push([
            scratch.callbackMs || 0, scratch.simFrameMs || 0, scratch.presentationMs || 0,
            scratch.renderMs || 0, scratch.vfxMs || 0, scratch.uiMs || 0, scratch.feelMs || 0,
            scratch.admissionMs || 0, scratch.untrackedMs || 0,
          ]);
        } else {
          record.costs.push(null);
        }
        const list = window.SF && window.SF.state && window.SF.state.entityList;
        if (Array.isArray(list)) {
          let live = 0;
          let foes = 0;
          const st = window.SF.state;
          for (const e of list) {
            if (!e || e.alive === false) continue;
            if (e.type === 'projectile') live++;
            else if (e.type === 'ship' && e.id !== st.playerId) foes++;
          }
          if (live > (record.projPeak || 0)) record.projPeak = live;
          if (foes > (record.foePeak || 0)) record.foePeak = foes;
        }
      }
      record.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const activeAtStart = await page.evaluate(() => ({
    mode: window.SF.state.mode,
    phase: window.SF.state.run && window.SF.state.run.phase,
    simTime: window.SF.state.simTime,
  }));
  if (activeAtStart.mode !== 'flight' || activeAtStart.phase !== 'active' || !(activeAtStart.simTime >= 0.5)) {
    throw new Error(`active CPU window refused non-active simulation: ${JSON.stringify(activeAtStart)}`);
  }

  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

  if (SETTLE_MS > 0) {
    console.log(`[crucible-cpu-profile] settling ${SETTLE_MS / 1000}s of flight before profiling…`);
    await page.waitForTimeout(SETTLE_MS);
  }

  const cpuBefore = cpuSnapshot();
  const started = Date.now();
  await cdp.send('Profiler.start');
  let phase = 0;
  while (Date.now() - started < SAMPLE_MS) {
    const key = phase % 2 === 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.keyboard.up(key);
    await page.waitForTimeout(600);
    phase++;
  }
  const { profile } = await cdp.send('Profiler.stop');
  await page.keyboard.up('KeyW');
  const hostBusy = hostBusyPct(cpuBefore, cpuSnapshot());
  const kills = await page.evaluate(() => ({
    kills: window.__SF_PROFILE_KILLS__ || 0,
    waves: (window.__SF_PROFILE_WAVES__ || [])
      .filter((e) => e.event === 'run:waveMaterialized')
      .map((e) => `w${e.wave}×${e.count ?? '?'}`),
  })).catch(() => ({ kills: null, waves: [] }));
  await page.evaluate(() => clearInterval(window.__SF_PROFILE_AIM__)).catch(() => {});

  const windowStats = await page.evaluate(() => {
    const state = window.SF.state;
    const costs = (window.__SF_PROFILE_WINDOW__ && window.__SF_PROFILE_WINDOW__.costs || []).slice(30);
    const names = ['callback', 'sim', 'present', 'render', 'vfx', 'ui', 'feel', 'admission', 'untracked'];
    const sums = new Array(names.length).fill(0);
    let n = 0;
    let over33 = 0;
    for (let i = 1; i < costs.length; i++) {
      const c = costs[i];
      if (!c) continue;
      n++;
      for (let k = 0; k < names.length; k++) sums[k] += c[k];
      if (c[0] > 33.4) over33++;
    }
    const callbackSorted = costs.map((c) => (c ? c[0] : 0)).filter((v) => v > 0).sort((a, b) => a - b);
    const pick = (q) => (callbackSorted.length
      ? callbackSorted[Math.min(callbackSorted.length - 1, Math.floor(callbackSorted.length * q))] : 0);
    // Live census: every visible light in the flight scene — the count three.js bakes into
    // every lit shader program as NUM_POINT_LIGHTS etc. Intensity-0 lights count; only
    // `visible === false` lights are skipped by the renderer's light pass.
    const lights = { point: 0, pointVisible: 0, spot: 0, spotVisible: 0, dir: 0, dirVisible: 0, names: [] };
    const scene = state.render && state.render.scene;
    if (scene && typeof scene.traverse === 'function') {
      scene.traverse((object) => {
        if (!object || !object.isLight) return;
        if (object.isPointLight) {
          lights.point++;
          if (object.visible) lights.pointVisible++;
          if (object.visible && lights.names.length < 24) {
            lights.names.push(`${object.name || 'point'} i=${Number(object.intensity || 0).toFixed(2)}`);
          }
        } else if (object.isSpotLight) {
          lights.spot++;
          if (object.visible) lights.spotVisible++;
        } else if (object.isDirectionalLight) {
          lights.dir++;
          if (object.visible) lights.dirVisible++;
        }
      });
    }
    const info = state.render && state.render.renderer && state.render.renderer.info;
    const list = Array.isArray(state.entityList) ? state.entityList : [];
    let hostiles = 0;
    let projectiles = 0;
    for (const e of list) {
      if (!e || e.alive === false) continue;
      if (e.type === 'ship' && e.id !== state.playerId) hostiles++;
      else if (e.type === 'projectile') projectiles++;
    }
    return {
      frames: n,
      callbackP50: pick(0.5),
      callbackP95: pick(0.95),
      callbackMean: n ? sums[0] / n : 0,
      mean: Object.fromEntries(names.map((name, k) => [name, n ? sums[k] / n : 0])),
      over33,
      projectilePeak: (window.__SF_PROFILE_WINDOW__ && window.__SF_PROFILE_WINDOW__.projPeak) || 0,
      foePeak: (window.__SF_PROFILE_WINDOW__ && window.__SF_PROFILE_WINDOW__.foePeak) || 0,
      lights,
      hostiles,
      projectiles,
      entities: list.length,
      drawCalls: info && info.render ? info.render.calls : 0,
      programs: info && Array.isArray(info.programs) ? info.programs.length : 0,
      gpu: state.render && state.render.gpu ? state.render.gpu.renderer : null,
      simTime: state.simTime,
      runPhase: state.run && state.run.phase,
    };
  });
  const activeSimDelta = windowStats.simTime - activeAtStart.simTime;

  fs.writeFileSync(path.join(OUT_DIR, 'profile.cpuprofile'), JSON.stringify(profile), 'utf8');
  const summary = summarizeProfile(profile);
  const pct = (micros) => `${((100 * micros) / (summary.totalMicros || 1)).toFixed(1)}%`;
  const ms = (micros) => (micros / 1000).toFixed(1);
  const w = windowStats;
  const lines = [
    '',
    'CRUCIBLE CPU PROFILE (PQ-210.01)',
    `  GPU                      ${w.gpu || 'unknown'}`,
    `  whole-machine CPU busy   ${hostBusy.toFixed(0)} % of ${os.cpus().length} logical cores during the profile window`,
    `  route                    CRUCIBLE seed 4242, default kit; at end ${w.hostiles} hostiles (peak ${w.foePeak}), ${w.projectiles} projectiles (peak ${w.projectilePeak}), ${w.entities} entities, ${w.drawCalls} draw calls, ${w.programs} programs`,
    `  fight progression        ${kills == null ? 'n/a' : `${kills.kills} kills; waves materialized: ${kills.waves.join(' ') || 'none'}`}`,
    `  window                   ${(SAMPLE_MS / 1000).toFixed(0)} s weave-and-shoot, ${w.frames} frames`,
    `  active simulation        ${activeAtStart.simTime.toFixed(2)} → ${w.simTime.toFixed(2)} s (${activeSimDelta.toFixed(2)} s; phase ${w.runPhase || 'unknown'})`,
    `  callback ms p50/p95      ${w.callbackP50.toFixed(1)} / ${w.callbackP95.toFixed(1)}; mean ${w.callbackMean.toFixed(1)}; >33.4 ms: ${w.over33}`,
    `  phase means (ms)         ${Object.entries(w.mean).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}`,
    `  visible scene lights     point ${w.lights.pointVisible}/${w.lights.point}  spot ${w.lights.spotVisible}/${w.lights.spot}  dir ${w.lights.dirVisible}/${w.lights.dir}  (visible/total; the visible count is baked into every lit program)`,
    `    lit point lights       ${w.lights.names.join('  ')}`,
    `  profiled (main thread)   ${ms(summary.totalMicros)} ms total; JS ${(100 * (summary.totalMicros - summary.buckets.idle - summary.buckets.program - summary.buckets.gc) / (summary.totalMicros || 1)).toFixed(1)}%, (program) ${pct(summary.buckets.program)}, idle ${pct(summary.buckets.idle)}, GC ${pct(summary.buckets.gc)}`,
    '  TOP SELF TIME BY FUNCTION',
    ...summary.self
      .filter((row) => row.node.callFrame.functionName !== '(idle)')
      .slice(0, 40)
      .map((row, i) => `    ${String(i + 1).padStart(2)}. ${ms(row.micros).padStart(8)} ms ${pct(row.micros).padStart(6)}  ${nodeLabel(row.node)}`),
    '  SELF TIME BY SOURCE FILE',
    ...summary.files
      .filter(([file]) => file !== '(idle)')
      .slice(0, 25)
      .map(([file, micros]) => `    ${ms(micros).padStart(8)} ms ${pct(micros).padStart(6)}  ${file}`),
    `  console errors           ${consoleErrors.length}`,
    ...consoleErrors.slice(0, 8),
    '',
  ];
  const report = lines.join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), report, 'utf8');
  console.log(report);
  if (w.runPhase !== 'active' || !(activeSimDelta > 0)) {
    throw new Error(`active profile did not observe advancing active simulation: ${JSON.stringify({ activeAtStart, simTime: w.simTime, runPhase: w.runPhase })}`);
  }
  }
} finally {
  if (startupProfilerRunning && cdp) {
    try {
      const { profile } = await cdp.send('Profiler.stop');
      writeProfileSummary('launch-incomplete', profile);
    } catch { /* browser teardown owns a disconnected profiling session */ }
  }
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
