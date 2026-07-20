import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, _electron as electron } from 'playwright';

import { adjustPursuitSlot } from '../src/core/flight/pursuitSlotAssist.js';
import { createIsolatedElectronLaunch } from './lib/electronTestIsolation.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROOF_DIR = process.env.SF_PQ007_PROOF_DIR || process.env.SF_AUTO_TARGET_PROOF_DIR || '';
const RUNTIME = process.env.SF_PQ007_PROBE_RUNTIME || process.env.SF_AUTO_TARGET_PROBE_RUNTIME || 'both';

const server = await acquireVisualProbeServer({ root: ROOT });
let browser = null;
let app = null;
let isolatedLaunch = null;
try {
  if (RUNTIME !== 'electron') {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    reportPageErrors(page, 'browser');
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await exercisePursuitSlot(page, 'browser');
  }

  if (RUNTIME !== 'browser') {
    isolatedLaunch = createIsolatedElectronLaunch({
      root: ROOT,
      taskId: 'pq007-pursuit-slot',
      timeout: 60000,
    });
    app = await electron.launch(isolatedLaunch.options);
    const page = await app.firstWindow({ timeout: 60000 });
    reportPageErrors(page, 'electron');
    await exercisePursuitSlot(page, 'electron');
  }
} finally {
  if (app) await app.close().catch(() => {});
  if (isolatedLaunch) isolatedLaunch.cleanup({ runtimeClosed: true });
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

console.log(`PQ-007 pursuit-slot live probe OK (${RUNTIME}) - MMB select, relative adjust, bounded hold, one-tick manual release, G cleanup.`);

async function exercisePursuitSlot(page, label) {
  console.log(`[probe] ${label}: waiting for SF runtime`);
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.registry, null, {
    timeout: 60000,
  });
  await dismissSplash(page);
  await ensureCanonicalFlight(page, label);

  const viewport = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const pointer = { x: viewport.width * 0.68, y: viewport.height * 0.34 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.waitForTimeout(100);

  const fixture = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    if (!player || !sf.helpers || typeof sf.helpers.spawnEntity !== 'function') {
      throw new Error('PQ-007 probe could not reach the live player/spawn seam');
    }
    const previousMode = state.mode;
    state.mode = 'flight';
    state.ui.screenStack.length = 0;
    state.ui.docked = false;
    state.input.autoFire = false;
    if (state.input.pursuitSlot) state.input.pursuitSlot.active = false;
    document.body.classList.remove('ui-modal-open');
    const screens = document.getElementById('screens');
    if (screens) {
      screens.style.display = 'none';
      screens.style.pointerEvents = 'none';
    }
    sf.bus.emit('mode:changed', { mode: 'flight', previousMode });

    const cursorAim = Number.isFinite(state.input.aimAngle) ? state.input.aimAngle : 0;
    const targetAngle = cursorAim + 1.35;
    const target = sf.helpers.spawnEntity({
      type: 'ship',
      factionId: 'faction_free',
      team: player.team,
      pos: {
        x: player.pos.x + Math.cos(targetAngle) * 360,
        z: player.pos.z + Math.sin(targetAngle) * 360,
      },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 15,
      mass: 900,
      hull: 900,
      hullMax: 900,
      shield: 0,
      shieldMax: 0,
      cap: 0,
      capMax: 0,
      collides: true,
      data: { probe: 'pq007-pursuit-slot', combat: {}, derived: { mass: 900 } },
    });
    state.player.targetId = target.id;
    window.__pq007ManualKeyTick = null;
    addEventListener('keydown', (event) => {
      if (event.code === 'KeyW') window.__pq007ManualKeyTick = state.tick;
    }, { capture: true, once: true });
    return {
      targetId: target.id,
      playerId: player.id,
      aimAngle: cursorAim,
      targetAngle,
    };
  });

  // MMB is the audited SF-07 selection mechanism. It now selects the same slot as G instead of
  // entering a fixed-tail flight mode.
  await dispatchMiddleClick(page, pointer);
  await page.waitForFunction((targetId) => {
    const slot = window.SF.state.input.pursuitSlot;
    return !!(slot && slot.active && slot.targetId === targetId && slot.source === 'mmb');
  }, fixture.targetId, { timeout: 5000 });
  const selected = await readPursuit(page);
  assert.equal(selected.pointerLocked, false, `${label}: MMB pursuit must not capture the pointer`);
  assert.equal(selected.autoFire, false, `${label}: MMB pursuit must not enable persistent weapon aim`);
  assert.equal(selected.reticleVisible, true, `${label}: the independent weapon reticle must stay visible`);
  assert(angleDistance(selected.aimAngle, fixture.aimAngle) < 0.08,
    `${label}: selecting pursuit must not rewrite cursor aim`);
  assert(angleDistance(selected.aimAngle, fixture.targetAngle) > 0.5,
    `${label}: cursor aim must remain independent from the selected ship`);

  const pointerEvents = await dispatchRelativeMotion(page, pointer, 150, -70);
  await page.waitForFunction(() => {
    const frame = window.SF.state.entities.get(window.SF.state.playerId)?._flightFrame?.pursuitSlot;
    return !!(frame && frame.active && frame.slotError > 1);
  }, null, { timeout: 5000 });
  const adjusted = await readPursuit(page);
  const expectedAdjusted = adjustPursuitSlot(selected.slot, { movementX: 150, movementY: -70 });
  assert.notEqual(adjusted.slot.bearing, selected.slot.bearing,
    `${label}: relative horizontal motion must change target-frame bearing`);
  assert(adjusted.slot.range > selected.slot.range,
    `${label}: upward relative motion must increase the selected station range`);
  assert(Math.abs(adjusted.slot.bearing - expectedAdjusted.bearing) < 1e-9,
    `${label}: paired pointer/mouse events must apply horizontal slot motion exactly once `
      + `(actual=${adjusted.slot.bearing}, expected=${expectedAdjusted.bearing}, events=${JSON.stringify(pointerEvents)})`);
  assert(Math.abs(adjusted.slot.range - expectedAdjusted.range) < 1e-9,
    `${label}: paired pointer/mouse events must apply range motion exactly once `
      + `(actual=${adjusted.slot.range}, expected=${expectedAdjusted.range})`);
  assert.equal(adjusted.pointerLocked, false, `${label}: relative adjustment must remain pointer-lock free`);
  assert.equal(adjusted.reticleVisible, true, `${label}: relative adjustment must preserve weapon aim UI`);

  await page.waitForTimeout(1800);
  const held = await readPursuit(page);
  assert.equal(held.slot.active, true, `${label}: finger lift must hold the selected slot`);
  assert.equal(held.slot.bearing, adjusted.slot.bearing, `${label}: held bearing must persist exactly`);
  assert.equal(held.slot.range, adjusted.slot.range, `${label}: held range must persist exactly`);
  assert.equal(held.frame.active, true, `${label}: Flight V3 must keep publishing pursuit telemetry`);
  assert(held.frame.maxAcceleration > 0 && held.frame.saturated !== undefined,
    `${label}: live telemetry must expose bounded controller authority`);
  const hullTravel = Math.hypot(
    held.player.pos.x - adjusted.player.pos.x,
    held.player.pos.z - adjusted.player.pos.z,
  );
  assert(hullTravel > 0.1, `${label}: the real hull must respond to the held station; travel=${hullTravel}`);
  assert.equal(held.hudVisible, true, `${label}: pursuit hold must expose the non-color HUD status cue`);
  assert.match(held.hudText, /PURSUIT ASSIST.*(HOLDING|ACQUIRING)/,
    `${label}: HUD cue must communicate state in text, not color alone`);

  if (PROOF_DIR) {
    await mkdir(PROOF_DIR, { recursive: true });
    await page.screenshot({ path: join(PROOF_DIR, `${label}-pq007-pursuit-slot.png`) });
  }

  const tickBeforeManual = held.tick;
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.SF.state.input.pursuitSlot?.active === false, null, {
    timeout: 5000,
  });
  const released = await readPursuit(page);
  await page.keyboard.up('KeyW');
  assert.equal(released.slot.reason, 'manual-override', `${label}: manual movement must own the release reason`);
  assert.equal(released.actionsAutopursuit, false, `${label}: release tick must withdraw the assist action`);
  assert(Number.isFinite(released.manualKeyTick), `${label}: manual key event tick must be observed`);
  assert(Number.isFinite(released.slot.releasedTick), `${label}: manual release must publish its fixed tick`);
  assert(released.slot.releasedTick - released.manualKeyTick <= 1,
    `${label}: manual release must complete within one fixed tick; key=${released.manualKeyTick} release=${released.slot.releasedTick}`);
  assert(released.tick >= tickBeforeManual,
    `${label}: release evidence must be sampled after the held station`);

  // G now selects the same station and never resurrects the retired pointer-lock/autoaim route.
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => window.SF.state.input.pursuitSlot?.active === true, null, { timeout: 5000 });
  const gSelected = await readPursuit(page);
  assert.equal(gSelected.slot.source, 'g', `${label}: G must feed the shared pursuit-slot contract`);
  assert.equal(gSelected.pointerLocked, false, `${label}: G must not capture pointer lock`);
  assert.equal(gSelected.autoFire, false, `${label}: G must not enable persistent weapon autoaim`);
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => window.SF.state.input.pursuitSlot?.active === false, null, { timeout: 5000 });

  console.log(`[probe] ${label}: slotError=${adjusted.frame.slotError.toFixed(2)} holdTravel=${hullTravel.toFixed(2)} cap=${held.frame.maxAcceleration.toFixed(2)} manualTicks=${released.slot.releasedTick - released.manualKeyTick}`);
}

async function dismissSplash(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await splash.click();
    await splash.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

async function ensureCanonicalFlight(page, label) {
  const hasPlayer = await page.evaluate(() => {
    const state = window.SF.state;
    return !!(state.entities && state.entities.get(state.playerId));
  });
  if (!hasPlayer) {
    await page.getByRole('button', { name: 'New Game', exact: true }).first().click({ timeout: 30000 });
    await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30000 });
  }
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
        body: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700),
      };
    });
    throw new Error(`${label}: canonical flight startup failed: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
}

async function dispatchRelativeMotion(page, pointer, movementX, movementY) {
  await page.evaluate(() => {
    window.__pq007PointerEvents = [];
    for (const type of ['pointermove', 'mousemove']) {
      addEventListener(type, (event) => {
        window.__pq007PointerEvents.push({
          type: event.type,
          timeStamp: event.timeStamp,
          clientX: event.clientX,
          clientY: event.clientY,
          movementX: event.movementX,
          movementY: event.movementY,
        });
      }, { capture: true, once: true });
    }
  });
  // Playwright's native mouse path emits the browser's real pointermove + compatibility
  // mousemove pair, exercising the production dedupe seam instead of a synthetic single event.
  await page.mouse.move(pointer.x + movementX, pointer.y + movementY);
  await page.waitForTimeout(100);
  return page.evaluate(() => window.__pq007PointerEvents || []);
}

async function dispatchMiddleClick(page, pointer) {
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('gl-canvas');
    if (!canvas) throw new Error('PQ-007 probe could not find the gameplay canvas');
    canvas.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 1,
      buttons: 4,
      clientX: x,
      clientY: y,
    }));
  }, pointer);
  await page.waitForTimeout(80);
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 1,
      buttons: 0,
      clientX: x,
      clientY: y,
    }));
  }, pointer);
}

function readPursuit(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const slot = state.input.pursuitSlot || { active: false };
    const frame = player?._flightFrame?.pursuitSlot || { active: false, reason: 'unavailable' };
    const cue = document.querySelector('.sf-pursuit-slot');
    const reticle = document.getElementById('aim-reticle');
    return {
      tick: state.tick,
      manualKeyTick: window.__pq007ManualKeyTick,
      slot: { ...slot },
      frame: JSON.parse(JSON.stringify(frame)),
      player: {
        pos: { x: player.pos.x, z: player.pos.z },
        vel: { x: player.vel.x, z: player.vel.z },
      },
      aimAngle: state.input.aimAngle,
      aimWorld: { ...state.input.aimWorld },
      autoFire: !!state.input.autoFire,
      actionsAutopursuit: !!state.input.actions?.autopursuit,
      pointerLocked: document.pointerLockElement != null,
      reticleVisible: !!(reticle && getComputedStyle(reticle).display !== 'none'),
      hudVisible: !!(cue && getComputedStyle(cue).display !== 'none'),
      hudText: cue ? cue.textContent.replace(/\s+/g, ' ').trim() : '',
    };
  });
}

function angleDistance(a, b) {
  let delta = (a || 0) - (b || 0);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function reportPageErrors(page, label) {
  page.on('pageerror', (error) => console.error(`[probe] ${label} page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[probe] ${label} console error: ${message.text()}`);
  });
}
