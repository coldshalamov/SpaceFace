// PQ-018 Wreck Cathedral ordinary player route.
// The actor uses only visible UI and normal keyboard/mouse controls. Page evaluation is read-only
// observation plus bounded evidence sampling; it never writes gameplay state.

import assert from 'node:assert/strict';
import path from 'node:path';

import {
  bootToAuthoredFlight,
  TRAVEL_PUBLIC_HELPERS,
} from './professionalTravelPublicRoute.mjs';
import {
  WORLD_SITE_PUBLIC_ROUTE_DRIVER,
} from './pq017WorldSitePublicRoute.mjs';

export const PQ018_ROUTE_SCHEMA = 'spaceface.pq018WreckCathedralPublicRoute.v1';
export const PQ018_SITE_ID = 'world_site_wreck_cathedral';
export const PQ018_ROOT_WORLD_ID = PQ018_SITE_ID;
export const PQ018_CERES_SECTOR_ID = 'sector_ceres_belt';
export const PQ018_HELIOS_SECTOR_ID = 'sector_helios_prime';
export const PQ018_FIXED_GLOBAL_POS = Object.freeze({ x: -11988, z: 10892 });
export const PQ018_SCREENSHOTS = Object.freeze({
  launch: '01-authored-flight.png',
  ceresApproach: '02-ceres-approach.png',
  cavityEntry: '03-cavity-entry.png',
  cavityExit: '04-cavity-exit.png',
  firstEvidence: '05-first-evidence.png',
  secondEvidence: '06-second-evidence.png',
  continued: '07-continued.png',
  returned: '08-returned.png',
  history: '09-history.png',
});

const CAVITY_ENTRY_OFFSET = Object.freeze({ x: -278.13482666015625, z: -31.204429626464844 });
const CAVITY_EXIT_OFFSET = Object.freeze({ x: 303.7676086425781, z: -45.19260787963867 });
const REPRESENTATIVE_OPERATIONS = Object.freeze([
  Object.freeze({
    componentId: 'cathedral_hull',
    operationId: 'stabilize_cathedral_hull',
    evidencePageId: null,
  }),
  Object.freeze({
    componentId: 'bridge_navigation_record',
    operationId: 'extract_bridge_navigation_record',
    evidencePageId: 'wreck_cathedral.missing_convoy',
  }),
  Object.freeze({
    componentId: 'registry_scan_array',
    operationId: 'extract_registry_scan',
    evidencePageId: 'wreck_cathedral.capital_hull_located',
  }),
]);

const {
  searchAndSelect,
  clickPersistentButton,
  waitBootOverlayGone,
  shot,
} = TRAVEL_PUBLIC_HELPERS;

const {
  travelThroughOrdinaryGate,
  cycleToComponent,
  settleAtWorldRecord,
  flyToPoint,
  releaseFlightKeys,
  startPerformanceWindow,
  finishPerformanceWindow,
} = WORLD_SITE_PUBLIC_ROUTE_DRIVER;

export async function runPq018WreckCathedralPublicRoute({
  page,
  outputDir,
  expectedRootUrl,
  fixedSeed,
  runtimeKind,
  baselineOnly = false,
  log = () => {},
  timeBudgetScale = 1,
} = {}) {
  assert(page, 'PQ-018 route requires a Playwright page');
  assert(outputDir, 'PQ-018 route requires an output directory');
  assert(expectedRootUrl, 'PQ-018 route requires the canonical root URL');
  assert(Number(fixedSeed) > 0, 'PQ-018 route requires a deterministic positive seed');
  assert(['browser', 'electron'].includes(runtimeKind), 'PQ-018 route requires a known runtime cell');

  const timeoutScale = Math.max(1, Math.min(4, Number(timeBudgetScale) || 1));
  const routeTimeout = (milliseconds) => Math.trunc(milliseconds * timeoutScale);
  const screenshots = [];
  const steps = [];
  let phase = 'boot';
  const mark = (name, detail = {}) => {
    const entry = { name, ...detail };
    steps.push(entry);
    log(`[pq018-route] ${name}`);
    return entry;
  };
  const capture = async (key) => {
    const name = PQ018_SCREENSHOTS[key];
    assert(name, `unknown PQ-018 screenshot key: ${key}`);
    screenshots.push(await shot(page, outputDir, name));
  };

  try {
    const launch = await bootToAuthoredFlight({
      page,
      flightTimeoutMs: routeTimeout(150_000),
      onMilestone: async (name) => {
        if (name === 'main-menu-visible') {
          await enableReducedFlashThroughSettings(page);
          mark('reduced-flash-enabled-through-settings');
        }
        if (name === 'new-game-visible') {
          const seedInput = page.locator('#sf-ng-seed');
          await seedInput.waitFor({ state: 'visible', timeout: 10_000 });
          await seedInput.fill(String(fixedSeed));
        }
        if (name === 'authored-flight-ready') await capture('launch');
        mark(name);
      },
    });
    const observedSeed = await page.evaluate(() => window.SF?.state?.meta?.seed ?? null);
    assert.equal(Number(observedSeed), Number(fixedSeed));
    assert.equal(new URL(page.url()).origin, new URL(expectedRootUrl).origin);
    await installObservers(page);

    phase = 'ceres-entry';
    await startPerformanceWindow(page, 'matched-ceres-entry-and-approach');
    const outbound = await travelThroughOrdinaryGate(page, {
      fromSectorId: PQ018_HELIOS_SECTOR_ID,
      toSectorId: PQ018_CERES_SECTOR_ID,
      timeoutMs: routeTimeout(360_000),
    });
    assert.equal(outbound.toSectorId, PQ018_CERES_SECTOR_ID);

    if (baselineOnly) {
      await flyToPoint(page, PQ018_FIXED_GLOBAL_POS, 120, routeTimeout(360_000));
      await capture('ceresApproach');
      const ceresApproach = await finishPerformanceWindow(page);
      const finalSnapshot = await snapshot(page);
      const accessibility = await accessibilitySnapshot(page);
      assert.equal(finalSnapshot.sectorId, PQ018_CERES_SECTOR_ID);
      assert.equal(finalSnapshot.site, null, 'authorized base baseline must not contain the Cathedral');
      assert.equal(accessibility.reducedMotionMedia, true);
      assert.equal(accessibility.reducedFlashSetting, true);
      assert.equal(accessibility.reducedFlashClass, true);
      return {
        schema: PQ018_ROUTE_SCHEMA,
        pass: true,
        baselineOnly: true,
        runtimeKind,
        inputSource: 'visible title/map controls and ordinary keyboard-mouse flight',
        injectedGameState: false,
        seed: fixedSeed,
        steps,
        screenshots,
        accessibility,
        performance: { ceresApproach },
        finalSnapshot,
      };
    }

    await navigateToCathedralThroughPublicMap(page, routeTimeout(360_000));
    await waitForWorldRecord(page, PQ018_ROOT_WORLD_ID, routeTimeout(60_000));
    const rootPos = PQ018_FIXED_GLOBAL_POS;
    await waitForAdmittedRoot(page, routeTimeout(90_000));
    await waitForSiteRenderResidency(page, routeTimeout(90_000));
    await capture('ceresApproach');
    const admission = await snapshot(page);
    assert.equal(admission.sectorId, PQ018_CERES_SECTOR_ID);
    assert.equal(admission.site?.stageId, 'dark');
    assert.equal(admission.residency.rootCount, 1);
    assert.equal(admission.residency.inertCount, 0);
    assert.equal(admission.residency.duplicateWorldRecordIds.length, 0);
    assert.equal(admission.rootAdmission, 'ready');
    const ceresApproach = await finishPerformanceWindow(page);
    mark('cathedral-admitted', {
      rootAdmission: admission.rootAdmission,
      siteEntities: admission.residency.siteEntityCount,
    });

    phase = 'cavity-and-operations';
    await startPerformanceWindow(page, 'cavity-and-representative-operations');
    const entry = add(rootPos, CAVITY_ENTRY_OFFSET);
    const exit = add(rootPos, CAVITY_EXIT_OFFSET);
    await flyToPoint(page, entry, 80, routeTimeout(180_000), {
      maxApproachSpeed: 32,
      maxSettledSpeed: 7,
    });
    await capture('cavityEntry');
    const cavityGate = await flyToPoint(page, rootPos, 70, routeTimeout(180_000), {
      maxApproachSpeed: 26,
      maxSettledSpeed: 7,
      routeSafety: { obstacles: [], playerRadius: 0 },
      passThrough: {
        safe: true,
        radius: 70,
        outgoingEnd: exit,
        requiredDynamicClearance: 0,
      },
    });
    assert.equal(cavityGate.passThrough?.advance, true,
      'ordinary flight must cross the bounded center gate inside the authored cavity');
    await flyToPoint(page, exit, 85, routeTimeout(180_000), {
      maxApproachSpeed: 26,
      maxSettledSpeed: 7,
    });
    await capture('cavityExit');
    mark('authored-cavity-traversed', {
      input: 'ordinary WASD flight',
      entry,
      centerGate: { ...rootPos, radius: 70 },
      exit,
      distance: round(Math.hypot(exit.x - entry.x, exit.z - entry.z)),
    });

    for (const operation of REPRESENTATIVE_OPERATIONS) {
      await completeOperation(page, operation, routeTimeout(120_000));
      if (operation.evidencePageId === 'wreck_cathedral.missing_convoy') {
        await capture('firstEvidence');
      } else if (operation.evidencePageId === 'wreck_cathedral.capital_hull_located') {
        await capture('secondEvidence');
      }
      mark('operation-completed', operation);
    }
    const activeOperation = await finishPerformanceWindow(page);
    const beforeSave = await snapshot(page);
    assertRepresentativeEvidence(beforeSave);

    phase = 'save-continue';
    await page.keyboard.press('F5');
    await page.waitForFunction(() => window.__PQ017_ROUTE__?.saved === true
      && !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, {
      timeout: 60_000,
    });
    await waitBootOverlayGone(page);
    const mainMenu = page.locator('[data-screen="mainMenu"]');
    await mainMenu.waitFor({ state: 'visible', timeout: 30_000 });
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await continueButton.isEnabled(), true);
    await continueButton.click();
    await page.waitForFunction(([siteId, sectorId]) => (
      window.SF?.state?.mode === 'flight'
      && window.SF?.state?.world?.currentSectorId === sectorId
      && !!window.SF?.state?.sites?.worldById?.[siteId]
    ), [PQ018_SITE_ID, PQ018_CERES_SECTOR_ID], { timeout: routeTimeout(150_000) });
    await installObservers(page);
    await waitForAdmittedRoot(page, routeTimeout(90_000));
    await waitForSiteRenderResidency(page, routeTimeout(90_000));
    const continued = await snapshot(page);
    assert.deepEqual(
      stableRecord(continued.site),
      stableRecord(beforeSave.site),
      'Continue must restore Cathedral components and direct-keyed evidence exactly',
    );
    assertRepresentativeEvidence(continued);
    await capture('continued');
    mark('save-continue-equivalent');

    phase = 'ordinary-leave-return';
    const beforeLeave = continued.residency;
    await startPerformanceWindow(page, 'ordinary-leave-return');
    const away = await travelThroughOrdinaryGate(page, {
      fromSectorId: PQ018_CERES_SECTOR_ID,
      toSectorId: PQ018_HELIOS_SECTOR_ID,
      timeoutMs: routeTimeout(360_000),
    });
    assert.equal(away.toSectorId, PQ018_HELIOS_SECTOR_ID);
    await waitForSiteCleanup(page, beforeLeave.entityIds, routeTimeout(60_000));
    const absent = await snapshot(page);
    assert.equal(absent.residency.siteEntityCount, 0);
    const returned = await travelThroughOrdinaryGate(page, {
      fromSectorId: PQ018_HELIOS_SECTOR_ID,
      toSectorId: PQ018_CERES_SECTOR_ID,
      timeoutMs: routeTimeout(360_000),
    });
    assert.equal(returned.toSectorId, PQ018_CERES_SECTOR_ID);
    await navigateToCathedralThroughPublicMap(page, routeTimeout(360_000));
    await waitForWorldRecord(page, PQ018_ROOT_WORLD_ID, routeTimeout(60_000));
    await waitForAdmittedRoot(page, routeTimeout(90_000));
    await waitForSiteRenderResidency(page, routeTimeout(90_000));
    const rematerialized = await snapshot(page);
    assert.deepEqual(stableRecord(rematerialized.site), stableRecord(beforeSave.site));
    assert.equal(rematerialized.residency.rootCount, 1);
    assert.equal(rematerialized.residency.duplicateWorldRecordIds.length, 0);
    assert(rematerialized.residency.siteEntityCount <= beforeLeave.siteEntityCount);
    const leaveReturn = await finishPerformanceWindow(page);
    await capture('returned');
    mark('ordinary-leave-return-clean');

    phase = 'map-history-and-accessibility';
    await page.keyboard.press('KeyN');
    await page.locator('[data-screen="galaxyMap"]').waitFor({ state: 'visible', timeout: 20_000 });
    await searchAndSelect(page, 'Wreck Cathedral', /world site|capital wreck|cathedral/i);
    const historyTab = page.getByRole('tab', { name: 'History', exact: true });
    await historyTab.waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal(await historyTab.isEnabled(), true);
    await historyTab.click();
    const historyText = await page.locator('#gm-tabpanel').innerText();
    assert.match(historyText, /BRIDGE NAVIGATION RECORD|MISSING CONVOY/i);
    assert.match(historyText, /REGISTRY SCAN ARRAY|CAPITAL HULL/i);
    const a11y = await accessibilitySnapshot(page);
    assert.equal(a11y.reducedMotionMedia, true,
      'runtime cell must preserve meaning under the declared reduced-motion profile');
    assert.equal(a11y.reducedFlashSetting, true,
      'runtime cell must enable reduced flash through the public Settings screen');
    assert.equal(a11y.reducedFlashClass, true,
      'runtime presentation must apply the reduced-flash accessibility class');
    assert.match(a11y.historyText, /BRIDGE|MISSING CONVOY/i);
    assert.match(a11y.historyText, /REGISTRY|CAPITAL HULL/i);
    await capture('history');

    return {
      schema: PQ018_ROUTE_SCHEMA,
      pass: true,
      baselineOnly: false,
      runtimeKind,
      inputSource: 'visible title/map controls and ordinary keyboard-mouse flight',
      injectedGameState: false,
      seed: fixedSeed,
      steps,
      screenshots,
      accessibility: a11y,
      performance: { ceresApproach, activeOperation, leaveReturn },
      lifecycle: {
        beforeLeave,
        absent: absent.residency,
        afterReturn: rematerialized.residency,
      },
      finalSnapshot: rematerialized,
    };
  } catch (error) {
    error.routePhase = phase;
    error.routeProgress = steps;
    throw error;
  } finally {
    await page.evaluate(() => window.__PQ017_ROUTE__?.stop?.()).catch(() => {});
    await releaseFlightKeys(page).catch(() => {});
  }
}

export function evaluatePq018MatchedPerformance(candidate, baseline) {
  const failures = [];
  const candidateWindow = candidate?.performance?.ceresApproach;
  const baselineWindow = baseline?.performance?.ceresApproach;
  const candidateFrames = candidateWindow?.frameTimes;
  const baselineFrames = baselineWindow?.frameTimes;
  if (!(candidateFrames?.samples >= 30) || !(baselineFrames?.samples >= 30)) {
    failures.push('matched Ceres windows require at least 30 bounded frame samples each');
  }
  const candidateP95 = candidateFrames?.distributionMs?.p95;
  const baselineP95 = baselineFrames?.distributionMs?.p95;
  if (!Number.isFinite(candidateP95) || !Number.isFinite(baselineP95)) {
    failures.push('matched Ceres windows require finite frameTimes.distributionMs.p95 values');
  } else {
    const relativeP95Limit = baselineP95 * 1.35 + 2;
    const floorP95BudgetMs = Number(candidateFrames?.floorP95BudgetMs) || 34;
    const inheritedP95Limit = Math.max(floorP95BudgetMs, baselineP95);
    if (candidateP95 > relativeP95Limit) {
      failures.push(`Ceres p95 ${candidateP95}ms exceeds matched limit ${round(relativeP95Limit)}ms`);
    }
    if (candidateP95 > inheritedP95Limit) {
      failures.push(
        `Ceres p95 ${candidateP95}ms exceeds inherited/floor limit ${round(inheritedP95Limit)}ms`,
      );
    }
  }
  const candidateHitches = candidateFrames?.hitchesOverThreshold;
  const baselineHitches = baselineFrames?.hitchesOverThreshold;
  if (!Number.isFinite(candidateHitches) || !Number.isFinite(baselineHitches)) {
    failures.push('matched Ceres windows require finite hitch counts');
  } else {
    const matchedHitchLimit = Math.ceil(baselineHitches * 1.35 + 3);
    if (candidateHitches > matchedHitchLimit) {
      failures.push(
        `Ceres hitch count ${candidateHitches} exceeds matched limit ${matchedHitchLimit}`,
      );
    }
  }

  const candidateMemory = candidateWindow?.threeWebgl?.memory;
  const baselineMemory = baselineWindow?.threeWebgl?.memory;
  const candidateRender = candidateWindow?.threeWebgl?.render;
  const baselineRender = baselineWindow?.threeWebgl?.render;
  if (!candidateMemory || !baselineMemory || !candidateRender || !baselineRender) {
    failures.push('matched Ceres windows require Three/WebGL memory and render counters');
  } else {
    const growth = {
      geometries: candidateMemory.geometries - baselineMemory.geometries,
      textures: candidateMemory.textures - baselineMemory.textures,
      programs: candidateMemory.programs - baselineMemory.programs,
      calls: candidateRender.calls - baselineRender.calls,
      triangles: candidateRender.triangles - baselineRender.triangles,
    };
    if (growth.geometries > 120) failures.push(`geometry growth ${growth.geometries} exceeds predicted site envelope 120`);
    if (growth.textures > 32) failures.push(`texture growth ${growth.textures} exceeds exact Cathedral family envelope 32`);
    if (growth.programs > 6) failures.push(`program growth ${growth.programs} exceeds shared-material envelope 6`);
    if (growth.calls > 120) failures.push(`draw-call growth ${growth.calls} exceeds bounded site envelope 120`);
    if (growth.triangles > 120_000) failures.push(`triangle growth ${growth.triangles} exceeds exact LOD0 plus fixtures envelope`);
    return {
      pass: failures.length === 0,
      failures,
      growth,
      frames: {
        candidateP95,
        baselineP95,
        candidateHitches,
        baselineHitches,
        floorP95BudgetMs: Number(candidateFrames?.floorP95BudgetMs) || 34,
        baselineFloorBudgetMet: baselineFrames?.floorP95BudgetMet === true,
        candidateFloorBudgetMet: candidateFrames?.floorP95BudgetMet === true,
      },
    };
  }
  return {
    pass: false,
    failures,
    growth: null,
    frames: {
      candidateP95,
      baselineP95,
      candidateHitches,
      baselineHitches,
      floorP95BudgetMs: Number(candidateFrames?.floorP95BudgetMs) || 34,
      baselineFloorBudgetMet: baselineFrames?.floorP95BudgetMet === true,
      candidateFloorBudgetMet: candidateFrames?.floorP95BudgetMet === true,
    },
  };
}

async function enableReducedFlashThroughSettings(page) {
  const mainMenu = page.locator('[data-screen="mainMenu"]');
  await mainMenu.waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 20_000 });
  const settings = page.locator('[data-screen="settings"]');
  await settings.waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('tab', { name: 'Access', exact: true }).click({ timeout: 10_000 });
  const row = page.locator('.sf-row').filter({ hasText: 'Reduce flashing' }).first();
  const toggle = row.getByRole('button');
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await settings.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 10_000 });
  await mainMenu.waitFor({ state: 'visible', timeout: 20_000 });
}

async function accessibilitySnapshot(page) {
  return page.evaluate(() => ({
    reducedMotionMedia: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    reducedFlashSetting: window.SF?.state?.settings?.accessibility?.flashReduce === true,
    reducedFlashClass: document.documentElement.classList.contains('sf-reduce-flash'),
    canvasLabel: document.querySelector('#gl-canvas')?.getAttribute('aria-label') || null,
    historyText: document.querySelector('#gm-tabpanel')?.textContent || '',
  }));
}

async function navigateToCathedralThroughPublicMap(page, timeoutMs) {
  await page.keyboard.press('KeyN');
  const map = page.locator('[data-screen="galaxyMap"]');
  await map.waitFor({ state: 'visible', timeout: 20_000 });
  await searchAndSelect(page, 'Wreck Cathedral', /world site|capital wreck|cathedral/i);
  const waypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await waypoint.waitFor({ state: 'visible', timeout: 10_000 });
  await clickPersistentButton(page, waypoint);
  await page.waitForFunction(([target, within]) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state?.playerId);
    if (!player?.pos || player.alive === false) return false;
    return Math.hypot(player.pos.x - target.x, player.pos.z - target.z) <= within;
  }, [PQ018_FIXED_GLOBAL_POS, 520], { timeout: timeoutMs });
  return {
    input: 'Star Map search -> Wreck Cathedral -> Set Waypoint',
    target: { ...PQ018_FIXED_GLOBAL_POS },
  };
}

async function completeOperation(page, operation, timeoutMs) {
  const worldRecordId = `${PQ018_SITE_ID}/component/${operation.componentId}`;
  await cycleToComponent(page, operation.componentId);
  await settleAtWorldRecord(page, worldRecordId, 110, 5, timeoutMs, {
    useAutopilot: true,
  });
  await page.keyboard.down('KeyB');
  try {
    await page.waitForFunction(([siteId, operationId]) => !!(
      window.SF?.state?.sites?.worldById?.[siteId]?.completedOperations?.[operationId]
    ), [PQ018_SITE_ID, operation.operationId], { timeout: Math.max(20_000, timeoutMs / 3) });
  } finally {
    await page.keyboard.up('KeyB');
  }
}

async function installObservers(page) {
  await page.evaluate((siteId) => {
    window.__PQ017_ROUTE__?.stop?.();
    const sink = {
      events: [],
      saved: false,
      frameWindow: null,
      frameRequestId: 0,
      captureSystemTiming: false,
      unsubscribers: [],
    };
    window.__PQ017_ROUTE__ = sink;
    for (const name of [
      'worldSite:operationReceipt',
      'worldSite:failureReceipt',
      'save:completed',
      'save:loaded',
      'sector:exit',
      'sector:enter',
    ]) {
      sink.unsubscribers.push(window.SF.bus.on(name, (payload) => {
        if (payload?.siteId && payload.siteId !== siteId) return;
        sink.events.push({ name, payload });
        if (sink.events.length > 128) sink.events.splice(0, sink.events.length - 128);
        if (name === 'save:completed') sink.saved = true;
      }));
    }
    const sampleFrame = (now) => {
      if (window.__PQ017_ROUTE__ !== sink) return;
      const frameWindow = sink.frameWindow;
      if (frameWindow?.active) {
        if (Number.isFinite(frameWindow.lastAt)) {
          frameWindow.samples[frameWindow.head] = now - frameWindow.lastAt;
          frameWindow.phaseTags[frameWindow.head] = frameWindow.currentPhase;
          frameWindow.head = (frameWindow.head + 1) % frameWindow.sampleLimit;
          if (frameWindow.count < frameWindow.sampleLimit) frameWindow.count += 1;
        }
        frameWindow.lastAt = now;
      }
      sink.frameRequestId = requestAnimationFrame(sampleFrame);
    };
    sink.stop = () => {
      if (sink.frameRequestId) cancelAnimationFrame(sink.frameRequestId);
      for (const unsubscribe of sink.unsubscribers.splice(0)) {
        try { unsubscribe(); } catch {}
      }
      if (sink.frameWindow) sink.frameWindow.active = false;
    };
    sink.frameRequestId = requestAnimationFrame(sampleFrame);
  }, PQ018_SITE_ID);
}

async function waitForWorldRecord(page, worldRecordId, timeoutMs) {
  await page.waitForFunction((id) => [...(window.SF?.state?.entities?.values?.() || [])]
    .some((entity) => entity?.alive !== false && entity?.data?.worldRecordId === id),
  worldRecordId, { timeout: timeoutMs });
}

async function waitForAdmittedRoot(page, timeoutMs) {
  await page.waitForFunction((worldId) => [...(window.SF?.state?.entities?.values?.() || [])]
    .some((entity) => entity?.alive !== false
      && entity?.data?.worldRecordId === worldId
      && entity.presentationAdmission === 'ready'),
  PQ018_ROOT_WORLD_ID, { timeout: timeoutMs });
}

async function waitForSiteRenderResidency(page, timeoutMs) {
  await page.waitForFunction((siteId) => {
    const state = window.SF?.state;
    const meshes = window.SF?.registry?.get?.('render')?._meshes;
    const entities = [...(state?.entities?.values?.() || [])]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    return entities.length > 0 && meshes && entities.every((entity) => meshes.has(entity.id));
  }, PQ018_SITE_ID, { timeout: timeoutMs });
}

async function waitForSiteCleanup(page, trackedEntityIds, timeoutMs) {
  await page.waitForFunction(([siteId, ids]) => {
    const state = window.SF?.state;
    const meshes = window.SF?.registry?.get?.('render')?._meshes;
    const current = [...(state?.entities?.values?.() || [])]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    return current.length === 0 && (!meshes || ids.every((id) => !meshes.has(id)));
  }, [PQ018_SITE_ID, trackedEntityIds], { timeout: timeoutMs });
}

async function snapshot(page) {
  return page.evaluate((siteId) => {
    const state = window.SF?.state;
    const render = window.SF?.registry?.get?.('render');
    const meshes = render?._meshes;
    const site = state?.sites?.worldById?.[siteId] || null;
    const entities = [...(state?.entities?.values?.() || [])]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    const ids = entities.map((entity) => entity.data?.worldRecordId).filter(Boolean);
    const root = entities.find((entity) => entity.data?.worldRecordId === siteId);
    return {
      tick: state?.tick ?? null,
      seed: state?.meta?.seed ?? null,
      sectorId: state?.world?.currentSectorId || null,
      site: site ? JSON.parse(JSON.stringify(site)) : null,
      rootAdmission: root?.presentationAdmission || null,
      residency: {
        entityIds: entities.map((entity) => entity.id).sort((a, b) => Number(a) - Number(b)),
        siteEntityCount: entities.length,
        rootCount: entities.filter((entity) => entity.data?.worldRecordId === siteId).length,
        inertCount: entities.filter((entity) => entity.data?.worldSiteComponentId
          && entity.data?.worldSitePresentationAdmitted !== true).length,
        duplicateWorldRecordIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
        renderRootCount: meshes
          ? entities.filter((entity) => meshes.has(entity.id)).length
          : 0,
        totalLiveEntityCount: [...(state?.entities?.values?.() || [])]
          .filter((entity) => entity?.alive !== false).length,
        totalRenderRootCount: meshes?.size || 0,
      },
      events: JSON.parse(JSON.stringify(window.__PQ017_ROUTE__?.events || [])),
    };
  }, PQ018_SITE_ID);
}

function assertRepresentativeEvidence(snapshotValue) {
  const evidence = snapshotValue.site?.evidenceReceiptsByPageId || {};
  assert.deepEqual(
    Object.keys(evidence).sort(),
    ['wreck_cathedral.capital_hull_located', 'wreck_cathedral.missing_convoy'],
  );
  assert.equal(snapshotValue.site?.evidenceRevision, 2);
  for (const operation of REPRESENTATIVE_OPERATIONS.filter((entry) => entry.evidencePageId)) {
    const receipt = evidence[operation.evidencePageId];
    assert.equal(receipt.pageId, operation.evidencePageId);
    assert.equal(receipt.componentId, operation.componentId);
    assert.equal(receipt.operationId, operation.operationId);
  }
}

function stableRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    recordSchemaVersion: record.recordSchemaVersion,
    stageId: record.stageId,
    components: record.components,
    completedOperations: record.completedOperations,
    evidenceReceiptsByPageId: record.evidenceReceiptsByPageId,
    evidenceRevision: record.evidenceRevision,
    payloads: record.payloads,
    consequencesApplied: record.consequencesApplied,
  };
}

function add(a, b) {
  return { x: a.x + b.x, z: a.z + b.z };
}

function round(value) {
  return Number(Number(value).toFixed(3));
}

export function repoRelative(root, absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}
