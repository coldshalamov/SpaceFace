// INF-017 — the opening arena gets one genuinely useful anchor.
//
// Wave 1 of a swarm run leads with a substantial anchor on a clear sling corridor, inside
// the enemy spawn ring's inner edge so inbound enemies stream past it. Composition is
// untouched: every spawned body is an ordinary tetherable asteroid, so the gun-only route
// is exactly as authored.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import {
  OPENING_ANCHOR_DIST,
  OPENING_ANCHOR_SIZE,
  OPENING_CORRIDOR_HALF,
  segmentDistance,
  terrainAnchors,
} from '../src/systems/terrainAnchors.js';

function boot({ flagOn = true } = {}) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = flagOn;
  MASSLINE2_FLAGS.terrainAnchors = flagOn;
  const state = createGameState(47);
  state.simTime = 30;
  state.entityList = [];
  state.run = { ruleset: 'swarm', seed: 4242, wave: 1 };
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

function openingTelegraph(bus, encounterId, seed = 4242) {
  bus.emit('encounter:telegraph', {
    encounterId,
    pos: { x: 0, z: 0 },
    arcadeLayout: true,
    arenaSeed: seed,
  });
}

test('INF-017: wave 1 leads with a substantial anchor on a clear corridor', () => {
  const { bus, system, spawned, snap } = boot({ flagOn: true });
  try {
    openingTelegraph(bus, 'survival-arena-w1');
    assert.equal(spawned.length, 6, `the arcade field keeps six anchors, got ${spawned.length}`);
    for (const rock of spawned) {
      assert.equal(rock.type, 'asteroid', 'every body is an ordinary asteroid — guns still work');
      assert.equal(rock.data.terrainAnchor, true);
    }
    const opener = spawned.find((r) => r.radius === OPENING_ANCHOR_SIZE);
    assert.ok(opener, 'one anchor is the substantial opening monolith');
    const dist = Math.hypot(opener.pos.x, opener.pos.z);
    assert.ok(Math.abs(dist - OPENING_ANCHOR_DIST) < 1,
      `the opener sits a slingable ${OPENING_ANCHOR_DIST} wu out, got ${dist}`);
    assert.ok(opener.mass >= 3 * 200, 'the opener reads as the likely anchor, not the payload');
    assert.ok(dist + opener.radius < 213,
      'the opener stays inside the spawn ring inner edge — no unavoidable spawn collision');
    for (const rock of spawned) {
      if (rock === opener) continue;
      const clearance = segmentDistance(0, 0, opener.pos.x, opener.pos.z, rock.pos.x, rock.pos.z);
      assert.ok(clearance >= OPENING_CORRIDOR_HALF,
        `lane rock at ${clearance.toFixed(0)} wu must not block the sling corridor`);
      const fromPlayer = Math.hypot(rock.pos.x, rock.pos.z);
      assert.ok(fromPlayer >= 120, 'no rock starts on top of the player');
    }
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});

test('INF-017: later waves and non-swarm bubbles keep the shipped lanes', () => {
  const { bus, system, spawned, snap } = boot({ flagOn: true });
  try {
    openingTelegraph(bus, 'survival-arena-w2');
    assert.equal(spawned.length, 6);
    assert.ok(!spawned.some((r) => r.radius === OPENING_ANCHOR_SIZE
      && Math.hypot(r.pos.x, r.pos.z) < 160), 'no opening monolith past wave 1');

    spawned.length = 0;
    bus.emit('encounter:telegraph', { encounterId: 'enc_plain', pos: { x: 2000, z: 2000 } });
    assert.ok(spawned.length >= 2 && spawned.length <= 3,
      `non-swarm bubbles keep 2-3 rocks, got ${spawned.length}`);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});
