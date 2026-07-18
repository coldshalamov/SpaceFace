import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, _electron as electron } from 'playwright';

import { createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT_URL = new URL('../', import.meta.url);
const ROOT = fileURLToPath(ROOT_URL);
const PROOF_DIR = process.env.SF_AUTO_TARGET_PROOF_DIR || '';
const RUNTIME = process.env.SF_AUTO_TARGET_PROBE_RUNTIME || 'both';

const server = await acquireVisualProbeServer({ root: ROOT });
let browser = null;
let app = null;
let isolatedLaunch = null;
try {
  if (RUNTIME !== 'electron') {
    browser = await chromium.launch({ headless: true });
    const browserPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    reportPageErrors(browserPage, 'browser');
    await browserPage.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[probe] browser DOM loaded');
    await exerciseDrawPath(browserPage, 'browser');
  }

  if (RUNTIME !== 'browser') {
    isolatedLaunch = createIsolatedElectronLaunch({
      root: ROOT,
      taskId: 'auto-target-steering',
      timeout: 60000,
    });
    app = await electron.launch(isolatedLaunch.options);
    const electronPage = await app.firstWindow({ timeout: 60000 });
    reportPageErrors(electronPage, 'electron');
    console.log(`[probe] Electron window acquired at ${electronPage.url()}`);
    await exerciseDrawPath(electronPage, 'electron');
  }
} finally {
  if (app) await app.close().catch(() => {});
  if (isolatedLaunch) isolatedLaunch.cleanup({ runtimeClosed: true });
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

console.log(`Auto-target steering live probe OK (${RUNTIME}) - draw, retain, extend, follow, visualize, and unlock path flight.`);

async function exerciseDrawPath(page, label) {
  console.log(`[probe] ${label}: waiting for SF runtime`);
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.registry, null, {
    timeout: 60000,
  });
  console.log(`[probe] ${label}: SF runtime ready`);
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await splash.click();
    await splash.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  const hasPlayer = await page.evaluate(() => {
    const state = window.SF.state;
    return !!(state.entities && state.entities.get(state.playerId));
  });
  console.log(`[probe] ${label}: hasPlayer=${hasPlayer}`);
  if (!hasPlayer) {
    const newGame = page.getByRole('button', { name: 'New Game', exact: true }).first();
    await newGame.click({ timeout: 30000 });
    await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30000 });
    console.log(`[probe] ${label}: canonical New Game -> Launch route activated`);
    try {
      await page.waitForFunction(() => {
        const state = window.SF && window.SF.state;
        const player = state && state.entities && state.entities.get(state.playerId);
        return !!(state && state.mode === 'flight' && player && player.alive !== false);
      }, null, { timeout: 120000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const state = window.SF && window.SF.state;
        return {
          mode: state && state.mode,
          playerId: state && state.playerId,
          entities: state && state.entityList && state.entityList.length,
          renderReadiness: state && state.render && state.render.authoredAssets,
          body: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700),
        };
      });
      throw new Error(`${label}: canonical flight startup failed: ${JSON.stringify(diagnostic)}`, {
        cause: error,
      });
    }
    console.log(`[probe] ${label}: player ready`);
  }
  const viewport = page.viewportSize() || await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  await page.evaluate(() => {
    const state = window.SF.state;
    const previousMode = state.mode;
    state.mode = 'flight';
    state.input.autoFire = false;
    state.input.autoTargetPath = { active: false, drawing: false, cursorX: 0, cursorY: 0, pointIndex: 1, points: [] };
    state.ui.screenStack.length = 0;
    state.ui.docked = false;
    document.body.classList.remove('ui-modal-open');
    const screens = document.getElementById('screens');
    if (screens) {
      screens.style.display = 'none';
      screens.style.pointerEvents = 'none';
    }
    window.SF.bus.emit('mode:changed', { mode: 'flight', previousMode });
  });

  await page.mouse.click(center.x, center.y);
  await page.keyboard.press('g');
  await page.waitForTimeout(50);
  const activation = await page.evaluate(() => ({
    autoTarget: !!window.SF.state.input.autoFire,
    locked: document.pointerLockElement === document.getElementById('gl-canvas'),
    modal: document.body.classList.contains('ui-modal-open'),
    activeElement: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
    requestPointerLock: typeof document.getElementById('gl-canvas')?.requestPointerLock,
  }));
  assert.equal(activation.autoTarget, true,
    `${label}: G must reach auto-target; activation=${JSON.stringify(activation)}`);
  await page.waitForFunction(() => document.pointerLockElement === document.getElementById('gl-canvas'), null, {
    timeout: 5000,
  });
  console.log(`[probe] ${label}: auto-target active and pointer locked`);
  await tickLiveInput(page);

  const first = await dispatchRelativeMotion(page, center, 230, -170);
  assert.equal(first.locked, true, `${label}: G must pointer-lock the flight canvas`);
  assert.equal(first.autoTarget, true, `${label}: G must enable auto-target`);
  assertNear(first.pointer.x, center.x, 1, `${label}: centered hidden pointer x`);
  assertNear(first.pointer.y, center.y, 1, `${label}: centered hidden pointer y`);
  assert.equal(first.path.active, true,
    `${label}: relative motion must publish an active world route; report=${JSON.stringify(first)}`);
  assert.equal(first.path.drawing, true,
    `${label}: fresh relative motion must mark the route as drawing`);
  assert(first.path.points.length >= 2,
    `${label}: route must retain a ship origin plus projected endpoint`);
  assert(first.commandAlignment > 0.98,
    `${label}: local Flight V3 axes must follow the next route point; report=${JSON.stringify(first)}`);
  assert.equal(first.pathVisible, true,
    `${label}: active route must show its curve and endpoint marker`);
  assert(first.renderedPathPoints.length > 0,
    `${label}: route SVG must contain projected path points`);
  assert.equal(first.aimReticleVisible, false,
    `${label}: the weapon cursor must stay hidden while auto-target owns weapon aim`);
  console.log(`[probe] ${label}: first route drawn`);

  await page.waitForTimeout(350);
  await tickLiveInput(page);
  const released = await readRoute(page);
  assert.equal(released.path.active, true,
    `${label}: idle/lift must retain the unfinished route`);
  assert.equal(released.path.drawing, false,
    `${label}: idle/lift ends drawing without ending route traversal`);
  assert.equal(released.pathVisible, true,
    `${label}: retained route must stay visible while the ship follows it`);
  assert(Math.hypot(released.moveX, released.moveZ) > 0.05,
    `${label}: retained route must keep producing translation after finger lift`);
  const travelX = released.player.pos.x - first.player.pos.x;
  const travelZ = released.player.pos.z - first.player.pos.z;
  const travelDistance = Math.hypot(travelX, travelZ);
  const requestedX = first.path.points[1].x - first.player.pos.x;
  const requestedZ = first.path.points[1].z - first.player.pos.z;
  const requestedLength = Math.hypot(requestedX, requestedZ);
  const travelAlignment = travelDistance > 1e-6 && requestedLength > 1e-6
    ? (travelX * requestedX + travelZ * requestedZ) / (travelDistance * requestedLength)
    : 0;
  assert(travelDistance > 0.05,
    `${label}: the hull itself must move while following the retained route; travel=${travelDistance}`);
  assert(travelAlignment > 0.5,
    `${label}: hull travel must align with the drawn first leg; alignment=${travelAlignment}`);
  assert(Math.abs(wrapAngle(released.player.rot - first.player.rot)) > 0.01,
    `${label}: the hull itself must turn toward the route; first=${first.player.rot} released=${released.player.rot}`);
  console.log(`[probe] ${label}: retained route moved and turned the hull`);

  const opposite = await dispatchRelativeMotion(page, center, -250, 190);
  assert.equal(opposite.path.active, true);
  assert(opposite.path.points.length > released.path.points.length,
    `${label}: later motion must extend the route instead of erasing the earlier curve`);
  assert.equal(opposite.path.drawing, true);
  if (PROOF_DIR) {
    await mkdir(PROOF_DIR, { recursive: true });
    await page.screenshot({ path: join(PROOF_DIR, `${label}-draw-to-fly.png`) });
  }
  console.log(`[probe] ${label}: route extended and captured`);

  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => document.pointerLockElement == null, null, { timeout: 5000 });
  const off = await readRoute(page);
  assert.equal(off.autoTarget, false, `${label}: second G must disable auto-target`);
}

function readRoute(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const path = state.input.autoTargetPath || { active: false, pointIndex: 1, points: [] };
    const player = state.entities.get(state.playerId);
    const rot = player && Number.isFinite(player.rot) ? player.rot : 0;
    const commandWorldX = Math.cos(rot) * state.input.moveZ - Math.sin(rot) * state.input.moveX;
    const commandWorldZ = Math.sin(rot) * state.input.moveZ + Math.cos(rot) * state.input.moveX;
    const commandLength = Math.hypot(commandWorldX, commandWorldZ);
    const target = path.points && path.points[Math.max(1, path.pointIndex || 1)];
    const routeX = target && player ? target.x - player.pos.x : 0;
    const routeZ = target && player ? target.z - player.pos.z : 0;
    const routeLength = Math.hypot(routeX, routeZ);
    const commandAlignment = commandLength > 1e-6 && routeLength > 1e-6
      ? (commandWorldX * routeX + commandWorldZ * routeZ) / (commandLength * routeLength)
      : 0;
    const pathEl = document.getElementById('auto-target-flight-path');
    const line = pathEl && pathEl.querySelector('.sf-flight-path__route');
    return {
      locked: document.pointerLockElement === document.getElementById('gl-canvas'),
      autoTarget: !!state.input.autoFire,
      pointer: { ...state.input.pointerScreen },
      path: {
        ...path,
        points: Array.isArray(path.points) ? path.points.map((point) => ({ ...point })) : [],
      },
      moveX: state.input.moveX,
      moveZ: state.input.moveZ,
      turnIntent: state.input.turnIntent,
      player: {
        pos: { x: player.pos.x, z: player.pos.z },
        vel: { x: player.vel.x, z: player.vel.z },
        rot,
      },
      commandAlignment,
      pathVisible: !!(pathEl && pathEl.style.display !== 'none' && Number(pathEl.style.opacity) > 0.5),
      renderedPathPoints: line ? line.getAttribute('points') || '' : '',
      aimReticleVisible: getComputedStyle(document.getElementById('aim-reticle')).display !== 'none',
    };
  });
}

async function dispatchRelativeMotion(page, center, movementX, movementY) {
  await page.evaluate(({ center, movementX, movementY }) => {
    const event = new MouseEvent('mousemove', {
      bubbles: true,
      clientX: center.x,
      clientY: center.y,
    });
    Object.defineProperty(event, 'movementX', { value: movementX });
    Object.defineProperty(event, 'movementY', { value: movementY });
    window.dispatchEvent(event);
    const state = window.SF.state;
    window.SF.registry.get('input').update(1 / 60, state);
    window.SF.registry.get('autoTargetAssist').update(1 / 60, state);
    const ui = window.SF.registry.get('ui');
    if (ui && typeof ui._syncFlightCursor === 'function') ui._syncFlightCursor(true);
  }, { center, movementX, movementY });
  return readRoute(page);
}

function tickLiveInput(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    state.mode = 'flight';
    state.ui.screenStack.length = 0;
    document.body.classList.remove('ui-modal-open');
    window.SF.registry.get('input').update(1 / 60, state);
    window.SF.registry.get('autoTargetAssist').update(1 / 60, state);
    const ui = window.SF.registry.get('ui');
    if (ui && typeof ui._syncFlightCursor === 'function') ui._syncFlightCursor(true);
  });
}

function assertNear(actual, expected, tolerance, label) {
  assert(Number.isFinite(actual), `${label} must be finite; got ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} +/- ${tolerance}; got ${actual}`);
}

function reportPageErrors(page, label) {
  page.on('pageerror', (error) => console.error(`[probe] ${label} page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[probe] ${label} console error: ${message.text()}`);
  });
}

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}
