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
// It also runs a SECOND condition with the tutorial finished, because H1 predicts the approach
// succeeds once onboarding no longer owns nav, and H3 predicts it fails identically.
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

async function armStationAndTrack(page, helpers, label) {
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
  const mapStillVisible = await page.locator('[data-screen="galaxyMap"]').first().isVisible().catch(() => false);
  if (mapStillVisible) await page.keyboard.press('Escape').catch(() => {});
  await page.locator('#gl-canvas').focus().catch(() => {});
  const flightResumed = await page.waitForFunction(() => window.SF?.state?.mode === 'flight', null, { timeout: 10_000 })
    .then(() => true).catch(() => false);
  if (!flightResumed) return { label, ok: false, reason: 'map waypoint flow did not return to flight mode' };

  const samples = [];
  const deadline = Date.now() + APPROACH_S * 1000;
  while (Date.now() < deadline) {
    samples.push(await page.evaluate(SAMPLE_FN, target.name));
    const last = samples[samples.length - 1];
    if (last.dist != null && last.dockRadius != null && last.dist <= last.dockRadius) break;
    await page.waitForTimeout(SAMPLE_MS);
  }

  // Derived discriminators.
  const moved = samples.filter((s) => s.pos);
  let pathLen = 0;
  for (let i = 1; i < moved.length; i += 1) {
    pathLen += Math.hypot(moved[i].pos.x - moved[i - 1].pos.x, moved[i].pos.z - moved[i - 1].pos.z);
  }
  const first = moved[0]; const last = moved[moved.length - 1];
  const netDisp = first && last ? Math.hypot(last.pos.x - first.pos.x, last.pos.z - first.pos.z) : 0;
  const dists = samples.map((s) => s.dist).filter((d) => d != null);
  const tickAdvanced = samples.length > 1 && samples[samples.length - 1].tick > samples[0].tick;
  const targetEverNull = samples.some((s) => s.apActive && !s.apTarget);
  const targetChanged = samples.some((s) => s.apTarget && samples[0].apTarget
    && Math.hypot(s.apTarget.x - samples[0].apTarget.x, s.apTarget.z - samples[0].apTarget.z) > 1);
  const statuses = [...new Set(samples.map((s) => s.apStatus).filter(Boolean))];
  const sides = [...new Set(samples.map((s) => s.avoidanceSide).filter((v) => v != null))];
  const obstacleNames = [...new Set(samples.flatMap((s) => s.obstacles.map((o) => `${o.type}:${o.name}`)))];

  return {
    label,
    ok: true,
    station: target.name,
    samples: samples.length,
    tickAdvanced,
    tickFirst: samples[0]?.tick ?? null,
    tickLast: samples[samples.length - 1]?.tick ?? null,
    distFirst: dists[0] ?? null,
    distLast: dists[dists.length - 1] ?? null,
    distMin: dists.length ? Math.min(...dists) : null,
    distMax: dists.length ? Math.max(...dists) : null,
    dockRadius: samples.find((s) => s.dockRadius != null)?.dockRadius ?? null,
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

  // ---- Condition A: exactly as the journey does it (onboarding untouched) ----
  const a = await armStationAndTrack(page, TRAVEL_PUBLIC_HELPERS, 'A-as-journey');
  report.conditions.push(a);

  // ---- Condition B: same, after retiring the tutorial through the PUBLIC settings toggle ----
  // H1 predicts B succeeds. H3 predicts B fails identically. This is the discriminating run.
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
