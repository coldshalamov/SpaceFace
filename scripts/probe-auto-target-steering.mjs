import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { chromium, _electron as electron } from 'playwright';

import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT_URL = new URL('../', import.meta.url);
const ROOT = fileURLToPath(ROOT_URL);

const server = await acquireVisualProbeServer({ root: ROOT });
let browser = null;
let app = null;
try {
  browser = await chromium.launch({ headless: true });
  const browserPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await browserPage.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await exerciseGestureStick(browserPage, 'browser');

  app = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 60000 });
  const electronPage = await app.firstWindow({ timeout: 60000 });
  await electronPage.waitForLoadState('domcontentloaded', { timeout: 60000 });
  await exerciseGestureStick(electronPage, 'electron');
} finally {
  if (app) await app.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

console.log('Auto-target steering live probe OK - browser and Electron capture, hold, reverse, visualize, and unlock the trackpad joystick.');

async function exerciseGestureStick(page, label) {
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.registry, null, {
    timeout: 60000,
  });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await splash.click();
    await splash.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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
    state.input.autoTargetStick = { active: false, x: 0, y: 0, magnitude: 0 };
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
  await tickLiveInput(page);

  await dispatchRelativeMotion(page, center, 230, -170);
  const first = await readStick(page);
  assert.equal(first.locked, true, `${label}: G must pointer-lock the flight canvas`);
  assert.equal(first.autoTarget, true, `${label}: G must enable auto-target`);
  assert(pointerMagnitude(first.pointer, center) > 0.2,
    `${label}: first swipe magnitude must be visible and bounded; report=${JSON.stringify(first)}`);
  assert(first.pointer.x > center.x && first.pointer.y < center.y,
    `${label}: first swipe must deflect top-right from neutral`);
  assert(first.stick.x > 0 && first.stick.y > 0,
    `${label}: top-right swipe must publish right-yaw plus forward-thrust axes`);
  assert.equal(first.helmBaseVisible, true,
    `${label}: the fixed HELM gate must identify the moving puck as a joystick, not a target`);
  assert.equal(first.aimReticleVisible, false,
    `${label}: the weapon crosshair cursor must be hidden while the HELM puck is active`);

  await page.waitForTimeout(170);
  await tickLiveInput(page);
  const held = await readStick(page);
  assert.equal(held.stick.active, true, `${label}: idle/lift must preserve held joystick deflection`);
  assertNear(held.pointer.x, first.pointer.x, 1, `${label}: held pointer x`);
  assertNear(held.pointer.y, first.pointer.y, 1, `${label}: held pointer y`);

  await dispatchRelativeMotion(page, center, -250, 190);
  const opposite = await readStick(page);
  assert(opposite.pointer.x < center.x && opposite.pointer.y > center.y,
    `${label}: opposite swipe must flip immediately from neutral`);
  assert(opposite.stick.x < 0 && opposite.stick.y < 0,
    `${label}: opposite swipe must publish left-yaw plus reverse-thrust axes`);

  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => document.pointerLockElement == null, null, { timeout: 5000 });
  const off = await readStick(page);
  assert.equal(off.autoTarget, false, `${label}: second G must disable auto-target`);
}

function readStick(page) {
  return page.evaluate(() => ({
    locked: document.pointerLockElement === document.getElementById('gl-canvas'),
    autoTarget: !!window.SF.state.input.autoFire,
    pointer: { ...window.SF.state.input.pointerScreen },
    stick: { ...window.SF.state.input.autoTargetStick },
    helmBaseVisible: getComputedStyle(document.getElementById('auto-target-stick-base')).display !== 'none',
    aimReticleVisible: getComputedStyle(document.getElementById('aim-reticle')).display !== 'none',
  }));
}

function dispatchRelativeMotion(page, center, movementX, movementY) {
  return page.evaluate(({ center, movementX, movementY }) => {
    const event = new MouseEvent('mousemove', {
      bubbles: true,
      clientX: center.x,
      clientY: center.y,
    });
    Object.defineProperty(event, 'movementX', { value: movementX });
    Object.defineProperty(event, 'movementY', { value: movementY });
    window.dispatchEvent(event);
  }, { center, movementX, movementY });
}

function tickLiveInput(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    state.mode = 'flight';
    state.ui.screenStack.length = 0;
    document.body.classList.remove('ui-modal-open');
    window.SF.registry.get('input').update(1 / 60, state);
  });
}

function assertNear(actual, expected, tolerance, label) {
  assert(Number.isFinite(actual), `${label} must be finite; got ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} +/- ${tolerance}; got ${actual}`);
}

function pointerMagnitude(pointer, center) {
  const radius = Math.max(72, Math.min(center.x * 2, center.y * 2) * 0.28);
  return Math.min(1, Math.hypot(pointer.x - center.x, pointer.y - center.y) / radius);
}
