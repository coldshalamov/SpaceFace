// An asteroid splitting alive has an ear (the ear audit: asteroid:chunked was silent while its
// sibling asteroid:destroyed was voiced). The brittle split plays at the split's position, one
// voice per parent per tick — a break spawns several chunks at once and must not chorus — and
// grades a touch louder the more pieces the parent came apart into. Real bus, play stub.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';

function cueHost() {
  const played = [];
  const bus = createBus();
  const state = { tick: 100, simTime: 4, playerId: 'player', entities: new Map(), entityList: [],
    ui: {}, world: {}, settings: {}, audioRuntime: {} };
  const host = Object.create(audio);
  host.init({ state, bus, helpers: {} });
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  return { host, bus, played, state };
}

test('a chunked parent speaks the brittle split at the split, once per tick', () => {
  const { bus, played } = cueHost();
  for (let i = 0; i < 4; i++) {
    bus.emit('asteroid:chunked', { parentId: 'rock-1', chunkId: `c${i}`, count: 4, pos: { x: 60, z: -20 } });
  }
  assert.equal(played.length, 1, `one voice for the parent's break, got ${played.length}`);
  assert.equal(played[0].id, 'sfx_mining_fracture_break');
  assert.notEqual(played[0].id, 'sfx_asteroid_depleted', 'the split is not the ending voice');
  assert.deepEqual(played[0].position, { x: 60, z: -20 });
});

test('the gain grades with the piece count and the next tick speaks again', () => {
  const { host, bus, played, state } = cueHost();
  bus.emit('asteroid:chunked', { parentId: 'rock-2', chunkId: 'a', count: 2, pos: { x: 0, z: 0 } });
  const twoPieces = played[0].gain;
  bus.emit('asteroid:chunked', { parentId: 'rock-3', chunkId: 'b', count: 6, pos: { x: 0, z: 0 } });
  const sixPieces = played[1].gain;
  assert.ok(sixPieces > twoPieces, `more pieces read louder: ${sixPieces} > ${twoPieces}`);
  state.tick = 101;
  bus.emit('asteroid:chunked', { parentId: 'rock-2', chunkId: 'c', count: 2, pos: { x: 0, z: 0 } });
  assert.equal(played.length, 3, 'the same parent splits again on a later tick');
});
