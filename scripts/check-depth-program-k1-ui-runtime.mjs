#!/usr/bin/env node
// K1 administrative-blackout browser contract. Uses real Chromium DOM propagation and the
// production ScreenManager/UI input modules on the existing pause fixture; no debug game route.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();
let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(server.baseUrl + 'test/fixtures/pause-live-frame.html', {
    waitUntil: 'domcontentloaded',
  });

  const report = await page.evaluate(async () => {
    const { createBus } = await import('/src/core/eventBus.js');
    const { createScreenManager } = await import('/src/ui/screenManager.js');
    const { createUiInput } = await import('/src/ui/input.js');
    const { createPirateParleyPrompt } = await import('/src/ui/pirateParleyPrompt.js');
    const { createContactHailPrompt } = await import('/src/ui/contactHailPrompt.js');
    const { createSignalInvestigationPrompt } = await import('/src/ui/signalInvestigationPrompt.js');
    const { createRecoveryEncounterPrompt } = await import('/src/ui/recoveryEncounterPrompt.js');

    const bus = createBus();
    const timeEffectsCalls = [];
    const timeEffects = {
      set(id, request) { timeEffectsCalls.push(['set', id, request && request.scale]); },
      clear(id) { timeEffectsCalls.push(['clear', id]); },
    };
    const state = {
      mode: 'flight',
      timeScale: 1,
      ui: { docked: false, screenStack: [], fulfillmentBlackoutActive: true },
      settings: { controls: { gamepad: { enabled: true } } },
      player: { targetId: 'contact-k1', cargo: { items: { ore: 1 } } },
      playerId: 1,
      entities: new Map(),
      entityList: [],
      world: { currentSectorId: 'sector_k1_runtime' },
      simTime: 1,
    };
    const ctx = {
      state,
      bus,
      timeEffects,
      gamepad: {
        axes: { leftX: 0, leftY: 0 },
        actions: { pause: { pressed: true }, accept: { pressed: true } },
        isConnected: () => true,
      },
    };

    const manager = createScreenManager(ctx);
    manager.syncVisibility();
    const hud = document.getElementById('hud');
    const initialSemanticModal = document.body.classList.contains('ui-modal-open')
      && hud.getAttribute('aria-hidden') === 'true'
      && hud.inert === true;

    const observed = {
      tab: 0,
      pointer: 0,
      click: 0,
      contextmenu: 0,
      wheel: 0,
      cameraZoom: 0,
      dock: 0,
      quickLoad: 0,
      parleyChoices: 0,
      hailRequests: 0,
      hailChoices: 0,
      signalTracks: 0,
      recoveryChoices: 0,
    };
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Tab') observed.tab += 1; });
    document.addEventListener('pointerdown', () => { observed.pointer += 1; });
    document.addEventListener('click', () => { observed.click += 1; });
    document.addEventListener('contextmenu', () => { observed.contextmenu += 1; });
    document.addEventListener('wheel', () => { observed.wheel += 1; });
    bus.on('camera:zoom', () => { observed.cameraZoom += 1; });
    bus.on('dock:docked', () => { observed.dock += 1; });
    bus.on('game:load', () => { observed.quickLoad += 1; });
    bus.on('pirateParley:choose', () => { observed.parleyChoices += 1; });
    bus.on('contactHail:request', () => { observed.hailRequests += 1; });
    bus.on('contactHail:choice', () => { observed.hailChoices += 1; });
    bus.on('signal:track', () => { observed.signalTracks += 1; });
    bus.on('recovery:choose', () => { observed.recoveryChoices += 1; });

    // Match production uiRoot ordering: the document-capture fence must register before prompt
    // handlers. Prompt methods also consult the same semantic fence so direct/gamepad paths cannot
    // bypass DOM propagation ownership.
    const input = createUiInput(ctx, manager);
    const parleyPrompt = createPirateParleyPrompt(ctx);
    const contactHailPrompt = createContactHailPrompt(ctx);
    const signalPrompt = createSignalInvestigationPrompt(ctx);
    const recoveryPrompt = createRecoveryEncounterPrompt(ctx);
    const parleyShown = parleyPrompt.showDemand({
      squadId: 'k1-runtime-squad',
      hailerId: 'k1-runtime-raider',
      factionId: 'pirates',
      deadlineAt: 20,
      demand: { kind: 'credits', amount: 50 },
    });
    bus.emit('contactHail:availability', {
      enabled: true,
      targetId: 'contact-k1',
      kind: 'ship',
      label: 'Hail selected contact',
    });
    bus.emit('contactHail:offer', {
      requestId: 'hail-k1',
      targetId: 'contact-k1',
      lines: ['Administrative channel open.'],
      actions: [{ id: 'acknowledge', label: 'Acknowledge' }],
    });
    const hailShown = document.querySelector('#sf-contact-hail [data-k="panel"]')?.hidden === false;
    const directParleyBlocked = parleyPrompt.choose('comply', 'direct') === false;
    const directHailRequestBlocked = contactHailPrompt.request('direct') === false;
    const directHailChoiceBlocked = contactHailPrompt.choose('acknowledge', 'direct') === false;
    const signalShown = signalPrompt.showResults({ primary: {
      id: 'signal-k1', classification: 'administrative echo', detail: 'Unresolved routing carrier.',
      confidence: 0.9, strength: 0.8, distance: 120, scanCount: 1,
    }, total: 1 });
    const recoveryShown = recoveryPrompt.render({
      recoveryId: 'recovery-k1', phase: 'decision', conditionLabel: 'ROUTING CASUALTY',
      ownership: 'OPEN SALVAGE', legalStatus: 'open', hasSurvivor: true,
    });
    const directSignalBlocked = signalPrompt.track('direct') === false;
    const directRecoveryBlocked = recoveryPrompt.choose('rescue', 'direct') === false;
    bus.emit('dock:range', { stationId: 'fulfillment-route-office', inRange: true });
    const target = document.getElementById('gl-canvas');
    const events = [
      new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: 'F9', code: 'F9', bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true, cancelable: true }),
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true }),
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }),
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }),
    ];
    for (const event of events) target.dispatchEvent(event);
    bus.emit('touch:uiAction', { action: 'dock' });
    bus.emit('touch:uiAction', { action: 'pause' });
    input.tick(1 / 60);
    parleyPrompt.tick();
    signalPrompt.tick();
    recoveryPrompt.tick();

    const fencedDefaults = events.every((event) => event.defaultPrevented === true);
    const fencedPropagation = observed.tab === 0
      && observed.pointer === 0
      && observed.click === 0
      && observed.contextmenu === 0
      && observed.wheel === 0;
    const fencedIntents = observed.cameraZoom === 0
      && observed.dock === 0
      && observed.quickLoad === 0
      && manager.isOpen() === false
      && state.timeScale === 1;
    const fencedCommsPrompts = parleyShown === true
      && hailShown === true
      && directParleyBlocked
      && directHailRequestBlocked
      && directHailChoiceBlocked
      && signalShown === true
      && recoveryShown === true
      && directSignalBlocked
      && directRecoveryBlocked
      && observed.parleyChoices === 0
      && observed.hailRequests === 0
      && observed.hailChoices === 0
      && observed.signalTracks === 0
      && observed.recoveryChoices === 0;

    state.ui.fulfillmentBlackoutActive = false;
    manager.syncVisibility();
    const releasedSemanticModal = !document.body.classList.contains('ui-modal-open')
      && hud.getAttribute('aria-hidden') !== 'true'
      && hud.inert === false;

    const resumedPointer = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const resumedContext = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    const resumedWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    target.dispatchEvent(resumedPointer);
    target.dispatchEvent(resumedContext);
    target.dispatchEvent(resumedWheel);
    bus.emit('touch:uiAction', { action: 'dock' });
    const releasedPropagation = observed.pointer === 1
      && observed.contextmenu === 1
      && observed.wheel === 1
      && observed.cameraZoom === 1
      && observed.dock === 1;

    parleyPrompt.destroy();
    contactHailPrompt.destroy();
    signalPrompt.destroy();
    recoveryPrompt.destroy();
    input.dispose();
    state.ui.fulfillmentBlackoutActive = true;
    const afterDisposePointer = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    target.dispatchEvent(afterDisposePointer);
    const inputTeardown = observed.pointer === 2 && afterDisposePointer.defaultPrevented === false;

    state.ui.fulfillmentBlackoutActive = false;
    manager.register({
      id: 'k1Lifecycle',
      mount(el) { el.innerHTML = '<button type="button">Lifecycle</button>'; },
    });
    manager.pushScreen('k1Lifecycle');
    const firstManagerScreens = document.querySelectorAll('#screens > .screen').length;
    manager.destroy();
    const afterDestroyScreens = document.querySelectorAll('#screens > .screen').length;
    const destroyedChromeClean = document.getElementById('screens').style.display === 'none'
      && document.getElementById('modal-backdrop').hidden === true
      && !document.body.classList.contains('ui-modal-open')
      && hud.inert === false;
    const callsAfterDestroy = timeEffectsCalls.length;
    bus.emit('mode:changed', {});
    bus.emit('save:error', {});
    const busTeardown = timeEffectsCalls.length === callsAfterDestroy;

    const manager2 = createScreenManager(ctx);
    manager2.register({
      id: 'k1Lifecycle',
      mount(el) { el.innerHTML = '<button type="button">Lifecycle 2</button>'; },
    });
    manager2.pushScreen('k1Lifecycle');
    const secondManagerScreens = document.querySelectorAll('#screens > .screen').length;
    manager2.destroy();

    return {
      initialSemanticModal,
      fencedDefaults,
      fencedPropagation,
      fencedIntents,
      fencedCommsPrompts,
      releasedSemanticModal,
      releasedPropagation,
      inputTeardown,
      screenManagerLifecycle: firstManagerScreens === 1
        && afterDestroyScreens === 0
        && secondManagerScreens === 1
        && destroyedChromeClean,
      busTeardown,
      observed,
      events: events.map((event) => ({ type: event.type, defaultPrevented: event.defaultPrevented })),
    };
  });

  for (const key of [
    'initialSemanticModal',
    'fencedDefaults',
    'fencedPropagation',
    'fencedIntents',
    'fencedCommsPrompts',
    'releasedSemanticModal',
    'releasedPropagation',
    'inputTeardown',
    'screenManagerLifecycle',
    'busTeardown',
  ]) {
    assert.equal(report[key], true, `${key}: ${JSON.stringify(report)}`);
  }
  console.log('depth-program-k1-ui-runtime PASS', JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8760);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`server exited early\n${output}`);
    try {
      const response = await fetch(baseUrl + 'test/fixtures/pause-live-frame.html');
      if (response.ok) return { baseUrl, kill: () => child.kill() };
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`server did not become reachable at ${baseUrl}\n${output}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port for K1 UI runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
