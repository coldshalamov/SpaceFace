// D50 admission-time overlap guard: a dormant field rock promotes carrying the authored scaled
// collider, so promoting a record whose disc already overlaps a live hull materializes the ball
// inside it — the physics owner's unclamped positional depenetration then yeets the hull (the
// seed-4242 player fling, `wave-a6` `fail_latch`). All promote paths route through
// `promoteAsteroidFieldRock`, so the guard lives there: shallow overlap resolves by spawning at
// the hull's collider skin, a centered or unsolvable one refuses admission and leaves the
// record dormant. Run: node --test test/asteroid-promote-overlap-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { insertAsteroidFieldRock, promoteAsteroidFieldRock, getAsteroidFieldRock } from '../src/world/asteroidField.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';

function boot() {
  const state = createGameState(14920);
  state.mode = 'flight';
  state.simTime = 0;
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: spec.id,
        type: spec.type,
        alive: true,
        pos: { x: spec.pos.x, z: spec.pos.z },
        vel: { x: 0, z: 0 },
        radius: spec.radius,
        mass: spec.mass,
        physicsBody: spec.physicsBody,
        data: spec.data || {},
        activity: {},
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      spawned.push(ent);
      return ent;
    },
  };
  return { state, helpers, spawned, bus };
}

function shipAt(state, id, x, z, radius = 12) {
  const ship = {
    id, type: 'ship', alive: true, team: 1,
    pos: { x, z }, vel: { x: 0, z: 0 }, radius, mass: 60,
    hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(id, ship);
  state.entityList.push(ship);
  return ship;
}

function surfaceGap(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - (a.radius || 0) - (b.radius || 0);
}

test('a clean promote keeps the record position: no hull in reach, nothing shifts', () => {
  const { state, helpers } = boot();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 5000, z: 5000 },
    radius: 14,
    data: { typeId: 'ast_common_rock', oreHP: 80, oreHPMax: 80 },
  });
  shipAt(state, 2, 4000, 4000);
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'npc-mine');
  assert.ok(live, 'the clean record still promotes');
  assert.equal(live.pos.x, rec.pos.x, 'x is the record position, not an offset one');
  assert.equal(live.pos.z, rec.pos.z, 'z is the record position, not an offset one');
  assert.equal(live.physicsBody.radius, asteroidColliderRadius('ast_common_rock', 14));
  assert.equal(getAsteroidFieldRock(state, rec.id), null, 'the record left the dormant field');
});

test('a barge parked inside a gas record disc promotes the ball at the barge skin, not over itself', () => {
  const { state, helpers } = boot();
  // Big gas cloud: record radius 24 -> scaled collider 24 x 1.10 = 26.4, far past the
  // radius-blind dist<40 traffic promote that materialized it at rock CENTER.
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 1000, z: 1000 },
    radius: 24,
    data: { typeId: 'ast_gas_cloud', oreHP: 80, oreHPMax: 80 },
  });
  const barge = shipAt(state, 2, 1016, 1000, 12);
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'npc-mine');
  assert.ok(live, 'the rock still materializes for the miner');
  assert.ok(surfaceGap(live, barge) >= 0, `the spawned ball must not overlap the barge (gap ${surfaceGap(live, barge).toFixed(2)})`);
  assert.equal(barge.pos.x, 1016, 'the barge is never moved by admission');
  assert.equal(live.physicsBody.radius, asteroidColliderRadius('ast_gas_cloud', 24));
});

test('the player hull gets the same protection on a projectile-sweep promote', () => {
  const { state, helpers } = boot();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: -2000, z: 500 },
    radius: 20,
    data: { typeId: 'ast_metallic', oreHP: 80, oreHPMax: 80 },
  });
  const player = shipAt(state, 2, -1985, 500, 8);
  state.playerId = 2;
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'projectile');
  assert.ok(live, 'the shot still materializes the rock');
  assert.ok(surfaceGap(live, player) >= 0, `the spawned ball must not overlap the player (gap ${surfaceGap(live, player).toFixed(2)})`);
});

test('a hull centered on the record refuses admission and the record stays dormant and promotable', () => {
  const { state, helpers } = boot();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 300, z: 300 },
    radius: 14,
    data: { typeId: 'ast_common_rock', oreHP: 80, oreHPMax: 80 },
  });
  const hull = shipAt(state, 2, 300, 300, 8);
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'first-flight-cook');
  assert.equal(live, null, 'no rejection direction: admission is refused, not forced');
  assert.equal(getAsteroidFieldRock(state, rec.id), rec, 'the dormant record is kept for a later, cleaner admit');
  assert.equal(state.entities.get(rec.id), undefined, 'no live body was created under the hull');
  // The hull leaves: the same record promotes cleanly afterwards.
  hull.alive = false;
  const later = promoteAsteroidFieldRock(state, rec.id, helpers, 'npc-mine');
  assert.ok(later, 'the record promotes once the overlap is gone');
  assert.equal(later.pos.x, 300);
});

test('two hulls sandwiching the record refuse admission instead of spawning inside either', () => {
  const { state, helpers } = boot();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 0, z: 0 },
    radius: 30,
    data: { typeId: 'ast_crystalline', oreHP: 80, oreHPMax: 80 },
  });
  // collider 30 x 1.55 = 46.5: hulls at +-25 are each deeper than the skin along their own
  // rejection direction, and resolving one lands inside the other.
  shipAt(state, 2, -25, 0, 8);
  shipAt(state, 3, 25, 0, 8);
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'survival-roster-prewarm');
  assert.equal(live, null, 'an unsolvable overlap refuses admission');
  assert.equal(getAsteroidFieldRock(state, rec.id), rec, 'the record stays dormant');
});

test('an already-live id still passes through without re-spawning', () => {
  const { state, helpers } = boot();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 5000, z: 5000 },
    radius: 14,
    data: { typeId: 'ast_common_rock', oreHP: 80, oreHPMax: 80 },
  });
  const live = promoteAsteroidFieldRock(state, rec.id, helpers, 'mine');
  const again = promoteAsteroidFieldRock(state, rec.id, helpers, 'mine');
  assert.equal(again, live, 'the live entity is returned, not a second spawn');
});
