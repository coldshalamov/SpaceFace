// w-498/499: the Line remembers tonnage, the class ladder advances on real holds,
// record holds stamp CORRECT., an over-class body strains the winch to a grace snap,
// and the bag survives a save/restore round trip normalized.
import assert from 'node:assert/strict';
import test from 'node:test';

import { lineProgression } from '../src/systems/lineProgression.js';
import { LINE_CLASSES } from '../src/data/lineProgression.js';

function harness() {
  const cutCalls = [];
  const emitted = [];
  const attachments = {
    listForEntity: (id) => (id === 'p1'
      ? [{ id: 'att1', state: 'active', targetId: 'rock1' }]
      : []),
    cut: (attachmentId, ownerId, reason) => {
      cutCalls.push({ attachmentId, ownerId, reason });
    },
  };
  const state = {
    simTime: 0,
    entities: new Map([
      ['p1', { id: 'p1', pos: { x: 0, z: 0 }, mass: 10 }],
      ['rock1', { id: 'rock1', pos: { x: 5, z: 0 }, mass: 30 }],
      ['heavy1', { id: 'heavy1', pos: { x: 9, z: 0 }, mass: 500 }],
    ]),
    player: { id: 'p1' },
    playerId: 'p1',
  };
  const bus = {
    _handlers: new Map(),
    on(ev, fn) {
      if (!this._handlers.has(ev)) this._handlers.set(ev, []);
      this._handlers.get(ev).push(fn);
    },
    emit(ev, payload) {
      emitted.push({ ev, payload });
      for (const fn of this._handlers.get(ev) || []) fn(payload);
    },
  };
  const sys = Object.create(lineProgression);
  sys.init({
    state,
    bus,
    registry: { get: (id) => (id === 'combat' ? { kernel: { attachments } } : null) },
  });
  return { state, bus, sys, attachments, cutCalls, emitted };
}

test('w-498: releasing a held body logs its true mass and advances the class ladder', () => {
  const { state, bus, sys } = harness();
  bus.emit('tether:latched', { targetId: 'rock1' });
  bus.emit('tether:released', { targetId: 'rock1' });
  assert.equal(state.lineProgression.tonnageLoggedT, 30);

  // 2 000 T crosses class II; push the pilot over the threshold.
  state.entities.set('asteroidBig', { id: 'asteroidBig', mass: 2_100 });
  bus.emit('tether:latched', { targetId: 'asteroidBig' });
  bus.emit('tether:broke', { targetId: 'asteroidBig', reason: 'tension' });
  assert.equal(state.lineProgression.tonnageLoggedT, 2_130);
  assert.ok(state.lineProgression.classIndex >= 2, 'class II reached at 2 000 T');
  assert.ok(
    state.lineProgression.recordStamps.some((s) => s.kind === 'class_up' && /LINE CLASS II/.test(s.text)),
    'the class-up stamps CORRECT.',
  );
  sys.update(1 / 60, state);
});

test('w-498: a record heaviest hold stamps once and tonnage never double-credits', () => {
  const { state, bus } = harness();
  bus.emit('tether:latched', { targetId: 'rock1' });
  bus.emit('tether:released', { targetId: 'rock1' });
  bus.emit('tether:latched', { targetId: 'heavy1' });
  bus.emit('tether:released', { targetId: 'heavy1' });
  assert.equal(state.lineProgression.highestHeldMassT, 500);
  const holdStamps = state.lineProgression.recordStamps.filter((s) => s.kind === 'heaviest_hold');
  assert.equal(holdStamps.length, 1, 'one CORRECT. stamp for the record hold');
  assert.ok(/500 T\. CORRECT\./.test(holdStamps[0].text));
  // A duplicate end receipt must not double-credit the same hold.
  bus.emit('tether:released', { targetId: 'heavy1' });
  assert.equal(state.lineProgression.tonnageLoggedT, 530);
});

test('w-499: an over-class hold heats the winch to a grace-window snap', () => {
  const { state, bus, sys, attachments, cutCalls } = harness();
  // Class I controls 20 T; the 500 T heavy1 is far over the ceiling.
  attachments.listForEntity = () => [{ id: 'att9', state: 'active', targetId: 'heavy1' }];
  bus.emit('tether:latched', { targetId: 'heavy1' });
  sys.update(1 / 60, state);
  assert.equal(state.lineProgression.overClass, true);
  assert.ok(state.lineProgression.overClassReelFactor < 1, 'reel clamp exposed');
  assert.ok(state.lineProgression.overClassTurnFactor < 1, 'turn clamp exposed');
  // Burn through the heat cap and the grace window.
  for (let i = 0; i < 60 * 10; i += 1) {
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
    if (cutCalls.length) break;
  }
  assert.equal(cutCalls.length, 1, 'exactly one grace snap');
  assert.equal(cutCalls[0].reason, 'line_overclass_snap');
  assert.equal(state.lineProgression.winchHeat, 0, 'heat resets after the snap');
});

test('w-499: a within-class hold never heats, and a stale bag normalizes clean', () => {
  const { state, bus, sys } = harness();
  bus.emit('tether:latched', { targetId: 'rock1' });
  for (let i = 0; i < 60; i += 1) sys.update(1 / 60, state);
  // 30 T is over the 20 T class-I cap — the winch heats.
  assert.ok(state.lineProgression.winchHeat > 0, 'over-class hold heats');
  assert.equal(state.lineProgression.overClass, true);
  const small = { id: 'pebble', mass: 5 };
  state.entities.set('pebble', small);
  bus.emit('tether:released', { targetId: 'rock1' });
  bus.emit('tether:latched', { targetId: 'pebble' });
  for (let i = 0; i < 60 * 10; i += 1) sys.update(1 / 60, state);
  assert.equal(state.lineProgression.overClass, false, '5 T is inside the class-I ceiling');
  assert.equal(state.lineProgression.winchHeat, 0, 'heat fully decays');

  // Save round trip with the dispatcher's calling convention (serialize(), deserialize(bag)):
  // a raw bag normalizes into live state, a missing bag defaults.
  const saved = sys.serialize();
  const restored = { simTime: 0, entities: new Map(), playerId: 'p1' };
  const sys2 = Object.create(lineProgression);
  sys2.init({ state: restored, bus, registry: { get: () => null } });
  sys2.deserialize(saved);
  assert.equal(restored.lineProgression.tonnageLoggedT, state.lineProgression.tonnageLoggedT);
  const fresh = { simTime: 0 };
  const sys3 = Object.create(lineProgression);
  sys3.init({ state: fresh, bus, registry: { get: () => null } });
  sys3.deserialize(undefined);
  assert.equal(fresh.lineProgression.tonnageLoggedT, 0);
  assert.equal(fresh.lineProgression.classIndex, 1);
  // New Game: the ledger and any held target clear back to class I.
  sys.newGame();
  assert.equal(state.lineProgression.tonnageLoggedT, 0);
  assert.equal(state.lineProgression.classIndex, 1);
  assert.equal(LINE_CLASSES.length, 8);
});
