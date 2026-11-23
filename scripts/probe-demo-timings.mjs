#!/usr/bin/env node
// DEMO-BOOT-1 timing probe: real Electron launches measuring what a player waits through.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-demo-timings.mjs [--runs=3]
//
// Per route (swarm, adventure) a fresh isolated profile is minted, then:
//   cold = first launch on that profile (empty HTTP/GPU/IndexedDB caches)
//   warm = second launch on the same profile (what a repeat player sees)
// Each launch measures launch -> title-interactive from the game's own boot timeline
// (the electron-process-start mark is the shell's own Date.now() stamp, so the span
// covers process start, server bind, navigation, module graph, and title paint), then
// title -> playable for the route:
//   swarm     title "Swarm" press -> survival wave live + hostile on screen + first playable frame
//   adventure title "New Game" press -> Launch -> flight in Helios + authoredVisualReadiness ready
// Readiness comes from the game (boot marks, state, worldToScreen, firstPlayableFrameAt),
// never fixed sleeps. In-page 25ms watchers stamp performance.now() the moment the
// predicate first holds, so Playwright polling latency cannot inflate a leg.
// "Other load" is os.cpus() busy% over the leg window minus the app's own CPU share
// (app.getAppMetrics sampled at leg edges). A CDP Profiler capture and the page's
// resource/longtask buffers attribute the biggest costs per leg.
import os from 'node:os';
import net from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { provisionElectronRuntime } from './lib/electronRuntimeProvisioning.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const RUNS = Math.max(1, Number(args.runs || 3) || 3);
const ROUTES = String(args.routes || 'swarm,adventure').split(',').map((s) => s.trim()).filter(Boolean);
const TEMPS = String(args.temps || 'cold,warm').split(',').map((s) => s.trim()).filter(Boolean);
const LABEL = String(args.label || 'baseline').replace(/[^a-z0-9_-]+/gi, '-');
const OUT = resolve(ROOT, args.out || `.devshots/perf/demo-timings-${LABEL}.json`);
const SHOTS = resolve(ROOT, args.shots || `.devshots/perf/demo-timings-${LABEL}`);
const TITLE_TIMEOUT_MS = Number(args['title-timeout'] || 180_000);
const LEG_TIMEOUT_MS = Number(args['leg-timeout'] || 120_000);
const PROFILE_LEGS = args.profile !== '0';
// --rfx-off=worldKtx2 (comma list): flips shipped rfx switches off for the whole session by
// stamping globalThis.__sfRfx at the first possible page hook — the switch is read live per
// acquire call, so one early evaluate reaches every world-texture load in the run.
const RFX_OFF = String(args['rfx-off'] || '').split(',').map((s) => s.trim()).filter(Boolean);

const { _electron: electron } = await loadPlaywright();
const electronRuntime = provisionElectronRuntime({ root: ROOT });

// Player parity: `npm run electron` serves the sim worker as ONE bundled file
// (devSimWorkerBundle provider, on by default for player launches). Isolated
// evidence profiles default it OFF, which measures a module-graph path no
// player ever runs — opt the probe back into the shipped artifact.
process.env.SPACEFACE_EVIDENCE_PLAYER_WORKER_BUNDLE = '1';

const samples = [];
const failures = [];

// Every completed leg flushes to a partial file: a crash mid-run keeps its
// evidence instead of losing the whole suite to a late serializer fault.
function flushPartial() {
  try {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(`${OUT}.partial`, `${JSON.stringify({
      schema: 'spaceface.demoBootTimings.partial.v1',
      label: LABEL,
      generatedAt: new Date().toISOString(),
      samples, failures,
    }, jsonReplacer(), 2)}\n`);
  } catch (error) {
    console.error(`[demo-boot] partial flush failed: ${error?.message || error}`);
  }
}

for (const route of ROUTES) {
  for (let runIndex = 1; runIndex <= RUNS; runIndex++) {
    // One pinned loopback port per profile: a real player relaunches on the same
    // origin, which is exactly what makes their second launch warm. Port 0 would
    // re-origin every launch and the HTTP cache could never hit.
    const port = await reserveLoopbackPort();
    const isolated = createIsolatedElectronLaunch({
      root: ROOT, taskId: `demo-${LABEL}-${route}-${runIndex}`, port,
    });
    try {
      for (const temp of TEMPS) {
        // cold runs on the minted profile; warm relaunches the same one.
        if (temp !== 'cold' && temp !== 'warm') throw new Error(`unknown temp "${temp}"`);
        const label = `${route}/${temp}/run${runIndex}`;
        try {
          const sample = await measureLaunch({ isolated, route, temp, runIndex, label });
          samples.push(sample);
          flushPartial();
          console.log(`[demo-boot] ${label} launch->title ${fmt(sample.launchToTitleMs)}ms `
            + `title->${route} ${fmt(sample.legMs)}ms other-load ${fmt(sample.cpu.otherLoadPct)}%`);
        } catch (error) {
          failures.push({
            route, temp, runIndex,
            message: error?.message || String(error),
            diagnostics: error?.diagnostics || null,
          });
          flushPartial();
          console.error(`[demo-boot] ${label} FAILED: ${error?.message || error}`);
        }
      }
    } finally {
      // A warm launch already proved the runtime closes; cleanup needs that proof.
      isolated.cleanup({ runtimeClosed: true });
    }
  }
}

const report = {
  schema: 'spaceface.demoBootTimings.v1',
  label: LABEL,
  generatedAt: new Date().toISOString(),
  machine: {
    platform: os.platform(),
    release: os.release(),
    cpuModel: os.cpus()[0]?.model || null,
    cores: os.cpus().length,
    electronRuntime: { packageVersion: electronRuntime.packageVersion, runtimeVersion: electronRuntime.runtimeVersion },
    simWorkerArtifact: 'player-parity-bundle',
  },
  runs: RUNS,
  rfxOff: RFX_OFF.length ? RFX_OFF : null,
  medians: buildMedians(samples),
  samples,
  failures,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, jsonReplacer(), 2)}\n`);
printTable(report);
console.log(`[demo-boot] report: ${OUT}`);
if (failures.length) process.exitCode = 1;

// ---------------------------------------------------------------------------

async function measureLaunch({ isolated, route, temp, runIndex, label }) {
  const cpuAtLaunch = cpuSnapshot();
  const spawnAt = Date.now();
  let app = null;
  let page = null;
  let childProcess = null;
  let processMonitor = null;
  let canonicalUrlTracker = null;
  let rootUrl = null;
  let pageIssues = null;
  try {
    app = await electron.launch(isolated.options);
    childProcess = app.process();
    processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
    page = await app.firstWindow({ timeout: 90_000 });
    installCspSafePlaywrightPolling(page);
    let ktx2Fetches = 0;
    page.on('request', (req) => {
      if (/\.(png|jpe?g)\.ktx2(\?|$)/i.test(req.url())) ktx2Fetches += 1;
    });
    if (RFX_OFF.length) {
      await page.evaluate((names) => {
        globalThis.__sfRfx = { ...(globalThis.__sfRfx || {}), ...Object.fromEntries(names.map((n) => [n, false])) };
      }, RFX_OFF).catch(() => {});
    }
    canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
      bootstrapTimeoutMs: 10_000,
      pollIntervalMs: 75,
      allowAnyLoopbackPort: true,
    });
    rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
    pageIssues = collectPageIssues(page, { ignoreProbeWarnings: true });

    const profiler = await startProfiler(page);
    await installPageProbe(page);

    // ---- leg 1: launch -> title interactive (game's own boot marks) ----
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 }).catch(() => {});
    await page.waitForFunction(() => {
      const timeline = window.__SF_BOOT_TIMELINE__;
      if (timeline && timeline.marks && timeline.marks.some((m) => m.name === 'title-interactive')) return true;
      const menu = document.querySelector('[data-screen="mainMenu"]');
      return !!(menu && menu.offsetParent !== null);
    }, null, { timeout: TITLE_TIMEOUT_MS });
    await dismissSplash(page);
    const launchLeg = await page.evaluate(() => {
      const timeline = window.__SF_BOOT_TIMELINE__ || { marks: [] };
      const mark = (name) => timeline.marks.find((m) => m.name === name) || null;
      const shell = mark('electron-process-start');
      const title = mark('title-interactive');
      return {
        marks: typeof timeline.table === 'function' ? timeline.table() : [],
        navToTitleMs: title ? title.t : (window.__SF_DEMO__ ? window.__SF_DEMO__.titleAt : null),
        launchToTitleMs: title && shell ? title.t - shell.t : null,
        shellBootT: shell ? shell.t : null,
        timeOrigin: performance.timeOrigin,
      };
    });
    const cpuAtTitle = cpuSnapshot();
    const titleWall = launchLeg.timeOrigin + (launchLeg.navToTitleMs || 0);
    const spawnToTitleMs = Number.isFinite(titleWall) && titleWall > 0 ? titleWall - spawnAt : null;
    const launchHostBusy = busyPct(cpuAtLaunch, cpuAtTitle);

    // ---- leg 2: title -> playable on the route ----
    const cpuAtLegStart = cpuSnapshot();
    const appMetricsStart = await readAppMetrics(app);
    const legProfiler = await startProfiler(page); // fresh capture for the leg
    await page.evaluate((routeKind) => window.__SF_DEMO__ && window.__SF_DEMO__.arm(routeKind), route);
    // A leg must start from a clean menu. A stray launch (splash race, stale input)
    // puts the run's results screen over the menu and burns the input timeout —
    // catch it in seconds instead.
    const menuClean = await page.waitForFunction(() => {
      const st = window.SF && window.SF.state;
      if (!st || st.mode !== 'menu') return false;
      const run = st.run;
      return !run || (run.ruleset !== 'swarm' && run.kind !== 'survival');
    }, null, { timeout: 15_000 }).then(() => true, () => false);
    if (!menuClean) throw await legFailure(page, 'menu was not clean before route input (a run is already live)');
    try {
      if (route === 'swarm') {
        await page.locator('[data-screen="mainMenu"] [data-action="swarm"]').first()
          .click({ timeout: 90_000 });
      } else if (route === 'adventure') {
        await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 90_000 });
        // A save on disk (every warm relaunch shares the profile) routes New Game through the
        // "Start a new game?" confirm first — a returning player clicks through it, so the probe
        // does too. Fresh profiles go straight to the newGame screen.
        const branch = await page.waitForFunction(() => {
          const c = document.querySelector('.sf-confirm');
          if (c && c.offsetParent !== null) return 'confirm';
          const el = document.querySelector('[data-screen="newGame"]');
          return (el && el.offsetParent !== null) ? 'newGame' : null;
        }, null, { timeout: 90_000 }).then((h) => (h && typeof h.jsonValue === 'function' ? h.jsonValue() : h));
        if (branch === 'confirm') {
          await page.locator('.sf-confirm__ok').first().click({ timeout: 30_000 });
          await page.waitForFunction(() => {
            const el = document.querySelector('[data-screen="newGame"]');
            return !!(el && el.offsetParent !== null);
          }, null, { timeout: 90_000 });
        }
        await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 90_000 });
      } else {
        throw new Error(`unknown route "${route}"`);
      }
    } catch (error) {
      throw await legFailure(page, `${route} route input failed: ${error?.message || error}`);
    }
    const legDeadline = Date.now() + LEG_TIMEOUT_MS;
    for (;;) {
      const stamped = await page.waitForFunction(
        () => window.__SF_DEMO__ && window.__SF_DEMO__.readyAt != null,
        null, { timeout: Math.max(1, legDeadline - Date.now()) },
      ).then(() => true, () => false);
      if (stamped) break;
      if (Date.now() >= legDeadline) {
        throw await legFailure(page, `${route} readiness timed out after ${LEG_TIMEOUT_MS}ms`);
      }
      // A player skips the cinematic to reach the fight; the probe does the same.
      await dismissSplash(page).catch(() => {});
      await page.waitForTimeout(400);
    }
    await dismissSplash(page).catch(() => {});
    const cpuAtLegEnd = cpuSnapshot();
    const appMetricsEnd = await readAppMetrics(app);
    const legProfile = await stopProfiler(legProfiler);
    const bootProfile = await stopProfiler(profiler);

    const shot = resolve(SHOTS, `${route}-${temp}-run${runIndex}.png`);
    mkdirSync(dirname(shot), { recursive: true });
    await page.screenshot({ path: shot }).catch(() => null);

    const legResult = await page.evaluate((routeKind) => {
      const demo = window.__SF_DEMO__ || {};
      const timeline = window.__SF_BOOT_TIMELINE__ || { marks: [] };
      const clickAt = demo.clickAt;
      const readyAt = demo.readyAt;
      const inLeg = (start) => clickAt == null || start >= clickAt;
      const resources = performance.getEntriesByType('resource')
        .filter((e) => inLeg(e.startTime) || inLeg(e.startTime + e.duration))
        .map((e) => ({
          name: e.name.replace(/^https?:\/\/[^/]+/, ''),
          start: Math.round(e.startTime),
          duration: Math.round(e.duration),
          transferSize: e.transferSize || 0,
          decodedBodySize: e.decodedBodySize || 0,
        }));
      const longtasks = (demo.longtasks || [])
        .filter((e) => clickAt == null || e.start + e.duration >= clickAt);
      const st = window.SF && window.SF.state;
      const run = st && st.run || {};
      const playerTeam = st && st.entities && st.entities.get(st.playerId)
        ? st.entities.get(st.playerId).team : 1;
      const hostiles = (st && st.entityList || []).filter((e) => e && e.alive !== false
        && (e.type === 'ship' || e.type === 'drone')
        && e.team != null && e.team !== playerTeam && e.team !== 0).length;
      return {
        clickAt,
        readyAt,
        legMs: clickAt != null && readyAt != null ? readyAt - clickAt : null,
        newGameCalls: demo.newGameCalls || [],
        why: demo.why || null,
        marks: typeof timeline.table === 'function' ? timeline.table() : [],
        resources,
        longtasks,
        state: {
          mode: st && st.mode,
          run: { kind: run.kind, ruleset: run.ruleset, phase: run.phase, wave: run.wave },
          sector: st && st.world && st.world.currentSectorId || null,
          hostiles,
          firstPlayableFrameAt: st && st.render && st.render.firstPlayableFrameAt || null,
          startupGpuResidency: st && st.render && st.render.startupGpuResidency || null,
          openingCookLedger: st && st.render && st.render.openingCookLedger || null,
          openingFirstPicturePhase: st && st.render && st.render.openingFirstPicturePhase || null,
          openingCurrentSectorFailure: st && st.render && st.render.openingCurrentSectorFailure || null,
          loaderDiagnostics: st && st.render && (st.render.loaderDiagnostics || st.render.authoredAssets) || null,
        },
      };
    }, route);

    const legMs = legResult.legMs;
    if (!Number.isFinite(legMs) || legMs < 0) {
      throw new Error(`route readiness never stamped a usable clock (clickAt=${legResult.clickAt}, readyAt=${legResult.readyAt})`);
    }
    const appCpuPct = appSharePct(appMetricsStart, appMetricsEnd);
    const legHostBusy = busyPct(cpuAtLegStart, cpuAtLegEnd);
    const otherLoadPct = legHostBusy == null ? null : Math.max(0, Math.round((legHostBusy - (appCpuPct || 0)) * 10) / 10);

    return {
      schema: 'spaceface.demoBootTimingRun.v1',
      route, temp, runIndex, label,
      rootUrl,
      spawnToTitleMs: spawnToTitleMs == null ? null : Math.round(spawnToTitleMs),
      launchToTitleMs: launchLeg.launchToTitleMs == null ? spawnToTitleMs : Math.round(launchLeg.launchToTitleMs),
      navToTitleMs: launchLeg.navToTitleMs == null ? null : Math.round(launchLeg.navToTitleMs),
      legMs: Math.round(legMs),
      cpu: {
        launchHostBusyPct: launchHostBusy,
        legHostBusyPct: legHostBusy,
        appCpuPct: appCpuPct == null ? null : Math.round(appCpuPct * 10) / 10,
        otherLoadPct,
      },
      clickAtMs: legResult.clickAt,
      readyAtMs: legResult.readyAt,
      newGameCalls: legResult.newGameCalls,
      launchMarks: launchLeg.marks,
      launchTopCosts: topCosts({ marks: launchLeg.marks, resources: [], longtasks: [], clickAt: null }),
      marks: legResult.marks,
      topCosts: topCosts({ marks: legResult.marks, resources: legResult.resources, longtasks: legResult.longtasks, clickAt: legResult.clickAt, cookLedger: legResult.state && legResult.state.openingCookLedger }),
      legResources: legResult.resources.length,
      rfxOff: RFX_OFF.length ? RFX_OFF : null,
      worldKtx2Fetches: ktx2Fetches,
      state: legResult.state,
      profile: PROFILE_LEGS ? { leg: legProfile, boot: bootProfile } : null,
      shot,
      pageIssues: summarizeIssues(pageIssues ? pageIssues.errorIssues() : []),
    };
  } finally {
    if (app) {
      await closeOwnedElectronRuntime({
        page, electronApp: app, childProcess, canonicalUrlTracker, processMonitor, rootUrl,
      }).catch((error) => {
        console.error(`[demo-boot] ${label} cleanup warning: ${error?.message || error}`);
      });
    }
  }
}

// ---------------------------------------------------------------------------

// Grab a free loopback port, release it, hand it to the isolated launch so cold
// and warm legs share one origin. Never the player port.
async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  const { PLAYER_ELECTRON_PORT } = await import('./lib/electronTestIsolation.mjs');
  if (port === PLAYER_ELECTRON_PORT) return reserveLoopbackPort();
  return port;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const eq = key.indexOf('=');
    if (eq >= 0) { result[key.slice(0, eq)] = key.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { result[key] = next; i++; }
    else result[key] = true;
  }
  return result;
}

// Game state snapshots may carry Three.js object graphs (scene parents/children,
// material, geometry). Cycle-drop and cap depth so the report always writes.
function jsonReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (value && typeof value === 'object') {
      if (value.isObject3D || value.isMaterial || value.isBufferGeometry || value.isTexture) {
        return `[${value.type || 'three-object'}]`;
      }
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
}

function fmt(value) {
  return value == null || !Number.isFinite(value) ? ' n/a ' : String(Math.round(value));
}

function median(values) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function buildMedians(samples) {
  const out = {};
  for (const s of samples) {
    const cell = ((out[s.route] ||= {})[s.temp] ||= { launchToTitleMs: [], legMs: [], otherLoadPct: [] });
    cell.launchToTitleMs.push(s.launchToTitleMs);
    cell.legMs.push(s.legMs);
    cell.otherLoadPct.push(s.cpu.otherLoadPct);
  }
  for (const route of Object.values(out)) {
    for (const temp of Object.values(route)) {
      for (const key of Object.keys(temp)) temp[key] = median(temp[key]);
    }
  }
  return out;
}

function printTable(report) {
  const rows = [];
  for (const route of Object.keys(report.medians)) {
    for (const temp of Object.keys(report.medians[route])) {
      const cell = report.medians[route][temp];
      rows.push({
        route, temp,
        'launch→title ms': cell.launchToTitleMs == null ? 'n/a' : Math.round(cell.launchToTitleMs),
        [`title→${route} ms`]: cell.legMs == null ? 'n/a' : Math.round(cell.legMs),
        'other load %': cell.otherLoadPct == null ? 'n/a' : cell.otherLoadPct,
      });
    }
  }
  console.log('[demo-boot] medians:');
  console.table(rows);
}

// Host busy% across a leg from os.cpus() deltas; app share from getAppMetrics.
function cpuSnapshot() {
  let idle = 0; let total = 0;
  for (const cpu of os.cpus()) {
    for (const key of Object.keys(cpu.times)) total += cpu.times[key];
    idle += cpu.times.idle;
  }
  return { idle, total, at: Date.now() };
}

function busyPct(a, b) {
  if (!a || !b) return null;
  const total = b.total - a.total;
  const idle = b.idle - a.idle;
  if (total <= 0) return null;
  return Math.round((1 - idle / total) * 1000) / 10;
}

async function readAppMetrics(app) {
  try {
    const metrics = await app.evaluate(({ app: a }) => a.getAppMetrics()
      .map((m) => ({ type: m.type, cpu: m.cpu && Number(m.cpu.percentCPUUsage) || 0 })));
    return metrics;
  } catch {
    return null;
  }
}

function appSharePct(start, end) {
  if (!Array.isArray(end)) return null;
  // percentCPUUsage is cumulative CPU-time/wall-time per process; two reads bound the leg share.
  const endSum = end.reduce((sum, m) => sum + m.cpu, 0);
  const startSum = Array.isArray(start) ? start.reduce((sum, m) => sum + m.cpu, 0) : 0;
  const delta = endSum - startSum;
  return delta > 0.01 ? delta : endSum;
}

// In-page watchers: stamp performance.now() the moment readiness holds (25ms granularity),
// a capture-phase click stamp, and a longtask buffer — all independent of driver latency.
async function installPageProbe(page) {
  await page.evaluate(() => {
    const demo = window.__SF_DEMO__ = {
      readyAt: null,
      clickAt: null,
      titleAt: null,
      longtasks: [],
      newGameCalls: [],
      _timer: null,
      arm(kind) {
        this.readyAt = null;
        this.clickAt = null;
        if (this._timer) clearInterval(this._timer);
        const test = kind === 'swarm' ? this._swarmReady : this._adventureReady;
        this._timer = setInterval(() => {
          try {
            if (test.call(this)) {
              this.readyAt = performance.now();
              clearInterval(this._timer);
              this._timer = null;
            }
          } catch (_) { /* keep polling */ }
        }, 25);
      },
      _playerTeam(state) {
        const player = state.entities && state.entities.get(state.playerId);
        return player ? player.team : 1;
      },
      // Why-trace: every negative poll records the first failing check plus the
      // counts that explain it, so a timeout names its blocker in the report.
      _why(reason, extra) {
        this.why = { reason, ...(extra || {}), at: Math.round(performance.now()) };
        return false;
      },
      _swarmReady() {
        const sf = window.SF; const st = sf && sf.state;
        if (!st || st.mode !== 'flight') return this._why('not-flight', { mode: st && st.mode });
        const run = st.run;
        if (!run || (run.ruleset !== 'swarm' && run.kind !== 'survival')) {
          return this._why('not-swarm-run', { run: run && { kind: run.kind, ruleset: run.ruleset } });
        }
        if (run.phase !== 'active' || !(run.wave >= 1)) {
          return this._why('phase', { phase: run.phase, wave: run.wave });
        }
        if (!Number.isFinite(st.render && st.render.firstPlayableFrameAt)) return this._why('no-first-frame');
        const wts = sf.ctx && sf.ctx.helpers && sf.ctx.helpers.worldToScreen;
        if (typeof wts !== 'function') return this._why('no-wts');
        const playerTeam = this._playerTeam(st);
        // The packet's contract is "a hostile visible". A Swarm survival run is
        // solo — any living ship/drone on another team on screen is a hostile.
        // (Mirrored lane rows do not all carry .data, so the cohort tag cannot
        // be the gate; the opposing-team check is what the player's guns use.)
        let others = 0;
        let sample = null;
        for (const e of st.entityList || []) {
          if (!e || e.alive === false || e.id === st.playerId) continue;
          if (e.type !== 'ship' && e.type !== 'drone') continue;
          if (!sample) sample = { type: e.type, team: e.team, hasData: !!e.data, hasPos: !!e.pos };
          if (e.team == null || e.team === playerTeam || e.team === 0) continue;
          others += 1;
          const screen = e.pos ? wts(e.pos) : null;
          if (screen && screen.onScreen === true && !screen.behind) {
            this.why = null;
            return true;
          }
        }
        return this._why('no-hostile-onscreen', { others, entities: (st.entityList || []).length, sample });
      },
      _adventureReady() {
        const sf = window.SF; const st = sf && sf.state;
        if (!st || st.mode !== 'flight') return false;
        const run = st.run;
        // A stray Swarm launch (splash-race, stale input) also sits in Helios flight —
        // it must not satisfy the Adventure leg.
        if (run && (run.ruleset === 'swarm' || run.kind === 'survival')) return false;
        const player = st.entities && st.entities.get(st.playerId);
        if (!player || player.alive === false || !(Number(player.hull) > 0)) return false;
        const sector = st.world && st.world.currentSectorId;
        if (typeof sector !== 'string' || !sector.startsWith('sector_helios')) return false;
        if (!Number.isFinite(st.render && st.render.firstPlayableFrameAt)) return false;
        const readiness = typeof sf.authoredVisualReadiness === 'function' ? sf.authoredVisualReadiness() : null;
        if (!readiness || readiness.ready !== true) return false;
        if (document.body.classList.contains('ui-modal-open')) return false;
        const splash = document.getElementById('cinematic-splash');
        if (splash && !splash.hidden) {
          const cs = getComputedStyle(splash);
          if (cs.display !== 'none' && cs.visibility !== 'hidden') return false;
        }
        return true;
      },
    };
    document.addEventListener('click', (ev) => {
      // The splash dismissal rides this same listener path while armed — never let
      // it pose as the route's input stamp.
      if (demo._timer && demo.clickAt == null
        && !(ev.target && ev.target.id === 'cinematic-splash')) {
        demo.clickAt = performance.now();
      }
    }, true);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          demo.longtasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (_) {}
    // Emit-spy: a run that launches itself inside a measured leg (attract/auto-start
    // contamination) is only diagnosable if we capture who emitted game:new.
    const spyBus = () => {
      const bus = window.SF && window.SF.bus;
      if (!bus || typeof bus.emit !== 'function' || bus.__sfDemoSpy) return;
      bus.__sfDemoSpy = true;
      const orig = bus.emit.bind(bus);
      bus.emit = (event, payload) => {
        if (event === 'game:new') {
          try {
            demo.newGameCalls.push({
              at: Math.round(performance.now()),
              opts: JSON.parse(JSON.stringify(payload ?? null)),
              stack: String(new Error('emit-spy').stack).split('\n').slice(1, 8).join('\n'),
            });
          } catch (_) {}
        }
        return orig(event, payload);
      };
    };
    spyBus();
    const busSpyTimer = setInterval(() => { try { spyBus(); } catch (_) {} }, 100);
    setTimeout(() => clearInterval(busSpyTimer), 300000);
    // Fallback title stamp for builds without the title-interactive mark.
    const titleTimer = setInterval(() => {
      try {
        const menu = document.querySelector('[data-screen="mainMenu"]');
        if (menu && menu.offsetParent !== null) {
          demo.titleAt = demo.titleAt == null ? performance.now() : demo.titleAt;
          clearInterval(titleTimer);
        }
      } catch (_) {}
    }, 25);
    setTimeout(() => clearInterval(titleTimer), 300000);
  });
}

// Failures carry evidence: which screens/buttons were up, run state, recent boot
// marks, and a PNG of whatever the player would have been staring at.
async function legFailure(page, message) {
  const diagnostics = await collectLegDiagnostics(page).catch(() => null);
  const shot = resolve(SHOTS, `failure-${Date.now()}.png`);
  mkdirSync(dirname(shot), { recursive: true });
  const shotOk = await page.screenshot({ path: shot }).then(() => true, () => false);
  if (diagnostics && shotOk) diagnostics.shot = shot;
  const error = new Error(message);
  error.diagnostics = diagnostics;
  return error;
}

// On a leg timeout, snapshot what the game was doing so a failure is diagnosable
// from the report instead of a bare clock.
async function collectLegDiagnostics(page) {
  return page.evaluate(() => {
    const st = window.SF && window.SF.state;
    const timeline = window.__SF_BOOT_TIMELINE__;
    const screens = [...document.querySelectorAll('#screens > *')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.dataset && el.dataset.screen || el.className || el.id)
      .slice(0, 6);
    return {
      mode: st && st.mode,
      run: st && st.run ? { kind: st.run.kind, ruleset: st.run.ruleset, phase: st.run.phase, wave: st.run.wave } : null,
      sector: st && st.world && st.world.currentSectorId || null,
      firstPlayableFrameAt: st && st.render && st.render.firstPlayableFrameAt || null,
      entities: st && st.entityList ? st.entityList.length : null,
      screensVisible: screens,
      buttons: [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => String(b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40))
        .filter(Boolean).slice(0, 25),
      splashVisible: !!(document.getElementById('cinematic-splash')
        && !document.getElementById('cinematic-splash').hidden),
      clickAt: window.__SF_DEMO__ ? window.__SF_DEMO__.clickAt : null,
      readyAt: window.__SF_DEMO__ ? window.__SF_DEMO__.readyAt : null,
      why: window.__SF_DEMO__ ? window.__SF_DEMO__.why : null,
      newGameCalls: window.__SF_DEMO__ ? window.__SF_DEMO__.newGameCalls : null,
      marks: timeline && typeof timeline.table === 'function' ? timeline.table().slice(-25) : [],
      lastProgress: window.__SF_LAST_PROGRESS__ || null,
    };
  });
}

async function dismissSplash(page) {
  // Dismiss on the element's own click path (cinematic fence's pointer dismiss).
  // Never send keyboard input here: the fence consumes keys only while armed, and
  // once the splash finalizes the focused title verb is the Swarm door — a stray
  // Space/Enter launches a real survival run inside the measured leg.
  await page.evaluate(() => {
    const splash = document.getElementById('cinematic-splash');
    if (splash && !splash.hidden && typeof splash.click === 'function') splash.click();
  }).catch(() => {});
  await page.locator('#cinematic-splash').waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
}

// CDP Profiler: bottom-up self time, resolved to file:line. Best-effort — the
// session may attach after navigation starts, which is why boot marks stay primary.
async function startProfiler(page) {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 100 });
    await session.send('Profiler.start');
    return session;
  } catch {
    return null;
  }
}

async function stopProfiler(session) {
  if (!session) return null;
  try {
    const { profile } = await session.send('Profiler.stop');
    await session.detach().catch(() => {});
    return summarizeProfile(profile);
  } catch {
    return null;
  }
}

function summarizeProfile(profile) {
  if (!profile || !Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) return null;
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const hits = new Map();
  for (const id of profile.samples) hits.set(id, (hits.get(id) || 0) + 1);
  const intervalUs = profile.samples.length > 1 && profile.endTime > profile.startTime
    ? ((profile.endTime - profile.startTime) / Math.max(1, profile.samples.length - 1)) / 1000
    : 100;
  const rows = [];
  for (const [id, count] of hits) {
    const node = nodes.get(id);
    if (!node) continue;
    const cf = node.callFrame || {};
    const url = String(cf.url || '').replace(/^https?:\/\/[^/]+/, '') || '(native)';
    rows.push({
      fn: cf.functionName || '(anonymous)',
      at: `${url}:${cf.lineNumber + 1}`,
      ms: Math.round(count * intervalUs),
    });
  }
  rows.sort((a, b) => b.ms - a.ms);
  return { totalMs: Math.round(profile.samples.length * intervalUs), top: rows.slice(0, 15) };
}

function topCosts({ marks, resources, longtasks, clickAt, cookLedger }) {
  const costs = [];
  // mark.ms is performance.now() at the mark; deltaMs is the stage that ended at it.
  for (const mark of (marks || []).filter((m) => clickAt == null || m.ms >= clickAt)) {
    if (mark.deltaMs > 0) costs.push({ what: `boot:…→${mark.name}`, ms: mark.deltaMs });
  }
  // The opening cook ledger is the gate's own accounting — the honest decomposition
  // of gate:render-pipelines into the waits it actually sat in.
  for (const row of (cookLedger || [])) {
    if (row && row.step !== 'begin' && row.step !== 'lane' && row.ms > 0) {
      costs.push({ what: `cook:${row.step}${row.outcome && row.outcome !== 'resolved' ? ':' + row.outcome : ''}`, ms: row.ms });
    }
  }
  for (const r of (resources || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 10)) {
    costs.push({ what: `fetch:${r.name.split('?')[0].split('/').pop() || r.name.slice(-60)}`, ms: r.duration, bytes: r.transferSize });
  }
  for (const t of (longtasks || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 10)) {
    costs.push({ what: `longtask@${Math.round(t.start)}ms`, ms: Math.round(t.duration) });
  }
  costs.sort((a, b) => b.ms - a.ms);
  return costs.slice(0, 10);
}
