// ZERO_TO_HERO Phase 5.1 — the demo flag itself and the NON-demo contract: without the define the
// flag is off, the title keeps its save-driven primary, the results plate shows no belt bridge,
// and the end card never fires.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { onboarding } from '../src/systems/onboarding.js';
import { titlePrimaryAction } from '../src/ui/screens/mainMenu.js';
import { crucibleResultsScreen } from '../src/ui/screens/crucible.js';
import { mountScreen } from './helpers/fake-dom.mjs';

test('IS_DEMO is false by default (no define, no query)', async () => {
  const mod = await import('../src/core/demoMode.js');
  assert.equal(mod.IS_DEMO, false);
});

test('IS_DEMO is true when the bundle define bakes it in', async () => {
  globalThis.__SPACEFACE_DEMO__ = true;
  try {
    const mod = await import('../src/core/demoMode.js?baked');
    assert.equal(mod.IS_DEMO, true);
  } finally {
    delete globalThis.__SPACEFACE_DEMO__;
  }
});

test('IS_DEMO is true on a non-production page with ?demo=1', async () => {
  globalThis.location = { search: '?demo=1' };
  try {
    const mod = await import('../src/core/demoMode.js?query');
    assert.equal(mod.IS_DEMO, true);
  } finally {
    delete globalThis.location;
  }
});

test('non-demo title primary is Continue with a save, New Game without', () => {
  assert.equal(titlePrimaryAction(false, true), 'continue');
  assert.equal(titlePrimaryAction(false, false), 'newGame');
});

export function mountResults(result, ctxExtra = {}) {
  return mountScreen(crucibleResultsScreen, {
    registryGet: (name) => (name === 'survivalResults' ? { lastResult: () => result } : null),
    ctx: ctxExtra,
  });
}

const BENCH_RESULT = Object.freeze({
  outcome: 'defeat', seed: 4242, arenaId: 'helios_core', wave: 3, deepestWave: 3,
  wavesCleared: 2, kills: 9, score: 400, credits: 40, xp: 120, level: 2,
  picks: [], headline: 'The run ended.',
  damageTrail: [],
});

test('the results plate shows no Take it to the belt bridge outside the demo', () => {
  const { buttons } = mountResults(BENCH_RESULT);
  assert.equal(buttons.some((b) => b.textContent === 'Take it to the belt'), false);
});

function bootOnboarding() {
  const state = createGameState(7);
  const bus = createBus();
  const pushed = [];
  bus.on('ui:pushScreen', (p) => pushed.push(p));
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return { state, bus, pushed };
}

test('a fitted undock never fires the end card outside the demo', () => {
  const { state, bus, pushed } = bootOnboarding();
  bus.emit('dock:docked', { stationId: 'station_helios' });
  state.ui.docked = true;
  bus.emit('module:equipped', { shipId: state.playerId, slotIndex: 3, defId: 'mod_engine_fusion_m' });
  state.ui.docked = false;
  bus.emit('dock:undocked', { stationId: 'station_helios' });
  assert.equal(pushed.length, 0);
  assert.equal(state.player.hints.demoEndShown || false, false);
});
