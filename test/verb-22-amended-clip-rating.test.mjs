// VERB-22: a moment re-rated after the fact re-rates its one reel clip.
// Seed 4242. One amendment. The grade the reel reads changes. The clip count stays 1.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { bulletTime } from '../src/systems/bulletTime.js';
import {
  clipListSummary,
  installLiveClipDirector,
  setClipDirector,
  uninstallLiveClipDirector,
} from '../src/ui/screens/clips.js';

function receipt(changes = {}) {
  const time = 28;
  return {
    trickId: 'bolas',
    name: 'Bolas',
    rarity: 'uncommon',
    actorId: 0,
    targetId: 1,
    secondaryIds: [2],
    episodeId: `root:bolas:${time}`,
    rootId: `root:bolas:${time}`,
    rootTick: time * 60 - 120,
    tick: time * 60,
    causeChain: [{ kind: 'impulse', pos: { x: 0, z: 0 } }, { kind: 'contact', pos: { x: 10, z: 0 } }],
    consequence: { killed: true },
    sourceRadius: 6,
    metrics: { availableMomentum: 960, referenceMomentum: 400 },
    modifiers: { collateralCount: 2 },
    seed: 4242,
    ...changes,
  };
}

function boot() {
  setClipDirector(null);
  const state = createGameState(4242);
  state.mode = 'flight';
  state.playerId = 0;
  for (let id = 0; id < 3; id += 1) {
    state.entities.set(id, { id, pos: { x: id * 10, z: 0 }, radius: 6, vel: { x: 0, z: 0 } });
  }
  const bus = createBus();
  const system = Object.create(bulletTime);
  const director = installLiveClipDirector(bus, { seedOf: () => 4242 });
  system.init({
    state,
    bus,
    timeEffects: createTimeEffects(state),
    helpers: { worldToScreen: (p) => ({ x: p.x * 4 + 100, y: p.z * 4 + 100, onScreen: true }) },
  });
  return {
    state,
    bus,
    director,
    emit(record, event = 'stunt:trickDetected') {
      state.tick = record.tick;
      state.simTime = record.tick / 60;
      bus.emit(event, record);
    },
    close() {
      system.destroy();
      uninstallLiveClipDirector();
      setClipDirector(null);
      bus.clear();
    },
  };
}

test('moment:amended re-rates the one existing reel clip', () => {
  const h = boot();
  try {
    const first = receipt();
    h.emit(first);
    const id = h.director.latest().id;
    const before = clipListSummary(h.director);
    assert.equal(before.count, 1);
    assert.equal(before.items[0].id, id);
    assert.deepEqual(before.items[0].rating, { fraction: 0.5, tone: 'hi', label: 'Uncommon' });

    h.emit({ ...first, tick: 1800, modifiers: { collateralCount: 3 } }, 'stunt:trickAmended');

    const after = clipListSummary(h.director);
    assert.equal(h.director.size, 1);
    assert.equal(h.director.latest().id, id);
    assert.equal(h.state.stunts.moment.clips.length, 1);
    assert.equal(after.count, 1);
    assert.equal(after.items[0].id, id);
    assert.deepEqual(after.items[0].rating, { fraction: 0.75, tone: 'hi', label: 'Rare' });
    assert.equal(after.items[0].rarity, 'rare');
    assert.notDeepEqual(after.items[0].rating, before.items[0].rating);
    assert.ok(Math.abs(h.state.stunts.moment.clips[0].peakScore - 6.48) < 1e-12);

    h.bus.emit('moment:amended', {
      tick: first.tick, trickId: first.trickId, rarity: 'common', peakScore: 99,
    });
    const held = clipListSummary(h.director);
    assert.equal(held.count, 1);
    assert.equal(held.items[0].id, id);
    assert.deepEqual(held.items[0].rating, { fraction: 0.75, tone: 'hi', label: 'Rare' });
  } finally {
    h.close();
  }
});

test('a higher peak keeps a legendary plate legendary', () => {
  const h = boot();
  try {
    const first = receipt({ rarity: 'legendary', modifiers: { collateralCount: 2 } });
    h.emit(first);
    const before = clipListSummary(h.director);
    assert.equal(before.count, 1);
    assert.deepEqual(before.items[0].rating, { fraction: 1, tone: 'hi', label: 'Legendary' });

    h.emit({ ...first, tick: 1800, modifiers: { collateralCount: 3 } }, 'stunt:trickAmended');

    const after = clipListSummary(h.director);
    assert.equal(h.director.size, 1);
    assert.equal(after.count, 1);
    assert.equal(after.items[0].id, before.items[0].id);
    assert.deepEqual(after.items[0].rating, { fraction: 1, tone: 'hi', label: 'Legendary' });
  } finally {
    h.close();
  }
});
