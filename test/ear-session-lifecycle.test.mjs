import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio } from '../src/audio/audioSystem.js';
import { admitEarCue, admitAftermathHush } from '../src/audio/combatFeedbackEar.js';
import { TABLE_HEARING_FAR_WU } from '../src/render/tabletopPolicy.js';

function wire() {
  const state = createGameState(4242), bus = createBus(), host = { ...audio };
  state.playerId = 1;
  state.entities.set(1, { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 } });
  host.init({ state, bus, helpers: {} });
  const played = [], hushes = [];
  host.play = (id, options) => { played.push({ id, options }); return { id }; };
  host._triggerHush = options => hushes.push(options);
  return { state, bus, host, played, hushes };
}

test('new runs and loaded saves rearm feedback before their clocks catch up to the old run', () => {
  for (const boundary of ['game:new', 'game:newGame', 'save:loaded', 'game:exitToMenu']) {
    const { state, bus, played, hushes } = wire();
    state.tick = 36000; state.simTime = 600;
    bus.emit('danger:miningNoise', { level: 1, threshold: 0.5 });
    bus.emit('cloak:burned', { entityId: 1, x: 0, z: 0 });
    bus.emit('barkDirector:silence', { until: 610 });
    assert.equal(played.length, 2);
    assert.equal(hushes.length, 1);
    bus.emit(boundary, {});
    state.tick = 1; state.simTime = 1 / 60;
    const before = played.length;
    bus.emit('danger:miningNoise', { level: 1, threshold: 0.5 });
    bus.emit('cloak:burned', { entityId: 1, x: 0, z: 0 });
    bus.emit('barkDirector:silence', { until: 10 });
    assert.equal(played.length - before, 2, boundary);
    assert.equal(hushes.length, 2, boundary);
  }
});

test('routed mayday is heard on the receiver even beyond physical sound range', () => {
  const { state, bus, played } = wire();
  state.tick = 10;
  const pos = { x: Math.min(1799, TABLE_HEARING_FAR_WU + 100), z: 0 };
  assert.ok(pos.x > TABLE_HEARING_FAR_WU);
  bus.emit('distress:call', { callerId: 7, routedToPlayer: true, pos });
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'sfx_wanted_alert');
  assert.equal(played[0].options.position, null);
  bus.emit('distress:call', { callerId: 8, routedToPlayer: false, pos });
  assert.equal(played.length, 1);
});

test('admission expires old entity keys while retaining every live cooldown', () => {
  const book = {};
  for (let i = 0; i < 1000; i++) assert.equal(admitEarCue(book, `mine:${i}`, 0, 8), true);
  assert.equal(admitEarCue(book, 'miningNoise', 0, 180), true);
  assert.equal(admitEarCue(book, 'newMine', 60, 8), true);
  assert.equal(book.entries.size, 2);
  assert.equal(admitEarCue(book, 'miningNoise', 60, 180), false);
  assert.equal(admitEarCue(book, 'miningNoise', 180, 180), true);
});

test('a continuing silence window extends admission without replaying its hush', () => {
  const book = {};
  assert.equal(admitAftermathHush(book, 18, 10), true);
  assert.equal(admitAftermathHush(book, 25, 17), false);
  assert.equal(admitAftermathHush(book, 30, 20), false);
  assert.equal(admitAftermathHush(book, 40, 30), true);
  assert.equal(admitAftermathHush({}, 1, 2), false);
});
