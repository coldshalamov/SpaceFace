#!/usr/bin/env node
// Held-out player-facing proof for the K1 Fulfillment administrative blackout.
//
// Boots the canonical authored-asset New Game route, compresses travel/positioning through the
// documented window.SF surface, then uses the production combat kernel twice: a player hit provokes
// the shipped fixed-route convoy and a Fulfillment EMP hit disables the player's real drive. The
// registered factionPresence system owns the resulting boarding FSM, fade lease, accessibility
// state, and input fence. No fixture route, replacement presenter, or synthetic markup is used.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'depth-program', 'k1-blackout');
const SCREENSHOT = path.join(OUT, 'fulfillment-administrative-blackout.png');
const MANIFEST = path.join(OUT, 'k1-fulfillment-blackout-evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CAPTURE_SEED = 0x4b31_b10c;
const START_TIMEOUT_MS = Number(process.env.SF_K1_BLACKOUT_START_TIMEOUT_MS) || 180_000;

function systemBrowserPath() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function waitForVisible(page, selector, label, timeout = 30_000) {
  await page.waitForFunction((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0 && rect.width > 20 && rect.height > 10;
  }, selector, { timeout }).catch((error) => {
    throw new Error(`Timed out waiting for ${label}: ${error.message}`);
  });
}

async function bootCanonicalFlight(page, baseUrl) {
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert(response && response.ok(), 'canonical game root must return a successful response');
  const current = new URL(page.url());
  const expected = new URL(baseUrl);
  assert.equal(current.origin, expected.origin, 'capture must stay on the owned public origin');
  assert.equal(current.pathname, '/', 'capture must use the canonical root path');
  assert.equal(current.search, '', 'capture must not use debug query flags');
  assert.equal(current.hash, '', 'capture must not use an alternate hash route');

  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.ctx),
    null,
    { timeout: 30_000 },
  );
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu', 45_000);
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', {
      seed,
      name: 'K1 Blackout Evidence Pilot',
      shipId: 'ship_kestrel',
      difficulty: 'standard',
    });
  }, CAPTURE_SEED);
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  return page.evaluate(async (seed) => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } = await import('/src/render/partsLibrary.js');
    const library = await state.render.authoredPartLibraryReady;
    const onboardingBefore = state.onboarding ? {
      active: state.onboarding.active === true,
      finished: state.onboarding.finished === true,
    } : null;
    if (state.onboarding) {
      state.onboarding.active = false;
      state.onboarding.finished = true;
    }
    if (state.ui) {
      state.ui.docked = false;
      state.ui.dockedStationId = null;
    }
    const screens = sf.ctx.screenManager;
    if (screens) {
      screens.closeAll();
      if (typeof screens.syncVisibility === 'function') screens.syncVisibility();
    }
    return {
      seed: state.meta && state.meta.seed,
      expectedSeed: seed,
      route: location.href,
      title: document.title,
      mode: state.mode,
      playerDefId: player && player.data && player.data.defId,
      backends: {
        flight: sf.registry.get('flight') && sf.registry.get('flight').name,
        ai: sf.registry.get('ai') && sf.registry.get('ai').name,
        physics: sf.registry.get('physics') && sf.registry.get('physics').name,
      },
      registeredOwners: {
        combat: sf.registry.get('combat') && sf.registry.get('combat').name,
        factionPresence: sf.registry.get('factionPresence') && sf.registry.get('factionPresence').name,
        ui: sf.registry.get('ui') && sf.registry.get('ui').name,
      },
      libraryUsable: isAuthoredPartLibraryUsable(library),
      criticalVisuals: authoredCriticalVisualReadiness(state),
      onboardingBefore,
      onboardingAfter: state.onboarding ? {
        active: state.onboarding.active === true,
        finished: state.onboarding.finished === true,
      } : null,
    };
  }, CAPTURE_SEED);
}

async function triggerProductionIncident(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    const presence = sf.registry.get('factionPresence');
    const combat = sf.registry.get('combat');
    if (!world || typeof world.enterSector !== 'function') throw new Error('registered world.enterSector unavailable');
    if (!presence || typeof presence.update !== 'function') throw new Error('registered factionPresence unavailable');
    if (!combat || typeof combat.ensureKernel !== 'function') throw new Error('registered combat kernel unavailable');

    const eventTrace = [];
    const trace = (type) => sf.bus.on(type, (payload = {}) => eventTrace.push({
      type,
      phase: payload.phase || null,
      boardingId: payload.boardingId || null,
      attackerId: payload.attackerId ?? null,
      targetId: payload.targetId ?? null,
      subsystemId: payload.subsystemId || null,
      text: payload.text || null,
    }));
    for (const type of [
      'combat:damage',
      'combat:subsystemDisabled',
      'factionPresence:fulfillmentProvoked',
      'factionPresence:boardingPhase',
      'presentation:caption',
    ]) trace(type);

    const fromSectorId = state.world.currentSectorId;
    sf.timeEffects.set('capture:k1-blackout', { scale: 0 });
    world.enterSector('sector_tethys_junction', {
      placePlayer: true,
      fromJump: true,
      via: 'capture-travel-compression',
      fromSectorId,
    });
    presence.update(1 / 60, state);

    const convoy = Object.values(state.factionPresence && state.factionPresence.active || {})
      .filter((row) => row && row.sectorId === 'sector_tethys_junction'
        && row.factionId === 'faction_fulfillment')
      .map((row) => state.entities.get(row.entityId))
      .filter((entity) => entity && entity.alive !== false
        && entity.data && entity.data.factionPresence
        && entity.data.factionPresence.factionId === 'faction_fulfillment'
        && entity.data.factionPresence.fixedRoute === true);
    if (convoy.length !== 3) throw new Error(`expected shipped three-ship Fulfillment convoy, got ${convoy.length}`);
    const attacker = convoy.find((entity) => (entity.data.weapons || []).some((weapon) => weapon.defId === 'wpn_emp_disruptor_m'))
      || convoy[0];
    const player = state.entities.get(state.playerId);
    if (!player || !attacker) throw new Error('live player/Fulfillment attacker unavailable');

    const playerX = attacker.pos.x + 120;
    const playerZ = attacker.pos.z + 40;
    if (player.pos && typeof player.pos.set === 'function') player.pos.set(playerX, 0, playerZ);
    else player.pos = { x: playerX, y: 0, z: playerZ };
    if (player.prevPos && typeof player.prevPos.copy === 'function') player.prevPos.copy(player.pos);
    if (player.vel && typeof player.vel.set === 'function') player.vel.set(0, 0, 0);
    else player.vel = { x: 0, y: 0, z: 0 };
    player.angVel = 0;
    player.flags = player.flags || {};
    player.flags.noInterp = true;

    const kernel = combat.ensureKernel();
    const provocation = kernel.routeDamage({
      attackerId: player.id,
      targetId: attacker.id,
      packet: { channels: { kinetic: 1 }, penetration: 0, shieldBypass: 0 },
      origin: { kind: 'capture-proof', id: 'player-provokes-fulfillment' },
    });
    if (!provocation || provocation.ok !== true || !(provocation.totalApplied > 0)) {
      throw new Error(`real provocation damage failed: ${JSON.stringify(provocation)}`);
    }
    if (attacker.data.ai.passive !== false || attacker.data.ai.retaliationTargetId !== player.id) {
      throw new Error('real combat:damage did not activate the Fulfillment variance response');
    }

    player.shield = 0;
    const disable = kernel.routeDamage({
      attackerId: attacker.id,
      targetId: player.id,
      packet: {
        channels: { ion: 50 },
        penetration: 0,
        shieldBypass: 1,
        subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
      },
      origin: { kind: 'capture-proof', id: 'fulfillment-emp-disable' },
    });
    if (!disable || disable.ok !== true || !disable.subsystemResult || disable.subsystemResult.after !== 0) {
      throw new Error(`real Fulfillment drive disable failed: ${JSON.stringify(disable)}`);
    }
    state.tick = (state.tick | 0) + 1;
    kernel.prePhysics(1 / 60);

    const boarding = state.factionPresence && state.factionPresence.boarding;
    if (!boarding || boarding.phase !== 'blackout') {
      throw new Error(`production K1 boarding FSM did not enter blackout: ${JSON.stringify(boarding)}`);
    }
    if (!state.ui || state.ui.fulfillmentBlackoutActive !== true) {
      throw new Error('production K1 UI fence did not activate from boardingPhase');
    }
    return {
      fromSectorId,
      sectorId: state.world.currentSectorId,
      convoyCount: convoy.length,
      convoyDefIds: convoy.map((entity) => entity.data.defId),
      routeId: attacker.data.factionPresence.routeId,
      attackerId: attacker.id,
      attackerDefId: attacker.data.defId,
      attackerDistance: Math.hypot(attacker.pos.x - player.pos.x, attacker.pos.z - player.pos.z),
      provocation: { ok: provocation.ok, applied: provocation.totalApplied },
      disable: {
        ok: disable.ok,
        subsystemId: disable.subsystemResult.subsystemId,
        before: disable.subsystemResult.before,
        after: disable.subsystemResult.after,
      },
      boarding: { ...boarding, holdingPos: boarding.holdingPos ? { ...boarding.holdingPos } : null },
      eventTrace,
      fixedClock: true,
      timeScale: state.timeScale,
    };
  });
}

async function inspectFenceAndPresentation(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('sf-dock-overlay');
    return window.SF?.state?.ui?.fulfillmentBlackoutActive === true
      && overlay && !overlay.hidden
      && overlay.classList.contains('active')
      && overlay.classList.contains('sf-administrative-blackout')
      && Number(getComputedStyle(overlay).opacity) >= 0.999;
  }, null, { timeout: 15_000 });

  return page.evaluate(() => {
    const overlay = document.getElementById('sf-dock-overlay');
    const status = overlay && overlay.querySelector('[role="status"]');
    const hud = document.getElementById('hud');
    const style = getComputedStyle(overlay);
    const rect = overlay.getBoundingClientRect();
    const dispatched = {};
    for (const [name, event] of [
      ['tab', new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })],
      ['quickLoad', new KeyboardEvent('keydown', { key: 'F9', code: 'F9', bubbles: true, cancelable: true })],
      ['pointer', new PointerEvent('pointerdown', { bubbles: true, cancelable: true })],
      ['click', new MouseEvent('click', { bubbles: true, cancelable: true })],
      ['contextmenu', new MouseEvent('contextmenu', { bubbles: true, cancelable: true })],
      ['wheel', new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })],
    ]) {
      document.dispatchEvent(event);
      dispatched[name] = { defaultPrevented: event.defaultPrevented };
    }
    const screenBeforeTouch = window.SF.ctx.screenManager?.top?.() || null;
    const dockedBeforeTouch = window.SF.state.ui.docked === true;
    window.SF.bus.emit('touch:uiAction', { action: 'pause' });
    window.SF.bus.emit('touch:uiAction', { action: 'dock' });
    const screenAfterTouch = window.SF.ctx.screenManager?.top?.() || null;
    const dockedAfterTouch = window.SF.state.ui.docked === true;
    return {
      stateFenceActive: window.SF.state.ui.fulfillmentBlackoutActive === true,
      boardingPhase: window.SF.state.factionPresence?.boarding?.phase || null,
      overlay: {
        id: overlay.id,
        hidden: overlay.hidden,
        ariaHidden: overlay.getAttribute('aria-hidden'),
        classes: [...overlay.classList],
        opacity: style.opacity,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      },
      status: {
        text: status && status.textContent,
        role: status && status.getAttribute('role'),
        ariaLive: status && status.getAttribute('aria-live'),
        ariaAtomic: status && status.getAttribute('aria-atomic'),
        tabIndex: status && status.tabIndex,
        focused: document.activeElement === status,
      },
      modal: {
        bodyClass: document.body.classList.contains('ui-modal-open'),
        hudInert: !!(hud && hud.inert),
        hudAriaHidden: hud && hud.getAttribute('aria-hidden'),
      },
      dispatched,
      touchIntent: { screenBeforeTouch, screenAfterTouch, dockedBeforeTouch, dockedAfterTouch },
    };
  });
}

async function inspectPng(file) {
  const buffer = await readFile(file);
  assert(buffer.length >= 5_000, `${relative(file)} is unexpectedly small (${buffer.length} bytes)`);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', 'capture must be a PNG');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assert.deepEqual({ width, height }, VIEWPORT, 'capture dimensions must match the acceptance viewport');
  const info = await stat(file);
  return {
    path: relative(file),
    bytes: info.size,
    width,
    height,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const executablePath = systemBrowserPath();
  assert(executablePath, 'system Chrome or Edge is required for K1 blackout evidence');
  const probe = await acquireVisualProbeServer({ root: ROOT });
  const browser = await chromium.launch({
    headless: process.env.SF_K1_BLACKOUT_HEADED !== '1',
    executablePath,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const requestErrors = [];
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on('requestfailed', (request) => requestErrors.push({
    url: request.url(),
    error: request.failure() && request.failure().errorText,
  }));

  try {
    const startup = await bootCanonicalFlight(page, probe.baseUrl);
    assert.equal(startup.seed, startup.expectedSeed);
    assert.equal(startup.backends.flight, 'flight');
    assert.equal(startup.backends.ai, 'tacticalAI');
    assert.equal(startup.backends.physics, 'physics');
    assert.equal(startup.registeredOwners.combat, 'combat');
    assert.equal(startup.registeredOwners.factionPresence, 'factionPresence');
    assert.equal(startup.libraryUsable, true);
    assert.equal(startup.criticalVisuals.ready, true);

    const incident = await triggerProductionIncident(page);
    const presentation = await inspectFenceAndPresentation(page);
    assert.equal(incident.sectorId, 'sector_tethys_junction');
    assert.equal(incident.boarding.phase, 'blackout');
    assert(incident.eventTrace.some((row) => row.type === 'combat:subsystemDisabled'
      && row.subsystemId === 'subsystem_drive'));
    assert(incident.eventTrace.some((row) => row.type === 'factionPresence:boardingPhase'
      && row.phase === 'blackout'));
    assert.equal(presentation.stateFenceActive, true);
    assert.equal(presentation.boardingPhase, 'blackout');
    assert.equal(presentation.overlay.hidden, false);
    assert.equal(presentation.overlay.ariaHidden, 'false');
    assert.equal(presentation.overlay.opacity, '1');
    assert.equal(presentation.overlay.backgroundColor, 'rgb(5, 7, 13)');
    assert.equal(presentation.overlay.backgroundImage, 'none');
    assert.equal(presentation.overlay.pointerEvents, 'auto');
    assert.equal(presentation.overlay.zIndex, '2500');
    assert.deepEqual(presentation.overlay.rect, { x: 0, y: 0, width: 1440, height: 900 });
    assert.equal(presentation.status.text,
      'Fulfillment administrative boarding. Flight and interface controls are locked.');
    assert.equal(presentation.status.role, 'status');
    assert.equal(presentation.status.ariaLive, 'assertive');
    assert.equal(presentation.status.ariaAtomic, 'true');
    assert.equal(presentation.status.focused, true);
    assert.equal(presentation.modal.bodyClass, true);
    assert.equal(presentation.modal.hudInert, true);
    assert.equal(presentation.modal.hudAriaHidden, 'true');
    assert(Object.values(presentation.dispatched).every((row) => row.defaultPrevented === true),
      `blackout input dispatch escaped: ${JSON.stringify(presentation.dispatched)}`);
    assert.deepEqual(presentation.touchIntent, {
      screenBeforeTouch: null,
      screenAfterTouch: null,
      dockedBeforeTouch: false,
      dockedAfterTouch: false,
    });

    await page.screenshot({ path: SCREENSHOT });
    const screenshot = await inspectPng(SCREENSHOT);
    assert.deepEqual(pageErrors, [], pageErrors.join('\n'));
    assert.deepEqual(consoleErrors, [], consoleErrors.join('\n'));
    assert.deepEqual(httpErrors, [], JSON.stringify(httpErrors));
    assert.deepEqual(requestErrors, [], JSON.stringify(requestErrors));

    const evidence = {
      schema: 'spaceface.depthProgram.k1FulfillmentBlackoutEvidence.v1',
      result: 'passed',
      capturedAt: new Date().toISOString(),
      browser: {
        driver: 'Playwright controlling installed system Chromium browser',
        executablePath: executablePath.replace(/\\/g, '/'),
        browserPlugin: {
          requested: true,
          usable: false,
          reason: 'Browser plugin invocation failed in this task context: Cannot redefine property: process',
          fallbackAuthorized: 'system Chrome route',
        },
      },
      route: {
        url: startup.route,
        canonicalRoot: true,
        authoredNewGame: true,
        queryFlags: false,
        hashRoute: false,
        fixturePage: false,
        replacementUi: false,
        releaseAssetMode: true,
      },
      startup,
      productionSeam: {
        trigger: 'combat kernel routeDamage -> combat:subsystemDisabled -> factionPresence._onSubsystemDisabled -> factionPresence:boardingPhase -> uiRoot boarding fence/fade lease',
        incidentOwner: 'registered factionPresence system',
        presentationOwner: 'registered ui system and #sf-dock-overlay',
      },
      compressions: [
        'dismissed first-flight onboarding only after the canonical authored New Game gate completed',
        'called registered world.enterSector(sector_tethys_junction) instead of flying the route',
        'positioned the live player 126.49 units from the shipped Fulfillment convoy before combat',
        'froze fixed-step time through timeEffects after travel so the first production blackout phase remains inspectable',
      ],
      incident,
      presentation,
      screenshot,
      validation: {
        viewport: VIEWPORT,
        pageErrors,
        consoleErrors,
        httpErrors,
        requestErrors,
      },
      visualVerdict: 'The frame is intentionally fully opaque #05070d: no flight imagery or interactive HUD leaks through the administrative blackout. Its player-facing meaning is exposed by the focused assertive status node recorded above.',
    };
    await writeFile(MANIFEST, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`K1 Fulfillment blackout capture PASS ${JSON.stringify({
      screenshot: screenshot.path,
      sha256: screenshot.sha256,
      manifest: relative(MANIFEST),
      phase: incident.boarding.phase,
      inputFence: presentation.stateFenceActive,
      errors: 0,
    })}`);
  } finally {
    await browser.close().catch(() => {});
    await probe.close().catch(() => {});
  }
}

await main();
