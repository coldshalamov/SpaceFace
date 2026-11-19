// w-498/499: the Line remembers tonnage, the class ladder advances on real holds,
// record holds stamp CORRECT., a heavy body never strains or snaps the line (ruling R12),
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
  assert.deepEqual(holdStamps.map(s => s.text), ['30 T. CORRECT.', '500 T. CORRECT.'],
    'the first hold and the later record each stamp once');
  // A duplicate end receipt must not double-credit the same hold.
  bus.emit('tether:released', { targetId: 'heavy1' });
  assert.equal(state.lineProgression.tonnageLoggedT, 530);
});

// Ruling R12 (design/overhaul/00_RULINGS.md, owner 2026-11-18): "when you're small the tether makes you
// swing around THEM… when you play a huge ship… YOU PULL THEM." The rope never refuses or snaps for mass;
// the physics owner decides who moves. Row 499's heat-to-snap strain is retired.
test('R12: a heavy hold never heats, clamps or snaps the line — mass decides who moves', () => {
  const { state, bus, sys, attachments, cutCalls } = harness();
  // Class I's full-control figure is 20 T; the 500 T heavy1 is an anchor the pilot swings round.
  attachments.listForEntity = () => [{ id: 'att9', state: 'active', targetId: 'heavy1' }];
  bus.emit('tether:latched', { targetId: 'heavy1' });
  for (let i = 0; i < 60 * 12; i += 1) {
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  assert.equal(state.lineProgression.overClass, false, 'the rope never strains for mass (R12)');
  assert.equal(state.lineProgression.overClassReelFactor, 1, 'no reel clamp');
  assert.equal(state.lineProgression.overClassTurnFactor, 1, 'no turn clamp: an orbiting pilot keeps the nose');
  assert.equal(state.lineProgression.winchHeat, 0, 'mass adds no winch heat');
  assert.equal(cutCalls.length, 0, 'no timed snap for mass');
  bus.emit('tether:released', { targetId: 'heavy1' });
  assert.equal(state.lineProgression.tonnageLoggedT, 500, 'the heavy hold still logs its tonnage toward the ladder');
});

// NOTICE-01: the opening's second throw — "Latch the raider. Swing him into the rock." — must
// hold a 220 T body on a class-I line without ever heating the winch toward a snap.
test('notice-01: a latched tutorial raider counts no held mass — no heat, no snap', () => {
  const { state, bus, sys, attachments, cutCalls } = harness();
  state.entities.set('raider1', {
    id: 'raider1', pos: { x: 7, z: 0 }, mass: 220,
    data: { onboarding: true, onboardingRaid: true },
  });
  attachments.listForEntity = (id) => (id === 'p1'
    ? [{ id: 'att-raid', state: 'active', targetId: 'raider1' }]
    : []);
  bus.emit('tether:latched', { targetId: 'raider1' });
  for (let i = 0; i < 60 * 12; i += 1) {
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
  assert.equal(state.lineProgression.overClass, false, 'the raid raider is never over class');
  assert.equal(state.lineProgression.winchHeat, 0, 'no heat means the grace snap never arms');
  assert.equal(cutCalls.length, 0, 'the line never cuts on the lesson');
  bus.emit('tether:released', { targetId: 'raider1' });
  assert.equal(state.lineProgression.tonnageLoggedT, 0,
    'the lesson hold logs no tonnage — same as the rock');
  // Control: the same mass without the raid tag logs as an ordinary hold — and still never strains (R12).
  state.entities.set('plainHeavy', { id: 'plainHeavy', mass: 220, data: {} });
  attachments.listForEntity = (id) => (id === 'p1'
    ? [{ id: 'att-plain', state: 'active', targetId: 'plainHeavy' }]
    : []);
  bus.emit('tether:latched', { targetId: 'plainHeavy' });
  sys.update(1 / 60, state);
  assert.equal(state.lineProgression.overClass, false, 'R12: ordinary 220 T never strains the line either');
});

test('w-499: no hold heats the winch, saved heat cools, and a stale bag normalizes clean', () => {
  const { state, bus, sys } = harness();
  bus.emit('tether:latched', { targetId: 'rock1' });
  state.lineProgression.winchHeat = 0.6; // heat saved by an older build
  for (let i = 0; i < 60; i += 1) sys.update(1 / 60, state);
  // 30 T is above class I's 20 T full-control figure: under R12 that is not a strain, only who moves.
  assert.ok(state.lineProgression.winchHeat < 0.6, 'saved heat cools; nothing adds heat (R12)');
  assert.equal(state.lineProgression.overClass, false);
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
