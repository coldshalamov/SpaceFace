// ZERO_TO_HERO Phase 5.1 / 5.5 — the demo path itself. The flag helper must be imported first so
// every module below evaluates with the bundle define baked true (import order is evaluation order).
import './helpers/enable-demo.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { IS_DEMO } from '../src/core/demoMode.js';
import { onboarding } from '../src/systems/onboarding.js';
import { titlePrimaryAction, titleVerbOrder } from '../src/ui/screens/mainMenu.js';
import { crucibleResultsScreen } from '../src/ui/screens/crucible.js';
import { demoEndFacts, demoEndScreen } from '../src/ui/screens/demoEnd.js';
import { mountScreen, textLines } from './helpers/fake-dom.mjs';

const BENCH_RESULT = Object.freeze({
  outcome: 'defeat', seed: 4242, arenaId: 'helios_core', wave: 3, deepestWave: 3,
  wavesCleared: 2, kills: 9, score: 400, credits: 40, xp: 120, level: 2,
  picks: [], headline: 'The run ended.',
  damageTrail: [],
});

function mountResults(result) {
  return mountScreen(crucibleResultsScreen, {
    registryGet: (name) => (name === 'survivalResults' ? { lastResult: () => result } : null),
  });
}

function bootOnboarding() {
  const state = createGameState(7);
  const bus = createBus();
  const pushed = [];
  bus.on('ui:pushScreen', (p) => pushed.push(p));
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return { state, bus, pushed };
}

test('the demo flag is on when the bundle define is baked', () => {
  assert.equal(IS_DEMO, true);
});

test('demo title primary is the Crucible, save or no save', () => {
  assert.equal(titlePrimaryAction(true, true), 'crucible');
  assert.equal(titlePrimaryAction(true, false), 'crucible');
});

test('demo title puts the Crucible FIRST in the list (DEMO_READINESS §5)', () => {
  assert.deepEqual(titleVerbOrder(true), ['crucible', 'newGame', 'continue', 'settings', 'quit']);
});

test('the results plate offers Take it to the belt and bridges through game:new', () => {
  const { buttons, emitted } = mountResults(BENCH_RESULT);
  const belt = buttons.find((b) => b.textContent === 'Take it to the belt');
  assert.ok(belt, 'the demo results plate carries the belt bridge');
  belt.click();
  const events = emitted.map((e) => e.event);
  assert.deepEqual(events, ['game:over:dismissed', 'game:exitToMenu', 'ui:closeAll', 'game:new']);
  // The ordinary New Game route — the same payload shape the after-action screen emits.
  assert.equal(emitted[3].payload.name, null);
  assert.ok(emitted[3].payload.difficulty);
});

test('the end card fires exactly once per save on a fitted undock', () => {
  const { state, bus, pushed } = bootOnboarding();
  // Dock, fit a module, undock → the card.
  bus.emit('dock:docked', { stationId: 'station_helios' });
  state.ui.docked = true;
  bus.emit('module:equipped', { shipId: state.playerId, slotIndex: 3, defId: 'mod_engine_fusion_m' });
  state.ui.docked = false;
  bus.emit('dock:undocked', { stationId: 'station_helios' });
  assert.deepEqual(pushed, [{ id: 'demoEnd' }]);
  assert.equal(state.player.hints.demoEndShown, true);
  assert.equal(state.ui.demoEnd.moduleDefId, 'mod_engine_fusion_m');
  // A second dock + fit + undock in the same save never repeats the card.
  bus.emit('dock:docked', { stationId: 'station_helios' });
  state.ui.docked = true;
  bus.emit('module:equipped', { shipId: state.playerId, slotIndex: 2, defId: 'mod_shield_capacitor_m' });
  state.ui.docked = false;
  bus.emit('dock:undocked', { stationId: 'station_helios' });
  assert.equal(pushed.length, 1, 'the card is once per save');
});

test('an undock without a new fitting does not fire the card', () => {
  const { state, bus, pushed } = bootOnboarding();
  bus.emit('dock:docked', { stationId: 'station_helios' });
  state.ui.docked = true;
  state.ui.docked = false;
  bus.emit('dock:undocked', { stationId: 'station_helios' });
  assert.equal(pushed.length, 0);
  assert.equal(state.player.hints.demoEndShown || false, false);
});

test('a fitting outside a dock cannot arm the card (crucible refit is never docked)', () => {
  const { state, bus, pushed } = bootOnboarding();
  state.ui.docked = false;
  bus.emit('module:equipped', { shipId: state.playerId, slotIndex: 3, defId: 'mod_engine_fusion_m' });
  bus.emit('dock:undocked', { stationId: 'station_helios' });
  assert.equal(pushed.length, 0);
});

test('the end card reads its three facts and fires once', () => {
  const state = createGameState(7);
  state.ui.demoEnd = { moduleDefId: 'mod_engine_fusion_m' };
  state.player.stats.creditsEarned = 1840;
  const profile = {
    bestLines: [{
      version: 1, points: 960, multiplier: 4, seed: 4242, recordRules: { complete: true },
      acts: [{ trickId: 'ricochet', name: 'Ricochet', points: 240, evidence: {}, modifiers: {} }],
      id: 'line:test',
    }],
  };
  const facts = demoEndFacts(state, profile);
  const byKey = Object.fromEntries(facts.map((f) => [f.key, f.text]));
  assert.match(byKey.bestLine, /Ricochet — 960 points/);
  assert.equal(byKey.credits, '1,840 CR');
  assert.equal(byKey.module, 'Fusion Drive M');
});

test('the end card mounts the headline and its way-out words', () => {
  const state = createGameState(7);
  state.ui.demoEnd = { moduleDefId: 'mod_engine_fusion_m' };
  state.player.stats.creditsEarned = 1840;
  const { root, buttons, emitted } = mountScreen(demoEndScreen, { ctx: { state } });
  const lines = textLines(root);
  assert.ok(lines.includes("That's the demo."));
  const play = buttons.find((b) => b.textContent === 'Keep playing');
  assert.ok(play);
  play.click();
  assert.equal(emitted[0].event, 'ui:popScreen');
  const menu = buttons.find((b) => b.textContent === 'Main menu');
  assert.ok(menu);
  // Feedback/Store hide when the config carries no URL for them.
  assert.equal(textLines(root).includes('Feedback'), false);
  assert.equal(textLines(root).includes('Store page'), false);
});
