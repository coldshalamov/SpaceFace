// INFERENCE-30 (station no-fire advisory): BP-11 packet A2 shipped a complete, CI-pinned
// createNoFireWatch + authored NO_FIRE_BARK — and the file its own contract named as the owner
// (src/render/stationBubbleRings.js) was never built. The watch sat dead: firing inside a
// station's no-fire core produced no advisory. noFireAdvisory now owns one watch as a registered
// system — combat:fire from the player inside a ring speaks the authored traffic-control line
// once per ring ENTRY; leaving re-arms.
import assert from 'node:assert/strict';
import test from 'node:test';

import { noFireAdvisory, NO_FIRE_BARK, bubblesFor } from '../src/data/stationBubbles.js';

function makeStation(id, x, z, { size = 'M', dockRadius = 100, factionId = 'faction_concord' } = {}) {
  return {
    id, type: 'station', alive: true, factionId,
    pos: { x, y: 0, z },
    data: { stationId: id, dockRadius, size, factionId },
  };
}

function makeState(stations, playerPos = { x: 0, y: 0, z: 0 }) {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: playerPos };
  return {
    playerId: 1,
    entities: new Map([[1, player], ...stations.map((s, i) => [100 + i, s])]),
    entityList: [player, ...stations],
    entityIndex: { stations },
  };
}

function boot(state) {
  const said = [];
  const listeners = new Map();
  const bus = {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => {};
    },
    off(event, fn) {
      const list = listeners.get(event) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(event, payload) {
      for (const fn of (listeners.get(event) || []).slice()) fn(payload);
    },
  };
  noFireAdvisory.init({ bus, state, helpers: { voice: { say: (m) => said.push(m) } } });
  return { said, bus };
}

test('player fire inside the no-fire core speaks the authored line, once', () => {
  const st = makeStation('st_alpha', 0, 0); // noFire = 100 * 1.5 * 1.0 = 150
  const { said, bus } = boot(makeState([st], { x: 0, y: 0, z: 40 }));
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 1);
  assert.equal(said[0].text, NO_FIRE_BARK);
  assert.equal(said[0].kind, 'noFireZone');
  assert.equal(said[0].channel, 'warn');
  assert.equal(said[0].factionId, 'faction_concord');
  // sustained fire — including beam update ticks — stays silent
  bus.emit('combat:fire', { ownerId: 1 });
  bus.emit('combat:fire', { ownerId: 1, phase: 'update' });
  assert.equal(said.length, 1);
});

test('leaving the ring re-arms — a second entry barks again', () => {
  const st = makeStation('st_alpha', 0, 0);
  const state = makeState([st], { x: 0, y: 0, z: 40 });
  const { said, bus } = boot(state);
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 1);
  const player = state.entities.get(1);
  player.pos = { x: 0, y: 0, z: 400 }; // outside 150 ring
  noFireAdvisory.update(1 / 60, state);
  player.pos = { x: 0, y: 0, z: 40 }; // back inside
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 2);
});

test('fire outside the ring is silent', () => {
  const st = makeStation('st_alpha', 0, 0);
  const { said, bus } = boot(makeState([st], { x: 0, y: 0, z: 300 }));
  bus.emit('combat:fire', { ownerId: 1 });
  noFireAdvisory.update(1 / 60, makeState([st], { x: 0, y: 0, z: 300 }));
  assert.equal(said.length, 0);
});

test('non-player fire inside the ring is silent', () => {
  const st = makeStation('st_alpha', 0, 0);
  const { said, bus } = boot(makeState([st], { x: 0, y: 0, z: 40 }));
  bus.emit('combat:fire', { ownerId: 77 });
  assert.equal(said.length, 0);
});

test('destroy silences the watch; newGame re-arms for a fresh run', () => {
  const st = makeStation('st_alpha', 0, 0);
  const state = makeState([st], { x: 0, y: 0, z: 40 });
  const { said, bus } = boot(state);
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 1);
  noFireAdvisory.destroy();
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 1);
});

test('newGame rebuilds the watch so a saved-and-restarted run re-arms', () => {
  const st = makeStation('st_alpha', 0, 0);
  const state = makeState([st], { x: 0, y: 0, z: 40 });
  const { said, bus } = boot(state);
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 1);
  noFireAdvisory.newGame();
  // fresh watch has no inside-tracking yet — fire marks entry again
  bus.emit('combat:fire', { ownerId: 1 });
  assert.equal(said.length, 2);
});

test('station sizing follows the authored bubble math', () => {
  const s = makeStation('st_big', 0, 0, { size: 'L', dockRadius: 120 });
  const r = bubblesFor(s).noFire.radius;
  assert.equal(r, Math.round(120 * 1.5 * 1.15 * 100) / 100);
});
