#!/usr/bin/env node
// Live player-route acceptance for Phase B1/B2 outpost production + world presence.
//
// The probe enters a real new game through the event used by the menu, then uses the visible
// Pause -> Operations route. It grants test funds and
// unlocks the logistics research nodes only to reach the feature without hours of progression;
// construction itself still goes through the visible Operations control and ui:fleetOrder intent.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOT_DIR = '.devshots/acceptance/automation-outpost';
const START_TIMEOUT_MS = 120_000;
const AUTHORED_TIMEOUT_MS = 45_000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
const startedAt = Date.now();
const timings = {};

try {
  server = await startFreshServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const issues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  mark('navigate');
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'probe must use the canonical player URL');
  await page.waitForFunction(
    () => window.SF && window.SF.state && window.SF.bus && window.SF.ctx,
    null,
    { timeout: 30_000 },
  );
  await waitForBootOverlayGone(page);
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Automation Outpost Live Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player);
  }, null, { timeout: START_TIMEOUT_MS });
  const playerEntry = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return { alive: player.alive, hull: player.hull, hullMax: player.hullMax, type: player.type };
  });
  assert.notEqual(playerEntry.alive, false, `player should be live after new-game entry: ${JSON.stringify(playerEntry)}`);
  mark('flight-ready');

  await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.player;
    const researched = new Set(player.researchedNodes || []);
    for (const id of ['tech_drone_swarm', 'tech_autonomous_fleets', 'tech_outpost_charter']) researched.add(id);
    player.researchedNodes = [...researched];
    player.droneTierCap = Math.max(3, Number(player.droneTierCap) || 1);
    sf.bus.emit('economy:grantCredits', { amount: 1_000_000, reason: 'qa:outpost-live-probe' });
  });

  // Build through the visible Pause -> Operations -> Outposts route.
  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="outposts"]').click();
  const buildRefinery = page.locator(
    '#sf-automation button[data-act="buildOutpost"][data-ref="outpost_refinery"]',
  );
  await buildRefinery.scrollIntoViewIfNeeded();
  assert.equal(await buildRefinery.isEnabled(), true, 'Refinery build control should be enabled');
  await buildRefinery.click();
  await page.waitForFunction(
    () => window.SF.state.automation.outposts.some((o) => o && o.defId === 'outpost_refinery'),
    null,
    { timeout: 10_000 },
  );
  mark('refinery-built');

  await closeOperationsAndResume(page);
  await page.waitForTimeout(700);
  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="outposts"]').click();
  await waitForOutpostState(page, 'starved');
  const starvedCard = page.locator('#sf-automation .au-card.au-outpost').first();
  await starvedCard.scrollIntoViewIfNeeded();
  const starvedReport = await readOutpostUi(page);
  assert.equal(starvedReport.flowState, 'starved');
  assert.match(starvedReport.status, /Starved: Iron Ore/i);
  assert.match(starvedReport.flowText, /No local feeders detected/i);
  assert.match(starvedReport.flowText, /Iron Ore/i);
  assert.match(starvedReport.flowText, /Alloys/i);
  await page.locator('#sf-automation details[data-outpost-detail] summary').first().click();
  assert.match(
    await page.locator('#sf-automation details[data-outpost-detail][open]').first().innerText(),
    /2 cmdty ore iron.*1 cmdty alloys|2.*Iron.*1.*Alloys/i,
  );
  await page.waitForTimeout(350);
  await shot(page, '01-outpost-starved-1920x1080.png');

  // Add one feeder through the same Operations UI, then give its hold deterministic QA feedstock.
  await closeOperationsAndResume(page);
  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="drones"]').click();
  const buyDrone = page.locator('#sf-automation button[data-act="buyDrone"]').first();
  await buyDrone.scrollIntoViewIfNeeded();
  assert.equal(await buyDrone.isEnabled(), true, 'Mining-drone purchase should be enabled');
  await buyDrone.click();
  await page.waitForFunction(() => window.SF.state.automation.drones.length === 1, null, { timeout: 10_000 });
  await page.evaluate(() => {
    const group = window.SF.state.automation.drones[0];
    group.buffer = Math.max(50, Number(group.buffer) || 0);
    group.fuel = Math.max(100, Number(group.fuel) || 0);
  });
  await closeOperationsAndResume(page);
  await page.waitForTimeout(900);

  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="outposts"]').click();
  await waitForOutpostState(page, 'producing');
  const producingCard = page.locator('#sf-automation .au-card.au-outpost').first();
  await producingCard.scrollIntoViewIfNeeded();
  const producingReport = await readOutpostUi(page);
  assert.equal(producingReport.flowState, 'producing');
  assert.match(producingReport.status, /Producing/i);
  assert.match(producingReport.flowText, /1 local feeder detected/i);
  assert.ok(producingReport.ariaLabel.includes('Input draw:'), 'flow should expose an input summary');
  assert.ok(producingReport.ariaLabel.includes('Output:'), 'flow should expose an output summary');
  assert.ok(producingReport.ariaLabel.includes('Storage'), 'flow should expose storage telemetry');
  await page.locator('#sf-automation details[data-outpost-detail] summary').first().click();
  const openDetails = page.locator('#sf-automation details[data-outpost-detail][open]').first();
  assert.equal(await openDetails.isVisible(), true, 'Facility details should progressively disclose');
  const automationLayout = await readAutomationLayout(page);
  assert.equal(automationLayout.horizontalOverflow, 0, 'Automation panel should not overflow horizontally');
  assert.equal(automationLayout.flowClipped, false, 'Outpost flow should fit its card');
  await page.waitForTimeout(350);
  await shot(page, '02-outpost-producing-1920x1080.png');
  mark('operations-verified');

  await closeOperationsAndResume(page);
  await waitForAuthoredOutpost(page);
  const worldBefore = await page.evaluate(inspectOutpostRuntime);
  assert.equal(worldBefore.ledgerCount, 1, 'Refinery should persist as one ledger record');
  assert.equal(worldBefore.entityCount, 1, 'Current sector should materialize exactly one outpost entity');
  assert.equal(worldBefore.placeId, 'place_claim_outpost_refinery');
  assert.equal(worldBefore.claimSpecId, 'spec_refinery');
  assert.equal(worldBefore.assetState, 'authored', 'world outpost should settle to its authored asset');
  assert.ok(worldBefore.originDistance > 40, 'outpost must not be placed at world origin');
  assert.ok(worldBefore.nearestActivityDistance < 1_000,
    `outpost should be near the player/activity field (distance=${worldBefore.nearestActivityDistance})`);

  // Reframe the already-live world (QA camera setup only) so the authored structure is inspectable.
  await page.evaluate(() => {
    const sf = window.SF;
    const outpost = sf.state.automation.outposts[0];
    const player = sf.state.entities.get(sf.state.playerId);
    player.pos.x = outpost.pos.x;
    player.pos.z = outpost.pos.z - 62;
    if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
    const camera = sf.state.render && sf.state.render.cameraCtrl;
    if (camera && camera.setZoom) camera.setZoom(150);
    if (camera && camera.snapToPlayer) camera.snapToPlayer();
  });
  await page.waitForTimeout(1_500);
  await shot(page, '03-outpost-world-authored-1920x1080.png');

  const lifecycle = await exerciseSectorLifecycle(page);
  assert.equal(lifecycle.away.ledgerCount, 1, 'ledger should persist while away');
  assert.equal(lifecycle.away.entityCount, 0, 'rich outpost presence should be absent while away');
  assert.equal(lifecycle.away.transientEntityId, null, 'away-sector ledger should not retain an entity id');
  assert.equal(lifecycle.returned.ledgerCount, 1, 'return should preserve one ledger record');
  assert.equal(lifecycle.returned.entityCount, 1, 'return should rematerialize exactly one entity');
  assert.equal(lifecycle.returned.ledgerId, lifecycle.before.ledgerId, 'return should preserve ledger identity');
  assert.deepEqual(lifecycle.returned.pos, lifecycle.before.pos, 'return should preserve authored placement');
  // Direct sector entry places the player at that sector's arrival point. Approach the persisted
  // outpost again before requiring the distance-gated authored asset to promote.
  await page.evaluate(() => {
    const sf = window.SF;
    const outpost = sf.state.automation.outposts[0];
    const player = sf.state.entities.get(sf.state.playerId);
    player.pos.x = outpost.pos.x;
    player.pos.z = outpost.pos.z - 62;
    if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
  });
  await waitForAuthoredOutpost(page);
  await page.waitForTimeout(600);
  await shot(page, '04-outpost-returned-1920x1080.png');
  mark('sector-lifecycle-verified');

  // Final station smoke at the compact desktop viewport: B1/B2 must not degrade station chrome.
  const dockedStation = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data && entity.data.stationId && !entity.data.isGate);
    if (!station) return null;
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  assert.ok(dockedStation, 'current sector should contain a dockable station');
  await waitForVisible(page, '[data-screen="station"] .sx-dock', 20_000, 'station command dock');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(500);
  const stationLayout = await readStationLayout(page);
  assert.equal(stationLayout.horizontalOverflow, 0, 'station must not overflow the viewport horizontally');
  assert.equal(stationLayout.navCount, 6, 'station should retain six destinations');
  assert.equal(stationLayout.actionCount, 4, 'station should retain four immediate service actions');
  assert.equal(stationLayout.selectedCount, 1, 'station should retain one selected destination');
  assert.equal(stationLayout.readoutCount, 3, 'station should retain Hull, Fuel, and Hold readouts');
  assert.ok(stationLayout.minReadoutTrackWidth >= 52, 'station status tracks should remain substantial');
  assert.ok(Math.abs(stationLayout.helpWidth - stationLayout.helpHeight) <= 1.5, 'Help control should remain circular');
  await shot(page, '05-station-regression-1366x768.png');
  mark('station-regression-verified');

  const consoleErrors = issues.errorIssues();
  assert.deepEqual(consoleErrors, [], `live route should have no console/page/network errors: ${JSON.stringify(summarizeIssues(consoleErrors))}`);

  const result = {
    url: server.baseUrl,
    viewports: [
      { width: 1920, height: 1080, dpr: 1 },
      { width: 1366, height: 768, dpr: 1 },
    ],
    browserBackend: 'Playwright Chromium (in-app browser unavailable)',
    timingsMs: timings,
    worldBefore,
    starvedReport,
    producingReport,
    automationLayout,
    lifecycle,
    stationLayout,
    warnings: summarizeIssues(issues.warningIssues()),
    ignoredIssues: summarizeIssues(issues.ignoredIssues),
    screenshots: [
      `${SHOT_DIR}/01-outpost-starved-1920x1080.png`,
      `${SHOT_DIR}/02-outpost-producing-1920x1080.png`,
      `${SHOT_DIR}/03-outpost-world-authored-1920x1080.png`,
      `${SHOT_DIR}/04-outpost-returned-1920x1080.png`,
      `${SHOT_DIR}/05-station-regression-1366x768.png`,
    ],
  };
  console.log(`Automation outpost live acceptance OK\n${JSON.stringify(result, null, 2)}`);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

function mark(label) {
  timings[label] = Date.now() - startedAt;
}

async function openOperations(page) {
  await page.evaluate(() => {
    const sm = window.SF.ctx && window.SF.ctx.screenManager;
    if (!sm) throw new Error('missing screen manager');
    sm.pushScreen('pause');
    if (sm.syncVisibility) sm.syncVisibility();
  });
  await waitForVisible(page, '[data-screen="pause"]', 10_000, 'pause menu');
  assert.equal(await clickButton(page, 'Operations'), true, 'Pause menu should expose Operations');
  await waitForVisible(page, '#sf-automation', 10_000, 'Automation screen');
}

async function closeOperationsAndResume(page) {
  await page.locator('#sf-automation .au-close').click();
  await waitForVisible(page, '[data-screen="pause"]', 10_000, 'pause menu after Operations');
  const resumed = await clickButton(page, 'Resume');
  assert.equal(resumed, true, 'Pause menu should expose Resume');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 10_000 });
}

async function waitForOutpostState(page, state) {
  await page.waitForFunction((expected) => {
    const flow = document.querySelector('#sf-automation .au-card.au-outpost .au-outpost-flow');
    return !!flow && flow.dataset.state === expected;
  }, state, { timeout: 10_000 });
}

async function readOutpostUi(page) {
  return page.evaluate(() => {
    const card = document.querySelector('#sf-automation .au-card.au-outpost');
    const flow = card && card.querySelector('.au-outpost-flow');
    const status = card && card.querySelector('.au-operation-status');
    return {
      flowState: flow && flow.dataset.state || null,
      status: status && status.textContent.replace(/\s+/g, ' ').trim() || '',
      flowText: flow && flow.textContent.replace(/\s+/g, ' ').trim() || '',
      ariaLabel: flow && flow.getAttribute('aria-label') || '',
    };
  });
}

async function readAutomationLayout(page) {
  return page.evaluate(() => {
    const root = document.getElementById('sf-automation');
    const flow = root && root.querySelector('.au-outpost-flow');
    const body = root && root.querySelector('.au-body');
    const rr = root && root.getBoundingClientRect();
    const fr = flow && flow.getBoundingClientRect();
    const br = body && body.getBoundingClientRect();
    return {
      root: rr && rr.toJSON(),
      body: br && br.toJSON(),
      horizontalOverflow: root ? Math.max(0, Math.ceil(root.scrollWidth - root.clientWidth)) : -1,
      bodyScrollRange: body ? Math.max(0, Math.ceil(body.scrollHeight - body.clientHeight)) : -1,
      bodyOverflowY: body ? getComputedStyle(body).overflowY : null,
      flowClipped: !!(fr && br && (fr.left < br.left - 1 || fr.right > br.right + 1)),
    };
  });
}

async function waitForAuthoredOutpost(page) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    const outpost = sf.state.automation.outposts.find((o) => o && o.defId === 'outpost_refinery');
    if (!outpost) return false;
    const entity = sf.state.entityList.find((e) => e && e.alive !== false
      && e.data && e.data.automationOutpostId === outpost.id);
    return !!(entity && entity.mesh && entity.mesh.userData
      && entity.mesh.userData.authoredAssetState === 'authored');
  }, null, { timeout: AUTHORED_TIMEOUT_MS }).catch(async (error) => {
    const diagnostic = await page.evaluate(inspectOutpostRuntime);
    throw new Error(`Timed out waiting for authored outpost: ${JSON.stringify(diagnostic)}\n${error.message}`);
  });
}

async function exerciseSectorLifecycle(page) {
  return page.evaluate(async () => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    const ledger = sf.state.automation.outposts[0];
    const originalSectorId = sf.state.world.currentSectorId;
    const sector = sf.state.world.sectors[originalSectorId];
    const awaySectorId = (sector && sector.neighbors || []).find((id) => id && id !== originalSectorId);
    if (!awaySectorId) throw new Error(`No neighboring sector for ${originalSectorId}`);

    const countEntities = () => sf.state.entityList.filter((entity) => entity && entity.alive !== false
      && entity.data && entity.data.automationOutpostId === ledger.id).length;
    const snapshot = () => ({
      sectorId: sf.state.world.currentSectorId,
      ledgerCount: sf.state.automation.outposts.filter((o) => o && o.id === ledger.id).length,
      ledgerId: ledger.id,
      entityCount: countEntities(),
      transientEntityId: ledger.entityId == null ? null : ledger.entityId,
      pos: { x: ledger.pos.x, z: ledger.pos.z },
      storage: ledger.storage,
      status: ledger.status,
    });

    const before = snapshot();
    world.enterSector(awaySectorId, { fromJump: true, fromSectorId: originalSectorId });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const away = snapshot();
    world.enterSector(originalSectorId, { fromJump: true, fromSectorId: awaySectorId });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const returned = snapshot();
    return { originalSectorId, awaySectorId, before, away, returned };
  });
}

async function readStationLayout(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('[data-screen="station"]');
    const navs = [...document.querySelectorAll('[data-screen="station"] .sx-dock [data-nav]')];
    const actions = [...document.querySelectorAll('[data-screen="station"] .sx-dock [data-act]')];
    const tracks = [...document.querySelectorAll('[data-screen="station"] .sx-readout__track')]
      .map((track) => track.getBoundingClientRect().width);
    const help = document.querySelector('[data-screen="station"] [data-help], [data-screen="station"] .sx-help');
    const hr = help && help.getBoundingClientRect();
    const sr = screen && screen.getBoundingClientRect();
    return {
      screen: sr && sr.toJSON(),
      horizontalOverflow: Math.max(0, Math.ceil(document.documentElement.scrollWidth - innerWidth)),
      navCount: navs.length,
      actionCount: actions.length,
      selectedCount: navs.filter((nav) => nav.getAttribute('aria-selected') === 'true').length,
      readoutCount: tracks.length,
      minReadoutTrackWidth: tracks.length ? Math.min(...tracks) : 0,
      helpWidth: hr ? hr.width : 0,
      helpHeight: hr ? hr.height : 0,
      commsPresent: !!document.querySelector('[data-screen="station"] .sx-comms'),
    };
  });
}

async function shot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}`, type: 'png' });
}

async function clickButton(page, label) {
  return page.evaluate((needle) => {
    const wanted = String(needle).trim().toLowerCase();
    const buttons = [...document.querySelectorAll('button')];
    const visible = buttons.filter((button) => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && !button.hidden
        && rect.width > 0 && rect.height > 0;
    });
    const button = visible.find((candidate) => (candidate.textContent || '').trim().toLowerCase() === wanted);
    if (!button) return false;
    button.click();
    return true;
  }, label);
}

async function waitForVisible(page, selector, timeout, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && !el.hidden
      && rect.width > 0 && rect.height > 0;
  }, selector, { timeout }).catch((error) => {
    throw new Error(`Timed out waiting for visible ${label}: ${error.message}`);
  });
}

async function waitForBootOverlayGone(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('boot-overlay');
    if (!overlay) return true;
    const style = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') || style.display === 'none'
      || style.visibility === 'hidden' || style.pointerEvents === 'none';
  }, null, { timeout: START_TIMEOUT_MS });
}

async function startFreshServer() {
  const port = await findFreePort(8280);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-6_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before ${url} became reachable\n${child.probeOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 120; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port for outpost acceptance');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const netServer = createNetServer();
    netServer.once('error', () => resolve(false));
    netServer.once('listening', () => netServer.close(() => resolve(true)));
    netServer.listen(port, '127.0.0.1');
  });
}

// This function is serialized into the page by Playwright; keep it self-contained.
function inspectOutpostRuntime() {
  const sf = window.SF;
  const ledger = sf.state.automation.outposts.find((o) => o && o.defId === 'outpost_refinery');
  const entities = sf.state.entityList.filter((entity) => entity && entity.alive !== false
    && entity.data && entity.data.automationOutpostId === ledger.id);
  const entity = entities[0] || null;
  const player = sf.state.entities.get(sf.state.playerId);
  const activity = [];
  if (player && player.pos) activity.push(player.pos);
  for (const field of sf.state.world.activeSector && sf.state.world.activeSector.fields || []) {
    if (field && field.center) activity.push(field.center);
  }
  const nearestActivityDistance = activity.length
    ? Math.min(...activity.map((point) => Math.hypot(ledger.pos.x - point.x, ledger.pos.z - point.z)))
    : Infinity;
  return {
    ledgerCount: sf.state.automation.outposts.filter((o) => o && o.id === ledger.id).length,
    ledgerId: ledger.id,
    entityCount: entities.length,
    entityId: entity && entity.id,
    sectorId: ledger.sectorId,
    pos: { x: ledger.pos.x, z: ledger.pos.z },
    originDistance: Math.hypot(ledger.pos.x, ledger.pos.z),
    playerDistance: player && player.pos
      ? Math.hypot(ledger.pos.x - player.pos.x, ledger.pos.z - player.pos.z)
      : null,
    nearestActivityDistance,
    placeId: entity && entity.data.placeId || null,
    claimSpecId: entity && entity.data.claimSpecId || null,
    assetState: entity && entity.mesh && entity.mesh.userData.authoredAssetState || 'missing-mesh',
    hasMesh: !!(entity && entity.mesh),
    meshChildCount: entity && entity.mesh && entity.mesh.children ? entity.mesh.children.length : 0,
    authoredCompositionId: entity && entity.mesh && entity.mesh.userData.authoredCompositionId || null,
  };
}
