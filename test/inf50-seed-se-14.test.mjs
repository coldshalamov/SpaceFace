// SEED-SE-14 — your death is one reel mark the rating reads as Death. A hit is not.
// Seed 4242. clips.js and replay.js stay untouched; the mark is recorded from the snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { attachClipDirectorToBus, createClipDirector } from '../src/core/simSnapshot.js';
import { clipRating } from '../src/ui/screens/clips.js';

const SEED = 4242;

test('SEED-SE-14 seed 4242 player death clips once as Death and a damage hit clips nothing', () => {
  const bus = createBus();
  const director = createClipDirector();
  attachClipDirectorToBus(bus, director, {
    seedOf: () => SEED,
    tickOf: () => SEED,
    stateOf: () => ({ playerId: 1 }),
  });

  bus.emit('combat:damage', { targetId: 1, attackerId: 4, amount: 12, tick: 4200 });
  bus.emit('combat:damage', { id: 1, killerId: 4, applied: 40, tick: 4210 });
  assert.equal(director.size, 0);

  bus.emit('player:death', { killerId: 4, amount: 80, recoverable: true });
  assert.equal(director.size, 1);
  const clip = director.latest();
  assert.equal(clip.kind, 'death');
  assert.equal(clip.label, 'Death');
  assert.equal(clip.seed, SEED);
  assert.equal(clipRating(clip).label, 'Death');
  assert.equal(director.list().filter((row) => row.kind === 'death').length, 1);
  assert.equal(director.list().some((row) => row.kind === 'kill'), false);

  bus.emit('player:death', { killerId: 4, tick: SEED, amount: 10 });
  assert.equal(director.size, 1);
});
