import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { physics, shouldMaintainDynamicSpatialHash } from '../src/core/physics.js';

// FB-088 — the dynamic spatial hash must only resync when a dynamic body's cell coverage
// actually changed. Harness mirrors the quiet-clock suite: a bare game state, core prelude
// for index/journal maintenance, then the physics authority tick.

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  // The legacy path runs integrate() in-process, which exercises the gate without the
  // async Rapier owner (the gate sits in front of both backend paths).
  state.settings.gameplay.physicsBackend = 'custom';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  core._publishPresentation = () => {};
  physics.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
  });
  player.ttl = Infinity;
  state.playerId = player.id;
  if (state.entityIndex) state.entityIndex.ready = true;
  return { state, bus, helpers, player };
}

function spawn(ctx, spec) {
  const e = ctx.helpers.spawnEntity({
    ttl: Infinity,
    ...spec,
  });
  return e;
}

function step(ctx, dt = 1 / 60) {
  core.preStep(dt, ctx.state);
  physics.update(dt, ctx.state);
}

function dynamicSyncs(state) {
  return state.spatialHash.diagnostics.dynamicRebuilds;
}

function neighbourIds(hash, x, z, r) {
  return hash.queryRadius(x, z, r, [])
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

test('idle sector: rebuild count stays under 5% of ticks over 600 ticks', () => {
  const ctx = boot(4242);
  // Two drifting rocks (the packet's idle Helios example) — they move every tick but
  // only cross a cell boundary rarely.
  spawn(ctx, { type: 'asteroid', pos: { x: 200, z: 0 }, vel: { x: 0.4, z: 0 }, radius: 4, mass: 5, collides: true });
  spawn(ctx, { type: 'asteroid', pos: { x: -300, z: 150 }, vel: { x: 0, z: -0.25 }, radius: 5, mass: 5, collides: true });
  spawn(ctx, { type: 'station', pos: { x: 800, z: 800 }, vel: { x: 0, z: 0 }, radius: 40, mass: 0, collides: true });
  for (let i = 0; i < 20; i++) step(ctx); // settle: first syncs record gate state
  const base = dynamicSyncs(ctx.state);
  for (let i = 0; i < 600; i++) step(ctx);
  const rebuilds = dynamicSyncs(ctx.state) - base;
  assert.ok(
    rebuilds <= 600 * 0.05,
    `expected ≤30 dynamic syncs on an idle field, got ${rebuilds}`,
  );
  assert.ok(ctx.state.spatialHash.diagnostics.gateSkips > 500,
    'gate should have skipped the overwhelming majority of idle ticks');
});

test('a body crossing a cell forces a resync on the next physics tick', () => {
  const ctx = boot(4242);
  const rock = spawn(ctx, {
    type: 'asteroid', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 4, mass: 5, collides: true,
  });
  for (let i = 0; i < 10; i++) step(ctx);
  const base = dynamicSyncs(ctx.state);
  // Parked: gate should hold for several ticks in a row.
  for (let i = 0; i < 10; i++) step(ctx);
  const parkedSyncs = dynamicSyncs(ctx.state) - base;
  assert.ok(parkedSyncs <= 2, `parked field should not resync, got ${parkedSyncs} in 10 ticks`);

  // Silent pose write that dodges the dirty journal entirely — the coverage mix must
  // still catch the crossing on the very next physics tick.
  rock.pos.x += 200;
  const before = dynamicSyncs(ctx.state);
  step(ctx);
  assert.ok(dynamicSyncs(ctx.state) > before, 'crossing a cell must force a resync');

  // And neighbours must reflect the new position (never stale after the rebuild tick).
  const nearNew = neighbourIds(ctx.state.spatialHash, rock.pos.x, rock.pos.z, 20);
  assert.ok(nearNew.includes(rock.id), 'moved body must query at its new cell');
});

test('spawn and despawn both force a resync', () => {
  const ctx = boot(4242);
  for (let i = 0; i < 5; i++) step(ctx);
  const base = dynamicSyncs(ctx.state);
  const drifter = spawn(ctx, {
    type: 'pickup', pos: { x: 500, z: 500 }, vel: { x: 0, z: 0 }, radius: 2, mass: 1, collides: true,
  });
  step(ctx);
  assert.ok(dynamicSyncs(ctx.state) > base, 'spawn must force a resync');
  const afterSpawn = dynamicSyncs(ctx.state);
  ctx.helpers.removeEntity(drifter.id, { immediate: true });
  step(ctx);
  assert.ok(dynamicSyncs(ctx.state) > afterSpawn, 'despawn must force a resync');
  const near = neighbourIds(ctx.state.spatialHash, 500, 500, 10);
  assert.ok(!near.includes(drifter.id), 'despawned body must not remain a neighbour');
});

test('gate stays fail-open without a hash or index authority', () => {
  assert.equal(shouldMaintainDynamicSpatialHash({}), true);
  assert.equal(shouldMaintainDynamicSpatialHash({
    entityIndex: { __spacefaceEntityIndexV1: true, collidables: [1, 2], asteroids: [] },
  }), true);
});

test('300-tick combat scene: gated and ungated produce byte-identical neighbours', () => {
  const run = (gated) => {
    const ctx = boot(4242);
    const movers = [];
    for (let i = 0; i < 6; i++) {
      movers.push(spawn(ctx, {
        type: 'ship', pos: { x: 100 + i * 30, z: -80 }, vel: { x: 6 + i, z: 2 - i },
        radius: 6, mass: 10, hull: 50, hullMax: 50, collides: true, team: 2,
      }));
    }
    const shots = [];
    const snapshots = [];
    for (let i = 0; i < 300; i++) {
      // Scripted spawn/despawn churn mid-scene.
      if (i === 80 || i === 160) {
        shots.push(spawn(ctx, {
          type: 'projectile', pos: { x: 50, z: 50 }, vel: { x: 30, z: 0 },
          radius: 1, mass: 1, collides: true,
        }));
      }
      if (i === 200 && shots.length) {
        ctx.helpers.removeEntity(shots[0].id, { immediate: true });
      }
      step(ctx);
      if (!gated) {
        // Ungated twin: force the resync every tick, exactly the pre-gate behaviour.
        ctx.state.spatialHash.rebuildLayers && physics._rebuildSpatialHash(ctx.state);
      }
      snapshots.push(neighbourIds(ctx.state.spatialHash, 0, 0, 400).join(','));
    }
    return snapshots;
  };
  const gated = run(true);
  const ungated = run(false);
  assert.equal(gated.length, ungated.length);
  for (let i = 0; i < gated.length; i++) {
    assert.equal(gated[i], ungated[i], `neighbour sets diverged at tick ${i}`);
  }
});
