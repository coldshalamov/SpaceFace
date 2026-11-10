#!/usr/bin/env node
// REPRO — why the public autopilot does not close on a station.
//
// NOT A GATE. This is a diagnostic that exists to ATTRIBUTE the step-1 failure of
// `check:journey:textile`, which reports: armed correctly (target-to-station 0 WU), autopilot
// active, speed 15-27 WU/s, and closest approach improving 1347 -> 1344 WU in 300 s against a
// 90 WU dock radius. Those numbers are consistent with three completely different defects:
//
//   H1  ONBOARDING OWNS NAV — `missions._refreshNavigation` nulls competing waypoints while
//       `_onboardingOwnsOpeningNav()` holds, so the armed target is repeatedly cleared.
//   H2  SIM NOT INTEGRATING — the ship reports velocity but position never advances.
//   H3  ORBIT / AVOIDANCE LOCK — the ship really flies, but collision avoidance steers it
//       perpendicular forever, so it circles the station at constant radius.
//
// A bare timeout cannot tell these apart, and "fixing" the wrong one is worse than not fixing it.
// This script samples the trajectory so they separate outright:
//
//   * `tick` and `pos` every sample     -> distinguishes H2 (frozen) from H1/H3 (moving)
//   * `distance` over time              -> H3 shows a flat/oscillating radius, H1 shows drift
//   * `autopilot.target` every sample   -> H1 shows the target going null or changing
//   * `_avoidanceSide` + `status`       -> H3 shows a latched side and status 'avoiding'
//   * path length vs net displacement   -> H3's smoking gun: high path, ~zero net closure
//
// It also records the onboarding state without mutating it, so H1 remains auditable without
// turning a diagnostic into a second gameplay-state writer.
//
// Usage: node scripts/repro-station-approach.mjs

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { bootToAuthoredFlight, TRAVEL_PUBLIC_HELPERS } from './lib/professionalTravelPublicRoute.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const OUT = path.join(ROOT, '.devshots', 'repro-station-approach');
const SAMPLE_MS = 700;
const APPROACH_S = 75;           // far shorter than the journey's 300 s: the pattern is obvious by 60 s
const log = (m) => console.log(`[repro-approach] ${m}`);

function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  return candidates.find((p) => existsSync(p)) || null;
}

/** One sample of everything the three hypotheses disagree about. */
const SAMPLE_FN = (stationName) => {
  const state = window.SF?.state;
  const player = state?.entities?.get(state.playerId);
  const ap = state?.nav?.autopilot;
  let dist = Infinity; let station = null;
  if (player?.pos && Array.isArray(state?.entityList)) {
    for (const e of state.entityList) {
      if (!e || e.type !== 'station' || e.data?.isGate || !e.pos) continue;
      if (stationName && (e.data?.name || '') !== stationName) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < dist) { dist = d; station = { x: e.pos.x, z: e.pos.z, radius: e.data?.dockRadius || e.radius || null }; }
    }
  }
  // What is actually in the corridor between the ship and the station? H3 needs a persistent
  // obstacle; if the list is empty the avoidance explanation dies.
  const obstacles = [];
  if (player?.pos && station && Array.isArray(state?.entityList)) {
    const bx = station.x - player.pos.x; const bz = station.z - player.pos.z;
    const blen = Math.hypot(bx, bz) || 1;
    const ux = bx / blen; const uz = bz / blen;
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
      const ox = e.pos.x - player.pos.x; const oz = e.pos.z - player.pos.z;
      const proj = ox * ux + oz * uz;
      if (proj <= 0 || proj > 600) continue;
      const lat = Math.abs(ox * -uz + oz * ux);
      if (lat > 260) continue;
      obstacles.push({ type: e.type, name: e.data?.name || e.id, proj: Math.round(proj), lat: Math.round(lat), r: e.radius || 0 });
    }
  }
  return {
    tick: state?.tick ?? null,
    mode: state?.mode ?? null,
    pos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
    speed: player?.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : 0,
    dist: Number.isFinite(dist) ? dist : null,
    dockRadius: station?.radius ?? null,
    apActive: ap?.active === true,
    apStatus: ap?.status || null,
    apTarget: ap?.target ? { x: ap.target.x, z: ap.target.z } : null,
    apLabel: ap?.label || null,
    avoidanceSide: ap?._avoidanceSide ?? null,
    waypointLabel: state?.nav?.waypoint?.label || null,
    obstacles: obstacles.sort((a, b) => a.proj - b.proj).slice(0, 6),
  };
};

async function armStationAndTrack(page, helpers, label, { unconditionalEscape = false, recoverPause = true } = {}) {
  const target = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player?.pos || !Array.isArray(state?.entityList)) return null;
    let best = null; let bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'station' || e.data?.isGate || !e.pos) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = { name: e.data?.name || 'Station', dist: d }; }
    }
    return best;
  });
  if (!target) return { label, ok: false, reason: 'no station entity' };
  log(`[${label}] target ${target.name} at ${Math.round(target.dist)} WU`);

  await page.keyboard.press('KeyN');
  const mapUp = await helpers.waitVisibleSafe(page, '[data-screen="galaxyMap"]', 20_000);
  if (!mapUp) return { label, ok: false, reason: 'map did not open' };
  await helpers.searchAndSelect(page, target.name, /station|berth|dock/i);
  const setWp = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  const vis = await setWp.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
  if (!vis) return { label, ok: false, reason: 'no Set Waypoint control' };
  await helpers.clickPersistentButton(page, setWp);
  await page.waitForFunction(() => window.SF?.state?.nav?.autopilot?.active === true, null, { timeout: 10_000 })
    .catch(() => {});
  // THE A/B. `dockAtNearestStation` in the journey harness presses Escape UNCONDITIONALLY here.
  // If Set Waypoint already dismissed the chart, that keystroke lands in FLIGHT, where Escape is
  // the pause key — so the journey then polls a paused game for 300 s.
  const mapStillVisible = await page.locator('[data-screen="galaxyMap"]').first().isVisible().catch(() => false);
  if (unconditionalEscape || mapStillVisible) await page.keyboard.press('Escape').catch(() => {});
  await page.locator('#gl-canvas').focus().catch(() => {});
  const modeAfterEscape = await page.evaluate(() => window.SF?.state?.mode ?? null);
  log(`[${label}] chart still visible after Set Waypoint = ${mapStillVisible}; mode after escape = ${modeAfterEscape}`);
  const flightResumed = await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 10_000 })
    .then(() => true).catch(() => false);
  if (!flightResumed && !unconditionalEscape) return { label, ok: false, reason: 'map waypoint flow did not return to flight mode' };

  const samples = [];
  let pausedSamples = 0;
  const deadline = Date.now() + APPROACH_S * 1000;
  while (Date.now() < deadline) {
    samples.push(await page.evaluate(SAMPLE_FN, target.name));
    const last = samples[samples.length - 1];
    // MEASUREMENT GUARD, learned the hard way: this game auto-pauses when the window loses focus,
    // and a headed Playwright window loses focus to ANY other process that opens a window. A first
    // run of this script sampled 94 consecutive frames at `mode='paused'`, tick frozen at 155 and
    // path length 0 WU, which reads exactly like "the sim is not integrating" (H2) but was really
    // "another check stole focus". Never grade a frozen tick without checking `mode` first.
    if (last.mode === 'paused') {
      pausedSamples += 1;
      // Condition B deliberately does NOT recover: it must reproduce the journey faithfully.
      if (!recoverPause) { await page.waitForTimeout(SAMPLE_MS); continue; }
      await page.bringToFront().catch(() => {});
      await page.locator('#gl-canvas').focus().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    if (last.dist != null && last.dockRadius != null && last.dist <= last.dockRadius) break;
    await page.waitForTimeout(SAMPLE_MS);
  }

  // Derived discriminators. Paused frames are EXCLUDED from motion maths — including them would
  // dilute path length toward zero and manufacture a false orbit/frozen signature.
  const live = samples.filter((s) => s.mode !== 'paused');
  const moved = live.filter((s) => s.pos);
  let pathLen = 0;
  for (let i = 1; i < moved.length; i += 1) {
    pathLen += Math.hypot(moved[i].pos.x - moved[i - 1].pos.x, moved[i].pos.z - moved[i - 1].pos.z);
  }
  const first = moved[0]; const last = moved[moved.length - 1];
  const netDisp = first && last ? Math.hypot(last.pos.x - first.pos.x, last.pos.z - first.pos.z) : 0;
  const dists = live.map((s) => s.dist).filter((d) => d != null);
  const tickAdvanced = live.length > 1 && live[live.length - 1].tick > live[0].tick;
  const targetEverNull = live.some((s) => s.apActive && !s.apTarget);
  const targetChanged = live.some((s) => s.apTarget && live[0] && live[0].apTarget
    && Math.hypot(s.apTarget.x - live[0].apTarget.x, s.apTarget.z - live[0].apTarget.z) > 1);
  const statuses = [...new Set(live.map((s) => s.apStatus).filter(Boolean))];
  const sides = [...new Set(live.map((s) => s.avoidanceSide).filter((v) => v != null))];
  const obstacleNames = [...new Set(live.flatMap((s) => s.obstacles.map((o) => `${o.type}:${o.name}`)))];

  return {
    label,
    ok: true,
    station: target.name,
    samples: samples.length,
    liveSamples: live.length,
    pausedSamples,
    tickAdvanced,
    tickFirst: live[0]?.tick ?? null,
    tickLast: live[live.length - 1]?.tick ?? null,
    distFirst: dists[0] ?? null,
    distLast: dists[dists.length - 1] ?? null,
    distMin: dists.length ? Math.min(...dists) : null,
    distMax: dists.length ? Math.max(...dists) : null,
    dockRadius: live.find((s) => s.dockRadius != null)?.dockRadius ?? null,
    pathLen,
    netDisp,
    // The orbit signature: the ship flies a long way and ends up the same distance out.
    orbitRatio: netDisp > 0.001 ? pathLen / netDisp : null,
    targetEverNull,
    targetChanged,
    statuses,
    avoidanceSides: sides,
    obstaclesSeen: obstacleNames,
    trace: samples,
  };
}

let ownedServer = null; let browser = null; let context = null; let page = null;
const report = { generatedAt: new Date().toISOString(), conditions: [] };

try {
  await mkdir(OUT, { recursive: true });
  ownedServer = await acquireVisualProbeServer({ root: ROOT });
  const rootUrl = ownedServer.baseUrl;
  log(`server ${rootUrl}`);

  const executablePath = findSystemBrowser();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  });
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark' });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  await bootToAuthoredFlight({ page, outputDir: null, log });

  // ---- Condition A: conditional Escape (press it only if the chart is actually still up) ----
  const a = await armStationAndTrack(page, TRAVEL_PUBLIC_HELPERS, 'A-conditional-escape');
  report.conditions.push(a);

  // ---- Condition B: historical unconditional-Escape defect, from a fresh identical boot ----
  // A cannot be followed by B in the same run: A ends at Helios, so its world state and camera are
  // no longer comparable. Reload to a fresh public-route New Game before changing the one variable.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.bringToFront();
  await bootToAuthoredFlight({ page, outputDir: null, log });
  const b = await armStationAndTrack(page, TRAVEL_PUBLIC_HELPERS, 'B-historical-unconditional-escape', {
    unconditionalEscape: true,
    recoverPause: false,
  });
  report.conditions.push(b);

  // ---- Read-only onboarding state probe ----
  // Do not mutate tutorial state in a diagnostic. Record it so the H1 hypothesis remains auditable.
  const toggled = await page.evaluate(() => {
    const s = window.SF?.state;
    if (!s?.settings?.gameplay) return false;
    return s.settings.gameplay.tutorialHints === false ? 'already-off' : 'read-only-probe';
  });
  report.tutorialProbe = toggled;
  const onboarding = await page.evaluate(() => {
    const s = window.SF?.state;
    return {
      tutorialHints: s?.settings?.gameplay?.tutorialHints ?? null,
      onboardingStage: s?.onboarding?.stage ?? s?.tutorial?.stage ?? null,
      objective: s?.ui?.objective?.text ?? null,
      waypointLabel: s?.nav?.waypoint?.label ?? null,
    };
  });
  report.onboardingState = onboarding;
  log(`onboarding state: ${JSON.stringify(onboarding)}`);
} catch (error) {
  report.error = String(error && error.stack ? error.stack : error);
  log(`ERROR ${report.error}`);
} finally {
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await ownedServer?.release?.().catch(() => {});
}

const file = path.join(OUT, `report-${Date.now()}-${randomBytes(3).toString('hex')}.json`);
await writeFile(file, JSON.stringify(report, null, 2));

for (const c of report.conditions) {
  if (!c.ok) { log(`${c.label}: SETUP FAILED — ${c.reason}`); continue; }
  log(`── ${c.label} · ${c.station} ──`);
  log(`  ticks ${c.tickFirst} -> ${c.tickLast} (advanced=${c.tickAdvanced})   [H2: sim frozen?]`);
  log(`  dist ${c.distFirst?.toFixed(0)} -> ${c.distLast?.toFixed(0)} WU (min ${c.distMin?.toFixed(0)}, max ${c.distMax?.toFixed(0)}) vs dock radius ${c.dockRadius}`);
  log(`  path flown ${c.pathLen.toFixed(0)} WU · net displacement ${c.netDisp.toFixed(0)} WU · ratio ${c.orbitRatio?.toFixed(1)}   [H3: orbit?]`);
  log(`  autopilot target ever null=${c.targetEverNull} changed=${c.targetChanged}   [H1: onboarding stealing nav?]`);
  log(`  statuses ${JSON.stringify(c.statuses)} · avoidance sides ${JSON.stringify(c.avoidanceSides)}`);
  log(`  obstacles in corridor: ${c.obstaclesSeen.length ? c.obstaclesSeen.join(', ') : '(none)'}`);
}
log(`report: ${path.relative(ROOT, file)}`);
process.exit(report.error ? 1 : 0);
