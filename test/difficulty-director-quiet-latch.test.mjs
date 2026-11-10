import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  difficultyDirector,
  setDifficultyDirectorQuietLatchForBench,
  getDifficultyDirectorQuietLatchForBench,
} from '../src/systems/difficultyDirector.js';

function makeHarness() {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 140, hullMax: 140, shield: 40, shieldMax: 40, armorHp: 0, armorMax: 0,
    flags: {},
  };
  const state = {
    playerId: 'player',
    player: { credits: 10000, flags: {}, heat: 0, defeatStreak: { count: 0, lastDefeatSimTime: null } },
    entities: new Map([['player', player]]),
    entityList: [player],
    settings: { gameplay: { difficulty: 'veteran' } },
    simTime: 0,
    tick: 0,
  };
  const bus = createBus();
  const dir = Object.create(difficultyDirector);
  dir.init({ state, bus, registry: { get: () => null }, helpers: {} });
  return { state, bus, dir, player };
}

function settleQuiet(h, ticks = 600) {
  for (let i = 0; i < ticks; i++) {
    h.state.tick++;
    h.state.simTime += 1 / 60;
    h.dir.update(1 / 60, h.state);
  }
}

test('bench toggle defaults ON and round-trips', () => {
  assert.equal(getDifficultyDirectorQuietLatchForBench(), true);
  setDifficultyDirectorQuietLatchForBench(false);
  assert.equal(getDifficultyDirectorQuietLatchForBench(), false);
  setDifficultyDirectorQuietLatchForBench(true);
  assert.equal(getDifficultyDirectorQuietLatchForBench(), true);
});

test('quiet open flight arms latch once mults settle', () => {
  setDifficultyDirectorQuietLatchForBench(true);
  const h = makeHarness();
  settleQuiet(h, 600);
  assert.equal(h.state.difficultyRuntime?.quietLatched, true);
  assert.ok(h.dir._difficultyQuiet);
  const stance = h.state.difficulty.pacing.stance;
  assert.ok(['steady', 'surge', 'recovery'].includes(stance));
});

test('latched ticks skip work inside the 0.5 s rescan window', () => {
  setDifficultyDirectorQuietLatchForBench(true);
  const h = makeHarness();
  settleQuiet(h, 600);
  assert.equal(h.state.difficultyRuntime?.quietLatched, true);
  const armedSimT = h.dir._difficultyQuiet.armedSimT;
  for (let i = 0; i < 10; i++) {
    h.state.tick++;
    h.state.simTime += 1 / 60;
    h.dir.update(1 / 60, h.state);
  }
  assert.equal(h.state.difficultyRuntime?.quietLatched, true);
  assert.equal(h.dir._difficultyQuiet.armedSimT, armedSimT);
});

test('combat:damage wakes the quiet latch', () => {
  setDifficultyDirectorQuietLatchForBench(true);
  const h = makeHarness();
  settleQuiet(h, 600);
  assert.equal(h.state.difficultyRuntime?.quietLatched, true);
  h.bus.emit('combat:damage', {
    targetId: 'player', attackerId: 'raider', applied: 12, isPlayer: true,
  });
  assert.equal(h.dir._difficultyQuiet, null);
  h.state.tick++;
  h.state.simTime += 1 / 60;
  h.dir.update(1 / 60, h.state);
  assert.equal(h.state.difficultyRuntime?.quietLatched, false);
});

test('bench OFF never arms latch', () => {
  setDifficultyDirectorQuietLatchForBench(false);
  const h = makeHarness();
  settleQuiet(h, 600);
  assert.equal(!!h.state.difficultyRuntime?.quietLatched, false);
  assert.equal(h.dir._difficultyQuiet, null);
  setDifficultyDirectorQuietLatchForBench(true);
});

test('survival run refuses to latch', () => {
  setDifficultyDirectorQuietLatchForBench(true);
  const h = makeHarness();
  h.state.run = { kind: 'survival', phase: 'active' };
  settleQuiet(h, 600);
  assert.equal(!!h.state.difficultyRuntime?.quietLatched, false);
  assert.equal(h.state.difficulty.pacing.stance, 'steady');
});
