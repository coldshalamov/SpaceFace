import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { mines, countOwnerMines } from '../src/systems/mines.js';

// FIGHT-07 — placing a mine past the owner cap is refused with the count, through the voice
// floor, not swallowed. NPC layers hitting their own cap stay silent.

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [mines] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12,
    hull: 200, hullMax: 200, data: {},
  });
  state.playerId = player.id;
  const events = { cap: [], voice: [] };
  bus.on('mines:capReached', (p) => events.cap.push(p));
  bus.on('voice:say', (p) => events.voice.push(p));
  return { sim, state, bus, player, events, minesSys: sim.registry.get('mines') };
}

function fillPlayerCap(t) {
  for (let i = 0; i < 6; i++) {
    assert.ok(t.minesSys.placeMine({
      ownerId: t.player.id, pos: { x: 100 + i * 20, z: 0 }, team: 0, telegraph: false,
    }));
  }
  assert.equal(countOwnerMines(t.state, t.player.id), 6);
}

test('FIGHT-07: the player\'s seventh mine refuses with the cap in the caption', () => {
  const t = boot();
  fillPlayerCap(t);
  const denied = t.minesSys.placeMine({
    ownerId: t.player.id, pos: { x: 300, z: 0 }, team: 0, telegraph: false,
  });
  assert.equal(denied, null);
  assert.deepEqual(t.events.cap.at(-1), { ownerId: t.player.id, cap: 6 });
  assert.equal(t.events.voice.length, 1, 'one refusal line reached the voice floor');
  const line = t.events.voice[0];
  assert.equal(line.channel, 'alert');
  assert.match(line.text, /6/, 'the caption carries the cap count');
  assert.match(line.text, /mine/i);
});

test('FIGHT-07: an NPC layer at its cap emits the event but no player voice line', () => {
  const t = boot();
  const jackal = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 800, z: 0 }, radius: 14, hull: 100, hullMax: 100, data: {},
  });
  for (let i = 0; i < 6; i++) {
    t.minesSys.placeMine({ ownerId: jackal.id, pos: { x: 820 + i * 20, z: 0 }, team: 1, telegraph: false });
  }
  const denied = t.minesSys.placeMine({
    ownerId: jackal.id, pos: { x: 900, z: 0 }, team: 1, telegraph: false,
  });
  assert.equal(denied, null);
  assert.deepEqual(t.events.cap.at(-1), { ownerId: jackal.id, cap: 6 });
  assert.equal(t.events.voice.length, 0, 'NPC caps never speak to the player floor');
});

test('FIGHT-07: a refused press drops nothing and a freed slot places again', () => {
  const t = boot();
  fillPlayerCap(t);
  assert.equal(t.minesSys.placeMine({
    ownerId: t.player.id, pos: { x: 300, z: 0 }, team: 0, telegraph: false,
  }), null);
  assert.equal(countOwnerMines(t.state, t.player.id), 6, 'cap refusal places no entity');
  // Free a slot: release the player's mines and the bay accepts a fresh placement.
  t.minesSys.releaseAll('player_test');
  assert.equal(countOwnerMines(t.state, t.player.id), 0);
  assert.ok(t.minesSys.placeMine({
    ownerId: t.player.id, pos: { x: 300, z: 0 }, team: 0, telegraph: false,
  }), 'the bay works again once a slot frees');
});
