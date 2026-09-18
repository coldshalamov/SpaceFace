#!/usr/bin/env node
// M3 player-facing acceptance — canonical Browser routes.
//
// Route A proves the public title -> New Game -> ordinary flight -> map waypoint -> physical dock
// chain, then opens Outfitting and verifies its hover preview against the canonical engineering
// presenter. From that same run it uses the visible Undock command, takes the authored Hunter
// origin through Mission Log, tracks its named Yard Perimeter Writ through the public map, and
// captures readable natural damage from the warranted quarry. The probationary mark cannot kill a
// passive starter ship by design, so the death leg uses the other ordinary-combat path the same
// sector offers: fly home on the public waypoint, fire on Helios Station inside its lawful
// protection volume, and let CONTROL's dispatched patrol produce the kill — then the after-action
// receipt and recovery run unchanged. Route B independently proves intentional gate travel plus a
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
  // Install the combat/law observer before the baseline route starts so a death anywhere on the
  // public path — including the autopilot approach, which can kill the player before the hunter
  // leg's own install runs — leaves evidence of what fired, hit, and dispatched. Observer only:
  // it records bus traffic and never mutates gameplay state.
  await baselinePage.evaluate(() => {
    if (window.__M3_DAMAGE_OBSERVER__) return;
    window.__M3_DAMAGE_OBSERVER__ = { playerHits: [], outgoingHits: [], deaths: [], respawns: [], lawIncidents: [], fires: [] };
    window.SF.bus.on('combat:fire', (payload) => {
      if (payload?.ownerId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.fires.push({ atTick: window.SF.state.tick });
      }
    });
    window.SF.bus.on('combat:damage', (payload) => {
      if (payload?.targetId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.playerHits.push({ ...payload, atTick: window.SF.state.tick });
      }
      if (payload?.attackerId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.outgoingHits.push({ ...payload, atTick: window.SF.state.tick });
      }
    });
    window.SF.bus.on('player:death', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.deaths.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('player:respawn', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.respawns.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('law:incidentOpened', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.lawIncidents.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('law:dispatchStarted', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.lawIncidents.push({ ...payload, event: 'dispatch', atTick: window.SF.state.tick });
    });
  });
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
    issues: travelIssues,
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
      'Damage comes from the authored Hunter Yard Perimeter Writ: Mission Log posts Rook Nine as a mission-owned hostile outside Helios sanctuary, then the player uses Track Nav, Local Map, Tab targeting, MMB pursuit, and a Digit0 brake only after the first natural hit.',
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

  const slot = station.locator('.sx-hardpoint[data-spatial-slot]').first();
  await slot.waitFor({ state: 'visible', timeout: 20_000 });
  const slotBox = await slot.boundingBox();
  assert(slotBox && slotBox.width > 2 && slotBox.height > 2, 'Shipworks loadout slot must expose a pointer target');
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  // A fresh pilot cannot afford and has not researched most modules, so nearly every chooser row
  // renders `is-locked` (buy disabled). Locked rows still preview on hover — that is the surface
  // this gate exercises — so only the equipped row is excluded (its delta is the trivial no-op).
  const row = station.locator('.sx-modrow[data-preview-module]:not(.is-eq)').first();
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
  // Departure readiness: a flagged state (low munitions, unreviewed cargo, …) opens the review
  // pop instead of undocking directly — the public path continues through its primary verb.
  const popLaunch = page.locator('[data-pop-launch]');
  if (await popLaunch.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
    await pointerClick(page, popLaunch, 'Launch anyway');
  }
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.mode === 'flight' && state?.ui?.docked !== true
      && !!state.entities?.get?.(state.playerId)
      && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 30_000 });

  await page.evaluate(() => {
    if (window.__M3_DAMAGE_OBSERVER__) return;
    window.__M3_DAMAGE_OBSERVER__ = { playerHits: [], outgoingHits: [], deaths: [], respawns: [], lawIncidents: [], fires: [] };
    window.SF.bus.on('combat:fire', (payload) => {
      if (payload?.ownerId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.fires.push({ atTick: window.SF.state.tick });
      }
    });
    window.SF.bus.on('combat:damage', (payload) => {
      if (payload?.targetId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.playerHits.push({ ...payload, atTick: window.SF.state.tick });
      }
      if (payload?.attackerId === window.SF.state.playerId) {
        window.__M3_DAMAGE_OBSERVER__.outgoingHits.push({ ...payload, atTick: window.SF.state.tick });
      }
    });
    window.SF.bus.on('player:death', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.deaths.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('player:respawn', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.respawns.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('law:incidentOpened', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.lawIncidents.push({ ...payload, atTick: window.SF.state.tick });
    });
    window.SF.bus.on('law:dispatchStarted', (payload) => {
      window.__M3_DAMAGE_OBSERVER__.lawIncidents.push({ ...payload, event: 'dispatch', atTick: window.SF.state.tick });
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

  // The stage renders only the focused mission's verbs, and focus persists on whatever was
  // selected before the writ posted (a fresh pilot still holds the seeded starter contract).
  // The public path: click the writ's list row, then its stage card exposes Track.
  const writRow = missionLog.locator(`.k-row[data-id="${authoredMission.id}"]`);
  await writRow.waitFor({ state: 'visible', timeout: 20_000 });
  await pointerClick(page, writRow, authoredMission.title);
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
  // Bus-level witness for the click chain: a Track press that never emits ui:setCourse (button
  // side) looks identical downstream to one whose payload nav rejected (world side). The failure
  // dump needs to know which half failed, so count emissions before the first click.
  await page.evaluate(() => {
    window.__M3_TRACK_DEBUG__ = { courses: [] };
    window.SF.bus.on('ui:setCourse', (payload) => {
      window.__M3_TRACK_DEBUG__.courses.push({
        type: payload?.type || null, label: payload?.label || null,
        targetEntityId: payload?.targetEntityId ?? null,
        pos: payload?.pos ? { x: Math.round(payload.pos.x), z: Math.round(payload.pos.z) } : null,
        autopilot: payload?.autopilot ?? null,
      });
    });
  });
  await pointerClick(page, trackTarget, 'Track Target');
  // The quarry is a respawnable mission target: lawful patrols can kill it while the route is
  // still in the station, and missions respawns the same storyTarget on a fresh entity id.
  // authoredMission.targetId captured the FIRST spawn's id — gate on live mission ownership
  // (targetEntityIds) instead of the stale snapshot so a respawn cannot wedge the route.
  const autopilotTracksQuarry = (missionId) => {
    const state = window.SF?.state;
    const nav = state?.nav;
    const mission = (state?.missions?.active || [])
      .find((item) => String(item?.id) === String(missionId));
    const liveIds = (mission?.targetEntityIds || []).map(String);
    return nav?.autopilot?.active === true
      && liveIds.includes(String(nav.autopilot.targetEntityId))
      && /Rook Nine/i.test(String(nav.autopilot.label || ''));
  };
  let trackArmed = await page.waitForFunction(autopilotTracksQuarry, authoredMission.id, { timeout: 8_000 })
    .then(() => true, () => false);
  if (!trackArmed) {
    // A click whose inspector re-rendered under the pointer, or one swallowed by the focus
    // handoff, reads exactly like a Track that never armed: a real player clicks again.
    await pointerClick(page, trackTarget, 'Track Target (retry)');
    trackArmed = await page.waitForFunction(autopilotTracksQuarry, authoredMission.id, { timeout: 10_000 })
      .then(() => true, () => false);
  }
  assert(trackArmed === true,
    'Track Target must arm the public autopilot onto the live mission quarry: '
      + JSON.stringify(await page.evaluate((missionId) => {
        const state = window.SF?.state;
        const nav = state?.nav;
        const mission = (state?.missions?.active || [])
          .find((item) => String(item?.id) === String(missionId));
        return {
          autopilot: nav?.autopilot ? {
            active: nav.autopilot.active, label: nav.autopilot.label,
            targetEntityId: nav.autopilot.targetEntityId, status: nav.autopilot.status,
          } : null,
          navWaypoint: nav?.waypoint ? { kind: nav.waypoint.kind, label: nav.waypoint.label } : null,
          coursesEmitted: (window.__M3_TRACK_DEBUG__?.courses || []).slice(-4),
          // The click handler resolves THIS object, not the painted inspector: if it is null or
          // kind-swapped at click time the emit silently skips while the button still reads armed.
          selectedTarget: (() => {
            const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
            const t = def && def._selectedTarget;
            return t ? { kind: t.kind || null, name: t.name || null,
              entityId: t.entityId ?? null, targetEntityId: t.targetEntityId ?? null,
              x: Number.isFinite(t.x) ? Math.round(t.x) : null,
              z: Number.isFinite(t.z) ? Math.round(t.z) : null,
              courseDisabled: t.courseDisabled === true } : (def ? 'null' : 'no-screen');
          })(),
          activeScreenId: window.SF?.ctx?.screenManager?.getActiveScreenDef?.()?.id || null,
          missionTargets: (mission?.targetEntityIds || []).map(String),
          missionStatus: mission?.status || null,
          buttonText: document.querySelector('#gm-set-course-btn')?.textContent?.trim() || null,
          buttonHidden: document.querySelector('#gm-set-course-btn')?.hidden ?? null,
          buttonDisabled: document.querySelector('#gm-set-course-btn')?.disabled ?? null,
          clickInterceptor: (() => {
            const btn = document.querySelector('#gm-set-course-btn');
            if (!btn) return 'no-button';
            const rect = btn.getBoundingClientRect();
            if (!(rect.width > 0 && rect.height > 0)) return 'no-rect';
            const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            if (top === btn || btn.contains(top)) return null;
            return top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${top.className}` : 'none';
          })(),
        };
      }, authoredMission.id).catch((e) => ({ evalError: String(e && e.message || e) }))));
  await galaxyMap.waitFor({ state: 'hidden', timeout: 10_000 });
  await canvas.focus();
  await page.keyboard.press('KeyO');

  const hostile = await acquireAuthoredMissionHostile(page, authoredMission, 150_000);
  assert.equal(hostile.hostile, true, `public Tab must lock the warranted hostile: ${JSON.stringify(hostile)}`);
  await page.keyboard.press('KeyG');
  await page.waitForFunction((missionId) => {
    const state = window.SF?.state;
    const mission = (state?.missions?.active || [])
      .find((item) => String(item?.id) === String(missionId));
    const liveIds = (mission?.targetEntityIds || []).map(String);
    return state?.input?.autoFire === true
      && liveIds.includes(String(state?.player?.targetId));
  }, authoredMission.id, { timeout: 10_000 });

  // Poll the readable-damage wait instead of blocking blind: the timeout alone cannot
  // distinguish a passive quarry, a pursuit that never closed, or a quarry the player's own
  // autoFire killed before it landed a hit. Sample the hunt state so a timeout names the cause.
  const huntSamples = [];
  const huntDeadline = Date.now() + DAMAGE_TIMEOUT_MS;
  let huntReady = false;
  while (Date.now() < huntDeadline && !huntReady) {
    const sample = await page.evaluate((missionId) => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state.playerId);
      const mission = (state?.missions?.active || [])
        .find((item) => String(item?.id) === String(missionId));
      const quarry = (mission?.targetEntityIds || [])
        .map((id) => state?.entities?.get?.(id)).find((entity) => entity) || null;
      return {
        t: Math.round(state?.simTime || 0),
        playerHits: window.__M3_DAMAGE_OBSERVER__?.playerHits?.length || 0,
        quarry: quarry ? {
          alive: quarry.alive !== false,
          hull: Number(quarry.hull || 0),
          dist: player?.pos ? Math.round(Math.hypot(quarry.pos.x - player.pos.x, quarry.pos.z - player.pos.z)) : null,
        } : null,
        autopilot: state?.nav?.autopilot ? {
          active: state.nav.autopilot.active, status: state.nav.autopilot.status,
        } : null,
        playerVitals: player ? {
          shield: Number(player.shield || 0), hull: Number(player.hull || 0), alive: player.alive !== false,
        } : null,
        marker: [...document.querySelectorAll('.sf-dmgind-marker')].some((marker) => {
          const style = getComputedStyle(marker);
          const glyph = String(marker.querySelector('.sf-dmgind-marker__layer')?.textContent || '').trim();
          return style.display !== 'none' && Number(style.opacity) > 0.05 && /^[SAH]$/.test(glyph);
        }),
      };
    }, authoredMission.id);
    huntSamples.push(sample);
    if (sample.playerHits > 0 && sample.marker) {
      huntReady = true;
      break;
    }
    if (sample.quarry && sample.quarry.alive === false && sample.playerHits <= 0) {
      break;
    }
    await page.waitForTimeout(5_000);
  }
  assert(huntReady, `readable natural damage never arrived: ${JSON.stringify(huntSamples.slice(-8))}`);
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

  // The probationary writ deliberately fields a single weakest-tier wasp: enough for the readable
  // damage readout above, but its ~1.65 effective shield damage per hit cannot out-damage the
  // Hitch's regeneration — a legal interception mark is authored to be beaten BY the player, not
  // to kill a passive one. The death half of this route uses the other ordinary-combat path Helios
  // already provides: its starter protection volume makes a witnessed hit on the station a lawful
  // assault, CONTROL dispatches patrol lawmen, and their response is an ordinary-combat kill. Every
  // step stays on public controls — map search, Set Waypoint, autopilot, brake, cursor aim, LMB —
  // with no health, velocity, damage, or AI state writes.
  const autoFireOn = await page.evaluate(() => window.SF?.state?.input?.autoFire === true);
  if (autoFireOn) {
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.SF?.state?.input?.autoFire === false, null, { timeout: 5_000 });
  }

  const stationRef = await page.evaluate(() => {
    const state = window.SF.state;
    for (const e of state.entities.values()) {
      if (e && e.type === 'station' && e.alive !== false
        && (e.data?.stationId === 'station_helios' || e.stationId === 'station_helios')) {
        return { id: e.id, pos: { x: Number(e.pos.x), z: Number(e.pos.z) }, radius: Number(e.radius || 0) };
      }
    }
    return null;
  });
  assert(stationRef, 'Helios Station entity must exist for the lawful-assault death leg');

  await canvas.focus();
  await page.keyboard.press('KeyM');
  await galaxyMap.waitFor({ state: 'visible', timeout: 20_000 });
  await page.keyboard.press('/');
  const homeSearchFocused = await page.waitForFunction(
    () => document.activeElement?.matches('.gm-search-input') === true,
    null,
    { timeout: 1_000 },
  ).then(() => true, () => false);
  if (!homeSearchFocused) await pointerClick(page, galaxyMap.locator('.gm-search-input'), 'local-map search');
  // The map screen caches the previous search — clear before typing so the station query is exact.
  await galaxyMap.locator('.gm-search-input').fill('');
  await page.keyboard.type('Helios Station');
  await galaxyMap.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Enter');
  const homeWaypoint = galaxyMap.locator('#gm-set-course-btn');
  await homeWaypoint.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match((await homeWaypoint.innerText()).trim(), /Set Waypoint|Track Target/i,
    'local-map station inspector must expose a public flight-computer action');
  await pointerClick(page, homeWaypoint, 'Set Waypoint — Helios Station');
  await page.waitForFunction(() => {
    const nav = window.SF?.state?.nav;
    return nav?.autopilot?.active === true && /Helios Station/i.test(String(nav.autopilot.label || ''));
  }, null, { timeout: 10_000 });
  await galaxyMap.waitFor({ state: 'hidden', timeout: 10_000 });
  await canvas.focus();

  // Ride the public autopilot back inside the station's weapon envelope, then take the dedicated
  // Digit0 brake (disarms the flight computer and holds the ship in place — exempt from the
  // above-cap earned-momentum settle cutoff, so return speed and any hit impulse get spent).
  await page.waitForFunction((stationId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const station = state?.entities?.get?.(stationId);
    if (!player?.pos || !station?.pos) return false;
    return Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z) < 500;
  }, stationRef.id, { timeout: 180_000 });
  await page.keyboard.down('Digit0');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    return state?.flight?.mode === 'manual' && player?.vel
      && Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) < 20;
  }, null, { timeout: 30_000 });

  // Aim the real cursor at the station's projected screen position and hold LMB — the public
  // trigger. One landed round on a lawful hull inside its own jurisdiction is a witnessed
  // assault: lawSecurity opens a player_assault incident and CONTROL dispatches the patrol.
  // aimAngle only carries a bearing, so when the hull projects off-screen the cursor rides a
  // nearer point on the same player->station bearing instead. input.js drops any mousedown whose
  // DOM target is a HUD element rather than the canvas, so a candidate must also elementFromPoint
  // onto bare canvas before it is usable.
  const aimAtStationBearing = (stationId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const station = state?.entities?.get?.(stationId);
    const project = window.SF?.helpers?.worldToScreen;
    const canvas = document.getElementById('gl-canvas');
    if (!player?.pos || !station?.pos || typeof project !== 'function' || !canvas) return null;
    const dx = station.pos.x - player.pos.x;
    const dz = station.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    for (const leg of [dist, Math.min(260, dist * 0.6), Math.min(180, dist * 0.4), Math.min(120, dist * 0.25), Math.min(60, dist * 0.1), Math.min(30, dist * 0.05)]) {
      const out = project({ x: player.pos.x + (dx / dist) * leg, y: 0, z: player.pos.z + (dz / dist) * leg });
      if (!out || out.onScreen !== true || !Number.isFinite(out.x) || !Number.isFinite(out.y)) continue;
      const top = document.elementFromPoint(out.x, out.y);
      if (top === canvas || canvas.contains(top)) return { x: out.x, y: out.y };
    }
    return null;
  };
  const stationScreen = await page.evaluate(aimAtStationBearing, stationRef.id);
  assert(stationScreen, `station bearing must project onto bare canvas for cursor aim: ${JSON.stringify(stationRef)}`);
  await page.mouse.move(Math.round(stationScreen.x), Math.round(stationScreen.y));
  await page.mouse.down();
  // The incident is the real gate, not a hit on the station hull itself: any landed round on a
  // lawful target inside the bubble (station, patrol, or traffic caught in the line of fire)
  // opens player_assault/player_piracy. Holding LMB through the death watch is also the honest
  // posture — sustained assault keeps lastDamageAt fresh and catches crossing responders.
  //
  // The hold is supervised, not blind: input.js drops a mousedown whose DOM target is a HUD
  // element rather than the canvas, and a single dropped press would otherwise read as 90 s of
  // firing with zero rounds. While no incident is open and no player combat:fire has been
  // observed since the last press, release and re-press the public trigger.
  let assaultIncident = null;
  let triggerPresses = 1;
  const assaultDeadline = Date.now() + 90_000;
  let lastFireCount = 0;
  while (Date.now() < assaultDeadline) {
    assaultIncident = await page.evaluate(() => {
      const incidents = window.__M3_DAMAGE_OBSERVER__?.lawIncidents || [];
      return incidents.find((entry) => /player_assault|player_piracy/.test(String(entry?.cause || ''))) || null;
    });
    if (assaultIncident) break;
    const fireCount = await page.evaluate(() => window.__M3_DAMAGE_OBSERVER__?.fires?.length || 0);
    if (fireCount <= lastFireCount) {
      await page.mouse.up().catch(() => {});
      await page.mouse.down();
      triggerPresses += 1;
    }
    lastFireCount = Math.max(lastFireCount, fireCount);
    await page.waitForTimeout(3_000);
  }
  await page.mouse.up().catch(() => {});
  assert(assaultIncident,
    `firing on the station inside its lawful jurisdiction must open a CONTROL incident ` +
    `(trigger pressed ${triggerPresses}x, ${lastFireCount} player rounds observed)`);
  await page.mouse.down();

  // Poll rather than a bare waitFor: if the response never engages (no dispatch, responders
  // outranged, player carried away) a single end-state dump cannot say which. The ring buffer
  // keeps the transition itself.
  //
  // The lethality budget is a SIM budget, not a wall one: a throttled page stretches wall time
  // without giving the response more sim seconds to work. The observed lawful kill takes ~140 s
  // of sim (dispatch → responder transit → shield grind → hull); 15 000 ticks (~250 s sim)
  // covers it with margin while still failing a response that never engages. The wall deadline
  // stays only as a backstop for a page whose sim has stopped entirely.
  const DEATH_WATCH_SIM_TICKS = 15_000;
  const deathWatch = [];
  let gameOverShown = false;
  let watchStartTick = null;
  let watchSimElapsed = 0;
  let watchFireCount = null;
  let watchFireStall = 0;
  let watchPresses = 0;
  const deathDeadline = Date.now() + 600_000;
  while (Date.now() < deathDeadline && watchSimElapsed < DEATH_WATCH_SIM_TICKS) {
    gameOverShown = await page.locator('[data-screen="gameOver"]').isVisible().catch(() => false);
    if (gameOverShown) break;
    const sample = await page.evaluate((stationId) => {
      const state = window.SF?.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      const station = state && state.entities && state.entities.get(stationId);
      let responders = 0;
      if (state && state.entities && typeof state.entities.values === 'function') {
        for (const e of state.entities.values()) {
          const ai = e && e.data && e.data.ai;
          if (e && e.alive !== false && ai && (ai.spawnContext === 'security_response'
            || ai.motive === 'jurisdiction_enforcement' || ai.motive === 'self_defense')) responders++;
        }
      }
      return {
        tick: state?.tick ?? null,
        mode: state?.flight?.mode ?? null,
        speed: player && player.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : null,
        shield: player ? Number(player.shield || 0) : null,
        hull: player ? Number(player.hull || 0) : null,
        stationDist: player && station ? Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z) : null,
        incidents: (window.__M3_DAMAGE_OBSERVER__?.lawIncidents || []).length,
        responders,
        incomingHits: (window.__M3_DAMAGE_OBSERVER__?.playerHits || []).length,
        fires: (window.__M3_DAMAGE_OBSERVER__?.fires || []).length,
        inputFire: state?.input ? !!state.input.fire : null,
      };
    }, stationRef.id).catch((e) => ({ error: String(e && e.message || e) }));
    if (Number.isInteger(sample && sample.tick)) {
      if (watchStartTick == null) watchStartTick = sample.tick;
      watchSimElapsed = sample.tick - watchStartTick;
    }
    deathWatch.push(sample);
    if (deathWatch.length > 40) deathWatch.shift();
    // The same dropped-mousedown hazard as the assault-trigger loop: a press whose DOM target
    // silently became a HUD element reads as a held trigger that fires nothing — the assault
    // goes stale, CONTROL stands the response down, and the ship regens untouched. When the
    // player's own combat:fire stream stalls for a few samples, release, ride a fresh
    // canvas-clear point on the station bearing, and press again — what a player does when
    // they notice the trigger isn't shooting.
    if (Number.isInteger(sample && sample.fires)) {
      if (watchFireCount == null || sample.fires > watchFireCount) {
        watchFireCount = sample.fires;
        watchFireStall = 0;
      } else {
        watchFireStall += 1;
      }
      if (watchFireStall >= 4) {
        await page.mouse.up().catch(() => {});
        const reaim = await page.evaluate(aimAtStationBearing, stationRef.id).catch(() => null);
        if (reaim) await page.mouse.move(Math.round(reaim.x), Math.round(reaim.y));
        await page.mouse.down();
        watchPresses += 1;
        watchFireStall = 0;
      }
    }
    await page.waitForTimeout(1_000);
  }
  await page.keyboard.up('Digit0');
  await page.mouse.up().catch(() => {});
  try {
    assert.equal(gameOverShown, true, 'player death route never surfaced gameOver');
  } catch (err) {
    // The death route is the assertion under test — a timeout needs the law-response state at
    // expiry: did the assault open an incident, did CONTROL dispatch, did responders reach and
    // out-damage a braking starter ship?
    const lastCombat = await page.evaluate(async ({ quarryId, missionId, stationId }) => {
      const state = window.SF?.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      const target = state && state.entities && state.entities.get(state.player && state.player.targetId);
      const hits = (window.__M3_DAMAGE_OBSERVER__ && window.__M3_DAMAGE_OBSERVER__.playerHits) || [];
      const lastHit = hits.at(-1) || null;
      const ai = target && target.data && target.data.ai;
      const strip = (value) => {
        try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
      };
      const inspectEntity = (id) => {
        if (id == null || !window.SF?.helpers || typeof window.SF.helpers.inspectAI !== 'function') return null;
        try {
          const envelope = window.SF.helpers.inspectAI({ entityId: id });
          const raw = envelope && envelope.result ? envelope.result : envelope;
          const lastDecision = raw && raw.lastResult && Array.isArray(raw.lastResult.decisions)
            ? raw.lastResult.decisions.find((d) => d && d.entityId === id) || null
            : null;
          const squads = raw && raw.squads && typeof raw.squads === 'object' ? raw.squads : null;
          return raw ? strip({
            tick: raw.tick,
            perception: raw.perception || null,
            behavior: raw.behavior || null,
            maneuver: raw.maneuver || null,
            combatDoctrine: raw.combatDoctrine || null,
            squads: squads && !Array.isArray(squads) ? Object.keys(squads) : squads,
            lastDecision: lastDecision ? {
              directive: lastDecision.directive || null,
              action: lastDecision.action || null,
              combatDoctrine: lastDecision.combatDoctrine || null,
            } : null,
          }) : null;
        } catch (e) { return { error: String(e && e.message || e) }; }
      };
      let authorization = null;
      let protection = null;
      try {
        const mod = await import('/src/ai/engagementAuthority.js');
        protection = target && player ? mod.protectedStationAt(state, player) : null;
        authorization = target && player ? {
          strike: mod.authorizeAIEngagement({
            state, self: target, target: player,
            objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
          }),
          ingress: mod.authorizeAIEngagement({
            state, self: target, target: player,
            objectiveReason: 'combat_doctrine:interceptor_flyby:ingress',
          }),
        } : null;
      } catch (e) { authorization = { error: String(e && e.message || e) }; }
      const describeEntity = (e) => e ? {
        id: e.id, type: e.type, name: e.data && (e.data.displayName || e.data.name || e.data.enemyTypeId) || null,
        alive: e.alive !== false && Number(e.hull || 0) > 0,
        vitals: { shield: e.shield, armor: e.armor, hull: e.hull },
        pos: e.pos ? { x: Math.round(e.pos.x), z: Math.round(e.pos.z) } : null,
        vel: e.vel ? { x: +e.vel.x.toFixed(1), z: +e.vel.z.toFixed(1) } : null,
        dist: player && e.pos ? Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) : null,
        intent: e.data && e.data.intent || null,
        simTier: e.activity && e.activity.simTier || null,
        ai: e.data && e.data.ai ? {
          activity: e.data.ai.activity || null, roe: e.data.ai.roe || null,
          motive: e.data.ai.motive || null, passive: e.data.ai.passive ?? null,
          combatDoctrineId: e.data.ai.combatDoctrineId || null, zoneId: e.data.ai.zoneId || null,
        } : null,
        inspect: inspectEntity(e.id),
      } : null;
      return {
        mode: state && state.mode,
        playerAlive: player && player.alive !== false,
        vitals: player ? { shield: player.shield, armor: player.armor, hull: player.hull } : null,
        playerSpeed: player && player.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : null,
        playerPos: player && player.pos ? { x: Math.round(player.pos.x), z: Math.round(player.pos.z) } : null,
        lawIncidents: (window.__M3_DAMAGE_OBSERVER__?.lawIncidents || []).slice(-8),
        stationHits: (window.__M3_DAMAGE_OBSERVER__?.outgoingHits || [])
          .filter((h) => String(h?.targetId) === String(stationId)).length,
        targetId: target && target.id,
        targetAlive: target ? target.alive !== false && Number(target.hull || 0) > 0 : null,
        targetVitals: target ? { shield: target.shield, armor: target.armor, hull: target.hull } : null,
        targetDist: target && player ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
        targetPos: target && target.pos ? { x: Math.round(target.pos.x), z: Math.round(target.pos.z) } : null,
        targetVel: target && target.vel ? { x: +target.vel.x.toFixed(1), z: +target.vel.z.toFixed(1) } : null,
        targetRot: target && typeof target.rot === 'number' ? +target.rot.toFixed(2) : null,
        quarry: (() => {
          const mission = (state.missions?.active || [])
            .find((item) => String(item?.id) === String(missionId));
          const liveId = mission?.targetEntityIds?.[0] ?? quarryId;
          return liveId == null ? null
            : describeEntity((target && target.id === liveId) ? target : state.entities.get(liveId))
              || { id: liveId, missing: true };
        })(),
        targetAi: ai ? {
          activity: ai.activity || null, roe: ai.roe || null, motive: ai.motive || null,
          engagementTrigger: ai.engagementTrigger || null, combatDoctrineId: ai.combatDoctrineId || null,
          zoneId: ai.zoneId || null, approachTelegraph: ai.approachTelegraph || null,
          noFireResponseWindowS: ai.noFireResponseWindowS ?? null,
          forceFlee: ai.forceFlee ?? null, fsm: ai.fsm || null,
          pirateDisengaged: ai.pirateDisengaged ?? null, motiveSatisfied: ai.motiveSatisfied ?? null,
          passive: ai.passive ?? null, doctrinePhase: ai.doctrinePhase || null,
          combatDoctrine: ai.combatDoctrine ? { phase: ai.combatDoctrine.phase, fireWindow: ai.combatDoctrine.fireWindow } : null,
        } : null,
        targetIntent: target && target.data ? target.data.intent || null : null,
        targetSimTier: target && target.activity ? target.activity.simTier || null : null,
        targetInspect: target ? inspectEntity(target.id) : null,
        // The dispatched responders decide the death leg; when incoming hits freeze after a
        // dispatch, the dump must say whether they stood down passive, chased another offender,
        // or never closed. Resolve the latest player-caused incident's responderIds live.
        responders: (() => {
          const incident = (window.__M3_DAMAGE_OBSERVER__?.lawIncidents || [])
            .filter((item) => item && (item.cause === 'player_assault' || item.cause === 'player_piracy'))
            .pop();
          const ids = (incident && incident.responderIds) || [];
          return ids.map((id) => {
            const e = state.entities.get(id);
            if (!e) return { id, missing: true };
            const eAi = e.data && e.data.ai || {};
            return {
              id,
              name: e.data && (e.data.displayName || e.data.name) || null,
              alive: e.alive !== false,
              dist: player && e.pos ? Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)) : null,
              speed: e.vel ? Math.round(Math.hypot(e.vel.x || 0, e.vel.z || 0)) : null,
              passive: eAi.passive ?? null,
              roe: eAi.roe || null,
              motive: eAi.motive || null,
              motiveSatisfied: eAi.motiveSatisfied ?? null,
              activity: eAi.activity ? { kind: eAi.activity.kind, reason: eAi.activity.reason,
                targetId: eAi.activity.targetId ?? null } : null,
              intent: e.data && e.data.intent
                ? { fire: e.data.intent.fire === true, boost: e.data.intent.boost === true,
                    moveX: +(e.data.intent.moveX || 0).toFixed(2), moveZ: +(e.data.intent.moveZ || 0).toFixed(2) }
                : null,
            };
          });
        })(),
        authorization,
        protection: protection ? { stationId: protection.stationId, radius: protection.radius } : null,
        hitCount: hits.length,
        lastHitAt: lastHit && lastHit.atTick,
        simTick: state && state.tick,
        autoFire: state && state.input && state.input.autoFire,
      };
    }, { quarryId: authoredMission && authoredMission.targetId,
         missionId: authoredMission && authoredMission.id, stationId: stationRef.id })
      .catch((evalErr) => ({ evalError: String(evalErr && evalErr.message || evalErr) }));
    assert.fail(`player death route never surfaced gameOver: ${JSON.stringify({ ...lastCombat, deathWatch, watchPresses })}`);
    throw err;
  }
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
    publicActions: ['Undock command', 'J Mission Log', 'Take hunter path', 'Track Nav', 'M local map', 'search Rook Nine', 'Track Target', 'O contacts', 'Tab target', 'MMB pursue', 'M local map', 'search Helios Station', 'Set Waypoint', 'autopilot return', 'Digit0 brake', 'LMB witnessed assault on station', 'CONTROL patrol response', 'Continue from recovery berth'],
  };
}

async function acquireAuthoredMissionHostile(page, authoredMission, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450);
    last = await page.evaluate(async (missionId) => {
      const { isHostileToPlayer } = await import('/src/systems/scanner.js');
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(state.player.targetId);
      // Resolve the quarry from the live mission record each poll — a respawned mark wears a
      // fresh entity id while keeping the same missionTag/storyTarget identity.
      const mission = (state.missions?.active || [])
        .find((item) => String(item?.id) === String(missionId));
      const liveQuarryId = mission?.targetEntityIds?.[0] ?? null;
      const quarry = liveQuarryId != null ? state.entities.get(liveQuarryId) : null;
      const autopilot = state.nav && state.nav.autopilot;
      return {
        sectorId: state.world?.currentSectorId || null,
        simTime: Number.isFinite(state.simTime) ? Math.round(state.simTime * 10) / 10 : null,
        playerAlive: player?.alive !== false && Number(player?.hull || 0) > 0,
        playerPos: player?.pos ? { x: Math.round(player.pos.x), z: Math.round(player.pos.z) } : null,
        playerSpeed: player?.vel ? Math.round(Math.hypot(player.vel.x, player.vel.z)) : null,
        quarryPos: quarry?.pos ? { x: Math.round(quarry.pos.x), z: Math.round(quarry.pos.z) } : null,
        quarryAlive: quarry ? quarry.alive !== false : null,
        quarryName: quarry?.data?.name || quarry?.data?.callsign || quarry?.type || null,
        quarryMissionId: quarry?.data?.missionId || quarry?.data?.missionTag || null,
        quarrySpeed: quarry?.vel ? Math.round(Math.hypot(quarry.vel.x, quarry.vel.z)) : null,
        quarryDist: (player?.pos && quarry?.pos)
          ? Math.round(Math.hypot(player.pos.x - quarry.pos.x, player.pos.z - quarry.pos.z)) : null,
        liveQuarryId,
        autopilot: autopilot
          ? { active: autopilot.active === true, targetEntityId: autopilot.targetEntityId ?? null }
          : null,
        targetId: target?.id || null,
        targetName: target?.data?.callsign || target?.data?.name || target?.type || null,
        targetTeam: target?.team ?? null,
        targetMissionId: target?.data?.missionId || target?.data?.missionTag || null,
        hostile: !!(target && isHostileToPlayer(target, player.team, state)),
        distance: target ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
        contactsVisible: [...document.querySelectorAll('.sf-overview-row')]
          .filter((el) => getComputedStyle(el).display !== 'none').length,
      };
    }, authoredMission && authoredMission.id != null ? authoredMission.id : null);
    assert.equal(last.playerAlive, true, `player died before public hostile lock: ${JSON.stringify(last)}`);
    // The warranted hostile is whoever the mission currently owns — missionTag is stamped on
    // respawn too, so ownership survives entity-id churn that a first-spawn snapshot cannot.
    if (last.hostile && String(last.targetMissionId) === String(authoredMission.id)) return last;
    if (Math.floor((deadline - Date.now()) / 1000) % 20 === 0) {
      console.log('[route] hunt-acquire', JSON.stringify(last));
    }
    await page.waitForTimeout(550);
  }
  throw new Error(`Warranted mission hostile did not enter public targeting range within ${timeoutMs} ms; mission=${JSON.stringify(authoredMission)} last=${JSON.stringify(last)}`);
}

async function pointerClick(page, locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  // A control nested inside the chart inspector's own scroll band (or below the column's fold)
  // reports a visible bounding box while its pixels belong to whatever is painted on top —
  // Playwright's box is layout, not hit-testing. Scroll it into view exactly as a player
  // would before committing the pointer.
  await locator.scrollIntoViewIfNeeded().catch(() => {});
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
