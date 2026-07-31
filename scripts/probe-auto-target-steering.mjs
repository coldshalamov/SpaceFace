#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAutoTargetRuntime,
  tickAutoTarget,
  toggleAutoTarget,
} from '../src/combat/autoTargetMode.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { collectPageIssues } from './lib/browser-issues.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import {
  createPq007ControlBrowserManifest,
  PQ007_CONTROL_FIXED_SEED,
} from './validation-manifests/pq007-control-browser.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq007-control-route');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const IS_DIRECT_RUN = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_DIRECT_RUN) {
  if (process.argv.includes('--acceptance')) await runBrowserAcceptance();
  else runFixtureProbe();
}

/**
 * Shared PQ-007 public actor route. Observations may read the debug handle, but every action is a
 * visible control, trusted keyboard event, or native Playwright mouse movement. No owner method is
 * called and no gameplay state is assigned by this harness.
 */
export async function runPq007PublicActorRoute({
  page,
  fixedSeed = PQ007_CONTROL_FIXED_SEED,
  outputDir,
  runtimeKind,
  expectedRootUrl,
}) {
  assert(page, 'PQ-007 actor route requires a Playwright page');
  assert.equal(new URL(expectedRootUrl).pathname, '/', 'PQ-007 must start at the canonical root');
  assert.equal(new URL(expectedRootUrl).search, '', 'PQ-007 canonical root cannot carry query flags');
  assert.equal(new URL(expectedRootUrl).hash, '', 'PQ-007 canonical root cannot carry a hash');
  await mkdir(outputDir, { recursive: true });

  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 180_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(fixedSeed));
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.waitForFunction((seed) => {
    const state = window.SF?.state;
    const canvas = document.querySelector('#gl-canvas');
    return state?.mode === 'flight'
      && Number(state?.meta?.seed) === Number(seed)
      && state?.entities?.get?.(state.playerId)?.alive !== false
      && !document.body.classList.contains('ui-modal-open')
      && canvas && getComputedStyle(canvas).display !== 'none';
  }, fixedSeed, { timeout: 180_000 });

  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const canvasBox = await canvas.boundingBox();
  assert(canvasBox && canvasBox.width > 100 && canvasBox.height > 100,
    'PQ-007 flight canvas must expose a visible native pointer target');
  const center = {
    x: Math.round(canvasBox.x + canvasBox.width / 2),
    y: Math.round(canvasBox.y + canvasBox.height / 2),
  };
  await page.mouse.move(center.x, center.y);
  await canvas.focus();

  // Prove the ordinary keyboard flight path before G claims the pointer.
  const keyboardBefore = await readControlSnapshot(page);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await page.waitForFunction(() => {
    const input = window.SF?.state?.input;
    return Math.abs(Number(input?.moveZ || 0)) > 0.1
      && Math.abs(Number(input?.turnIntent || input?.moveX || 0)) > 0.1;
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(850);
  const keyboardHeld = await readControlSnapshot(page);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  await waitForNeutralControls(page);
  const keyboardAfter = await readControlSnapshot(page);
  assert(
    planarDistance(keyboardBefore.player.pos, keyboardAfter.player.pos) > 0.25
      || Math.abs(keyboardAfter.player.rot - keyboardBefore.player.rot) > 0.02,
    'trusted W/A input must move or turn the live player hull',
  );
  assert(Math.abs(keyboardHeld.input.moveZ) > 0.1,
    'trusted W must reach the live flight command');
  assert(Math.abs(keyboardHeld.input.turnIntent || keyboardHeld.input.moveX) > 0.1,
    'trusted A must reach the live steering command');

  // Accept the deterministic authored warrant through the visible Mission Log.
  await canvas.focus();
  await page.keyboard.press('KeyJ');
  const missionLog = page.locator('[data-screen="missionLog"]');
  await missionLog.waitFor({ state: 'visible', timeout: 20_000 });
  const hunterCard = missionLog.locator(
    '[data-testid="mission-log-career-chip"][data-career-id="hunter"]',
  );
  await hunterCard.waitFor({ state: 'visible', timeout: 20_000 });
  const hunterCopy = (await hunterCard.innerText()).replace(/\s+/g, ' ');
  assert.match(hunterCopy, /Legal HOSTILE marks only/i,
    'the visible Hunter offer must establish useful hostile semantics');
  const acceptHunter = hunterCard.locator(
    'button[data-career-act="originAccept"][data-career-id="hunter"]',
  );
  await acceptHunter.click();
  await page.waitForFunction(() => (window.SF?.state?.missions?.active || []).some((mission) =>
    mission?.status === 'active'
      && mission.originCareer === 'hunter'
      && mission.originContractId === 'yard_writ'
      && Array.isArray(mission.targetEntityIds)
      && mission.targetEntityIds.length === 1), null, { timeout: 30_000 });
  const mission = await readHunterMission(page);
  assert.equal(mission.title, 'Yard Perimeter Writ');
  assert.equal(mission.targetName, 'Rook Nine');
  assert.equal(mission.hostile, true, 'the authored Rook Nine warrant must be a useful hostile');

  const trackMission = missionLog.locator(
    `button[data-act="track"][data-mid="${mission.id}"]`,
  );
  await trackMission.waitFor({ state: 'visible', timeout: 20_000 });
  await trackMission.click();
  await page.keyboard.press('Escape');
  await missionLog.waitFor({ state: 'hidden', timeout: 10_000 });

  // The actor gets its destination from the visible map, then waits for the visible contact roster.
  await canvas.focus();
  await page.keyboard.press('KeyM');
  const galaxyMap = page.locator('#sf-galaxymap');
  await galaxyMap.waitFor({ state: 'visible', timeout: 20_000 });
  const searchInput = galaxyMap.locator('.gm-search-input');
  await searchInput.click();
  await searchInput.fill('Rook Nine');
  await galaxyMap.locator('.gm-search-item-name', { hasText: 'Rook Nine' }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Enter');
  const inspectorText = (await galaxyMap.locator('.gm-inspector-content').innerText())
    .replace(/\s+/g, ' ');
  assert.match(inspectorText, /Rook Nine/i);
  assert.match(inspectorText, /Hostile\s+YES/i);
  const trackTarget = galaxyMap.locator('#gm-set-course-btn');
  await trackTarget.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(await trackTarget.innerText(), /Track Target|Set Waypoint/i);
  await trackTarget.click();
  await galaxyMap.waitFor({ state: 'hidden', timeout: 10_000 });
  await canvas.focus();

  const rookContact = page.locator('.sf-overview-row', { hasText: 'Rook Nine' }).first();
  await rookContact.waitFor({ state: 'visible', timeout: 180_000 });
  const visibleContactText = (await rookContact.innerText()).replace(/\s+/g, ' ');
  assert.match(visibleContactText, /Rook Nine/i,
    'the actor may engage only after the authored hostile is visibly in the contact roster');

  // G must acquire the useful hostile itself. Do not preselect it with Tab or a DOM click.
  await page.mouse.move(center.x, center.y);
  await canvas.focus();
  await page.keyboard.press('KeyG');
  await page.waitForFunction((targetId) => {
    const state = window.SF?.state;
    return state?.input?.autoFire === true
      && String(state?.player?.targetId) === String(targetId)
      && String(state?.input?.autoAim?.targetId) === String(targetId)
      && document.pointerLockElement?.id === 'gl-canvas';
  }, mission.targetId, { timeout: 10_000 });
  await page.locator('[data-k=weapons]').filter({ hasText: 'AUTO-TGT' })
    .waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('.sf-target__name').filter({ hasText: 'Rook Nine' })
    .waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('.sf-toast__text').filter({ hasText: 'draw to fly' })
    .waitFor({ state: 'visible', timeout: 5_000 });
  const gEnabled = await readControlSnapshot(page);
  assert.equal(gEnabled.input.actions?.autopursuit, false,
    'G cannot revive the retired pursuit action');
  assert.equal(gEnabled.player._flightFrame?.autopursuit, null,
    'flight diagnostics must retain no pursuit controller');
  await assertNoPursuitPresentation(page);

  // Native relative input draws the first route. Playwright owns both moves; no DOM event is made.
  await page.mouse.move(center.x + 260, center.y - 170);
  await page.waitForFunction(() => {
    const route = window.SF?.state?.input?.autoTargetPath;
    return route?.active === true && route?.drawing === true && route.points?.length >= 2;
  }, null, { timeout: 10_000 });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#auto-target-flight-path');
    const line = svg?.querySelector('.sf-flight-path__route');
    const style = svg ? getComputedStyle(svg) : null;
    return style?.display !== 'none'
      && Number(style?.opacity || 0) > 0.05
      && String(line?.getAttribute('points') || '').length > 0;
  }, null, { timeout: 5_000 });
  const firstDraw = await readControlSnapshot(page);
  const firstPathDom = await readPathPresentation(page);
  assert.equal(firstPathDom.visible, true, 'the drawn route must be visibly rendered');
  assert(firstPathDom.polylinePoints.length > 0, 'the visible route polyline cannot be empty');
  assert.equal(String(firstDraw.input.autoAim?.targetId), String(mission.targetId),
    'draw-to-fly must not steal the locked target lead');
  assert.match(firstDraw.targetName, /Rook Nine/i,
    'the useful hostile identity must remain visible while pointer flight owns the hull');

  // Let the 110 ms sim-clock clutch expire naturally. The route must remain authoritative and move
  // the hull after drawing stops.
  await page.waitForFunction((simTime) => {
    const state = window.SF?.state;
    const route = state?.input?.autoTargetPath;
    return state?.simTime > simTime + 0.13
      && route?.active === true
      && route?.drawing === false;
  }, firstDraw.simTime, { timeout: 10_000 });
  const firstRouteStart = firstDraw.route.points[0];
  const firstRouteEnd = firstDraw.route.points.at(-1);
  await page.waitForFunction(({ start, end }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    if (!player) return false;
    const routeX = end.x - start.x;
    const routeZ = end.z - start.z;
    const routeLength = Math.hypot(routeX, routeZ);
    if (routeLength < 1) return false;
    const travelX = player.pos.x - start.x;
    const travelZ = player.pos.z - start.z;
    return (travelX * routeX + travelZ * routeZ) / routeLength > 0.25;
  }, { start: firstRouteStart, end: firstRouteEnd }, { timeout: 10_000 });
  const clutched = await readControlSnapshot(page);
  assert.equal(clutched.route.active, true, 'pause-to-clutch must retain the route');
  assert.equal(clutched.route.drawing, false, 'pause-to-clutch must end only the drawing gesture');

  // A second, opposite native movement resumes granular route authoring without changing modes.
  await page.mouse.move(center.x - 260, center.y + 170);
  await page.waitForFunction((pointCount) => {
    const route = window.SF?.state?.input?.autoTargetPath;
    return route?.active === true && route?.drawing === true && route.points?.length > pointCount;
  }, firstDraw.route.points.length, { timeout: 10_000 });
  const secondDraw = await readControlSnapshot(page);
  assert(secondDraw.route.points.length > firstDraw.route.points.length,
    'the resumed opposite gesture must extend the live route');
  assert(
    planarDistance(firstDraw.route.points.at(-1), secondDraw.route.points.at(-1)) > 1,
    'the second native gesture must produce a granular endpoint change',
  );
  const firstVector = subtractPoints(firstDraw.route.points.at(-1), firstDraw.route.points[0]);
  const resumedVector = subtractPoints(secondDraw.route.points.at(-1), firstDraw.route.points.at(-1));
  assert(firstVector.x * resumedVector.x + firstVector.z * resumedVector.z < 0,
    'the opposite native gesture must reverse the authored route direction');
  await page.screenshot({ path: path.join(outputDir, '01-draw-to-fly-route.png') });

  // A second G releases pointer authority and the ordinary input tick clears the route/commands.
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const route = state?.input?.autoTargetPath;
    return state?.input?.autoFire === false
      && document.pointerLockElement == null
      && route?.active === false
      && Math.abs(Number(state?.input?.moveX || 0)) < 0.001
      && Math.abs(Number(state?.input?.moveZ || 0)) < 0.001
      && Math.abs(Number(state?.input?.turnIntent || 0)) < 0.001;
  }, null, { timeout: 10_000 });
  await assertNoPursuitPresentation(page);

  // Keyboard ownership returns after the pointer cell closes.
  await canvas.focus();
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => Math.abs(Number(window.SF?.state?.input?.moveZ || 0)) > 0.1,
    null, { timeout: 5_000 });
  await page.keyboard.up('KeyW');
  await waitForNeutralControls(page);
  const final = await readControlSnapshot(page);
  assert.equal(final.input.actions?.autopursuit, false);
  assert.equal(final.player._flightFrame?.autopursuit, null);

  const result = {
    schema: 'spaceface.pq007ControlRoute.v1',
    runtimeKind,
    fixedSeed,
    canonicalRoot: expectedRootUrl,
    actor: 'visible controls + trusted keyboard + native Playwright relative mouse',
    injectedState: false,
    productOwnerCalls: false,
    syntheticDomDispatch: false,
    usefulTarget: mission,
    keyboard: { before: keyboardBefore, held: keyboardHeld, after: keyboardAfter },
    autoTarget: { enabled: gEnabled, firstDraw, clutched, secondDraw, final },
    pathPresentation: firstPathDom,
    checks: [
      'G selects the visible authored hostile without Tab or state injection',
      'locked lead and target identity remain visible while pointer path owns flight',
      'relative pointer motion draws, pause clutches, and opposite motion extends the route',
      'second G clears pointer/path authority and keyboard remains reachable',
      'retired pursuit action, diagnostics, and presentation remain absent',
    ],
  };
  await writeFile(path.join(outputDir, 'route-report.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function runBrowserAcceptance() {
  const manifest = createPq007ControlBrowserManifest();
  const outputDir = path.join(ARTIFACT_ROOT, 'browser');
  const diagnostic = process.argv.includes('--diagnostic');
  const brokerGate = await requireBrokerClaimOrDiagnostic({
    outputRoot: ARTIFACT_ROOT,
    manifest,
    tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
    diagnostic,
    explicitDiagnostic: diagnostic,
    root: ROOT,
  });
  if (!brokerGate.ok) {
    console.error(`[pq007-control-browser] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
    console.error('[pq007-control-browser] invoke via validation-broker-cli --manifest pq007-control-browser');
    process.exitCode = 2;
    return;
  }

  const { loadPlaywright } = await import('./lib/load-playwright.mjs');
  await mkdir(outputDir, { recursive: true });
  let server = null;
  let browser = null;
  try {
    server = await acquireVisualProbeServer({ root: ROOT });
    const executablePath = findSystemBrowser();
    assert(executablePath, 'PQ-007 Browser acceptance requires installed Chrome or Edge');
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--force-device-scale-factor=1',
      ],
    });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      screen: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const result = await runPq007PublicActorRoute({
      page,
      fixedSeed: manifest.fixedSeed,
      outputDir,
      runtimeKind: 'browser',
      expectedRootUrl: server.baseUrl,
    });
    assert.deepEqual(issues.errorIssues(), [], 'PQ-007 Browser route emitted page errors');
    console.log(`PQ-007 Browser control route PASS\n${JSON.stringify({
      target: result.usefulTarget.targetName,
      artifact: path.relative(ROOT, path.join(outputDir, 'route-report.json')),
    }, null, 2)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

function runFixtureProbe() {
  const state = createGameState(0xa0707a12);
  const bus = createBus();
  const runtime = createAutoTargetRuntime();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { weapons: [{ projSpeed: 360 }] },
  };
  const target = {
    id: 2,
    type: 'ship',
    alive: true,
    pos: { x: 240, z: 0 },
    vel: { x: 0, z: 45 },
    rot: 0,
  };

  state.mode = 'flight';
  state.playerId = player.id;
  state.player.targetId = target.id;
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  state.entityList.push(player, target);

  assert.equal(toggleAutoTarget(state, bus, runtime), true);
  assert.equal(state.input.autoFire, true);
  tickAutoTarget(state, 1 / 60, bus, runtime);
  assert(state.input.aimWorld.z > target.pos.z,
    'auto-target must lead a laterally moving target');

  state.input.autoTargetPath = {
    active: true,
    drawing: false,
    cursorX: 0,
    cursorY: 0,
    pointIndex: 1,
    points: [
      { x: player.pos.x, z: player.pos.z },
      { x: player.pos.x, z: player.pos.z + 180 },
    ],
  };
  tickAutoTarget(state, 1 / 60, bus, runtime);
  assert(Math.abs(state.input.moveX) + Math.abs(state.input.moveZ) + Math.abs(state.input.turnIntent) > 0,
    'draw-to-fly path must create a flight command');

  assert.equal(toggleAutoTarget(state, bus, runtime), false);
  assert.equal(state.input.autoFire, false);

  console.log('Auto-target steering probe OK');
}

async function readHunterMission(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const mission = state.missions.active.find((item) => item?.status === 'active'
      && item.originCareer === 'hunter' && item.originContractId === 'yard_writ');
    const target = mission && state.entities.get(mission.targetEntityIds[0]);
    return {
      id: mission?.id || null,
      title: mission?.title || null,
      targetId: target?.id || null,
      targetName: target?.data?.name || target?.data?.callsign || null,
      hostile: target?.data?.ai?.lawful === false,
    };
  });
}

async function readControlSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const route = state.input.autoTargetPath || {};
    return {
      tick: state.tick,
      simTime: state.simTime,
      player: {
        id: player.id,
        pos: { x: Number(player.pos.x), z: Number(player.pos.z) },
        vel: { x: Number(player.vel.x), z: Number(player.vel.z) },
        rot: Number(player.rot),
        _flightFrame: {
          autopursuit: player._flightFrame?.autopursuit ?? null,
          autopilot: player._flightFrame?.autopilot ?? null,
        },
      },
      input: {
        moveX: Number(state.input.moveX || 0),
        moveZ: Number(state.input.moveZ || 0),
        turnIntent: Number(state.input.turnIntent || 0),
        autoFire: state.input.autoFire === true,
        autoAim: state.input.autoAim
          ? { targetId: state.input.autoAim.targetId, leadSpeed: state.input.autoAim.leadSpeed }
          : null,
        actions: { autopursuit: state.input.actions?.autopursuit === true },
      },
      route: {
        active: route.active === true,
        drawing: route.drawing === true,
        pointIndex: Number(route.pointIndex || 0),
        cursorX: Number(route.cursorX || 0),
        cursorY: Number(route.cursorY || 0),
        points: Array.isArray(route.points)
          ? route.points.map((point) => ({ x: Number(point.x), z: Number(point.z) }))
          : [],
      },
      targetName: String(document.querySelector('.sf-target__name')?.textContent || '').trim(),
      weaponsText: String(document.querySelector('[data-k=weapons]')?.textContent || '').trim(),
      pointerLock: document.pointerLockElement?.id || null,
    };
  });
}

async function readPathPresentation(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#auto-target-flight-path');
    const line = svg?.querySelector('.sf-flight-path__route');
    const style = svg ? getComputedStyle(svg) : null;
    return {
      visible: !!(svg && style?.display !== 'none' && Number(style?.opacity || 0) > 0.05),
      polylinePoints: String(line?.getAttribute('points') || ''),
      drawingClass: svg?.classList.contains('is-drawing') === true,
    };
  });
}

async function waitForNeutralControls(page) {
  await page.waitForFunction(() => {
    const input = window.SF?.state?.input;
    return Math.abs(Number(input?.moveX || 0)) < 0.001
      && Math.abs(Number(input?.moveZ || 0)) < 0.001
      && Math.abs(Number(input?.turnIntent || 0)) < 0.001;
  }, null, { timeout: 5_000 });
}

async function assertNoPursuitPresentation(page) {
  const presentation = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
    };
    return {
      hints: String(document.querySelector('#control-hints')?.textContent || '').trim(),
      visibleToasts: [...document.querySelectorAll('.sf-toast__text')]
        .filter(visible).map((element) => String(element.textContent || '').trim()),
      pursuitSlots: [...document.querySelectorAll('.sf-pursuit-slot')].filter(visible).length,
    };
  });
  assert.doesNotMatch(presentation.hints, /pursuit|pursue/i,
    'visible control hints cannot describe G as pursuit');
  assert.equal(presentation.pursuitSlots, 0, 'retired pursuit cannot expose a visible HUD slot');
  assert.equal(presentation.visibleToasts.some((text) => /pursuit|pursue/i.test(text)), false,
    'G cannot emit a pursuit toast');
}

function planarDistance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.z || 0) - Number(b?.z || 0));
}

function subtractPoints(a, b) {
  return {
    x: Number(a?.x || 0) - Number(b?.x || 0),
    z: Number(a?.z || 0) - Number(b?.z || 0),
  };
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
