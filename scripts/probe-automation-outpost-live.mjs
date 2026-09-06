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
// The finite route includes an outbound station detour and a physical return trip. On the
// reference iGPU, 30 wall seconds covered only 23 simulation seconds and cut off the returning
// loaded drone. Allow the complete trip without moving the fixture closer or accelerating it.
const PROGRAM_TIMEOUT_MS = 90_000;
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
    () => window.SF && window.SF.state && window.SF.bus && window.SF.registry,
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

  const automationFixture = await page.evaluate(prepareAutomationFixture);
  assert.equal(automationFixture.activeHull, 'ship_ranger', 'live automation fixture should use Ranger');
  assert.equal(automationFixture.hasDroneBay, true, 'live automation fixture should fit Drone Bay L');
  assert.ok(automationFixture.researchedNodes.includes('tech_drone_control'));
  assert.ok(automationFixture.researchedNodes.includes('tech_outpost_charter'));
  mark('automation-fixture-ready');

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

  const programmedMiner = await exerciseProgrammedMinerRoute(page);
  mark('programmed-miner-verified');

  await closeOperationsAndResume(page);
  // The programmed route ends at Helios, outside this outpost's render admission distance.
  // Approach the persisted structure before asking its distance-gated mesh to become authored.
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
  assert.deepEqual(stationLayout.destinations,
    ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'],
    'station must expose every current player destination');
  assert.ok(stationLayout.launchVisible, 'Launch must remain reachable');
  assert.ok(stationLayout.holdVisible, 'the cargo manifest must remain reachable');
  assert.ok(stationLayout.servicesOnVitals, 'available service actions must belong to their status instrument');
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
    automationFixture,
    programmedMiner,
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
      `${SHOT_DIR}/06-programmed-miner-finite-1920x1080.png`,
      `${SHOT_DIR}/07-programmed-miner-saturated-1920x1080.png`,
      `${SHOT_DIR}/08-programmed-miner-stranded-1920x1080.png`,
      `${SHOT_DIR}/09-programmed-miner-recovered-1920x1080.png`,
    ],
  };
  console.log(`Automation outpost live acceptance OK\n${JSON.stringify(result, null, 2)}`);
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

function mark(label) {
  timings[label] = Date.now() - startedAt;
  console.log(`[automation route] ${label}: ${timings[label]}ms`);
}

async function openOperations(page) {
  await page.evaluate(() => {
    const sm = window.SF.registry.get('ui')?.screenManager;
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

// This is a progression-compressed QA fixture only. Ship ownership, module fitting, and credits
// still go through their live owners; the explicit research packet skips an hours-long campaign so
// this diagnostic route can exercise the visible Drones board in one bounded run.
function prepareAutomationFixture() {
  const sf = window.SF;
  const ships = sf && sf.registry && sf.registry.get('ships');
  const player = sf && sf.state && sf.state.player;
  if (!ships || !player) throw new Error('live automation fixture requires ships owner and player state');

  const researchPacket = [
    'tech_drive_tuning',
    'tech_tractor_systems',
    'tech_drone_control',
    'tech_drone_swarm',
    'tech_autonomous_fleets',
    'tech_outpost_charter',
    'tech_long_range_survey',
  ];
  // Research points are the only progression resource without a grant intent; seed that QA
  // resource explicitly, then let the ships owner apply every unlock and charge each real cost.
  player.researchPoints = Math.max(10_000, Number(player.researchPoints) || 0);
  sf.bus.emit('economy:grantCredits', { amount: 3_000_000, reason: 'qa:automation-pq17707' });
  for (const id of researchPacket) {
    if (player.researchedNodes.includes(id)) continue;
    if (!ships.unlockTech(id)) throw new Error(`live automation fixture could not research ${id}`);
  }

  const bought = ships.buyShip({ defId: 'ship_ranger', setActive: true });
  if (!bought) throw new Error('live automation fixture could not acquire Ranger through ships owner');
  const ownedIndex = player.ownedShips.length - 1;
  const owned = player.ownedShips[ownedIndex];
  const defaultBayFittings = ships.fittingsFromDefaults('ship_ranger', ['mod_drone_bay_l']);
  const baySlotIndex = defaultBayFittings.indexOf('mod_drone_bay_l');
  if (baySlotIndex < 0) throw new Error('live automation fixture could not resolve Ranger utility slot');
  const fitted = ships.buyModule({ defId: 'mod_drone_bay_l', fitSlotIndex: baySlotIndex });
  if (!fitted) throw new Error('live automation fixture could not buy and fit Drone Bay L');
  if (!Array.isArray(owned.fittings) || !owned.fittings.includes('mod_drone_bay_l')) {
    throw new Error('live automation fixture could not fit Drone Bay L on Ranger');
  }
  ships.recomputeActiveShip();

  return {
    activeHull: player.ownedShips[player.activeShipIndex].defId,
    ownedShipIndex: ownedIndex,
    hasDroneBay: player.ownedShips[ownedIndex].fittings.includes('mod_drone_bay_l'),
    researchedNodes: researchPacket.filter((id) => player.researchedNodes.includes(id)),
    droneTierCap: player.droneTierCap,
    credits: player.credits,
  };
}

async function exerciseProgrammedMinerRoute(page) {
  // The assignment itself is a visible player action. The board uses an enhanced select widget in
  // the live route, but retain the native-select branch for a render that has not enhanced yet.
  await page.locator('#sf-automation .au-tab[data-tab="drones"]').click();
  const programControl = page.locator(
    '#sf-automation [data-act="assignProgram"][data-kind="drone"]',
  ).first();
  await programControl.waitFor({ state: 'visible', timeout: 10_000 });
  const nativeSelect = await programControl.evaluate((el) => el.tagName === 'SELECT');
  if (nativeSelect) {
    await programControl.selectOption('mine_to_depot');
  } else {
    await programControl.locator('.sf-select__field').click();
    await programControl.locator('.sf-select__opt[data-value="mine_to_depot"]').click();
  }
  await page.waitForFunction(() => window.SF.state.automation.drones.some((g) => (
    g && g.program && g.program.templateId === 'mine_to_depot'
  )), null, { timeout: 10_000 });

  // Isolate one live finite rock in a quiet coordinate beside the real Helios depot. The drone
  // must fly to it, chip its physical ore HP, then return and sell the resulting shipment.
  const finiteFixture = await page.evaluate(prepareProgrammedMiningFixture);
  await closeOperationsAndResume(page);
  await waitForProgrammedFiniteSettlement(page, finiteFixture).catch(async (error) => {
    console.error('Finite miner state at failure:', JSON.stringify(await readProgrammedState(page, finiteFixture)));
    await shot(page, 'failed-finite-miner.png');
    throw error;
  });
  const finiteState = await readProgrammedState(page, finiteFixture);
  assert.ok(finiteState.saleReceipt, 'finite route should retain the live economy sale receipt');
  assert.equal(
    finiteState.saleReceipt.total,
    finiteState.operation.lastSale.credited,
    'finite sale credits should equal the quoted owner receipt total',
  );

  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="drones"]').click();
  await waitForVisible(page, '#sf-automation .au-miner-ops', 10_000, 'finite miner operation readout');
  await page.locator('#sf-automation .au-miner-ops').first().scrollIntoViewIfNeeded();
  const finiteBoard = await readDroneUi(page);
  assert.equal(finiteBoard.state, 'stalled', 'finite rock should leave the programmed miner stalled');
  assert.match(finiteBoard.status, /No rock to cut/i);
  assert.match(finiteBoard.ariaLabel, /Gross cut/i);
  assert.match(finiteBoard.ariaLabel, /Last sale/i);
  await shot(page, '06-programmed-miner-finite-1920x1080.png');

  // Saturate the same real destination through the economy owner, then start a second finite
  // shipment. A failed sale must leave the shipment in the operation and expose the board reason.
  const saturationFixture = await page.evaluate(prepareSaturationFixture, {
    groupId: finiteFixture.groupId,
  });
  await closeOperationsAndResume(page);
  await waitForProgrammedSaturation(page, saturationFixture).catch(async (error) => {
    console.error('Saturated miner state at failure:', JSON.stringify(await readProgrammedState(page, saturationFixture)));
    await shot(page, 'failed-saturated-miner.png');
    throw error;
  });
  const saturationState = await readProgrammedState(page, saturationFixture);

  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="drones"]').click();
  await waitForVisible(page, '#sf-automation .au-miner-ops', 10_000, 'saturated miner operation readout');
  await page.locator('#sf-automation .au-miner-ops').first().scrollIntoViewIfNeeded();
  const saturationBoard = await readDroneUi(page);
  assert.equal(saturationBoard.state, 'waiting', 'saturated depot should leave the miner waiting');
  assert.match(saturationBoard.status, /Depot is full of this ore/i);
  assert.match(saturationBoard.ariaLabel, /depot is saturated/i);
  assert.ok(saturationState.shipmentQty > 0, 'saturated destination must retain the mined shipment');
  await shot(page, '07-programmed-miner-saturated-1920x1080.png');

  // Empty only the real group's fuel. The owner must strand the existing group and shipment,
  // leaving its purchased equipment in the roster for the visible Refuel action.
  const strandedFixture = await page.evaluate(prepareFuelStrandingFixture, {
    groupId: saturationFixture.groupId,
  });
  await closeOperationsAndResume(page);
  await waitForProgrammedFuelStranding(page, strandedFixture);
  const strandedState = await readProgrammedState(page, strandedFixture);

  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="drones"]').click();
  await waitForVisible(page, '#sf-automation .au-miner-ops', 10_000, 'stranded miner operation readout');
  await page.locator('#sf-automation .au-miner-ops').first().scrollIntoViewIfNeeded();
  const strandedBoard = await readDroneUi(page);
  assert.equal(strandedBoard.state, 'stranded', 'empty fuel should expose a stranded operation');
  assert.match(strandedBoard.status, /Out of fuel/i);
  assert.match(strandedBoard.ariaLabel, /machine is still here/i);
  assert.equal(strandedBoard.refuelVisible, true, 'stranded operation should expose Refuel');
  assert.ok(strandedState.entityCount > 0, 'fuel shortage must retain the purchased drone group');
  assert.ok(strandedState.shipmentQty > 0, 'fuel shortage must retain sealed destination cargo');
  await shot(page, '08-programmed-miner-stranded-1920x1080.png');

  const refuelButton = page.locator(
    '#sf-automation button.au-refuel[data-act="refuel"][data-kind="drone"]',
  ).first();
  await refuelButton.scrollIntoViewIfNeeded();
  assert.equal(await refuelButton.isVisible(), true, 'Refuel should be a visible player action');
  await refuelButton.click();
  await page.waitForFunction((groupId) => {
    const g = window.SF.state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
    return !!(g && Number(g.fuel) > 0 && g.status !== 'stranded'
      && (!g.operation || g.operation.operatingState !== 'stranded'));
  }, strandedFixture.groupId, { timeout: 10_000 });

  await closeOperationsAndResume(page);
  await waitForProgrammedRefuelRecovery(page, strandedFixture);
  const recoveredState = await readProgrammedState(page, strandedFixture);
  assert.equal(recoveredState.status === 'stranded', false, 'refuel should resume the retained group');
  assert.ok(recoveredState.fuel > 0, 'refuel should restore operating fuel');
  assert.ok(recoveredState.shipmentQty > 0, 'refuel should preserve the saturated shipment');

  await openOperations(page);
  await page.locator('#sf-automation .au-tab[data-tab="drones"]').click();
  await waitForVisible(page, '#sf-automation .au-miner-ops', 10_000, 'recovered miner operation readout');
  await page.locator('#sf-automation .au-miner-ops').first().scrollIntoViewIfNeeded();
  const recoveredBoard = await readDroneUi(page);
  assert.notEqual(recoveredBoard.state, 'stranded', 'recovered board should leave fuel-stranded state');
  assert.match(recoveredBoard.status, /Depot is full of this ore/i);
  assert.equal(recoveredBoard.refuelVisible, false, 'recovered operation should no longer offer Refuel');
  await shot(page, '09-programmed-miner-recovered-1920x1080.png');

  return {
    finiteFixture,
    finiteState,
    finiteBoard,
    saturationFixture,
    saturationState,
    saturationBoard,
    strandedFixture,
    strandedState,
    strandedBoard,
    recoveredState,
    recoveredBoard,
  };
}

async function waitForProgrammedFiniteSettlement(page, fixture) {
  await page.waitForFunction(({ groupId, rockId }) => {
    const sf = window.SF;
    const g = sf.state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
    const rock = sf.state.entities.get(rockId);
    const destroyed = (window.__sfPq17707Destroyed || []).some((event) => event.id === rockId);
    const op = g && g.operation;
    const sale = op && op.lastSale;
    const shipmentQty = Number(g && g.shipment && g.shipment.items
      && g.shipment.items.cmdty_ore_iron) || 0;
    const finite = destroyed || !!(rock && rock.alive === false
      && Number(rock.data && rock.data.oreHP) <= 0);
    return !!(g && finite
      && op && Number(op.grossUnits) >= 1 && sale && Number(sale.credited) > 0
      && shipmentQty === 0 && op.limitStage === 'no_exposed_face'
      && op.operatingState === 'stalled');
  }, fixture, { timeout: PROGRAM_TIMEOUT_MS });
}

async function waitForProgrammedSaturation(page, fixture) {
  await page.waitForFunction(({ groupId, rockId }) => {
    const sf = window.SF;
    const g = sf.state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
    const rock = sf.state.entities.get(rockId);
    const destroyed = (window.__sfPq17707Destroyed || []).some((event) => event.id === rockId);
    const op = g && g.operation;
    const shipmentQty = Number(g && g.shipment && g.shipment.items
      && g.shipment.items.cmdty_ore_iron) || 0;
    const finite = destroyed || !!(rock && rock.alive === false
      && Number(rock.data && rock.data.oreHP) <= 0);
    return !!(g && finite
      && op && Number(op.grossUnits) >= 2 && shipmentQty > 0
      && op.limitStage === 'demand_saturation' && op.operatingState === 'waiting');
  }, fixture, { timeout: PROGRAM_TIMEOUT_MS });
}

async function waitForProgrammedFuelStranding(page, fixture) {
  await page.waitForFunction(({ groupId }) => {
    const sf = window.SF;
    const g = sf.state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
    const shipmentQty = Number(g && g.shipment && g.shipment.items
      && g.shipment.items.cmdty_ore_iron) || 0;
    return !!(g && Number(g.fuel) <= 0 && g.status === 'stranded'
      && g.operation && g.operation.limitStage === 'missing_input'
      && g.operation.operatingState === 'stranded' && shipmentQty > 0);
  }, fixture, { timeout: PROGRAM_TIMEOUT_MS });
}

async function waitForProgrammedRefuelRecovery(page, fixture) {
  await page.waitForFunction(({ groupId }) => {
    const sf = window.SF;
    const g = sf.state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
    return !!(g && Number(g.fuel) > 0 && g.status !== 'stranded'
      && g.operation && g.operation.operatingState !== 'stranded'
      && Number(g.shipment && g.shipment.items && g.shipment.items.cmdty_ore_iron) > 0);
  }, fixture, { timeout: PROGRAM_TIMEOUT_MS });
}

async function readProgrammedState(page, fixture) {
  return page.evaluate(({ groupId, rockId }) => {
    const sf = window.SF;
    const state = sf.state;
    const g = state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
    const rock = rockId == null ? null : state.entities.get(rockId);
    const op = g && g.operation;
    const sale = op && op.lastSale;
    const droneEntities = g && Array.isArray(g.entityIds)
      ? g.entityIds.map((id) => state.entities.get(id)).filter((entity) => entity && entity.alive !== false)
      : [];
    const origin = g && g.originPos ? g.originPos : null;
    const nearestDrone = droneEntities[0] || null;
    const liveAsteroids = state.entityList.filter((entity) => entity && entity.alive !== false
      && entity.type === 'asteroid' && entity.pos);
    const candidates = liveAsteroids.map((entity) => ({
      id: entity.id,
      typeId: entity.data && entity.data.typeId || null,
      qaProbe: entity.data && entity.data.qaProbe || null,
      asteroidSlotId: entity.data && entity.data.asteroidSlotId || null,
      oreHP: Number(entity.data && entity.data.oreHP) || 0,
      distanceFromOrigin: origin
        ? Math.hypot(entity.pos.x - origin.x, entity.pos.z - origin.z)
        : null,
      distanceFromDrone: nearestDrone
        ? Math.hypot(entity.pos.x - nearestDrone.pos.x, entity.pos.z - nearestDrone.pos.z)
        : null,
    })).sort((left, right) => (
      (left.distanceFromOrigin ?? Infinity) - (right.distanceFromOrigin ?? Infinity)
      || String(left.id).localeCompare(String(right.id))
    )).slice(0, 8);
    const targetIds = [...new Set(droneEntities
      .map((entity) => entity.data && entity.data.targetAstId)
      .filter((id) => id != null))];
    const targetEntities = targetIds.map((id) => state.entities.get(id)).filter(Boolean);
    const targetDistance = (target) => nearestDrone && target && target.pos
      ? Math.hypot(target.pos.x - nearestDrone.pos.x, target.pos.z - nearestDrone.pos.z)
      : null;
    const compactEntity = (entity) => entity ? {
      id: entity.id,
      type: entity.type,
      groupId: entity.data?.groupId,
      alive: entity.alive !== false,
      pos: { x: Number(entity.pos && entity.pos.x) || 0, z: Number(entity.pos && entity.pos.z) || 0 },
      vel: { x: Number(entity.vel && entity.vel.x) || 0, z: Number(entity.vel && entity.vel.z) || 0 },
      rot: Number(entity.rot) || 0,
      activity: entity.activity ? { simTier: entity.activity.simTier, pins: entity.activity.pins } : null,
      inFlightIndex: !!state.entityIndex?.shipLike?.includes(entity),
      inPhysicsIndex: !!state.entityIndex?.physicsDynamics?.includes(entity),
      targetAstId: entity.data && entity.data.targetAstId != null ? entity.data.targetAstId : null,
      intent: entity.data && entity.data.intent ? {
        moveX: Number(entity.data.intent.moveX) || 0,
        moveZ: Number(entity.data.intent.moveZ) || 0,
        aimAngle: Number(entity.data.intent.aimAngle) || 0,
        boost: !!entity.data.intent.boost,
        brake: !!entity.data.intent.brake,
        fire: !!entity.data.intent.fire,
      } : null,
    } : null;
    const flight = sf.registry && (sf.registry.get('flight') || sf.registry.get('flightSlot'));
    const flightDiag = flight && flight._diag ? {
      physicsBackend: flight._diag.physicsBackend || null,
      tickMs: Number(flight._diag.tickMs) || 0,
    } : null;
    const physicsDiag = state.physicsRuntime && state.physicsRuntime.diagnostics;
    return {
      groupId,
      exists: !!g,
      status: g && g.status || null,
      fuel: g ? Number(g.fuel) || 0 : 0,
      fuelMax: g ? Number(g.fuelMax) || 0 : 0,
      entityCount: g && Array.isArray(g.entityIds) ? g.entityIds.length : 0,
      program: g && g.program && g.program.templateId || null,
      programCounter: g && g.programState ? g.programState.pc : null,
      shipmentQty: Number(g && g.shipment && g.shipment.items
        && g.shipment.items.cmdty_ore_iron) || 0,
      operation: op ? {
        grossUnits: Number(op.grossUnits) || 0,
        storedUnits: Number(op.storedUnits) || 0,
        storedCap: Number(op.storedCap) || 0,
        limitStage: op.limitStage || null,
        operatingState: op.operatingState || null,
        operatingCostPerMin: Number(op.operatingCostPerMin) || 0,
        netThroughputPerMin: Number(op.netThroughputPerMin) || 0,
        lastSale: sale ? {
          stationId: sale.stationId || null,
          quantity: Number(sale.quantity) || 0,
          unitPrice: Number(sale.unitPrice) || 0,
          credited: Number(sale.credited) || 0,
        } : null,
      } : null,
      saleReceipt: (() => {
        const receipts = Object.values(g && g.saleReceipts || {})
          .map((entry) => entry && entry.receipt)
          .filter((receipt) => receipt && receipt.stationId === 'station_helios');
        if (!receipts.length) return null;
        const matching = sale && receipts.find((receipt) => (
          receipt.quantity === sale.quantity && receipt.credited === sale.credited
        ));
        const receipt = matching || receipts[receipts.length - 1];
        return {
          stationId: receipt.stationId,
          good: receipt.good,
          quantity: Number(receipt.quantity) || 0,
          unitPrice: Number(receipt.unitPrice) || 0,
          total: Number(receipt.total) || 0,
          credited: Number(receipt.credited) || 0,
          quoteVersion: receipt.quoteVersion,
        };
      })(),
      rock: rock ? {
        id: rock.id,
        alive: rock.alive !== false,
        oreHP: Number(rock.data && rock.data.oreHP) || 0,
        oreHPMax: Number(rock.data && rock.data.oreHPMax) || 0,
      } : null,
      rockDestroyed: (window.__sfPq17707Destroyed || []).some((event) => event.id === rockId),
      runtime: {
        player: compactEntity(state.entities.get(state.playerId)),
        currentSectorId: state.world && state.world.currentSectorId || null,
        simTime: Number(state.simTime) || 0,
        tick: Number(state.tick) || 0,
        physicsBackend: state.settings && state.settings.gameplay
          && state.settings.gameplay.physicsBackend || null,
        flight: flight ? { name: flight.name || null, diag: flightDiag } : null,
        physics: physicsDiag ? {
          backend: physicsDiag.backend || null,
          sg02Ready: physicsDiag.sg02Ready === true,
          sg02DynamicBodies: Number(physicsDiag.sg02DynamicBodies) || 0,
          sg02SyncDynamicEntities: Number(physicsDiag.sg02SyncDynamicEntities) || 0,
        } : null,
      },
      drones: droneEntities.map(compactEntity),
      targetSelection: {
        targetIds,
        targetDistances: targetEntities.map((entity) => ({ id: entity.id, distance: targetDistance(entity) })),
        nearestCandidates: candidates,
      },
    };
  }, fixture);
}

async function readDroneUi(page) {
  return page.evaluate(() => {
    const card = [...document.querySelectorAll('#sf-automation .au-card')]
      .find((candidate) => candidate.querySelector('.au-miner-ops'));
    const ops = card && card.querySelector('.au-miner-ops');
    const status = card && card.querySelector('.au-operation-status');
    const refuel = card && card.querySelector('button.au-refuel[data-act="refuel"]');
    const program = card && card.querySelector('[data-act="assignProgram"][data-kind="drone"]');
    return {
      state: ops && ops.dataset.state || null,
      status: status && status.textContent.replace(/\s+/g, ' ').trim() || '',
      ariaLabel: ops && ops.getAttribute('aria-label') || '',
      text: ops && ops.textContent.replace(/\s+/g, ' ').trim() || '',
      refuelVisible: !!(refuel && refuel.getBoundingClientRect().width > 0
        && refuel.getBoundingClientRect().height > 0),
      programValue: program && (program.value || program.dataset.value) || null,
    };
  });
}

// This function is serialized into the page by Playwright; keep it self-contained. The only state
// it creates is a physical finite asteroid and real economy pressure for the next sale attempt.
function prepareProgrammedMiningFixture() {
  const sf = window.SF;
  const state = sf && sf.state;
  const group = state && state.automation && state.automation.drones
    && state.automation.drones.find((candidate) => candidate && candidate.program
      && candidate.program.templateId === 'mine_to_depot');
  const station = state && state.entityList && state.entityList.find((entity) => entity
    && entity.alive !== false && entity.type === 'station' && entity.data
    && entity.data.stationId === 'station_helios' && !entity.data.isGate);
  const player = state && state.entities && state.entities.get(state.playerId);
  if (!group || !station || !player || !sf.helpers || typeof sf.helpers.spawnEntity !== 'function') {
    throw new Error('programmed miner fixture requires live group, Helios station, player, and spawn owner');
  }

  // Restore the far-side geometry used by the player route. SG-02 stations are physical static
  // bodies, so this exercises the programmed pilot's real lateral detour before finite mining.
  const playerPos = { x: station.pos.x - 90, z: station.pos.z };
  const workOrigin = { x: station.pos.x + 500, z: station.pos.z };
  player.pos.x = playerPos.x;
  player.pos.z = playerPos.z;
  if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
  group.originPos = { x: workOrigin.x, z: workOrigin.z };
  group.sectorId = state.world.currentSectorId;
  group.buffer = 0;
  group.fuel = Number(group.fuelMax) || 240;
  group.status = 'program';
  group.programState = { pc: 0, waitT: 0, cargoWasFull: false };
  for (const id of group.entityIds || []) {
    const drone = state.entities.get(id);
    if (!drone) continue;
    drone.pos.x = playerPos.x;
    drone.pos.z = playerPos.z;
    if (drone.vel) { drone.vel.x = 0; drone.vel.z = 0; }
    if (drone.data) drone.data.targetAstId = null;
  }

  const rock = sf.helpers.spawnEntity({
    type: 'asteroid',
    team: 0,
    pos: { x: workOrigin.x, z: workOrigin.z },
    radius: 12,
    mass: 500,
    collides: true,
    hull: 14,
    hullMax: 14,
    data: {
      typeId: 'ast_common_rock',
      oreHP: 14,
      oreHPMax: 14,
      yieldU: 1,
      pctEjected: 0,
      respawnSec: 120,
      fieldId: 'qa-pq17707',
      asteroidSlotId: 'qa-finite-1',
      qaProbe: 'PQ-177.07',
    },
  });
  if (!rock) throw new Error('programmed miner fixture could not spawn finite live rock');
  window.__sfPq17707Destroyed = window.__sfPq17707Destroyed || [];
  sf.bus.on('asteroid:destroyed', (event) => {
    if (event && event.id === rock.id) {
      window.__sfPq17707Destroyed.push({ id: event.id, simTime: state.simTime });
    }
  });
  return {
    groupId: group.id,
    rockId: rock.id,
    stationId: station.data.stationId,
    oreId: 'cmdty_ore_iron',
    finiteOreHp: 14,
    workOrigin,
  };
}

// This function is serialized into the page by Playwright; keep it self-contained. Saturation is
// created by the economy's real pressure event and is checked again through its quote owner.
function prepareSaturationFixture({ groupId }) {
  const sf = window.SF;
  const state = sf && sf.state;
  const group = state && state.automation && state.automation.drones
    && state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
  const station = state && state.entityList && state.entityList.find((entity) => entity
    && entity.alive !== false && entity.type === 'station' && entity.data
    && entity.data.stationId === 'station_helios' && !entity.data.isGate);
  const economy = sf && sf.registry && sf.registry.get('economy');
  if (!group || !station || !economy || !sf.helpers || typeof sf.helpers.spawnEntity !== 'function') {
    throw new Error('saturation fixture requires live group, Helios station, economy, and spawn owner');
  }
  const stationId = station.data.stationId;
  const oreId = 'cmdty_ore_iron';
  const before = economy.quoteAutomationIntake(stationId, oreId, 1_000_000);
  if (!before || !before.ok || !(before.fillable > 0)) {
    throw new Error(`destination has no live intake before saturation: ${JSON.stringify(before)}`);
  }
  sf.bus.emit('economy:applyTradePressure', {
    stationId,
    good: oreId,
    vol: before.fillable,
  });
  const saturated = economy.quoteAutomationIntake(stationId, oreId, 1);
  if (!saturated || saturated.ok || saturated.reason !== 'demand_saturation') {
    throw new Error(`live destination did not saturate: ${JSON.stringify(saturated)}`);
  }

  const workOrigin = { x: station.pos.x + 500, z: station.pos.z };
  group.originPos = { x: workOrigin.x, z: workOrigin.z };
  group.programState = { pc: 0, waitT: 0, cargoWasFull: false };
  group.pendingSale = null;
  group._lastSaleBlock = null;
  group._programMineCarry = 0;
  group.fuel = Number(group.fuelMax) || 240;
  group.status = 'program';
  const rock = sf.helpers.spawnEntity({
    type: 'asteroid',
    team: 0,
    pos: { x: workOrigin.x, z: workOrigin.z },
    radius: 12,
    mass: 500,
    collides: true,
    hull: 14,
    hullMax: 14,
    data: {
      typeId: 'ast_common_rock',
      oreHP: 14,
      oreHPMax: 14,
      yieldU: 1,
      pctEjected: 0,
      respawnSec: 120,
      fieldId: 'qa-pq17707',
      asteroidSlotId: 'qa-finite-2',
      qaProbe: 'PQ-177.07',
    },
  });
  if (!rock) throw new Error('saturation fixture could not spawn finite live rock');
  window.__sfPq17707Destroyed = window.__sfPq17707Destroyed || [];
  sf.bus.on('asteroid:destroyed', (event) => {
    if (event && event.id === rock.id) {
      window.__sfPq17707Destroyed.push({ id: event.id, simTime: state.simTime });
    }
  });
  return {
    groupId,
    rockId: rock.id,
    stationId,
    oreId,
    expectedHeadroom: before.fillable,
    stockBefore: before.stock,
    stockAfter: saturated.stock,
    intakeTarget: before.intakeTarget,
  };
}

function prepareFuelStrandingFixture({ groupId }) {
  const sf = window.SF;
  const group = sf && sf.state && sf.state.automation && sf.state.automation.drones
    && sf.state.automation.drones.find((candidate) => candidate && candidate.id === groupId);
  const shipmentQty = Number(group && group.shipment && group.shipment.items
    && group.shipment.items.cmdty_ore_iron) || 0;
  if (!group || shipmentQty <= 0) throw new Error('fuel fixture requires retained destination shipment');
  group.fuel = 0;
  return { groupId, retainedShipment: shipmentQty };
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
    const actions = [...document.querySelectorAll('[data-screen="station"] [data-vital-act]')];
    const tracks = [...document.querySelectorAll('[data-screen="station"] .sxb-vital__track')]
      .map((track) => track.getBoundingClientRect().width);
    const help = document.querySelector('[data-screen="station"] .sxb-help[aria-expanded]');
    const hr = help && help.getBoundingClientRect();
    const sr = screen && screen.getBoundingClientRect();
    return {
      screen: sr && sr.toJSON(),
      horizontalOverflow: Math.max(0, Math.ceil(document.documentElement.scrollWidth - innerWidth)),
      navCount: navs.length,
      destinations: navs.map((nav) => nav.getAttribute('data-nav')),
      actionCount: actions.length,
      servicesOnVitals: actions.every((action) => !!action.closest('.sxb-vital')),
      launchVisible: !!screen?.querySelector('.sxb-launch')?.checkVisibility(),
      holdVisible: !!screen?.querySelector('[data-hold]')?.checkVisibility(),
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
