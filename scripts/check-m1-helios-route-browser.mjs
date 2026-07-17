#!/usr/bin/env node
/**
 * W1 complementary browser evidence — uninjected Helios dock approach.
 *
 * Thin Playwright harness:
 *   New Game → Launch → ordinary flight → N map → search Helios → Set Waypoint
 *   → wait physical dock prompt (.sf-alert--dock with E)
 *
 * Uses scripts/lib/alphaLiveBaselineRoute.mjs (same public route as demo-opening /
 * M0 baseline). No SF teleports, no state writes, no entity injection.
 *
 * Product geometry / terminal approach is gated by:
 *   npm run check:m1:helios-route  (headless flightV3 + Rapier, REAL product proof)
 *
 * This browser check is complementary wall-clock evidence. If Playwright is broken
 * or unavailable, classify as HARNESS and keep check:m1:helios-route as the REAL gate.
 *
 * Usage: npm run check:m1:helios-route-browser
 * Fence: no input.js / assets; observe-only.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeOwnedResources } from './lib/alphaLiveBaselineContracts.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'alpha', 'm1-helios-route-browser');
const REPORT = path.join(OUT_DIR, 'route-report.json');
const EVIDENCE = path.join(OUT_DIR, 'evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

let server = null;
let browser = null;
let primaryError = null;
let failureClass = null;

await mkdir(OUT_DIR, { recursive: true });

try {
  const executablePath = BROWSER_CANDIDATES.find(existsSync);
  if (!executablePath) {
    failureClass = 'HARNESS';
    throw new Error(
      'HARNESS: no headed Chrome/Edge at standard install paths; '
      + 'cannot capture browser dock evidence. Keep check:m1:helios-route as REAL product proof.',
    );
  }

  let chromium;
  try {
    ({ chromium } = await loadPlaywright());
  } catch (err) {
    failureClass = 'HARNESS';
    throw new Error(
      `HARNESS: Playwright load failed — ${err && err.message ? err.message : err}. `
      + 'Keep check:m1:helios-route as REAL product proof.',
    );
  }

  server = await acquireVisualProbeServer({ root: ROOT });
  assert.equal(server.ownsServer, true, 'browser route must own the in-process game server');
  console.log(`[m1-helios-browser] server ${server.baseUrl}`);
  console.log(`[m1-helios-browser] browser ${executablePath}`);

  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });

  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 180_000 });

  // Shared public route: New Game → flight input → map Helios → autopilot → dock prompt.
  // skipStationHubAcceptance: this W1 slice only needs the physical dock prompt (plus
  // the route's natural dock input). No SF teleport, no mode writes.
  const route = await runBrowserPublicRoute({
    page,
    outputDir: OUT_DIR,
    expectedRootUrl: server.baseUrl,
    log: (line) => process.stdout.write(`${line}\n`),
    flightTimeoutMs: 300_000,
    dockTimeoutMs: 360_000,
    skipStationHubAcceptance: true,
  });

  assert.equal(route.navSnapshot?.waypoint?.label, 'Helios Station',
    'public map selection must name Helios Station');
  assert.equal(route.navSnapshot?.autopilot?.active, true,
    'public Set Waypoint must engage the flight computer');
  assert.match(String(route.approachSnapshot?.autopilot?.label || ''), /Helios Station/i,
    'physical approach must retain Helios destination identity');
  assert.ok(
    (route.steps || []).some((step) => step.name === 'physical-dock-prompt'),
    'route must mark physical-dock-prompt',
  );
  assert.deepEqual(pageErrors, [], `public Helios route emitted page errors: ${pageErrors.join('\n')}`);

  const shotNames = [
    '01-main-menu.png',
    '02-new-game.png',
    '03-flight-after-input.png',
    '04-galaxy-map.png',
    '05-dock-prompt.png',
    '06-station-hub.png',
  ];
  const media = [];
  for (const name of shotNames) {
    const full = path.join(OUT_DIR, name);
    assert.equal(existsSync(full), true, `missing screenshot ${name}`);
    media.push(await mediaReceipt(full));
  }

  const dockStep = (route.steps || []).find((step) => step.name === 'physical-dock-prompt') || null;
  const report = {
    schema: 'spaceface.m1HeliosRouteBrowser.v1',
    generatedAt: new Date().toISOString(),
    taskId: 'm1-helios-route-browser',
    route: 'canonical root → New Game/Launch → ordinary flight → N/Search Helios/Set Waypoint → physical dock prompt (E)',
    url: server.baseUrl,
    canonicalRoot: true,
    viewport: { ...VIEWPORT, deviceScaleFactor: 1 },
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: false,
    complementaryTo: 'check:m1:helios-route',
    failureClass: null,
    waypoint: route.navSnapshot || null,
    approach: route.approachSnapshot || null,
    dockPrompt: dockStep,
    steps: route.steps || [],
    hardwareGpu: route.gpu?.identity || null,
    performanceTelemetry: route.performanceTelemetry || null,
    pageErrors,
    browserVersion: await browser.version(),
    media,
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  const evidence = {
    schema: 'spaceface.alphaEvidence.v1',
    taskId: 'm1-helios-route-browser',
    route: report.route,
    viewport: VIEWPORT,
    runtime: { kind: 'browser', gpu: report.hardwareGpu },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: false,
    complementaryTo: 'check:m1:helios-route',
    failureClass: null,
    checks: [
      { name: 'New Game → Launch → authored flight (no teleport)', status: 'pass' },
      { name: 'public map search arms Helios Station waypoint + autopilot', status: 'pass' },
      { name: 'physical dock prompt visible with public E binding', status: 'pass' },
      { name: 'no page errors on public route', status: 'pass' },
    ],
    artifacts: [
      ...media.map((item) => ({ kind: 'screenshot', path: item.path, sha256: item.sha256 })),
      { kind: 'report', path: relativePath(REPORT) },
    ],
    notes: [
      'Uninjected public route via alphaLiveBaselineRoute.runBrowserPublicRoute.',
      'No SF state writes, teleports, entity injection, or debug query flags.',
      'REAL product terminal approach remains check:m1:helios-route (headless flightV3 + Rapier hold).',
      'This browser run is complementary wall-clock player-route evidence for W1.',
    ],
  };
  await writeFile(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);

  process.stdout.write(`check:m1:helios-route-browser PASS\n${JSON.stringify({
    evidence: relativePath(EVIDENCE),
    report: relativePath(REPORT),
    objective: route.navSnapshot?.waypoint?.label,
    dockPrompt: dockStep?.text || null,
    approach: route.approachSnapshot || null,
    screenshots: media.map((item) => item.path),
  }, null, 2)}\n`);
} catch (error) {
  primaryError = error;
  if (!failureClass) {
    const msg = String(error && error.message || error);
    if (/HARNESS:|Playwright|browser|Chrome|Edge|websocket|Target closed|launch/i.test(msg)) {
      failureClass = 'HARNESS';
    } else {
      failureClass = 'REAL';
    }
  }
  const failureReport = {
    schema: 'spaceface.m1HeliosRouteBrowser.v1',
    generatedAt: new Date().toISOString(),
    taskId: 'm1-helios-route-browser',
    pass: false,
    failureClass,
    error: {
      message: String(error && error.message || error),
      routePhase: error?.routePhase || null,
      routeProgress: error?.routeProgress || null,
      stack: error?.stack || null,
    },
    complementaryTo: 'check:m1:helios-route',
    notes: [
      failureClass === 'HARNESS'
        ? 'Browser harness failed. Do not fake green. REAL product proof remains npm run check:m1:helios-route.'
        : 'Browser public route failed after harness boot. Classify carefully against headless product gate.',
    ],
  };
  await writeFile(REPORT, `${JSON.stringify(failureReport, null, 2)}\n`).catch(() => {});
  console.error(`[m1-helios-browser] FAIL (${failureClass}): ${failureReport.error.message}`);
  if (error?.routeProgress) {
    console.error(`[m1-helios-browser] progress: ${JSON.stringify(error.routeProgress.map((s) => s.name))}`);
  }
  process.exitCode = 1;
} finally {
  await closeOwnedResources({ browser, server }).catch(() => {});
}

if (primaryError) {
  process.exit(process.exitCode || 1);
}

async function mediaReceipt(absPath) {
  const buf = await readFile(absPath);
  return {
    path: relativePath(absPath),
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function relativePath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}
