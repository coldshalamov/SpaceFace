// A destroyed wingman has to say their name once. A living wing does not.
import test from 'node:test';
import assert from 'node:assert/strict';

import { wingmen } from '../src/systems/wingmen.js';

function harness(fleet, extras = []) {
  const events = [];
  const entities = new Map();
  const player = { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 }, hull: 100, hullMax: 100, data: {} };
  entities.set(player.id, player);
  for (const entity of extras) entities.set(entity.id, entity);
  const state = {
    mode: 'flight',
    tick: 10,
    simTime: 1,
    playerId: player.id,
    entities,
    automation: { fleet },
    world: { currentSectorId: 'sector_test' },
  };
  const bus = {
    on() {},
    emit(name, payload) { events.push({ name, payload }); },
  };
  const wings = Object.create(wingmen);
  wings.init({ state, bus, helpers: {} });
  return { state, wings, events };
}

function downToasts(events) {
  return events.filter((event) => event.name === 'toast' && String(event.payload && event.payload.text).startsWith('Wingman down'));
}

test('a destroyed wingman toasts their name once', () => {
  const wing = { id: 11, alive: false, pos: { x: 40, y: 0, z: 0 }, hull: 0, hullMax: 100, data: {} };
  const fs = { id: 'w1', name: 'Kestrel', order: 'escort', _liveId: wing.id, hp: 0.4, hullPct: 0.4 };
  const { state, wings, events } = harness([fs], [wing]);
  wings.update(1 / 60, state);
  const toasts = downToasts(events);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Wingman down — Kestrel');
  assert.equal(toasts[0].payload.kind, 'error');
  assert.equal(events.filter((event) => event.name === 'combat:hitAsset').length, 1);
  assert.equal(fs._liveId, null);
  wings.update(1 / 60, state);
  assert.equal(downToasts(events).length, 1);
});

test('a callsign on the wingman wins over the ledger name', () => {
  const wing = { id: 12, alive: false, pos: { x: 40, y: 0, z: 0 }, hull: 0, hullMax: 100, data: {} };
  const fs = {
    id: 'w2', name: 'Kestrel', customName: 'Ivy', order: 'escort', _liveId: wing.id, hp: 0, hullPct: 0,
  };
  const { state, wings, events } = harness([fs], [wing]);
  wings.update(1 / 60, state);
  assert.equal(downToasts(events)[0].payload.text, 'Wingman down — Ivy');
});

test('a wingman with no name still gets one down line', () => {
  const wing = { id: 13, alive: false, pos: { x: 40, y: 0, z: 0 }, hull: 0, hullMax: 100, data: {} };
  const fs = { id: 'w3', order: 'escort', _liveId: wing.id };
  const { state, wings, events } = harness([fs], [wing]);
  wings.update(1 / 60, state);
  assert.equal(downToasts(events)[0].payload.text, 'Wingman down — Wingman');
});

test('two destroyed wingmen each get their own line', () => {
  const a = { id: 21, alive: false, pos: { x: 40, y: 0, z: 0 }, hull: 0, hullMax: 100, data: {} };
  const b = { id: 22, alive: false, pos: { x: -40, y: 0, z: 0 }, hull: 0, hullMax: 100, data: {} };
  const fleet = [
    { id: 'b', name: 'Voss', order: 'escort', _liveId: b.id },
    { id: 'a', name: 'Kestrel', order: 'escort', _liveId: a.id },
  ];
  const { state, wings, events } = harness(fleet, [a, b]);
  wings.update(1 / 60, state);
  assert.deepEqual(downToasts(events).map((event) => event.payload.text).sort(), [
    'Wingman down — Kestrel',
    'Wingman down — Voss',
  ]);
});

test('a living wingman does not announce a death', () => {
  const wing = { id: 31, alive: true, pos: { x: 40, y: 0, z: 0 }, hull: 80, hullMax: 100, data: { ai: {} } };
  const fs = { id: 'w-live', name: 'Kestrel', order: 'escort', _liveId: wing.id, hp: 1, hullPct: 1 };
  const { state, wings, events } = harness([fs], [wing]);
  wings.update(1 / 60, state);
  wings.update(1 / 60, state);
  assert.equal(downToasts(events).length, 0);
  assert.equal(fs._liveId, wing.id);
});
