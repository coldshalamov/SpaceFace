import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

function boot({ flagOn = true } = {}) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = flagOn;
  MASSLINE2_FLAGS.terrainAnchors = flagOn;
  const state = createGameState(47);
  state.simTime = 30;
  state.entityList = [];
  const bus = createBus();
  const spawned = [];
  let nextId = 100;
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...spec };
      spawned.push(entity);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const system = Object.create(terrainAnchors);
  system.init({ state, bus, helpers });
  return { state, bus, system, spawned, snap };
}

test('a bare encounter bubble grows two or three large rocks', () => {
  const { state, bus, system, spawned, snap } = boot({ flagOn: true });
  try {
    bus.emit('encounter:telegraph', { encounterId: 'enc_1', pos: { x: 400, z: -200 } });
    assert.ok(spawned.length >= 2 && spawned.length <= 3, `expected 2-3 anchors, got ${spawned.length}`);
    for (const rock of spawned) {
      assert.equal(rock.type, 'asteroid');
      assert.ok(rock.radius >= 26);
      assert.equal(rock.data.terrainAnchor, true);
      assert.deepEqual(rock.data.terrainAnchorEncounterIds, ['enc_1']);
    }
    bus.emit('encounter:resolved', { encounterId: 'enc_1' });
    assert.equal(spawned[0].data.terrainAnchorEncounterIds.length, 0);
    assert.ok(spawned[0].data.despawnAt <= state.simTime + 45);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});

test('terrain anchors stay quiet when the flag is off', () => {
  const { bus, system, spawned, snap } = boot({ flagOn: false });
  try {
    bus.emit('encounter:telegraph', { encounterId: 'enc_off', pos: { x: 0, z: 0 } });
    assert.equal(spawned.length, 0);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});
