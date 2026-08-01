// PQ-020 Phase H1 functional route shared by Browser and Electron.
//
// This module drives only public player surfaces: title/New Game, the `/` galaxy-map search,
// visible map action buttons, local autopilot, F5, reload, and Continue. It observes live state to
// verify ownership and to classify failures, but never assigns gameplay state, emits gameplay events,
// calls an internal sector transition, or moves the camera/player for a prettier shot.
//
// H1 is functional evidence only. This file deliberately contains no frame-time sampler, percentile,
// hitch counter, renderer.info read, residency-byte claim, or applied-LOD claim. Matched performance
// and renderer structure remain Phase H3.

import assert from 'node:assert/strict';

export const PQ020_CERES_FUNCTIONAL_SCHEMA = 'spaceface.pq020-ceres-functional-route.v1';
export const PQ020_CERES_SECTOR_ID = 'sector_ceres_belt';
export const PQ020_HELIOS_SECTOR_ID = 'sector_helios_prime';
export const PQ020_TETHYS_SECTOR_ID = 'sector_tethys_junction';
export const PQ020_CATHEDRAL_SITE_ID = 'world_site_wreck_cathedral';
export const PQ020_BEACON_POI_ID = 'poi_ceres_throughline';
export const PQ020_SAVE_STORAGE_KEY = 'sf.save.quick';

export const PQ020_ROUTE_TARGETS = Object.freeze({
  ceresSector: Object.freeze({
    query: 'Ceres Belt',
    name: 'Ceres Belt',
    action: 'Set Course & Jump',
  }),
  heliosSector: Object.freeze({
    query: 'Helios Prime',
    name: 'Helios Prime',
    action: 'Set Course & Jump',
  }),
  tethysSector: Object.freeze({
    query: 'Tethys Junction',
    name: 'Tethys Junction',
    action: 'Set Course & Jump',
  }),
  refinery: Object.freeze({
    query: 'Ceres Refinery',
    name: 'Ceres Refinery',
    action: 'Set Waypoint',
    zoneId: 'zone_ceres_refinery',
    zoneName: 'Ceres Refinery Approach',
  }),
  beltOutpost: Object.freeze({
    query: 'Belt Outpost',
    name: 'Belt Outpost',
    action: 'Set Waypoint',
    zoneId: 'zone_ceres_belt',
    zoneName: 'Ceres Mining Belt',
  }),
  beacon: Object.freeze({
    query: 'Throughline Weigh Beacon',
    name: 'Throughline Weigh Beacon',
    action: 'Track Target',
    zoneId: 'zone_ceres_throughline',
    zoneName: 'Throughline Weigh',
  }),
  cathedral: Object.freeze({
    query: 'Wreck Cathedral',
    name: 'Wreck Cathedral',
    action: 'Track Target',
  }),
});

export const PQ020_FUNCTIONAL_SCREENSHOTS = Object.freeze([
  '01-helios-to-ceres-map.png',
  '02-ceres-helios-entry.png',
  '03-refinery-map.png',
  '04-refinery-flight.png',
  '05-belt-outpost-map.png',
  '06-belt-outpost-flight.png',
  '07-beacon-map.png',
  '08-beacon-flight.png',
  '09-cathedral-map.png',
  '10-cathedral-far.png',
  '11-cathedral-default.png',
  '12-cathedral-close.png',
  '13-cathedral-arrival.png',
  '14-pre-save.png',
  '15-continue-menu.png',
  '16-continue-restored.png',
  '17-repeat-beacon-map.png',
  '18-repeat-cathedral-map.png',
  '19-ceres-to-tethys-map.png',
  '20-tethys-to-ceres-map.png',
  '21-ceres-tethys-entry.png',
]);

const MAP_TIMEOUT_MS = 30_000;
const BOOT_TIMEOUT_MS = 150_000;
const JUMP_TIMEOUT_MS = 180_000;
const AUTOPILOT_TIMEOUT_MS = 300_000;
const ADMISSION_TIMEOUT_MS = 120_000;
const CONTINUE_TIMEOUT_MS = 180_000;

const CATHEDRAL_FRAMINGS = Object.freeze([
  Object.freeze({ name: 'far', cameraZoom: 112, screenshot: '10-cathedral-far.png' }),
  Object.freeze({ name: 'default', cameraZoom: 72, screenshot: '11-cathedral-default.png' }),
  Object.freeze({ name: 'close', cameraZoom: 64, screenshot: '12-cathedral-close.png' }),
]);

export async function runPq020CeresFunctionalRoute({
  page,
  rootUrl,
  outputDir,
  runtimeLabel,
  fixedSeed,
  screenshot,
  pageIssueTracker = null,
} = {}) {
  if (!page) throw new TypeError('PQ-020 functional route requires a Playwright page');
  if (!rootUrl) throw new TypeError('PQ-020 functional route requires a canonical root URL');
  if (!outputDir) throw new TypeError('PQ-020 functional route requires an output directory');
  if (typeof screenshot !== 'function') throw new TypeError('PQ-020 functional route requires a screenshot callback');

  let phase = 'boot';
  const setPhase = (next) => { phase = next; };

  try {
    const boot = await bootSeededFlight(page, rootUrl, fixedSeed);
    setPhase('gpu-contract');
    const gpu = await readGpu(page);
    assert.equal(gpu.available, true, 'WebGL must be available');
    assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
      `PQ-020 acceptance requires the real GPU path, got ${gpu.renderer}`);
    await installObservers(page);

    setPhase('helios-to-ceres-map');
    const heliosToCeresMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.ceresSector,
      method: 'keyboard',
      activate: true,
      screenshot,
      screenshotName: '01-helios-to-ceres-map.png',
    });
    setPhase('helios-to-ceres-jump');
    const heliosApproach = await waitForJumpArrival(page, {
      sourceSectorId: PQ020_HELIOS_SECTOR_ID,
      targetSectorId: PQ020_CERES_SECTOR_ID,
    });
    assertEndpointApproach(heliosApproach, PQ020_HELIOS_SECTOR_ID);
    await screenshot('02-ceres-helios-entry.png');

    setPhase('refinery-selection');
    const refineryMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.refinery,
      method: 'pointer',
      activate: true,
      screenshot,
      screenshotName: '03-refinery-map.png',
    });
    setPhase('refinery-travel');
    const refinery = await waitForAutopilotArrival(page, PQ020_ROUTE_TARGETS.refinery);
    assertZone(refinery, PQ020_ROUTE_TARGETS.refinery);
    await screenshot('04-refinery-flight.png');

    setPhase('belt-outpost-selection');
    const beltOutpostMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.beltOutpost,
      method: 'pointer',
      activate: true,
      screenshot,
      screenshotName: '05-belt-outpost-map.png',
    });
    setPhase('belt-outpost-travel');
    const beltOutpost = await waitForAutopilotArrival(page, PQ020_ROUTE_TARGETS.beltOutpost);
    assertZone(beltOutpost, PQ020_ROUTE_TARGETS.beltOutpost);
    await screenshot('06-belt-outpost-flight.png');

    setPhase('beacon-selection');
    const beaconMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.beacon,
      method: 'keyboard',
      activate: true,
      screenshot,
      screenshotName: '07-beacon-map.png',
    });
    assert.match(beaconMap.inspectorText, /Throughline Weigh Beacon/i,
      'beacon inspector must carry its identity in text');
    setPhase('beacon-travel');
    const beacon = await waitForAutopilotArrival(page, PQ020_ROUTE_TARGETS.beacon);
    assertZone(beacon, PQ020_ROUTE_TARGETS.beacon);
    await screenshot('08-beacon-flight.png');

    setPhase('cathedral-selection');
    const cathedralMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.cathedral,
      method: 'pointer',
      activate: true,
      screenshot,
      screenshotName: '09-cathedral-map.png',
    });
    assert.match(cathedralMap.inspectorText, /Wreck Cathedral/i,
      'Cathedral inspector must carry its identity in text');
    setPhase('cathedral-admission');
    const cathedralAdmission = await waitForCathedralAdmission(page);

    setPhase('cathedral-arrival');
    const cathedral = await waitForAutopilotArrival(page, PQ020_ROUTE_TARGETS.cathedral);
    await waitForShipSettled(page);

    const cathedralFramings = [];
    for (const framing of CATHEDRAL_FRAMINGS) {
      setPhase(`cathedral-${framing.name}-framing`);
      const frame = await waitForCathedralFraming(page, framing);
      await screenshot(framing.screenshot);
      cathedralFramings.push(frame);
    }

    await screenshot('13-cathedral-arrival.png');

    setPhase('quick-save');
    await screenshot('14-pre-save.png');
    const saved = await quickSave(page);

    setPhase('cold-continue');
    const continued = await coldContinue(
      page, rootUrl, fixedSeed, screenshot, pageIssueTracker,
    );
    await installObservers(page);

    setPhase('repeat-beacon-selection');
    const repeatedBeacon = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.beacon,
      method: 'keyboard',
      activate: false,
      screenshot,
      screenshotName: '17-repeat-beacon-map.png',
    });
    setPhase('repeat-cathedral-selection');
    const repeatedCathedral = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.cathedral,
      method: 'pointer',
      activate: false,
      screenshot,
      screenshotName: '18-repeat-cathedral-map.png',
    });

    setPhase('ceres-to-tethys-map');
    const ceresToTethysMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.tethysSector,
      method: 'pointer',
      activate: true,
      screenshot,
      screenshotName: '19-ceres-to-tethys-map.png',
    });
    setPhase('ceres-to-tethys-jump');
    const tethysArrival = await waitForJumpArrival(page, {
      sourceSectorId: PQ020_CERES_SECTOR_ID,
      targetSectorId: PQ020_TETHYS_SECTOR_ID,
    });

    setPhase('tethys-to-ceres-map');
    const tethysToCeresMap = await selectMapTarget(page, {
      ...PQ020_ROUTE_TARGETS.ceresSector,
      method: 'keyboard',
      activate: true,
      screenshot,
      screenshotName: '20-tethys-to-ceres-map.png',
    });
    setPhase('tethys-to-ceres-jump');
    const tethysApproach = await waitForJumpArrival(page, {
      sourceSectorId: PQ020_TETHYS_SECTOR_ID,
      targetSectorId: PQ020_CERES_SECTOR_ID,
    });
    assertEndpointApproach(tethysApproach, PQ020_TETHYS_SECTOR_ID);
    await screenshot('21-ceres-tethys-entry.png');

    const finalSnapshot = await readFunctionalSnapshot(page);
    assert.equal(finalSnapshot.sectorId, PQ020_CERES_SECTOR_ID);
    assert.equal(finalSnapshot.beaconEntities, 1, 'the physical beacon must materialize exactly once');
    assert.equal(finalSnapshot.cathedralEntities, 15, 'the Cathedral must materialize exactly 15 entities');

    return {
      schema: PQ020_CERES_FUNCTIONAL_SCHEMA,
      runtime: runtimeLabel,
      disposition: 'PASS',
      problems: [],
      fixedSeed,
      recordedSeed: boot.recordedSeed,
      gpu,
      routeContract: 'public map selection -> production jump/autopilot -> F5 -> cold Continue',
      noPerformanceEvidence: true,
      noPerformanceEvidenceNote:
        'Functional H1 receipt only: state, DOM semantics, admission booleans, coordinates, counts, and screenshots. '
        + 'Matched performance and renderer structure remain Phase H3.',
      accessibility: {
        keyboardSelections: [
          heliosToCeresMap.name,
          beaconMap.name,
          repeatedBeacon.name,
          tethysToCeresMap.name,
        ],
        pointerSelections: [
          refineryMap.name,
          beltOutpostMap.name,
          cathedralMap.name,
          repeatedCathedral.name,
          ceresToTethysMap.name,
        ],
        inspectorCarriesIdentityInText: true,
        controllerPass: 'OPEN — physical-controller selection remains a human H2 action',
      },
      endpointApproaches: {
        fromHelios: heliosApproach,
        fromTethys: tethysApproach,
      },
      itinerary: [
        { id: 'station_ceres', label: refineryMap.name, arrival: refinery },
        { id: 'station_beltout', label: beltOutpostMap.name, arrival: beltOutpost },
        { id: PQ020_BEACON_POI_ID, label: beaconMap.name, arrival: beacon },
        { id: PQ020_CATHEDRAL_SITE_ID, label: cathedralMap.name, arrival: cathedral },
      ],
      cathedral: {
        siteId: PQ020_CATHEDRAL_SITE_ID,
        admission: cathedralAdmission,
        framings: cathedralFramings,
      },
      saveContinue: { saved, continued },
      repeatedSelections: {
        beacon: repeatedBeacon,
        cathedral: repeatedCathedral,
      },
      transit: {
        ceresToTethysMap,
        tethysArrival,
        tethysToCeresMap,
      },
      finalSnapshot,
    };
  } catch (error) {
    error.routePhase ||= phase;
    throw error;
  }
}

export function buildPq020ParityProjection(receipt) {
  const approach = (row) => ({
    sourceSectorId: row?.sourceSectorId || null,
    targetSectorId: row?.targetSectorId || null,
    closestEndpointGateTo: row?.closestEndpointGateTo || null,
  });
  const arrival = (row) => ({
    sectorId: row?.sectorId || null,
    currentZoneId: row?.currentZone?.id || null,
    currentZoneName: row?.currentZone?.name || null,
    autopilotStatus: row?.autopilot?.status || null,
  });
  return {
    schema: receipt?.schema || null,
    disposition: receipt?.disposition || null,
    fixedSeed: receipt?.fixedSeed ?? null,
    recordedSeed: receipt?.recordedSeed ?? null,
    gpuAvailable: receipt?.gpu?.available === true,
    endpointApproaches: {
      fromHelios: approach(receipt?.endpointApproaches?.fromHelios),
      fromTethys: approach(receipt?.endpointApproaches?.fromTethys),
    },
    itinerary: (receipt?.itinerary || []).map((row) => ({ id: row.id, arrival: arrival(row.arrival) })),
    cathedralFramings: (receipt?.cathedral?.framings || []).map((row) => ({
      name: row.name,
      inFrame: row.projection?.inFrame === true,
      admitted: row.admission?.ready === true,
      authored: row.admission?.authored === true,
    })),
    saveContinue: {
      sectorId: receipt?.saveContinue?.continued?.sectorId || null,
      seed: receipt?.saveContinue?.continued?.seed ?? null,
      beaconEntities: receipt?.saveContinue?.continued?.beaconEntities ?? null,
      cathedralEntities: receipt?.saveContinue?.continued?.cathedralEntities ?? null,
      poseRestored: receipt?.saveContinue?.continued?.poseRestored === true,
    },
    repeatedSelections: {
      beacon: receipt?.repeatedSelections?.beacon?.name || null,
      cathedral: receipt?.repeatedSelections?.cathedral?.name || null,
    },
  };
}

export async function readPq020FailureSnapshot(page) {
  if (!page || page.isClosed()) return { pageAvailable: false };
  try {
    return await page.evaluate(({ siteId, beaconId }) => {
      const state = window.SF?.state;
      if (!state) return { pageAvailable: true, stateAvailable: false };
      const player = state.entities?.get(state.playerId);
      const root = [...(state.entities?.values?.() || [])].find((entity) => (
        entity?.alive !== false && entity.data?.worldRecordId === `${siteId}/root`
      ));
      return {
        pageAvailable: true,
        stateAvailable: true,
        seed: state.meta?.seed ?? null,
        mode: state.mode || null,
        tick: state.tick ?? null,
        simTime: state.simTime ?? null,
        timeScale: state.timeScale ?? null,
        sectorId: state.world?.currentSectorId || null,
        entryPoint: copyPoint(state.world?.entryPoint),
        currentZone: state.world?.currentZone ? { ...state.world.currentZone } : null,
        jump: state.jump ? {
          state: state.jump.state,
          targetSectorId: state.jump.targetSectorId,
          via: state.jump.via,
          chargeT: state.jump.chargeT,
          chargeNeeded: state.jump.chargeNeeded,
        } : null,
        autopilot: state.nav?.autopilot ? {
          active: state.nav.autopilot.active === true,
          label: state.nav.autopilot.label || '',
          status: state.nav.autopilot.status || '',
          distance: finiteOrNull(state.nav.autopilot.distance),
          arrivalRadius: finiteOrNull(state.nav.autopilot.arrivalRadius),
          target: copyPoint(state.nav.autopilot.target),
          targetEntityId: state.nav.autopilot.targetEntityId ?? null,
        } : null,
        player: player ? {
          alive: player.alive !== false && Number(player.hull) > 0,
          hull: finiteOrNull(player.hull),
          pos: copyPoint(player.pos),
          vel: copyPoint(player.vel),
          speed: Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0),
        } : null,
        beaconEntities: [...(state.entities?.values?.() || [])].filter((entity) => (
          entity?.alive !== false && entity.data?.poiId === beaconId
        )).length,
        cathedralEntities: [...(state.entities?.values?.() || [])].filter((entity) => (
          entity?.alive !== false && entity.data?.worldSiteId === siteId
        )).length,
        cathedralRoot: root ? {
          id: root.id,
          presentationAdmission: root.presentationAdmission || null,
          authoredAssetState: root.mesh?.userData?.authoredAssetState
            || root.view?.root?.userData?.authoredAssetState || null,
          projection: projectEntity(root, state.render?.camera),
        } : null,
        inputReadiness: readInputReadiness(state),
        trace: (window.__PQ020_H1_TRACE__?.events || []).slice(-40),
      };

      function finiteOrNull(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      }
      function copyPoint(value) {
        if (!value) return null;
        return { x: finiteOrNull(value.x), z: finiteOrNull(value.z) };
      }
      function projectEntity(entity, camera) {
        const mesh = entity?.mesh || entity?.view?.root || null;
        if (!mesh?.position?.clone || !camera) return null;
        try {
          mesh.updateWorldMatrix?.(true, false);
          camera.updateMatrixWorld?.(true);
          const point = mesh.position.clone();
          mesh.getWorldPosition?.(point);
          point.project(camera);
          return {
            x: finiteOrNull(point.x),
            y: finiteOrNull(point.y),
            z: finiteOrNull(point.z),
            inFrame: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1,
          };
        } catch (_) { return null; }
      }
      function readInputReadiness(currentState) {
        const overlay = document.getElementById('boot-overlay');
        const activeScreen = window.SF?.ctx?.screenManager?.top?.() || null;
        return {
          mode: currentState.mode || null,
          activeScreen,
          modalOpen: document.body.classList.contains('ui-modal-open'),
          documentHasFocus: document.hasFocus(),
          loadingOverlay: overlay ? {
            hiddenClass: overlay.classList.contains('hidden'),
            ariaBusy: overlay.getAttribute('aria-busy'),
            display: getComputedStyle(overlay).display,
          } : null,
        };
      }
    }, { siteId: PQ020_CATHEDRAL_SITE_ID, beaconId: PQ020_BEACON_POI_ID });
  } catch (error) {
    return { pageAvailable: true, stateAvailable: false, readError: error?.message || String(error) };
  }
}

async function bootSeededFlight(page, rootUrl, fixedSeed) {
  await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const url = new URL(page.url());
  assert.equal(url.search, '', 'PQ-020 route must use the canonical root with no query flags');
  assert.equal(url.hash, '', 'PQ-020 route must use the canonical root with no hash flags');
  await page.bringToFront().catch(() => {});
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.ctx), null,
    { timeout: 60_000 });
  await dismissCinematic(page);
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu', 30_000);
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 20_000 });
  await waitVisible(page, '[data-screen="newGame"]', 'New Game', 20_000);
  await page.fill('#sf-ng-seed', String(fixedSeed));
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return !!(state?.mode === 'flight' && player && player.alive !== false && Number(player.hull) > 0);
  }, null, { timeout: BOOT_TIMEOUT_MS });
  const begin = page.getByRole('button', { name: /^Begin$/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click({ timeout: 10_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const modal = document.body.classList.contains('ui-modal-open');
    return !!(state?.mode === 'flight' && player && player.alive !== false && !modal);
  }, null, { timeout: 30_000 });
  const recordedSeed = await page.evaluate(() => window.SF.state.meta?.seed ?? null);
  assert.equal(recordedSeed, fixedSeed, 'New Game must consume the broker seed');
  const sectorId = await page.evaluate(() => window.SF.state.world?.currentSectorId || null);
  assert.equal(sectorId, PQ020_HELIOS_SECTOR_ID, 'the public New Game route must start in Helios');
  return { recordedSeed, sectorId };
}

async function dismissCinematic(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
}

async function installObservers(page) {
  await page.evaluate(() => {
    const bus = window.SF?.bus;
    if (!bus || window.__PQ020_H1_TRACE_INSTALLED__) return;
    const trace = window.__PQ020_H1_TRACE__ = { events: [] };
    window.__PQ020_H1_TRACE_INSTALLED__ = true;
    const clone = (value) => {
      try { return JSON.parse(JSON.stringify(value)); }
      catch (_) { return { uncloneable: true }; }
    };
    for (const event of [
      'jump:chargeStart', 'jump:chargeAbort', 'jump:start', 'jump:arrive', 'sector:enter',
      'nav:waypoint', 'nav:autopilot', 'world:zoneEntered', 'world:zoneExited',
      'hazard:enter', 'hazard:exit', 'save:completed', 'save:loaded',
    ]) {
      bus.on(event, (payload) => {
        trace.events.push({ event, tick: window.SF?.state?.tick ?? null, payload: clone(payload) });
        if (trace.events.length > 240) trace.events.splice(0, trace.events.length - 240);
      });
    }
  });
}

async function selectMapTarget(page, {
  query,
  name,
  action,
  method,
  activate,
  screenshot,
  screenshotName,
}) {
  await openMap(page);
  await page.keyboard.press('/');
  await page.waitForFunction(() => document.activeElement?.matches('.gm-search-input') === true,
    null, { timeout: 5_000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(query, { delay: 16 });
  await page.locator('.gm-search-item-name').first().waitFor({ state: 'visible', timeout: 15_000 });

  const names = (await page.locator('.gm-search-item-name').allTextContents())
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim());
  const index = names.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase());
  assert.notEqual(index, -1, `map search '${query}' did not expose exact target '${name}'; got ${names.join(' | ')}`);

  if (method === 'keyboard') {
    for (let i = 0; i < index; i += 1) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  } else {
    await page.locator('.gm-search-item').nth(index).click({ timeout: 10_000 });
  }

  const actionButton = page.locator('#gm-set-course-btn');
  await actionButton.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction((expected) => {
    const details = document.querySelector('.gm-inspector-details');
    const button = document.querySelector('#gm-set-course-btn');
    return !!(details && String(details.textContent || '').includes(expected)
      && button && !button.hidden && !button.disabled);
  }, name, { timeout: 15_000 });

  const readout = await page.evaluate(({ expectedName, methodName }) => {
    const map = document.querySelector('[data-screen="galaxyMap"]');
    const search = document.querySelector('.gm-search-input');
    const button = document.querySelector('#gm-set-course-btn');
    const details = document.querySelector('.gm-inspector-details');
    return {
      name: expectedName,
      method: methodName,
      mapRole: map?.getAttribute('role') || null,
      mapAriaLabel: map?.getAttribute('aria-label') || null,
      searchAriaLabel: search?.getAttribute('aria-label') || null,
      actionLabel: String(button?.textContent || '').replace(/\s+/g, ' ').trim(),
      actionFocused: document.activeElement === button,
      inspectorText: String(details?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
    };
  }, { expectedName: name, methodName: method });
  assert.equal(readout.actionLabel, action, `${name}: expected visible action '${action}', got '${readout.actionLabel}'`);
  assert.match(readout.inspectorText, new RegExp(escapeRegExp(name), 'i'), `${name}: inspector omitted target identity`);
  if (method === 'keyboard') {
    assert.equal(readout.actionFocused, true, `${name}: keyboard selection must hand focus to the primary action`);
  }
  await screenshot(screenshotName);

  if (!activate) {
    await page.keyboard.press('Escape');
    await page.locator('[data-screen="galaxyMap"]').first().waitFor({ state: 'hidden', timeout: MAP_TIMEOUT_MS });
    return readout;
  }

  if (method === 'keyboard') await page.keyboard.press('Enter');
  else await actionButton.click({ timeout: 10_000 });
  await page.locator('[data-screen="galaxyMap"]').first().waitFor({ state: 'hidden', timeout: MAP_TIMEOUT_MS });
  return readout;
}

async function openMap(page) {
  await page.keyboard.press('KeyN');
  await page.locator('[data-screen="galaxyMap"]').first().waitFor({ state: 'visible', timeout: MAP_TIMEOUT_MS });
}

async function waitForJumpArrival(page, { sourceSectorId, targetSectorId }) {
  const handle = await page.waitForFunction(({ source, target }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!state || !player) return false;
    if (player.alive === false || Number(player.hull) <= 0) {
      return { terminal: true, ok: false, reason: 'player-dead', sectorId: state.world?.currentSectorId || null };
    }
    const trace = window.__PQ020_H1_TRACE__?.events || [];
    const abort = [...trace].reverse().find((entry) => entry.event === 'jump:chargeAbort');
    if (state.world?.currentSectorId === target && state.jump?.state === 'IDLE') {
      return { terminal: true, ok: true };
    }
    if (state.world?.currentSectorId === source && state.jump?.state === 'IDLE' && abort) {
      return { terminal: true, ok: false, reason: `jump-aborted:${abort.payload?.reason || 'unknown'}` };
    }
    return false;
  }, { source: sourceSectorId, target: targetSectorId }, { timeout: JUMP_TIMEOUT_MS });
  const terminal = await handle.jsonValue();
  assert.equal(terminal.ok, true, `${sourceSectorId} -> ${targetSectorId} failed: ${terminal.reason || 'unknown'}`);

  const snapshot = await page.evaluate(({ source, target, endpoints }) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const endpointGates = state.entityList
      .filter((entity) => entity?.alive !== false && entity.data?.isGate === true
        && entity.data?.homeSectorId === target && endpoints.includes(entity.data?.gateTo))
      .map((entity) => ({
        id: entity.id,
        gateTo: entity.data.gateTo,
        name: entity.data.name,
        pos: { x: entity.pos.x, z: entity.pos.z },
        distance: Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z),
      }))
      .sort((a, b) => a.distance - b.distance);
    return {
      sourceSectorId: source,
      targetSectorId: target,
      sectorId: state.world.currentSectorId,
      jumpState: state.jump.state,
      entryPoint: state.world.entryPoint ? { x: state.world.entryPoint.x, z: state.world.entryPoint.z } : null,
      playerPos: { x: player.pos.x, z: player.pos.z },
      endpointGates,
      closestEndpointGateTo: endpointGates[0]?.gateTo || null,
    };
  }, {
    source: sourceSectorId,
    target: targetSectorId,
    endpoints: [PQ020_HELIOS_SECTOR_ID, PQ020_TETHYS_SECTOR_ID],
  });
  assert.equal(snapshot.sectorId, targetSectorId);
  assert.equal(snapshot.jumpState, 'IDLE');
  return snapshot;
}

export function assertEndpointApproach(snapshot, sourceSectorId) {
  assert.equal(snapshot.closestEndpointGateTo, sourceSectorId,
    `Ceres arrival from ${sourceSectorId} must land closest to the gate back to that endpoint`);
  const sourceGate = snapshot.endpointGates.find((gate) => gate.gateTo === sourceSectorId);
  assert(sourceGate, `Ceres exposes no endpoint gate back to ${sourceSectorId}`);
}

async function waitForAutopilotArrival(page, target) {
  await page.waitForFunction((label) => {
    const autopilot = window.SF?.state?.nav?.autopilot;
    return !!(autopilot && autopilot.active === true && String(autopilot.label || '') === label);
  }, target.name, { timeout: 30_000 });

  const handle = await page.waitForFunction(({ label, sectorId }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const autopilot = state?.nav?.autopilot;
    if (!state || !player || !autopilot) return false;
    const base = {
      sectorId: state.world?.currentSectorId || null,
      currentZone: state.world?.currentZone ? { ...state.world.currentZone } : null,
      player: {
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: Number(player.hull),
        pos: { x: player.pos.x, z: player.pos.z },
        speed: Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0),
      },
      autopilot: {
        active: autopilot.active === true,
        label: String(autopilot.label || ''),
        status: String(autopilot.status || ''),
        distance: Number.isFinite(autopilot.distance) ? autopilot.distance : null,
        arrivalRadius: Number.isFinite(autopilot.arrivalRadius) ? autopilot.arrivalRadius : null,
      },
    };
    if (!base.player.alive) return { terminal: true, ok: false, reason: 'player-dead', ...base };
    if (base.sectorId !== sectorId) return { terminal: true, ok: false, reason: 'left-ceres', ...base };
    if (autopilot.active === false && autopilot.label === label) {
      return { terminal: true, ok: autopilot.status === 'arrived', reason: autopilot.status, ...base };
    }
    return false;
  }, { label: target.name, sectorId: PQ020_CERES_SECTOR_ID }, { timeout: AUTOPILOT_TIMEOUT_MS });
  const terminal = await handle.jsonValue();
  assert.equal(terminal.ok, true, `${target.name} autopilot ended as ${terminal.reason}`);
  return terminal;
}

function assertZone(arrival, target) {
  assert.equal(arrival.currentZone?.id, target.zoneId,
    `${target.name} must arrive inside ${target.zoneName}, got ${arrival.currentZone?.name || 'no zone'}`);
  assert.equal(arrival.currentZone?.name, target.zoneName);
}

async function waitForCathedralAdmission(page) {
  const handle = await page.waitForFunction((siteId) => {
    const state = window.SF?.state;
    if (!state?.entities) return false;
    const root = [...state.entities.values()].find((entity) => (
      entity?.alive !== false && entity.data?.worldRecordId === `${siteId}/root`
    ));
    if (!root) return false;
    const mesh = root.mesh || root.view?.root || null;
    const authoredAssetState = mesh?.userData?.authoredAssetState || null;
    const ready = root.presentationAdmission === 'ready';
    const authored = String(authoredAssetState || '').startsWith('authored');
    const admittedComponents = [...state.entities.values()].filter((entity) => (
      entity?.alive !== false
      && entity.data?.worldSiteId === siteId
      && entity.data?.role === 'world_site_component'
      && entity.data?.worldSitePresentationAdmitted === true
    )).length;
    return ready && authored && admittedComponents === 7 ? {
      ready,
      authored,
      admittedComponents,
      entityId: root.id,
      presentationAdmission: root.presentationAdmission,
      authoredAssetState,
    } : false;
  }, PQ020_CATHEDRAL_SITE_ID, { timeout: ADMISSION_TIMEOUT_MS });
  return handle.jsonValue();
}

async function waitForCathedralFraming(page, framing) {
  const appliedCameraZoom = await setPublicCameraZoom(page, framing.cameraZoom);
  const handle = await page.waitForFunction(({ siteId, cameraZoom, name }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const root = [...(state?.entities?.values?.() || [])].find((entity) => (
      entity?.alive !== false && entity.data?.worldRecordId === `${siteId}/root`
    ));
    if (!state || !player || !root) return false;
    const distance = Math.hypot(root.pos.x - player.pos.x, root.pos.z - player.pos.z);
    const mesh = root.mesh || root.view?.root || null;
    const camera = state.render?.camera;
    let projection = null;
    if (mesh?.position?.clone && camera) {
      try {
        mesh.updateWorldMatrix?.(true, false);
        camera.updateMatrixWorld?.(true);
        const point = mesh.position.clone();
        mesh.getWorldPosition?.(point);
        point.project(camera);
        projection = {
          x: point.x,
          y: point.y,
          z: point.z,
          inFrame: Math.abs(point.x) <= 0.96 && Math.abs(point.y) <= 0.96
            && point.z >= -1 && point.z <= 1,
        };
      } catch (_) { projection = null; }
    }
    const admittedComponents = [...state.entities.values()].filter((entity) => (
      entity?.alive !== false
      && entity.data?.worldSiteId === siteId
      && entity.data?.role === 'world_site_component'
      && entity.data?.worldSitePresentationAdmitted === true
    )).length;
    const admission = {
      ready: root.presentationAdmission === 'ready' && admittedComponents === 7,
      authored: String(mesh?.userData?.authoredAssetState || '').startsWith('authored'),
      authoredAssetState: mesh?.userData?.authoredAssetState || null,
      admittedComponents,
    };
    const appliedZoom = Number(state.camera?.zoom);
    if (Math.abs(appliedZoom - cameraZoom) <= 0.01
        && projection?.inFrame && admission.ready && admission.authored) {
      return {
        terminal: true,
        ok: true,
        name,
        distance,
        projection,
        admission,
        appliedCameraZoom: appliedZoom,
        framingControl: 'public keyboard +/-',
      };
    }
    return false;
  }, {
    siteId: PQ020_CATHEDRAL_SITE_ID,
    cameraZoom: framing.cameraZoom,
    name: framing.name,
  }, { timeout: 30_000 });
  const terminal = await handle.jsonValue();
  assert.equal(appliedCameraZoom, framing.cameraZoom,
    `Cathedral ${framing.name} public camera control did not reach ${framing.cameraZoom}`);
  assert.equal(terminal.ok, true,
    `Cathedral ${framing.name} framing failed: ${terminal.reason || 'unknown'} at ${terminal.distance ?? 'unknown'} WU`);
  return terminal;
}

async function setPublicCameraZoom(page, targetZoom) {
  for (let step = 0; step < 40; step += 1) {
    const current = await page.evaluate(() => Number(window.SF?.state?.camera?.zoom));
    assert.ok(Number.isFinite(current), 'public camera zoom needs the live camera owner');
    if (Math.abs(current - targetZoom) <= 0.01) return current;
    const key = current < targetZoom ? 'Minus' : 'Equal';
    await page.keyboard.press(key);
    await page.waitForFunction(({ before, direction }) => {
      const next = Number(window.SF?.state?.camera?.zoom);
      return Number.isFinite(next) && (direction > 0 ? next > before : next < before);
    }, { before: current, direction: current < targetZoom ? 1 : -1 }, { timeout: 2_000 });
  }
  return page.evaluate(() => Number(window.SF?.state?.camera?.zoom));
}

async function waitForShipSettled(page) {
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player) return false;
    return Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0) <= 1;
  }, null, { timeout: 30_000 });
}

async function quickSave(page) {
  await page.keyboard.press('F5');
  await page.waitForFunction((key) => !!localStorage.getItem(key)
    && (window.__PQ020_H1_TRACE__?.events || []).some((entry) => entry.event === 'save:completed'),
  PQ020_SAVE_STORAGE_KEY, { timeout: 30_000 });
  const snapshot = await readFunctionalSnapshot(page);
  return {
    storageKey: PQ020_SAVE_STORAGE_KEY,
    sectorId: snapshot.sectorId,
    seed: snapshot.seed,
    playerPos: snapshot.player?.pos || null,
    beaconEntities: snapshot.beaconEntities,
    cathedralEntities: snapshot.cathedralEntities,
  };
}

async function waitForScreenRegistrationSettled(page) {
  await page.waitForFunction(() => {
    const ui = window.SF?.registry?.get?.('ui');
    return !!ui
      && Number.isFinite(ui._screenRegistrationGeneration)
      && ui._screenRegistrationSettledGeneration === ui._screenRegistrationGeneration;
  }, null, { timeout: 60_000 });
}

async function coldContinue(page, rootUrl, fixedSeed, screenshot, pageIssueTracker) {
  const before = await readFunctionalSnapshot(page);
  const navigationToken = pageIssueTracker?.beginExpectedNavigation?.('pq020-cold-continue');
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  } finally {
    pageIssueTracker?.endExpectedNavigation?.(navigationToken);
  }
  assert.equal(new URL(page.url()).href, new URL(rootUrl).href, 'cold Continue must reload the canonical root');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 60_000 });
  await dismissCinematic(page);
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu after reload', 30_000);
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
  await waitForScreenRegistrationSettled(page);
  await screenshot('15-continue-menu.png');
  // Continue replaces the menu-owned registry/UI generation in the same document. Electron can
  // therefore deliver exact ERR_ABORTED failures for dependency requests owned by the generation
  // being replaced even though there is no second document navigation. Keep this scope bounded to
  // the public click plus the incoming owner's settled signal. Request identity still determines
  // attribution; console/page/HTTP/non-abort failures remain fatal in the tracker.
  const continueTransitionToken =
    pageIssueTracker?.beginExpectedNavigation?.('pq020-continue-transition');
  try {
    await continueButton.click({ timeout: 20_000 });
    await page.waitForFunction(({ sectorId, siteId, beaconId }) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      if (!state || !player || player.alive === false || Number(player.hull) <= 0) return false;
      const entities = [...state.entities.values()];
      const beaconCount = entities.filter((entity) => entity?.alive !== false && entity.data?.poiId === beaconId).length;
      const cathedralCount = entities.filter((entity) => entity?.alive !== false && entity.data?.worldSiteId === siteId).length;
      const overlay = document.getElementById('boot-overlay');
      const activeScreen = window.SF?.ctx?.screenManager?.top?.() || null;
      const inputReady = state.mode === 'flight'
        && activeScreen == null
        && !document.body.classList.contains('ui-modal-open')
        && (!overlay || (
          overlay.classList.contains('hidden')
          && overlay.getAttribute('aria-busy') === 'false'
        ));
      return state.world?.currentSectorId === sectorId
        && beaconCount === 1
        && cathedralCount === 15
        && inputReady;
    }, {
      sectorId: PQ020_CERES_SECTOR_ID,
      siteId: PQ020_CATHEDRAL_SITE_ID,
      beaconId: PQ020_BEACON_POI_ID,
    }, { timeout: CONTINUE_TIMEOUT_MS });
    await waitForScreenRegistrationSettled(page);
  } finally {
    pageIssueTracker?.endExpectedNavigation?.(continueTransitionToken);
  }
  await page.bringToFront().catch(() => {});
  await screenshot('16-continue-restored.png');
  const after = await readFunctionalSnapshot(page);
  assert.equal(after.seed, fixedSeed, 'Continue must preserve the fixed seed');
  assert.equal(after.sectorId, PQ020_CERES_SECTOR_ID, 'Continue must restore Ceres');
  assert.equal(after.beaconEntities, 1, 'Continue must restore one physical beacon');
  assert.equal(after.cathedralEntities, 15, 'Continue must restore 15 Cathedral entities');
  const poseDelta = Math.hypot(
    (after.player?.pos?.x || 0) - (before.player?.pos?.x || 0),
    (after.player?.pos?.z || 0) - (before.player?.pos?.z || 0),
  );
  assert.ok(poseDelta <= 8, `Continue restored the player ${poseDelta.toFixed(3)} WU from the saved pose`);
  return {
    sectorId: after.sectorId,
    seed: after.seed,
    playerPos: after.player?.pos || null,
    poseDelta,
    poseRestored: poseDelta <= 8,
    beaconEntities: after.beaconEntities,
    cathedralEntities: after.cathedralEntities,
  };
}

async function readFunctionalSnapshot(page) {
  return page.evaluate(({ siteId, beaconId }) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const entities = [...state.entities.values()];
    return {
      seed: state.meta?.seed ?? null,
      mode: state.mode,
      sectorId: state.world?.currentSectorId || null,
      currentZone: state.world?.currentZone ? { ...state.world.currentZone } : null,
      player: player ? {
        alive: player.alive !== false && Number(player.hull) > 0,
        hull: Number(player.hull),
        pos: { x: player.pos.x, z: player.pos.z },
        speed: Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0),
      } : null,
      beaconEntities: entities.filter((entity) => (
        entity?.alive !== false && entity.data?.poiId === beaconId
      )).length,
      cathedralEntities: entities.filter((entity) => (
        entity?.alive !== false && entity.data?.worldSiteId === siteId
      )).length,
      siteRecordPresent: !!state.sites?.worldById?.[siteId],
      autopilot: state.nav?.autopilot ? {
        active: state.nav.autopilot.active === true,
        label: state.nav.autopilot.label || '',
        status: state.nav.autopilot.status || '',
      } : null,
    };
  }, { siteId: PQ020_CATHEDRAL_SITE_ID, beaconId: PQ020_BEACON_POI_ID });
}

async function readGpu(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false, vendor: null, renderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    };
  });
}

async function waitVisible(page, selector, label, timeout) {
  try {
    await page.waitForFunction((sel) => {
      const element = document.querySelector(sel);
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 20 && rect.height > 10;
    }, selector, { timeout });
  } catch (_) {
    throw new Error(`${label} never became visible (${selector})`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
