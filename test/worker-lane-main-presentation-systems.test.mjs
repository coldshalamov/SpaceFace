import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  createRegistry,
  isMainLanePresentationSystemId,
  laneSimOwnedSystemIds,
} from '../src/core/registry.js';
import { render as rendererSystem } from '../src/render/renderer.js';
import { feel } from '../src/render/feel.js';
import { ui } from '../src/ui/uiRoot.js';
import { survivalHud } from '../src/ui/survivalHud.js';
import { swarmJuiceHud } from '../src/ui/swarmJuiceHud.js';
import { crucibleFocus } from '../src/ui/crucibleFocus.js';
import { redKitePrompt } from '../src/ui/redKitePrompt.js';

test('worker lane keeps DOM HUDs and event-only prompts on the main registry', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const registry = createRegistry({ state, bus, helpers: {}, simLane: 'worker' });

  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(registry.get('survivalHud'), survivalHud);
    assert.equal(registry.get('swarmJuiceHud'), swarmJuiceHud);
    assert.equal(registry.get('crucibleFocus'), crucibleFocus);
    assert.equal(registry.get('redKitePrompt'), redKitePrompt);
    assert.equal(registry.get('survivalArena'), undefined,
      'authoritative simulation systems remain worker-owned');

    assert.equal(isMainLanePresentationSystemId('survivalHud'), true);
    assert.equal(isMainLanePresentationSystemId('redKitePrompt'), true);
    assert.equal(isMainLanePresentationSystemId('survivalArena'), false);
    const simOwned = laneSimOwnedSystemIds([
      'survivalHud', 'redKitePrompt', 'survivalArena', 'swarmJuice',
    ]);
    assert.deepEqual([...simOwned], ['survivalArena', 'swarmJuice']);
  } finally {
    console.warn = previousWarn;
    registry.destroy();
  }
});

test('worker-lane DOM observers update every presented frame and isolate one observer failure', () => {
  const state = createGameState(4242);
  const registry = createRegistry({ state, bus: createBus(), helpers: {}, simLane: 'worker' });
  const originals = [survivalHud.update, swarmJuiceHud.update, crucibleFocus.update];
  const originalPrepareFrame = rendererSystem.prepareFrame;
  const originalFeelFrame = feel.frame;
  const originalUiFrame = ui.frame;
  const calls = [];
  try {
    rendererSystem.prepareFrame = () => false;
    feel.frame = () => {};
    ui.frame = () => {};
    survivalHud.update = (dt, current) => calls.push(['survivalHud', dt, current]);
    swarmJuiceHud.update = () => { throw new Error('isolated HUD observer failure'); };
    crucibleFocus.update = (dt, current) => calls.push(['crucibleFocus', dt, current]);

    const previousError = console.error;
    const reported = [];
    console.error = (...args) => reported.push(args);
    try { registry.renderUpdate(0, 1 / 60); }
    finally { console.error = previousError; }

    assert.deepEqual(calls.map(([name]) => name), ['survivalHud', 'crucibleFocus']);
    assert.ok(calls.every(([, dt, current]) => dt === 1 / 60 && current === state));
    assert.ok(reported.some(([message]) => /swarmJuiceHud presentation update error/.test(message)));
  } finally {
    [survivalHud.update, swarmJuiceHud.update, crucibleFocus.update] = originals;
    rendererSystem.prepareFrame = originalPrepareFrame;
    feel.frame = originalFeelFrame;
    ui.frame = originalUiFrame;
    registry.destroy();
  }
});
