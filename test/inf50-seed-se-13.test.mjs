// SEED-SE-13 — NPC kills do not file as your Kill. A player killer still does.
// Seed 4242. The reel screen is not edited; the filter lives on the clip director.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { attachClipDirectorToBus, createClipDirector } from '../src/core/simSnapshot.js';

const SEED = 4242;

test('SEED-SE-13 seed 4242 an NPC killer leaves no Kill clip and your kill still clips', () => {
  const bus = createBus();
  const director = createClipDirector();
  attachClipDirectorToBus(bus, director, {
    seedOf: () => SEED,
    tickOf: () => SEED,
    stateOf: () => ({ playerId: 7 }),
  });

  bus.emit('entity:killed', { id: 'hauler', killerId: 8, tick: 100 });
  assert.equal(director.size, 0);
  assert.equal(director.list().some((clip) => clip.kind === 'kill' || clip.label === 'Kill'), false);

  bus.emit('entity:killed', { id: 'raider', killerId: 7, tick: 200 });
  assert.equal(director.size, 1);
  assert.equal(director.latest().kind, 'kill');
  assert.equal(director.latest().label, 'Kill');
  assert.equal(director.latest().actorId, 7);
  assert.equal(director.latest().seed, SEED);

  assert.equal(
    director.observeKill({ tick: 300, id: 'miner', killerId: 'npc_miner', label: 'Kill' }),
    null,
  );
  assert.equal(director.size, 1);
  assert.equal(director.list().filter((clip) => clip.label === 'Kill').length, 1);

  const named = director.observeKill({ tick: 400, id: 'drone', killerId: 'player', seed: SEED });
  assert.ok(named);
  assert.equal(named.kind, 'kill');
  assert.equal(named.label, 'Kill');
  assert.equal(director.size, 2);
});
