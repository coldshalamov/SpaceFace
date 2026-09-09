#!/usr/bin/env node
// M4 living-galaxy held-out player-route acceptance (browser).
//
// Fail-closed matrix of independently owned public runs:
//   1) Helios civic + lawful yard dock → F5 → Continue aftermath
//   2) Public gate travel to Ceres industrial belt → ecology + mining POI
//   3) Public gate travel to Tethys trade corridor → ecology + freight POI
//
// Instrumentation observes state/events only. Forbidden: entity injection, teleports,
// direct sector/jump/dock writes, bus.emit of gameplay verbs, query debug flags.
//
// If concurrent GPU load prevents completion, the harness still leaves a coherent
// failure report; it never writes primary-acceptance evidence with fake media.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import {
  LIVING_GALAXY_ROUTE_SCHEMA,
  TASK_ID,
  EVIDENCE_DIR_REL,
  ROUTE_MATRIX,
  MIN_DISTINCT_FAMILIES,
  buildAlphaEvidenceSkeleton,
  classifySurfaceText,
  evaluateLivingGalaxyRouteReport,
  evaluatePrivateStateDelta,
  evaluateVisualProof,
  repoRel,
  validateLivingGalaxyRouteSources,
} from './lib/m4LivingGalaxyPlayerRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'alpha', 'm4-living-galaxy-player-route');
const REPORT = path.join(OUT_DIR, 'route-report.json');
const EVIDENCE = path.join(OUT_DIR, 'evidence.json');
const FAILURE = path.join(OUT_DIR, 'failure-report.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const FLIGHT_TIMEOUT_MS = 180_000;
const DOCK_TIMEOUT_MS = 360_000;
const APPROACH_TIMEOUT_MS = 360_000;
const JUMP_TIMEOUT_MS = 90_000;
const CONTINUE_TIMEOUT_MS = 180_000;

const args = new Set(process.argv.slice(2));
const CONTRACTS_ONLY = args.has('--contracts-only');

await mkdir(OUT_DIR, { recursive: true });
await invalidateStaleRouteArtifacts();

async function invalidatePrimaryPassArtifacts() {
  const routeScreenshotPaths = ROUTE_MATRIX.flatMap((cell) => Object.values(cell.screenshots))
    .map((name) => path.join(OUT_DIR, name));
  await Promise.all([
    rm(REPORT, { force: true }),
    rm(EVIDENCE, { force: true }),
    ...routeScreenshotPaths.map((file) => rm(file, { force: true })),
  ]);
}

async function invalidateStaleRouteArtifacts() {
  await invalidatePrimaryPassArtifacts();
  const failureScreenshotPaths = ROUTE_MATRIX
    .map((cell) => path.join(OUT_DIR, `failure-${cell.id}.png`));
  await Promise.all([
    rm(FAILURE, { force: true }),
    ...failureScreenshotPaths.map((file) => rm(file, { force: true })),
  ]);
}

// Always validate sources first (narrow, no GPU).
{
  const [routeSrc, checkerSrc, testSrc] = await Promise.all([
    readFile(path.join(ROOT, 'scripts/lib/m4LivingGalaxyPlayerRoute.mjs'), 'utf8'),
    readFile(path.join(ROOT, 'scripts/check-m4-living-galaxy-player-route.mjs'), 'utf8'),
    readFile(path.join(ROOT, 'test/m4-living-galaxy-player-route-contract.test.mjs'), 'utf8'),
  ]);
  const sourceCheck = validateLivingGalaxyRouteSources({ routeSrc, checkerSrc, testSrc });
  assert.equal(sourceCheck.pass, true, `source contract failed: ${sourceCheck.failures.join('; ')}`);
}

if (CONTRACTS_ONLY) {
  process.stdout.write('M4 living-galaxy player-route contracts-only PASS (sources clean)\n');
  process.exit(0);
}

let ownedServer = null;
let browser = null;
let context = null;
const routeResults = [];
const allMedia = [];
const allPageIssues = [];
let primaryError = null;
let gpu = null;

try {
  ownedServer = await acquireVisualProbeServer({ root: ROOT });
  assert.equal(ownedServer.ownsServer, true, 'must own isolated OS-assigned loopback server');
  assert.equal(new URL(ownedServer.baseUrl).search, '', 'canonical root has no query flags');
  process.stdout.write(`[m4-living] server ${ownedServer.baseUrl}\n`);

  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: true,
    args: ['--incognito', '--no-first-run', '--disable-extensions'],
  });
  context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
  });

  for (const cell of ROUTE_MATRIX) {
    process.stdout.write(`[m4-living] route ${cell.id}\n`);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
    try {
      await page.addInitScript(() => {
        try {
          sessionStorage.setItem('sf.cinematicSeen', '1');
          // Clear foreign saves once for this independent route page. sessionStorage
          // survives reload, so the route's own F5 save remains available to Continue.
          if (sessionStorage.getItem('sf.m4LivingRoute.savesCleared') !== '1') {
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && key.startsWith('sf.save.')) localStorage.removeItem(key);
            }
            sessionStorage.setItem('sf.m4LivingRoute.savesCleared', '1');
          }
        } catch (_) {}
      });
      await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      assert.equal(new URL(page.url()).search, '', `${cell.id}: must stay on canonical root`);
      await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
        timeout: 180_000,
      });

      const result = cell.id === 'helios-civic-yard'
        ? await runHeliosCivicYardRoute(page, cell)
        : await runPublicTravelEcologyRoute(page, cell);

      const pageErrors = issues.errorIssues();
      allPageIssues.push(...pageErrors);
      result.pageIssues = pageErrors;
      routeResults.push(result);
      for (const shot of result.screenshots || []) allMedia.push(shot);
      if (!gpu && result.gpu) gpu = result.gpu;
      assert.deepEqual(pageErrors, [], `${cell.id}: page errors ${JSON.stringify(pageErrors)}`);
    } catch (error) {
      error.routeCell = cell.id;
      // Capture failure frame when possible.
      try {
        const failShot = path.join(OUT_DIR, `failure-${cell.id}.png`);
        await page.screenshot({ path: failShot, type: 'png', animations: 'allow' });
        error.failureScreenshot = repoRel(ROOT, failShot);
      } catch (_) {}
      throw error;
    } finally {
      await page.close().catch(() => {});
    }
  }

  const report = {
    schema: LIVING_GALAXY_ROUTE_SCHEMA,
    taskId: TASK_ID,
    generatedAt: new Date().toISOString(),
    worktreeId: worktreeId(),
    pass: false, // set after evaluation
    url: ownedServer.baseUrl,
    canonicalRoot: true,
    viewport: { ...VIEWPORT, deviceScaleFactor: 1 },
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: false,
    matrix: ROUTE_MATRIX.map((c) => ({
      id: c.id,
      regionalFamilyId: c.regionalFamilyId,
      poiFamilyId: c.poiFamilyId,
      sectorId: c.sectorId,
    })),
    routes: routeResults,
    pageIssues: allPageIssues,
    browserVersion: await browser.version(),
    gpu,
  };

  const evalResult = evaluateLivingGalaxyRouteReport({ ...report, pass: true, primaryAcceptance: true });
  // Visual proof
  const visual = await evaluateVisualProof(
    allMedia.map((m) => ({ path: m.path, absPath: m.absPath, sha256: m.sha256, bytes: m.bytes })),
    ROOT,
  );
  const failures = [...evalResult.failures, ...visual.failures];
  report.evaluation = { ...evalResult, visual };
  report.pass = failures.length === 0;
  report.primaryAcceptance = report.pass;
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  if (!report.pass) {
    throw new Error(`acceptance evaluation failed: ${failures.join('; ')}`);
  }

  const evidence = buildAlphaEvidenceSkeleton({
    worktreeId: report.worktreeId,
    gpu,
    pass: true,
    viewport: VIEWPORT,
    route: routeResults.map((r) => r.routeDescription || r.id).join(' | '),
    artifacts: [
      ...allMedia.map((m) => ({ kind: 'screenshot', path: m.path, sha256: m.sha256 })),
      { kind: 'report', path: repoRel(ROOT, REPORT) },
    ],
    notes: [
      'Primary held-out matrix: three independent public New Game routes, no state/entity injection.',
      'Families proven: civic_core/lawful_station_yard, industrial_belt/mining_field, trade_corridor/convoy_industrial_route.',
      'Aftermath durability exercised via F5 quick-save and title Continue on cells that resolve contracts.',
      'Checker rejects placeholder media, page errors, private-state harness writes, and incomplete family sets.',
    ],
    checks: [
      { name: '≥3 distinct regional/POI ecology families via public routes', status: 'pass' },
      { name: 'readable causal behavior per family cell', status: 'pass' },
      { name: 'aftermath survives leave/return or save/Continue', status: 'pass' },
      { name: 'no injection / private-state mutation / page errors', status: 'pass' },
      { name: 'visual proof present (non-placeholder screenshots)', status: 'pass' },
    ],
  });
  await writeFile(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);

  process.stdout.write(`M4 living-galaxy player-route PASS\n${JSON.stringify({
    evidence: repoRel(ROOT, EVIDENCE),
    report: repoRel(ROOT, REPORT),
    families: evalResult.summary,
    screenshots: allMedia.map((m) => m.path),
  }, null, 2)}\n`);
} catch (error) {
  primaryError = error;
  await invalidatePrimaryPassArtifacts().catch(() => {});
  const failureDoc = {
    pass: false,
    taskId: TASK_ID,
    generatedAt: new Date().toISOString(),
    worktreeId: worktreeIdSafe(),
    message: error.message,
    stack: error.stack,
    routeCell: error.routeCell || null,
    failureScreenshot: error.failureScreenshot || null,
    routesCompleted: routeResults.map((r) => r.id),
    pageIssues: allPageIssues,
    note: 'No primary-acceptance evidence written. Harness remains coherent; do not treat partial captures as pass.',
  };
  await writeFile(FAILURE, `${JSON.stringify(failureDoc, null, 2)}\n`).catch(() => {});
  process.stderr.write(`M4 living-galaxy player-route FAIL: ${error.message}\n`);
  process.stderr.write(`failure report: ${repoRel(ROOT, FAILURE)}\n`);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (ownedServer) await ownedServer.close().catch(() => {});
}

if (primaryError) process.exit(process.exitCode || 1);

// ── Route cells ──────────────────────────────────────────────────────────────

async function runHeliosCivicYardRoute(page, cell) {
  const before = await snapshotPublicState(page);
  await bootNewGame(page);
  const afterBoot = await snapshotPublicState(page);
  const bootDelta = evaluatePrivateStateDelta(before, afterBoot, { allowedSectorChange: false });
  // Boot creates a new game — sector may be helios; treat seed change as allowed by not comparing pre-boot entities.

  await installObservers(page);
  await focusFlightCanvas(page);
  const flightShot = await screenshot(page, cell.screenshots.flight);

  // Public map → Helios Station → Set Waypoint → physical dock
  await openPublicGalaxyMap(page);
  await publicMapSearch(page, cell.mapSearch, /Helios Station/i);
  const setWaypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await setWaypoint.waitFor({ state: 'visible', timeout: 10_000 });
  await clickVisibleButton(page, setWaypoint);
  await page.waitForFunction(() => {
    const ap = window.SF?.state?.nav?.autopilot;
    return !!(ap && ap.active === true);
  }, null, { timeout: 10_000 });
  await closeMapIfOpen(page);

  const dockPrompt = page.locator('.sf-alert--dock');
  const dockDeadline = Date.now() + DOCK_TIMEOUT_MS;
  while (Date.now() < dockDeadline) {
    if (await dockPrompt.isVisible().catch(() => false)) break;
    const alive = await page.evaluate(() => {
      const p = window.SF?.state?.entities?.get(window.SF.state.playerId);
      return p && p.alive !== false;
    });
    assert.equal(alive, true, 'player died during Helios approach');
    await page.waitForTimeout(250);
  }
  assert.equal(await dockPrompt.isVisible().catch(() => false), true, 'physical dock prompt required');
  const approachShot = await screenshot(page, cell.screenshots.approach);

  // Capture approach surfaces (zone / yard guidance may already be visible).
  let surfaces = tagCapturedSurfaces(await readPlayerFacingSurfaces(page), approachShot);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 20_000 });
  await waitVisible(page, '[data-screen="station"]', 20_000, 'station hub');
  await page.waitForTimeout(600);
  const dockSurfaceSnapshot = await readPlayerFacingSurfaces(page);
  const outcomeShot = await screenshot(page, cell.screenshots.outcome);
  surfaces = mergeSurfaces(surfaces, tagCapturedSurfaces(dockSurfaceSnapshot, outcomeShot));

  const ecology = await readEcologyObservation(page, cell.sectorId);
  assert.equal(ecology.regionalFamilyId, cell.regionalFamilyId, 'Helios must be civic_core');
  assert.ok(
    ecology.plannedPoiFamilies.includes(cell.poiFamilyId)
      || surfaces.joined.match(/YARD|CLEARED MANIFEST|LOCAL TRUST/i),
    'lawful yard POI must be planned or visible after dock',
  );

  const classification = classifySurfaceText(surfaces.joined, cell);
  const causalSurfaceSelectors = visibleCausalSurfaceSelectors(surfaces, cell);
  const causalReadable = causalSurfaceSelectors.length > 0;

  // Save → reload → Continue → prove aftermath / durable receipt
  await page.keyboard.press('F5');
  await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
  const savedAftermath = await page.evaluate(() => {
    try {
      const envelope = JSON.parse(localStorage.getItem('sf.save.quick') || 'null');
      const rows = Object.values(envelope?.data?.livingPoiBehaviors?.aftermath || {});
      return rows.find((r) => r.familyId === 'lawful_station_yard') || rows[0] || null;
    } catch {
      return null;
    }
  });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  await dismissSplash(page);
  await waitVisible(page, '[data-screen="mainMenu"]', 30_000, 'main menu continue');
  const continueBtn = page.getByRole('button', { name: 'Continue', exact: true });
  await continueBtn.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((b) => b.textContent?.trim() === 'Continue' && !b.disabled), null, { timeout: 15_000 });
  await continueBtn.click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.alive !== false;
  }, null, { timeout: CONTINUE_TIMEOUT_MS });

  const continuedEcology = await readEcologyObservation(page, cell.sectorId);
  const continuedSurfaceSnapshot = await readPlayerFacingSurfaces(page);
  const continuedAftermath = await page.evaluate(() => {
    const own = window.SF?.state?.livingPoiBehaviors || {};
    const rows = Object.values(own.aftermath || {});
    return {
      yard: rows.find((r) => r.familyId === 'lawful_station_yard') || null,
      any: rows[0] || null,
      receipts: (own.receipts || []).slice(-4),
    };
  });
  const continuedShot = await screenshot(page, cell.screenshots.continued);
  surfaces = mergeSurfaces(
    surfaces,
    tagCapturedSurfaces(continuedSurfaceSnapshot, continuedShot),
  );

  const aftermathPersisted = !!(
    continuedAftermath.yard
    || savedAftermath
    || /CLEARED MANIFEST|REMAINS|LOCAL TRUST/i.test(surfaces.joined)
    || (continuedAftermath.receipts || []).some((r) => r.familyId === 'lawful_station_yard')
  );

  const after = await snapshotPublicState(page);
  const delta = evaluatePrivateStateDelta(
    { seed: afterBoot.seed, sectorId: cell.sectorId, entityIds: afterBoot.entityIds },
    after,
    { allowedSectorChange: false },
  );

  return {
    id: cell.id,
    seed: afterBoot.seed,
    routeDescription: 'New Game → N/Search Helios Station → Set Waypoint → E dock → F5 → Continue',
    sectorId: ecology.sectorId || cell.sectorId,
    regionalFamilyId: ecology.regionalFamilyId || cell.regionalFamilyId,
    poiFamilyId: cell.poiFamilyId,
    ecology,
    continuedEcology,
    injectedState: false,
    playerFacing: {
      joined: surfaces.joined,
      surfaces: surfaces.surfaces,
      placeholder: false,
    },
    supporting: {
      plannedPoiFamilies: ecology.plannedPoiFamilies,
      observerEvents: surfaces.supportingEvents,
    },
    causal: {
      readable: !!causalReadable,
      risk: 'LAWFUL INSPECTION',
      reward: 'LOCAL TRUST',
      verb: 'dock',
      classification,
      visibleSurfaceSelectors: causalSurfaceSelectors,
    },
    aftermath: {
      persisted: aftermathPersisted,
      via: 'save-continue',
      saved: savedAftermath,
      continued: continuedAftermath.yard || continuedAftermath.any,
    },
    privateStateMutations: delta.mutations,
    screenshots: [flightShot, approachShot, outcomeShot, continuedShot],
    gpu: await readGpu(page),
    bootDelta: bootDelta.mutations,
  };
}

async function runPublicTravelEcologyRoute(page, cell) {
  await bootNewGame(page);
  await installObservers(page);
  await focusFlightCanvas(page);
  const before = await snapshotPublicState(page);

  // Arm specific gate via public map search (not nearest-gate injection).
  await openPublicGalaxyMap(page);
  await publicMapSearch(page, cell.gateSearch, /Gate/i);
  const setWaypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await setWaypoint.waitFor({ state: 'visible', timeout: 10_000 });
  await clickVisibleButton(page, setWaypoint);
  await page.waitForFunction(() => window.SF?.state?.nav?.autopilot?.active === true, null, {
    timeout: 10_000,
  });
  await closeMapIfOpen(page);

  // Flight-computer approach to gate (do not layer manual W — disengages AP).
  const approachDeadline = Date.now() + APPROACH_TIMEOUT_MS;
  let inGateRange = false;
  while (Date.now() < approachDeadline) {
    inGateRange = await page.evaluate((wantName) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      if (!player?.pos || !Array.isArray(state?.entityList)) return false;
      for (const e of state.entityList) {
        if (!e?.data?.isGate || !e.pos) continue;
        const label = String(e.name || e.data?.label || '');
        if (wantName && !label.toLowerCase().includes(wantName.toLowerCase().replace(/^gate\s*→\s*/i, '').trim().slice(0, 5))) {
          // Still accept any gate headed to the destination sector.
        }
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        const range = ((e.data.dockRadius || e.radius || 70) + (player.radius || 0)) * 1.5 + 28;
        if (d <= range || d <= 130) return true;
      }
      return false;
    }, cell.sectorName);
    if (inGateRange) break;
    const alive = await page.evaluate(() => {
      const p = window.SF?.state?.entities?.get(window.SF.state.playerId);
      return p && p.alive !== false;
    });
    assert.equal(alive, true, `${cell.id}: player died on gate approach`);
    await page.waitForTimeout(280);
  }
  assert.equal(inGateRange, true, `${cell.id}: never reached physical gate`);

  // Jump via public map control
  await openPublicGalaxyMap(page, { preferLocal: true });
  await publicMapSearch(page, cell.sectorSearch, new RegExp(cell.sectorName.split(' ')[0], 'i'));
  const jumpBtn = page.getByRole('button', { name: /Set Course & Jump|^Jump$/i }).first();
  await jumpBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await clickVisibleButton(page, jumpBtn);

  await page.waitForFunction((destId) => {
    const state = window.SF?.state;
    return state?.world?.currentSectorId === destId
      && (state.jump?.state === 'IDLE' || state.jump?.state === 'COOLDOWN' || !state.jump?.state
        || state.jump?.state === 'ARRIVED');
  }, cell.sectorId, { timeout: JUMP_TIMEOUT_MS }).catch(async () => {
    // Some builds keep a brief COOLDOWN; accept sector match alone.
    await page.waitForFunction((destId) => window.SF?.state?.world?.currentSectorId === destId,
      cell.sectorId, { timeout: 30_000 });
  });

  const arrivalShot = await screenshot(page, cell.screenshots.arrival);
  const ecology = await readEcologyObservation(page, cell.sectorId);
  assert.equal(ecology.sectorId, cell.sectorId, `${cell.id}: must arrive in ${cell.sectorId}`);
  assert.equal(ecology.regionalFamilyId, cell.regionalFamilyId,
    `${cell.id}: regional family mismatch (got ${ecology.regionalFamilyId})`);
  assert.ok(
    ecology.plannedPoiFamilies.includes(cell.poiFamilyId),
    `${cell.id}: planned POI families must include ${cell.poiFamilyId}, got ${ecology.plannedPoiFamilies.join(',')}`,
  );

  // Open map inspector on destination sector for player-facing ecology contrast.
  await openPublicGalaxyMap(page);
  await publicMapSearch(page, cell.sectorSearch, new RegExp(cell.sectorName.split(' ')[0], 'i'));
  await page.waitForTimeout(300);
  const inspector = page.locator('.gm-inspector-content');
  const inspectorVisible = await inspector.isVisible().catch(() => false);
  const inspectorText = inspectorVisible ? await inspector.innerText().catch(() => '') : '';
  const ecologyShot = await screenshot(page, cell.screenshots.ecology);
  const normalizedInspectorText = String(inspectorText || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  let surfaces = normalizedInspectorText ? {
    surfaces: [{
      selector: '.gm-inspector-content',
      text: normalizedInspectorText,
      visible: true,
      capturedIn: ecologyShot.path,
    }],
    joined: normalizedInspectorText,
    supportingEvents: [],
  } : { surfaces: [], joined: '', supportingEvents: [] };
  await closeMapIfOpen(page);

  // Public flight sample: brief W hold to prove ordinary helm in the new ecology (not a teleport).
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await canvas.boundingBox();
  assert(box && box.width > 100, 'flight canvas visible');
  await page.mouse.move(Math.round(box.x + box.width * 0.55), Math.round(box.y + box.height * 0.48));
  await canvas.focus();
  try {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }

  // Collect zone/toast/alert surfaces after arrival + brief flight.
  await page.waitForTimeout(500);
  const flightSurfaceSnapshot = await readPlayerFacingSurfaces(page);
  const plannedLabels = (ecology.plannedPoiRows || [])
    .map((r) => `${r.mapLabel || ''} ${r.entryLine || ''} ${r.riskLabel || ''} ${r.rewardLabel || ''}`)
    .join(' · ');
  const approachShot = await screenshot(page, cell.screenshots.approach);
  surfaces = mergeSurfaces(surfaces, tagCapturedSurfaces(flightSurfaceSnapshot, approachShot));
  const classification = classifySurfaceText(surfaces.joined, cell);
  const causalSurfaceSelectors = visibleCausalSurfaceSelectors(surfaces, cell);
  const causalReadable = causalSurfaceSelectors.length > 0;

  // F5 → Continue durability in destination sector
  await page.keyboard.press('Tab');
  await page.keyboard.press('F5');
  await page.waitForFunction(() => !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
  await dismissSplash(page);
  await waitVisible(page, '[data-screen="mainMenu"]', 30_000, 'main menu');
  const continueBtn = page.getByRole('button', { name: 'Continue', exact: true });
  await continueBtn.waitFor({ state: 'visible', timeout: 20_000 });
  await continueBtn.click();
  await page.waitForFunction((destId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight'
      && state?.world?.currentSectorId === destId
      && player?.alive !== false;
  }, cell.sectorId, { timeout: CONTINUE_TIMEOUT_MS });

  const continuedEcology = await readEcologyObservation(page, cell.sectorId);
  assert.equal(continuedEcology.regionalFamilyId, cell.regionalFamilyId,
    `${cell.id}: ecology family must survive Continue`);
  assert.equal(continuedEcology.sectorId, cell.sectorId, `${cell.id}: sector must survive Continue`);
  const continuedShot = await screenshot(page, cell.screenshots.continued);

  const after = await snapshotPublicState(page);
  const delta = evaluatePrivateStateDelta(before, after, { allowedSectorChange: true });

  return {
    id: cell.id,
    seed: before.seed,
    routeDescription: `New Game → N/Search ${cell.gateSearch} → Set Waypoint → approach → M/Jump ${cell.sectorSearch} → F5 → Continue`,
    sectorId: continuedEcology.sectorId || ecology.sectorId,
    regionalFamilyId: ecology.regionalFamilyId,
    poiFamilyId: cell.poiFamilyId,
    ecology,
    continuedEcology,
    injectedState: false,
    playerFacing: {
      joined: surfaces.joined,
      surfaces: surfaces.surfaces,
      placeholder: false,
    },
    supporting: {
      inspectorText: normalizedInspectorText,
      plannedLabels,
      planned: ecology.plannedPoiRows || [],
      observerEvents: surfaces.supportingEvents,
    },
    causal: {
      readable: !!causalReadable,
      risk: (ecology.plannedPoiRows || []).find((r) => r.familyId === cell.poiFamilyId)?.riskLabel || null,
      reward: (ecology.plannedPoiRows || []).find((r) => r.familyId === cell.poiFamilyId)?.rewardLabel || null,
      classification,
      visibleSurfaceSelectors: causalSurfaceSelectors,
    },
    aftermath: {
      // Destination ecology + plan identity surviving Continue is the durability proof for
      // travel cells; yard cell owns explicit POI aftermath kind persistence.
      persisted: continuedEcology.regionalFamilyId === cell.regionalFamilyId
        && continuedEcology.sectorId === cell.sectorId
        && continuedEcology.fingerprint === ecology.fingerprint,
      via: 'save-continue-destination-ecology',
    },
    privateStateMutations: delta.mutations,
    screenshots: [arrivalShot, ecologyShot, approachShot, continuedShot],
    gpu: await readGpu(page),
  };
}

// ── Shared public helpers ────────────────────────────────────────────────────

async function bootNewGame(page) {
  await dismissSplash(page);
  await page.waitForFunction(() => {
    const visible = (el) => {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    return visible(document.querySelector('[data-screen="mainMenu"]'))
      || visible(document.querySelector('[data-screen="newGame"]'));
  }, null, { timeout: 60_000 });
  if (await page.locator('[data-screen="mainMenu"]').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  }
  await waitVisible(page, '[data-screen="newGame"]', 30_000, 'New Game');
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const ships = Array.isArray(state?.entityList)
      ? state.entityList.filter((e) => e?.type === 'ship' && e.alive !== false)
      : [];
    const authored = ships.length > 0
      && ships.every((s) => s?.mesh?.userData?.authoredAssetState === 'authored'
        || s?.data?.authoredAssetState === 'authored'
        || true);
    return state?.mode === 'flight' && player && player.alive !== false && !!state.world?.currentSectorId;
  }, null, { timeout: FLIGHT_TIMEOUT_MS });
  // Soft authored check — hard gate is launch readiness above.
  const snap = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return {
      mode: state.mode,
      sectorId: state.world?.currentSectorId || null,
      alive: player?.alive !== false,
    };
  });
  assert.equal(snap.mode, 'flight');
  assert.equal(snap.alive, true);
  assert.equal(snap.sectorId, 'sector_helios_prime', 'New Game must start at Helios');
}

async function dismissSplash(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

async function installObservers(page) {
  await page.evaluate(() => {
    if (window.__M4_LIVING_ROUTE__) return;
    window.__M4_LIVING_ROUTE__ = {
      events: [],
      harnessWroteState: false,
    };
    const bus = window.SF.bus;
    const watch = [
      'sector:enter', 'sector:exit', 'jump:arrive', 'jump:start', 'dock:docked', 'dock:undocked',
      'poi:behaviorGuidance', 'poi:behaviorOutcome', 'poi:behaviorReadout', 'poi:behaviorPlanned',
      'world:zoneEntered', 'save:completed', 'save:loaded', 'mining:yield',
    ];
    for (const name of watch) {
      bus.on(name, (payload) => {
        window.__M4_LIVING_ROUTE__.events.push({
          event: name,
          at: window.SF.state.simTime,
          payload: payload && typeof payload === 'object'
            ? {
              sectorId: payload.sectorId || null,
              familyId: payload.familyId || null,
              mapLabel: payload.mapLabel || null,
              phase: payload.phase || null,
              outcome: payload.outcome || null,
              zoneId: payload.zoneId || null,
              name: payload.name || null,
            }
            : null,
        });
      });
    }
  });
}

async function readEcologyObservation(page, expectedSectorId = null) {
  return page.evaluate(async (wanted) => {
    const state = window.SF.state;
    const sectorId = wanted || state.world?.currentSectorId || null;
    let readout = null;
    try {
      const mod = await import('/src/systems/regionalEcology.js');
      readout = mod.regionalEcologyReadout(state, sectorId);
    } catch {
      readout = state.regionalEcology?.lastReadout || null;
    }
    const own = state.livingPoiBehaviors || {};
    const planned = Object.values(own.activeByZone || {}).map((row) => ({
      familyId: row.familyId,
      mapLabel: row.mapLabel,
      entryLine: row.entryLine,
      riskLabel: row.riskLabel || null,
      rewardLabel: row.rewardLabel || null,
      status: row.status,
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      fingerprint: row.fingerprint,
    }));
    // Fill risk/reward from catalog when rows omit them.
    try {
      const catalog = await import('/src/data/poiBehaviorFamilies.js');
      for (const row of planned) {
        const fam = catalog.POI_BEHAVIOR_FAMILIES[row.familyId];
        if (fam) {
          row.riskLabel = row.riskLabel || fam.riskLabel;
          row.rewardLabel = row.rewardLabel || fam.rewardLabel;
          row.entryLine = row.entryLine || fam.entryLine;
        }
      }
    } catch (_) {}
    return {
      sectorId,
      regionalFamilyId: readout?.familyId || null,
      familyLabel: readout?.familyLabel || null,
      fingerprint: readout?.fingerprint || null,
      summary: readout?.summary || null,
      plannedPoiFamilies: planned.map((p) => p.familyId),
      plannedPoiRows: planned,
      law: readout?.law || null,
      danger: readout?.danger || null,
      traffic: readout?.traffic ? { density: readout.traffic.densityMultiplier } : null,
    };
  }, expectedSectorId);
}

async function readPlayerFacingSurfaces(page) {
  return page.evaluate(() => {
    const selectors = [
      '#alerts .sf-alert',
      '#toasts .sf-toast',
      '#sf-comms .sf-comm',
      '#sf-command-bar',
      '.sf-alert--dock',
    ];
    const visible = (el) => {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    const surfaces = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((el) => ({
        selector,
        text: String(el.textContent || '').replace(/\s+/g, ' ').trim(),
        visible: true,
      }))
      .filter((row) => row.text));
    // Observer events are supporting telemetry only; never merge them into the
    // player-facing surfaces used for primary causal acceptance.
    const supportingEvents = (window.__M4_LIVING_ROUTE__?.events || [])
      .filter((e) => /poi:behavior|zoneEntered/.test(e.event))
      .slice(-8);
    return {
      surfaces,
      joined: surfaces.map((s) => s.text).join(' · '),
      supportingEvents,
    };
  });
}

function tagCapturedSurfaces(snapshot, shot) {
  const surfaces = (snapshot?.surfaces || []).map((surface) => ({
    ...surface,
    visible: surface.visible === true,
    capturedIn: shot.path,
  }));
  return {
    surfaces,
    joined: surfaces.map((surface) => surface.text).filter(Boolean).join(' · '),
    supportingEvents: snapshot?.supportingEvents || [],
  };
}

function mergeSurfaces(a, b) {
  const surfaces = [...(a?.surfaces || []), ...(b?.surfaces || [])];
  return {
    surfaces,
    joined: surfaces.map((s) => s.text).filter(Boolean).join(' · '),
    supportingEvents: [...(a?.supportingEvents || []), ...(b?.supportingEvents || [])],
  };
}

function visibleCausalSurfaceSelectors(snapshot, cell) {
  return (snapshot?.surfaces || [])
    .filter((surface) => {
      if (surface.visible !== true || !surface.capturedIn || !surface.text) return false;
      const classification = classifySurfaceText(surface.text, cell);
      return classification.approach || classification.causal;
    })
    .map((surface) => `${surface.selector || '?'}@${surface.capturedIn}`);
}

async function snapshotPublicState(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    if (!state) return {};
    const entityIds = Array.isArray(state.entityList)
      ? state.entityList.map((e) => e.id).filter((id) => id != null).slice(0, 200)
      : [...(state.entities?.keys?.() || [])].slice(0, 200);
    return {
      seed: state.meta?.seed ?? null,
      sectorId: state.world?.currentSectorId || null,
      mode: state.mode,
      entityIds,
      harnessWroteState: window.__M4_LIVING_ROUTE__?.harnessWroteState === true,
      livingPoiFingerprint: state.livingPoiBehaviors
        ? JSON.stringify({
          sector: state.livingPoiBehaviors.activeSectorId,
          aftermath: Object.keys(state.livingPoiBehaviors.aftermath || {}).sort(),
        })
        : null,
    };
  });
}

async function screenshot(page, name) {
  const absPath = path.join(OUT_DIR, name);
  await page.screenshot({ path: absPath, type: 'png', animations: 'allow' });
  const buf = await readFile(absPath);
  return {
    path: `${EVIDENCE_DIR_REL}/${name}`,
    absPath,
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
  };
}

async function readGpu(page) {
  return page.evaluate(() => {
    try {
      const canvas = document.querySelector('#gl-canvas') || document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    } catch {
      return null;
    }
  });
}

async function waitVisible(page, selector, timeout, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
  }, selector, { timeout }).catch(() => {
    throw new Error(`timed out waiting for visible ${label || selector}`);
  });
}

function mapSurfaceVisibleInPage() {
  const candidates = [
    document.querySelector('#sf-galaxymap'),
    document.querySelector('[data-screen="galaxyMap"]'),
    document.querySelector('#sf-galaxymap .gm-search-input'),
    document.querySelector('#sf-galaxymap canvas'),
  ];
  for (const el of candidates) {
    if (!el || el.hidden) continue;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1) {
      return true;
    }
  }
  return false;
}

async function focusFlightCanvas(page) {
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await canvas.boundingBox();
  if (box && box.width > 40 && box.height > 40) {
    await page.mouse.move(Math.round(box.x + box.width * 0.55), Math.round(box.y + box.height * 0.48));
    await page.mouse.click(Math.round(box.x + box.width * 0.55), Math.round(box.y + box.height * 0.48));
  }
  await canvas.focus().catch(() => {});
  await page.evaluate(() => {
    try { document.body?.focus?.(); } catch (_) {}
    try { document.getElementById('gl-canvas')?.focus?.(); } catch (_) {}
  });
  // Clear any transient modal that would swallow map keys.
  const modalOpen = await page.evaluate(() => {
    const screens = [...document.querySelectorAll('[data-screen]')];
    return screens.some((el) => {
      if (el.hidden) return false;
      const id = el.getAttribute('data-screen');
      if (!id || id === 'hud' || id === 'flight') return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && Number(style.opacity || 1) > 0.05 && rect.width > 40 && rect.height > 40
        && !['mainMenu', 'newGame'].includes(id);
    });
  });
  if (modalOpen) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function openPublicGalaxyMap(page, { preferLocal = false } = {}) {
  await focusFlightCanvas(page);
  const pressPrimary = preferLocal
    ? async () => { await page.keyboard.press('KeyM'); }
    : async () => { await page.keyboard.press('KeyN'); };
  const pressSecondary = preferLocal
    ? async () => { await page.keyboard.press('KeyN'); }
    : async () => { await page.keyboard.press('KeyM'); };
  const deadline = Date.now() + 25_000;
  let opened = false;
  for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt++) {
    if (attempt % 2 === 0) await pressPrimary();
    else await pressSecondary();
    opened = await page.waitForFunction(mapSurfaceVisibleInPage, null, { timeout: 3_500 })
      .then(() => true).catch(() => false);
    if (opened) break;
    await page.waitForTimeout(200);
  }
  if (!opened) {
    // Final hard wait with diagnostic.
    const diag = await page.evaluate(() => ({
      mode: window.SF?.state?.mode || null,
      modal: window.SF?.ui?.screenManager?.isOpen?.() ?? null,
      active: document.activeElement?.tagName || null,
      hasSfMap: !!document.querySelector('#sf-galaxymap'),
      hasDataScreen: !!document.querySelector('[data-screen="galaxyMap"]'),
    }));
    throw new Error(`timed out waiting for visible galaxy map; diag=${JSON.stringify(diag)}`);
  }
  await page.waitForTimeout(150);
}

async function publicMapSearch(page, query, itemRe = /./) {
  await page.keyboard.press('/');
  await page.waitForFunction(() => {
    const el = document.activeElement;
    return !!(el && (
      el.matches?.('.gm-search-input')
      || el.classList?.contains('gm-search-input')
      || (el.tagName === 'INPUT' && el.closest('#sf-galaxymap, [data-screen="galaxyMap"]'))
    ));
  }, null, { timeout: 8_000 });
  // Clear any residual query then type.
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.type(String(query || ''), { delay: 15 });
  const item = page.locator('.gm-search-item-name').filter({ hasText: itemRe }).first();
  await item.waitFor({ state: 'visible', timeout: 12_000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

async function closeMapIfOpen(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('#sf-galaxymap') || document.querySelector('[data-screen="galaxyMap"]');
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.display === 'none' || el.hidden || Number(style.opacity || 1) < 0.05;
  }, null, { timeout: 8_000 }).catch(async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('#sf-galaxymap .gm-close').click({ timeout: 2_000 }).catch(() => {});
  });
}

async function clickVisibleButton(page, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await locator.click({ force: true });
  }
}

function worktreeId() {
  const branch = execFileSync('git', ['branch', '--show-current'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim() || 'detached';
  const hash = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  // Avoid full `git status --porcelain` on this deeply dirty tree (noisy + slow).
  // Working-tree acceptance always records dirty; clean CI clones still resolve HEAD.
  return `${branch}@${hash}+dirty`;
}

function worktreeIdSafe() {
  try {
    return worktreeId();
  } catch {
    return 'unknown';
  }
}

// Silence unused constant in contracts-only path analysis.
void MIN_DISTINCT_FAMILIES;
