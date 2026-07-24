#!/usr/bin/env node
// M3 player-facing acceptance — canonical Browser routes.
//
// Route A proves the public title -> New Game -> ordinary flight -> map waypoint -> physical dock
// chain, then opens Outfitting and verifies its hover preview against the canonical engineering
// presenter. From that same run it uses the visible Undock command, takes the authored Hunter
// origin through Mission Log,
// tracks its named Yard Perimeter Writ through the public map, and captures readable damage, the
// after-action receipt, and recovery. Route B independently proves intentional gate travel plus a
// cold Continue. The harness observes state/events but never writes gameplay state or invents
// entities.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { runProfessionalTravelPublicRoute } from './lib/professionalTravelPublicRoute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_OPENING = process.argv.includes('--demo-opening');
const OUT_DIR = resolve(ROOT, '.devshots', 'alpha',
  DEMO_OPENING ? 'demo-opening-checkpoint' : 'm3-player-facing-public-route');
const BASELINE_DIR = resolve(OUT_DIR, 'baseline');
const TRAVEL_DIR = resolve(OUT_DIR, 'travel');
const REPORT = resolve(OUT_DIR, 'route-report.json');
const EVIDENCE = resolve(OUT_DIR, 'evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const DAMAGE_TIMEOUT_MS = 240_000;

let browser = null;
let server = null;
try {
  await Promise.all([
    mkdir(OUT_DIR, { recursive: true }),
    mkdir(BASELINE_DIR, { recursive: true }),
    mkdir(TRAVEL_DIR, { recursive: true }),
  ]);
  server = await startServer();
  const { chromium } = await loadPlaywright();
  const executablePath = findSystemBrowser();
  assert(executablePath, 'M3 player-facing acceptance requires installed Chrome or Edge');
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

  const baselinePage = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const baselineIssues = collectPageIssues(baselinePage, { ignoreProbeWarnings: true });
  await baselinePage.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await baselinePage.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 180_000 });
  const baseline = await runBrowserPublicRoute({
    page: baselinePage,
    outputDir: BASELINE_DIR,
    expectedRootUrl: server.baseUrl,
    log: (line) => process.stdout.write(`${line}\n`),
    flightTimeoutMs: 300_000,
    dockTimeoutMs: 360_000,
    skipStationHubAcceptance: true,
  });
  assert.equal(baseline.navSnapshot?.waypoint?.label, 'Helios Station',
    'public map selection must name the objective destination');
  assert.equal(baseline.navSnapshot?.autopilot?.active, true,
    'public Set Waypoint must engage the flight computer');
  assert.match(String(baseline.approachSnapshot?.autopilot?.label || ''), /Helios Station/i,
    'physical approach must retain the selected destination identity');

  const engineering = await proveEngineeringPreview(baselinePage);
  const engineeringShot = resolve(OUT_DIR, '01-truthful-engineering-preview.png');
  await baselinePage.screenshot({ path: engineeringShot });
  const damage = await proveAuthoredHunterDamageAndRecovery(baselinePage, {
    requireRecovery: !DEMO_OPENING,
  });
  assert.deepEqual(baselineIssues.errorIssues(), [], 'engineering/combat/recovery route emitted no page errors');
  await baselinePage.close();

  if (!(await isServerReachable(server.baseUrl))) {
    await stopOwnedServer(server).catch(() => {});
    server = await startServer();
    process.stdout.write(`[route] server-restarted-for-travel — ${server.baseUrl}\n`);
  }
  const travelPage = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const travelIssues = collectPageIssues(travelPage, { ignoreProbeWarnings: true });
  await travelPage.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const travel = await runProfessionalTravelPublicRoute({
    page: travelPage,
    outputDir: TRAVEL_DIR,
    expectedRootUrl: server.baseUrl,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  const rawTravelIssues = travelIssues.errorIssues();
  const ignoredReloadAborts = DEMO_OPENING
    ? rawTravelIssues.filter(isColdReloadBlobAbort)
    : [];
  const blockingTravelIssues = rawTravelIssues.filter((issue) => !ignoredReloadAborts.includes(issue));
  assert.deepEqual(blockingTravelIssues, [], 'intentional travel/Continue route emitted no blocking page errors');

  const mediaPaths = [
    mediaReceipt(engineeringShot),
    mediaReceipt(resolve(BASELINE_DIR, '04-galaxy-map.png')),
    mediaReceipt(resolve(BASELINE_DIR, '05-dock-prompt.png')),
    mediaReceipt(resolve(OUT_DIR, '02-readable-damage.png')),
  ];
  if (!DEMO_OPENING) {
    mediaPaths.push(
      mediaReceipt(resolve(OUT_DIR, '03-after-action-receipt.png')),
      mediaReceipt(resolve(OUT_DIR, '04-recovery-berth.png')),
    );
  }
  const media = await Promise.all(mediaPaths);
  const report = {
    schema: DEMO_OPENING
      ? 'spaceface.demoOpeningCheckpoint.v1'
      : 'spaceface.m3PlayerFacingPublicRoute.v1',
    generatedAt: new Date().toISOString(),
    worktreeId: worktreeId(),
    route: [
      DEMO_OPENING
        ? 'canonical root -> New Game/Launch -> N/Search/Set Waypoint -> physical Helios dock -> Outfitting hover preview -> visible Undock command -> J/Hunter origin -> Track Nav/Local Map/Set Waypoint -> Tab/MMB named-warrant combat -> readable natural damage'
        : 'canonical root -> New Game/Launch -> N/Search/Set Waypoint -> physical Helios dock -> Outfitting hover preview -> visible Undock command -> J/Hunter origin -> Track Nav/Local Map/Set Waypoint -> Tab/MMB/LMB named-warrant combat -> after-action -> recovery berth',
      'canonical root -> New Game/Launch -> N/Search/Set Waypoint -> physical gate -> M/Search/Set Course & Jump -> F5 -> Continue',
    ],
    url: server.baseUrl,
    canonicalRoot: true,
    viewport: { ...VIEWPORT, deviceScaleFactor: 1 },
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    baseline: {
      waypoint: baseline.navSnapshot,
      approach: baseline.approachSnapshot,
      station: {
        stationId: baseline.stableStation?.observationSequence?.at(-1)?.stationId || null,
        settledFrames: baseline.stableStation?.suffix?.length || baseline.stableStation?.finalSuffix?.length || null,
      },
      hardwareGpu: baseline.gpu?.identity || null,
      performanceTelemetry: baseline.performanceTelemetry,
    },
    engineering,
    travel: {
      destination: travel.destination || travel.arrivalSnapshot?.sectorId || damage.sectorId,
      steps: travel.steps,
      receipts: travel.jumpReceipts || null,
    },
    damage,
    pageIssues: [...baselineIssues.errorIssues(), ...blockingTravelIssues],
    ignoredReloadAborts,
    browserVersion: await browser.version(),
    media,
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');

  const evidence = {
    schema: 'spaceface.alphaEvidence.v1',
    taskId: DEMO_OPENING ? 'demo-opening-checkpoint' : 'm3-player-facing-public-route',
    worktreeId: report.worktreeId,
    route: report.route.join(' | '),
    viewport: VIEWPORT,
    runtime: { kind: 'browser', gpu: report.baseline.hardwareGpu },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    checks: [
      { name: 'truthful engineering preview on normal Outfitting route', status: 'pass' },
      { name: 'objective search, waypoint, flight-computer approach, and physical dock', status: 'pass' },
      { name: 'authored named-warrant damage through public Mission Log, map, and combat controls', status: 'pass' },
      ...(DEMO_OPENING
        ? [{ name: 'player remains alive after the first readable authored threat', status: 'pass' }]
        : [{ name: 'readable after-action consequence receipt and public recovery', status: 'pass' }]),
      { name: 'blocking runtime/page errors absent', status: 'pass' },
    ],
    artifacts: [
      ...media.map((item) => ({ kind: 'screenshot', path: item.path, sha256: item.sha256 })),
      { kind: 'report', path: relativePath(REPORT) },
    ],
    notes: [
      'Primary evidence: no query flags, state writes, entity injection, teleports, direct damage, or internal transition calls.',
      'Engineering expected values are recomputed read-only through the same canonical presenter used by the live Outfitting screen.',
      'Damage comes from the authored Hunter Yard Perimeter Writ: Mission Log posts Rook Nine as a mission-owned hostile outside Helios sanctuary, then the player uses Track Nav, Local Map, Tab targeting, MMB pursuit, and a Space brake only after the first natural hit.',
      ...(DEMO_OPENING && ignoredReloadAborts.length > 0
        ? [`Cold reload canceled ${ignoredReloadAborts.length} in-flight blob texture requests; authored flight readiness passed after Continue and every non-navigation error remained fatal.`]
        : []),
    ],
  };
  await writeFile(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');

  process.stdout.write(`M3 player-facing public route PASS\n${JSON.stringify({
    evidence: relativePath(EVIDENCE),
    report: relativePath(REPORT),
    module: engineering.moduleId,
    objective: baseline.navSnapshot?.waypoint?.label,
    dangerousSector: damage.sectorId,
    fatalSummary: damage.afterAction?.fatalSummary || null,
    recovery: damage.recovered || null,
    screenshots: media,
  }, null, 2)}\n`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await stopOwnedServer(server).catch(() => {});
}

async function proveEngineeringPreview(page) {
  const station = page.locator('[data-screen="station"] .sx-app');
  await station.waitFor({ state: 'visible', timeout: 30_000 });
  const undock = station.locator('button[data-act="undock"]');
  const shipworks = station.locator('button[data-nav="shipworks"]');
  await Promise.all([
    undock.waitFor({ state: 'visible', timeout: 20_000 }),
    shipworks.waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
  assert.equal(await undock.isEnabled(), true, 'current station shell must expose its public Undock action');
  const shipworksBox = await shipworks.boundingBox();
  assert(shipworksBox && shipworksBox.width > 2 && shipworksBox.height > 2,
    'current Shipworks command-dock tile must expose a pointer target');
  await page.mouse.click(shipworksBox.x + shipworksBox.width / 2, shipworksBox.y + shipworksBox.height / 2);
  await station.locator('.sx-sw').waitFor({ state: 'visible', timeout: 30_000 });
  const canvas = station.locator('.sx-sw__canvas');
  await canvas.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    return el?.dataset?.authoredRequired === 'true'
      && el?.dataset?.fallbackAllowed === 'false'
      && el?.dataset?.previewReady === 'true';
  }, null, { timeout: 120_000 });

  const slot = station.locator('.sx-slot[data-slot]').first();
  await slot.waitFor({ state: 'visible', timeout: 20_000 });
  const slotBox = await slot.boundingBox();
  assert(slotBox && slotBox.width > 2 && slotBox.height > 2, 'Shipworks loadout slot must expose a pointer target');
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  const row = station.locator('.sx-modrow[data-preview-module]:not(.is-eq):not(.is-locked)').first();
  await row.waitFor({ state: 'visible', timeout: 20_000 });
  const moduleId = await row.getAttribute('data-preview-module');
  const slotIndex = Number(await row.getAttribute('data-preview-slot'));
  assert(moduleId && Number.isInteger(slotIndex), 'live Shipworks row must expose exact module and slot identity');
  await row.hover();
  await page.waitForFunction((wanted) => {
    const preview = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    const stats = document.querySelector('[data-screen="station"] .sx-sw__stats');
    return preview?.dataset?.previewMode === 'module'
      && preview?.dataset?.previewModule === wanted
      && preview?.dataset?.previewReady === 'true'
      && stats?.dataset?.previewSource === 'ships.getDerivedStats';
  }, moduleId, { timeout: 30_000 });

  const snapshot = await page.evaluate(async ({ wanted, wantedSlot }) => {
    const presenter = await import('/src/ui/presenters/engineeringPreview.js');
    const state = window.SF.state;
    const owned = (state.player.ownedShips || [])[state.player.activeShipIndex];
    const expectedPreview = presenter.presentModuleFitPreview({
      defId: owned.defId,
      fittings: owned.fittings || [],
      moduleId: wanted,
      slotIndex: wantedSlot,
      player: state.player,
    });
    const expectedDelta = presenter.presentShopModuleDelta({
      defId: owned.defId,
      fittings: owned.fittings || [],
      moduleId: wanted,
      slotIndex: wantedSlot,
      player: state.player,
    });
    const canvasEl = document.querySelector('[data-screen="station"] .sx-sw__canvas');
    const statsEl = document.querySelector('[data-screen="station"] .sx-sw__stats');
    return {
      moduleId: wanted,
      shipDefId: owned.defId,
      slotIndex: wantedSlot,
      expectedPreview,
      expectedDelta,
      actual: {
        stationShell: document.querySelector('[data-screen="station"] .sx-app') ? 'orbital-command' : null,
        rowText: String(document.querySelector(`.sx-modrow[data-preview-module="${CSS.escape(wanted)}"]`)?.innerText || '')
          .replace(/\s+/g, ' ').trim(),
        previewCanvasVisible: visible(canvasEl),
        previewReady: canvasEl?.dataset?.previewReady === 'true',
        fallbackAllowed: canvasEl?.dataset?.fallbackAllowed || null,
        previewDefId: canvasEl?.dataset?.previewDefId || null,
        previewFittings: canvasEl?.dataset?.previewFittings || '[]',
        previewMode: canvasEl?.dataset?.previewMode || null,
        metrics: Object.fromEntries([...statsEl.querySelectorAll('[data-metric][data-value]')]
          .map((el) => [el.dataset.metric, Number(el.dataset.value)])),
      },
    };

    function visible(el) {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
        && rect.width > 1 && rect.height > 1;
    }
  }, { wanted: moduleId, wantedSlot: slotIndex });

  assert.equal(snapshot.expectedPreview.ok, true, 'canonical fit presenter must accept the visible preview');
  assert.equal(snapshot.expectedDelta.ok, true, 'canonical shop delta presenter must accept the visible preview');
  assert.equal(snapshot.actual.previewCanvasVisible, true, 'authored ship preview must be visible');
  assert.equal(snapshot.actual.previewReady, true, 'live Shipworks must render the requested hull/loadout');
  assert.equal(snapshot.actual.fallbackAllowed, 'false', 'live Shipworks must refuse fabricated preview geometry');
  assert.equal(snapshot.actual.previewDefId, snapshot.shipDefId, 'preview geometry must use the owned runtime hull');
  assert.equal(snapshot.actual.previewMode, 'module', 'hover must visibly enter module-preview mode');
  assert.deepEqual(JSON.parse(snapshot.actual.previewFittings), [...snapshot.expectedPreview.afterFittings],
    'preview geometry must use the canonical after-fittings loadout');
  for (const [key, expected] of Object.entries({
    shieldMax: snapshot.expectedPreview.after.shieldMax,
    hullMax: snapshot.expectedPreview.after.hullMax,
    cargoCap: snapshot.expectedPreview.after.cargoCap,
    maxSpeed: snapshot.expectedPreview.after.maxSpeed,
    operationalMass: snapshot.expectedPreview.after.operationalMass,
  })) {
    assert.equal(snapshot.actual.metrics[key], expected, `visible ${key} must match getDerivedStats`);
  }
  return snapshot;
}

async function proveAuthoredHunterDamageAndRecovery(page, { requireRecovery = true } = {}) {
  const station = page.locator('[data-screen="station"] .sx-app');
  await station.waitFor({ state: 'visible', timeout: 30_000 });
  const undock = station.locator('button[data-act="undock"]');
  await undock.waitFor({ state: 'visible', timeout: 10_000 });
  await pointerClick(page, undock, 'Undock');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.mode === 'flight' && state?.ui?.docked !== true
      && !!state.entities?.get?.(state.playerId)
      && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 30_000 });

  await page.evaluate(() => {
    if (window.__M3_DAMAGE_OBSERVER__) return;
    window.__M3_DAMAGE_OBSERVER__ = { playerHits: [], deaths: [], respawns: [] };
    window.SF.bus.on('combat:damage', (payload) => {
      if (payload?.targetId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.playerHits.push({ ...payload, atTick: window.SF.state.tick });
      }
    });
    window.SF.bus.on('player:death', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.deaths.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('player:respawn', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.respawns.push({ ...payload, atTick: window.SF.state.tick });
    });
  });

  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await canvas.boundingBox();
  assert(box && box.width > 100 && box.height > 100, 'combat route requires a visible flight canvas');
  await page.mouse.move(Math.round(box.x + box.width * 0.55), Math.round(box.y + box.height * 0.48));
  await canvas.focus();

  // The Hunter origin is offered on normal flight entry. Take it through Mission Log so the
  // combatant has an authored warrant, name, mission identity, and explicit lawful context.
  await page.keyboard.press('KeyJ');
  const missionLog = page.locator('[data-screen="missionLog"]');
  await missionLog.waitFor({ state: 'visible', timeout: 20_000 });
  const hunterCard = missionLog.locator('[data-testid="mission-log-career-chip"][data-career-id="hunter"]');
  await hunterCard.waitFor({ state: 'visible', timeout: 20_000 });
  assert.match((await hunterCard.innerText()).replace(/\s+/g, ' '), /Legal HOSTILE marks only\. Heat voids the bag\./i,
    'public Hunter offer must explain legal target discrimination before acceptance');
  const acceptHunter = hunterCard.locator('button[data-career-act="originAccept"]');
  await pointerClick(page, acceptHunter, 'Take hunter path');

  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return (state?.missions?.active || []).some((mission) => mission?.status === 'active'
      && mission.originCareer === 'hunter' && mission.originContractId === 'yard_writ'
      && mission.storyTarget?.id === 'origin_hunter_yard_mark'
      && Array.isArray(mission.targetEntityIds) && mission.targetEntityIds.length === 1);
  }, null, { timeout: 30_000 });
  const authoredMission = await page.evaluate(() => {
    const state = window.SF.state;
    const mission = state.missions.active.find((item) => item?.status === 'active'
      && item.originCareer === 'hunter' && item.originContractId === 'yard_writ');
    const target = mission && state.entities.get(mission.targetEntityIds[0]);
    return {
      id: mission?.id || null,
      title: mission?.title || null,
      type: mission?.type || null,
      storyTag: mission?.storyTag || null,
      originCareer: mission?.originCareer || null,
      originContractId: mission?.originContractId || null,
      targetId: target?.id || null,
      targetName: target?.data?.name || target?.data?.ai?.name || null,
      targetScanLabel: target?.data?.scanLabel || null,
      targetStoryId: target?.data?.storyTargetId || null,
      targetMissionId: target?.data?.missionId || target?.data?.missionTag || null,
      targetLawful: target?.data?.ai?.lawful === true,
      targetPos: target?.pos ? { x: Number(target.pos.x), z: Number(target.pos.z) } : null,
    };
  });
  assert.equal(authoredMission.title, 'Yard Perimeter Writ', 'public Hunter choice must post the authored opening writ');
  assert.equal(authoredMission.type, 'bounty_hunt', 'opening writ must use the mission-owned bounty path');
  assert.equal(authoredMission.targetName, 'Rook Nine', 'opening writ must name its authored quarry');
  assert.match(String(authoredMission.targetScanLabel || ''), /ROOK NINE.*WARRANT/i,
    'visible scanner identity must carry the warrant context');
  assert.equal(String(authoredMission.targetMissionId), String(authoredMission.id),
    'quarry must be owned by the accepted mission');
  assert.equal(authoredMission.targetLawful, false, 'the warranted quarry must not masquerade as lawful patrol traffic');

  const trackButton = missionLog.locator(`button[data-act="track"][data-mid="${authoredMission.id}"]`);
  await trackButton.waitFor({ state: 'visible', timeout: 20_000 });
  await pointerClick(page, trackButton, 'Track Nav');
  await page.waitForFunction((missionId) => String(window.SF?.state?.ui?.trackedMissionId) === String(missionId),
    authoredMission.id, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await missionLog.waitFor({ state: 'hidden', timeout: 10_000 });

  // Open the normal local map, search for the visible named warrant, and arm the flight computer
  // from its inspector. This proves the objective is findable without hidden target knowledge.
  await canvas.focus();
  await page.keyboard.press('KeyM');
  const galaxyMap = page.locator('#sf-galaxymap');
  await galaxyMap.waitFor({ state: 'visible', timeout: 20_000 });
  const searchInput = galaxyMap.locator('.gm-search-input');
  await page.keyboard.press('/');
  const searchFocused = await page.waitForFunction(
    () => document.activeElement?.matches('.gm-search-input') === true,
    null,
    { timeout: 1_000 },
  ).then(() => true, () => false);
  if (!searchFocused) await pointerClick(page, searchInput, 'local-map search');
  await page.keyboard.type('Rook Nine');
  await galaxyMap.locator('.gm-search-item-name', { hasText: 'Rook Nine' }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Enter');
  const inspector = (await galaxyMap.locator('.gm-inspector-content').innerText()).replace(/\s+/g, ' ');
  assert.match(inspector, /Rook Nine/i, 'local-map inspector must visibly identify the warranted quarry');
  assert.match(inspector, /Hostile\s+YES/i, 'local-map inspector must distinguish the quarry as hostile');
  const trackTarget = galaxyMap.locator('#gm-set-course-btn');
  await trackTarget.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match((await trackTarget.innerText()).trim(), /Track Target|Set Waypoint/i,
    'local-map quarry inspector must expose a public flight-computer action');
  await pointerClick(page, trackTarget, 'Track Target');
  await page.waitForFunction(({ targetId, label }) => {
    const nav = window.SF?.state?.nav;
    return nav?.autopilot?.active === true
      && String(nav.autopilot.targetEntityId) === String(targetId)
      && new RegExp(label, 'i').test(String(nav.autopilot.label || ''));
  }, { targetId: authoredMission.targetId, label: 'Rook Nine' }, { timeout: 10_000 });
  await galaxyMap.waitFor({ state: 'hidden', timeout: 10_000 });
  await canvas.focus();
  await page.keyboard.press('KeyO');

  const hostile = await acquireAuthoredMissionHostile(page, authoredMission, 150_000);
  assert.equal(hostile.hostile, true, `public Tab must lock the warranted hostile: ${JSON.stringify(hostile)}`);
  await page.keyboard.press('KeyG');
  await page.waitForFunction((targetId) => {
    const state = window.SF?.state;
    return state?.input?.autoFire === true
      && String(state?.player?.targetId) === String(targetId);
  }, authoredMission.targetId, { timeout: 10_000 });

  await page.waitForFunction(() => {
    if ((window.__M3_DAMAGE_OBSERVER__?.playerHits?.length || 0) <= 0) return false;
    return [...document.querySelectorAll('.sf-dmgind-marker')].some((marker) => {
      const style = getComputedStyle(marker);
      const glyph = String(marker.querySelector('.sf-dmgind-marker__layer')?.textContent || '').trim();
      return style.display !== 'none' && Number(style.opacity) > 0.05 && /^[SAH]$/.test(glyph);
    });
  }, null, { timeout: DAMAGE_TIMEOUT_MS });
  const damageReadout = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const marker = [...document.querySelectorAll('.sf-dmgind-marker')].find((candidate) => {
      const style = getComputedStyle(candidate);
      return style.display !== 'none' && Number(style.opacity) > 0.05;
    });
    return {
      sectorId: state.world?.currentSectorId || null,
      targetId: state.player.targetId || null,
      vitals: {
        shield: Number(player.shield || 0), armor: Number(player.armor || 0), hull: Number(player.hull || 0),
      },
      damageCue: marker ? {
        glyph: String(marker.querySelector('.sf-dmgind-marker__layer')?.textContent || '').trim(),
        layer: [...marker.classList].find((name) => name.startsWith('layer-')) || null,
        severity: [...marker.classList].find((name) => name.startsWith('severity-')) || null,
        transform: marker.style.transform || null,
      } : null,
      hit: window.__M3_DAMAGE_OBSERVER__.playerHits.at(-1) || null,
      rosterText: String(document.querySelector('.sf-overview')?.innerText || '')
        .replace(/\s+/g, ' ').trim().slice(0, 500),
    };
  });
  assert.match(String(damageReadout.damageCue?.glyph || ''), /^[SAH]$/,
    'current HUD must show the incoming hit direction with a redundant shield/armor/hull glyph');
  assert.match(String(damageReadout.damageCue?.transform || ''), /translate3d\(/,
    'incoming-hit cue must be positioned directionally rather than shown as a generic alarm');
  const damageShot = resolve(OUT_DIR, '02-readable-damage.png');
  await page.screenshot({ path: damageShot });

  if (!requireRecovery) {
    const playerAlive = await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state.playerId);
      return player?.alive !== false && Number(player?.hull || 0) > 0;
    });
    assert.equal(playerAlive, true, 'demo opening must leave the player alive after readable natural damage');
    return {
      sectorId: damageReadout.sectorId,
      mission: authoredMission,
      hostile,
      damageReadout,
      afterAction: null,
      recovered: null,
      playerAlive,
      publicActions: ['Undock command', 'J Mission Log', 'Take hunter path', 'Track Nav', 'M local map', 'search Rook Nine', 'Track Target', 'O contacts', 'Tab target', 'MMB pursue'],
    };
  }

  // The accepted warrant is the combat cause; do not damage the light Wasp or trip its morale
  // response. After its first natural hit, yield with normal Space brake/counter-thrust input so
  // ordinary AI can complete the death route without health, velocity, damage, or AI state writes.
  await page.keyboard.down('Space');
  await page.waitForTimeout(4_000);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.flight?.mode === 'manual' && player?.vel
      && Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) < 20;
  }, null, { timeout: 15_000 });

  await page.locator('[data-screen="gameOver"]').waitFor({ state: 'visible', timeout: DAMAGE_TIMEOUT_MS });
  const afterAction = await page.evaluate(() => {
    const root = document.querySelector('[data-screen="gameOver"]');
    const receipt = window.SF?.state?.combat?.lastPlayerDefeat || null;
    return {
      text: String(root?.innerText || '').replace(/\s+/g, ' ').trim(),
      fatalSummary: receipt?.fatalSummary || receipt?.cause || null,
      recovery: receipt?.recovery || null,
      rows: [...(root?.querySelectorAll('.sf-go-grid .v') || [])].map((el) => String(el.textContent || '').trim()),
      deathEvents: window.__M3_DAMAGE_OBSERVER__?.deaths || [],
      playerHits: window.__M3_DAMAGE_OBSERVER__?.playerHits || [],
    };
  });
  assert.match(afterAction.text, /Ship Lost|Run Over/i, 'after-action surface must state the outcome');
  assert.match(afterAction.text, /Loss cause/i, 'after-action surface must name loss cause');
  assert.match(afterAction.text, /Final damage/i, 'after-action surface must name final damage');
  assert.match(afterAction.text, /Recovery dock/i, 'after-action surface must name recovery dock');
  assert.match(afterAction.text, /Recovery cost/i, 'after-action surface must name recovery cost');
  assert.match(afterAction.text, /Cargo consequence/i, 'after-action surface must name cargo consequence');
  assert.match(afterAction.text, /Coverage/i, 'after-action surface must name coverage');
  assert.ok(afterAction.fatalSummary, 'canonical defeat receipt must name the fatal cause');
  const afterActionShot = resolve(OUT_DIR, '03-after-action-receipt.png');
  await page.screenshot({ path: afterActionShot });

  const recoveryButton = page.getByRole('button', { name: /Continue from the recovery berth/i });
  await recoveryButton.waitFor({ state: 'visible', timeout: 10_000 });
  await recoveryButton.click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get?.(sf.state.playerId);
    const screen = document.querySelector('[data-screen="gameOver"]');
    const hidden = !screen || screen.hidden || getComputedStyle(screen).display === 'none';
    return hidden && player?.alive !== false && Number(player?.hull || 0) > 0
      && (window.__M3_DAMAGE_OBSERVER__?.respawns?.length || 0) > 0;
  }, null, { timeout: 30_000 });
  const recovered = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return {
      mode: state.mode,
      sectorId: state.world?.currentSectorId || null,
      docked: state.ui?.docked === true,
      dockedStationId: state.ui?.dockedStationId || null,
      alive: player.alive !== false && Number(player.hull || 0) > 0,
      hull: Number(player.hull || 0),
      receipt: window.__M3_DAMAGE_OBSERVER__.respawns.at(-1) || null,
    };
  });
  assert.equal(recovered.alive, true, 'public recovery must return a living player ship');
  const recoveryShot = resolve(OUT_DIR, '04-recovery-berth.png');
  await page.screenshot({ path: recoveryShot });

  return {
    sectorId: damageReadout.sectorId,
    mission: authoredMission,
    hostile,
    damageReadout,
    afterAction,
    recovered,
    publicActions: ['Undock command', 'J Mission Log', 'Take hunter path', 'Track Nav', 'M local map', 'search Rook Nine', 'Track Target', 'O contacts', 'Tab target', 'MMB pursue', 'Space brake after first hit', 'Continue from recovery berth'],
  };
}

async function acquireAuthoredMissionHostile(page, authoredMission, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450);
    last = await page.evaluate(async () => {
      const { isHostileToPlayer } = await import('/src/systems/scanner.js');
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(state.player.targetId);
      return {
        sectorId: state.world?.currentSectorId || null,
        playerAlive: player?.alive !== false && Number(player?.hull || 0) > 0,
        targetId: target?.id || null,
        targetName: target?.data?.callsign || target?.data?.name || target?.type || null,
        targetTeam: target?.team ?? null,
        targetMissionId: target?.data?.missionId || target?.data?.missionTag || null,
        hostile: !!(target && isHostileToPlayer(target, player.team, state)),
        distance: target ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
        contactsVisible: [...document.querySelectorAll('.sf-overview-row')]
          .filter((el) => getComputedStyle(el).display !== 'none').length,
      };
    });
    assert.equal(last.playerAlive, true, `player died before public hostile lock: ${JSON.stringify(last)}`);
    if (last.hostile && String(last.targetId) === String(authoredMission.targetId)
      && String(last.targetMissionId) === String(authoredMission.id)) return last;
    await page.waitForTimeout(550);
  }
  throw new Error(`Warranted mission hostile did not enter public targeting range within ${timeoutMs} ms; mission=${JSON.stringify(authoredMission)} last=${JSON.stringify(last)}`);
}

async function pointerClick(page, locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await locator.boundingBox();
  assert(box && box.width > 2 && box.height > 2, `${label} must expose a visible pointer target`);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
}

async function mediaReceipt(path) {
  const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
  return {
    path: relativePath(path),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  };
}

function worktreeId() {
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim() || 'detached';
  const hash = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return `${branch}@${hash}+dirty`;
}

function relativePath(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/');
}

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function startServer() {
  for (let port = 8970; port < 9040; port++) {
    if (!(await isPortFree(port))) continue;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    const baseUrl = `http://127.0.0.1:${port}/`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode != null) throw new Error(`M3 public-route server exited early\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return { child, baseUrl };
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    child.kill();
  }
  throw new Error('No free M3 public-route Browser proof port');
}

async function stopOwnedServer({ child, baseUrl }) {
  if (child.exitCode == null && child.signalCode == null) child.kill();
  await new Promise((done) => {
    if (child.exitCode != null || child.signalCode != null) return done();
    const timer = setTimeout(done, 5_000);
    child.once('exit', () => { clearTimeout(timer); done(); });
  });
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(250) });
    throw new Error(`owned M3 public-route server remained reachable: ${baseUrl}`);
  } catch (error) {
    if (/remained reachable/.test(String(error))) throw error;
  }
}

async function isServerReachable(baseUrl) {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function isColdReloadBlobAbort(issue) {
  const text = String(issue?.text || '');
  return /^Request failed blob:.*net::ERR_ABORTED$/i.test(text)
    || /^THREE\.GLTFLoader: Couldn't load texture blob:/i.test(text);
}

function isPortFree(port) {
  return new Promise((done) => {
    const probe = createNetServer();
    probe.once('error', () => done(false));
    probe.once('listening', () => probe.close(() => done(true)));
    probe.listen(port, '127.0.0.1');
  });
}
