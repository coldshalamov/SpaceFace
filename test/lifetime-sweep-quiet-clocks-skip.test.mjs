import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  core,
  setLifetimeSweepQuietClocksSkipForBench,
  getLifetimeSweepQuietClocksSkipForBench,
} from '../src/core/coreSystem.js';
import { beginDirtyTick, markDirty, DIRTY } from '../src/core/dirtyJournal.js';

function bootQuiet() {
  const state = createGameState(901);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  core._publishPresentation = () => {};
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.ttl = Infinity;
  for (let i = 0; i < 8; i++) {
    const e = helpers.spawnEntity({
      type: 'ship', pos: { x: 100 + i * 10, z: 40 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 2,
    });
    e.physicsSleeping = true;
    e.ttl = Infinity;
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  return { state, helpers, player, bus };
}

test('quiet clocks skip defaults ON for production bench flag', () => {
  assert.equal(getLifetimeSweepQuietClocksSkipForBench(), true);
});

test('quiet Ceres Infinity-ttl movers skip clocks walk without dropping corpses', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state } = bootQuiet();
  for (let i = 0; i < 12; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const alive = [...state.entities.values()].filter((e) => e.alive);
  assert.ok(alive.length >= 9, `expected quiet fleet still alive, got ${alive.length}`);
});

test('projectile TTL still expires when short-lived lane is non-empty (dirty-wake)', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state, helpers } = bootQuiet();
  for (let i = 0; i < 6; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const proj = helpers.spawnEntity({
    type: 'projectile', pos: { x: 2, z: 0 }, vel: { x: 80, z: 0 },
    radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
  });
  proj.ttl = 0.2;
  for (let i = 0; i < 30; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(proj.id);
  assert.ok(!still || still.alive === false, 'projectile must expire via clocks path');
});

test('shipLike despawnAt fail-open restores clocks path', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state } = bootQuiet();
  for (let i = 0; i < 4; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const npc = [...state.entities.values()].find((e) => e.type === 'ship' && e.id !== state.playerId);
  assert.ok(npc);
  npc.data = npc.data || {};
  npc.data.despawnAt = state.simTime + 0.05;
  for (let i = 0; i < 20; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(npc.id);
  assert.ok(!still || still.alive === false, 'despawnAt ship must expire');
});

test('bench flag OFF restores always-walk clocks (projectile TTL still works)', () => {
  setLifetimeSweepQuietClocksSkipForBench(false);
  const { state, helpers } = bootQuiet();
  const proj = helpers.spawnEntity({
    type: 'projectile', pos: { x: 3, z: 0 }, vel: { x: 50, z: 0 },
    radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
  });
  proj.ttl = 0.15;
  for (let i = 0; i < 30; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(proj.id);
  assert.ok(!still || still.alive === false);
  setLifetimeSweepQuietClocksSkipForBench(true);
});

// C8 — finite-deadline dynamic wrecks and loose asteroids ride the same clocks walk. Quiet
// indexed state with only those deadlines must expire them on the identical ticks as the
// always-walk path, with or without an unrelated projectile waking the lanes.
function runTimedScene({ quietSkip, withProjectile }) {
  setLifetimeSweepQuietClocksSkipForBench(quietSkip);
  const { state, helpers, bus } = bootQuiet();
  const destroyedCounts = new Map();
  bus.on('entity:destroyed', ({ id }) => {
    destroyedCounts.set(id, (destroyedCounts.get(id) || 0) + 1);
  });
  const wreck = helpers.spawnEntity({
    type: 'wreck', pos: { x: 60, z: -20 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 8, hull: 1, hullMax: 1, collides: true,
  });
  wreck.ttl = 0.4;
  const rock = helpers.spawnEntity({
    type: 'asteroid', pos: { x: -45, z: 25 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 20, hull: 40, hullMax: 40, collides: true,
  });
  rock.ttl = 0.55;
  if (withProjectile) {
    const proj = helpers.spawnEntity({
      type: 'projectile', pos: { x: 2, z: 0 }, vel: { x: 80, z: 0 },
      radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
    });
    proj.ttl = 0.15;
  }
  const deathTicks = new Map([[wreck.id, null], [rock.id, null]]);
  const dt = 1 / 60;
  for (let i = 0; i < 90; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += dt;
    core.preStep(dt, state);
    core.lifetimeSweep(dt, state);
    if (deathTicks.get(wreck.id) == null && !state.entities.has(wreck.id)) deathTicks.set(wreck.id, i);
    if (deathTicks.get(rock.id) == null && !state.entities.has(rock.id)) deathTicks.set(rock.id, i);
  }
  const index = state.entityIndex;
  return {
    wreck, rock, deathTicks, destroyedCounts, index,
    entityListClean: [...state.entityList].every((e) => e && e.alive),
  };
}

test('a timed wreck and loose asteroid expire on identical ticks — skip on/off, projectile or not', () => {
  const [on, off, onWake, offWake] = [
    runTimedScene({ quietSkip: true, withProjectile: false }),
    runTimedScene({ quietSkip: false, withProjectile: false }),
    runTimedScene({ quietSkip: true, withProjectile: true }),
    runTimedScene({ quietSkip: false, withProjectile: true }),
  ];
  for (const run of [on, off, onWake, offWake]) {
    assert.notEqual(run.deathTicks.get(run.wreck.id), null, 'timed wreck must expire');
    assert.notEqual(run.deathTicks.get(run.rock.id), null, 'timed loose asteroid must expire');
    assert.equal(run.destroyedCounts.get(run.wreck.id), 1, 'wreck destroyed exactly once');
    assert.equal(run.destroyedCounts.get(run.rock.id), 1, 'asteroid destroyed exactly once');
    assert.equal(run.entityListClean, true, 'no corpses left behind in entityList');
    assert.ok(run.index.wrecks.every((e) => e !== run.wreck), 'wreck lane vacated');
    assert.ok(run.index.asteroids.every((e) => e !== run.rock), 'asteroid lane vacated');
  }
  assert.equal(on.deathTicks.get(on.wreck.id), off.deathTicks.get(off.wreck.id), 'wreck tick: skip on === off');
  assert.equal(on.deathTicks.get(on.rock.id), off.deathTicks.get(off.rock.id), 'asteroid tick: skip on === off');
  assert.equal(on.deathTicks.get(on.wreck.id), onWake.deathTicks.get(onWake.wreck.id), 'wreck tick: quiet === dirty-wake');
  assert.equal(on.deathTicks.get(on.rock.id), onWake.deathTicks.get(onWake.rock.id), 'asteroid tick: quiet === dirty-wake');
  assert.equal(off.deathTicks.get(off.wreck.id), offWake.deathTicks.get(offWake.wreck.id), 'wreck tick: walk === walk+projectile');
  assert.equal(off.deathTicks.get(off.rock.id), offWake.deathTicks.get(offWake.rock.id), 'asteroid tick: walk === walk+projectile');
  setLifetimeSweepQuietClocksSkipForBench(true);
});

test('a despawnAt deadline on a wreck also fails the quiet skip open', () => {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state, helpers } = bootQuiet();
  for (let i = 0; i < 4; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const wreck = helpers.spawnEntity({
    type: 'wreck', pos: { x: 30, z: 30 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 8, hull: 1, hullMax: 1, collides: true,
  });
  wreck.ttl = Infinity;
  wreck.data = wreck.data || {};
  wreck.data.despawnAt = state.simTime + 0.1;
  for (let i = 0; i < 20; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  assert.ok(!state.entities.has(wreck.id), 'despawnAt wreck must expire without a wake');
  setLifetimeSweepQuietClocksSkipForBench(true);
});

test('genuinely idle scenes keep the fast path: deadline-free wreck/asteroid do not admit', () => {
  function idleProbe(skip) {
    setLifetimeSweepQuietClocksSkipForBench(skip);
    const { state, helpers } = bootQuiet();
    helpers.spawnEntity({
      type: 'wreck', pos: { x: 70, z: 10 }, vel: { x: 0, z: 0 },
      radius: 6, mass: 8, hull: 1, hullMax: 1, collides: true,
    });
    helpers.spawnEntity({
      type: 'asteroid', pos: { x: -70, z: 30 }, vel: { x: 0, z: 0 },
      radius: 5, mass: 20, hull: 40, hullMax: 40, collides: true,
    });
    // Fauna is movable but outside every short-lived lane and outside the C8 wreck/asteroid
    // admission — its finite ttl only runs when the clocks walk is live, making it the
    // behavioral probe of whether the quiet skip engaged.
    const fauna = helpers.spawnEntity({
      type: 'fauna', pos: { x: 10, z: 60 }, vel: { x: 0, z: 0 },
      radius: 3, mass: 2, hull: 5, hullMax: 5, collides: false,
    });
    fauna.ttl = 0.2;
    for (let i = 0; i < 30; i++) {
      beginDirtyTick(state, state.tick++);
      state.simTime += 1 / 60;
      core.preStep(1 / 60, state);
      core.lifetimeSweep(1 / 60, state);
    }
    return state.entities.get(fauna.id);
  }
  const quiet = idleProbe(true);
  assert.ok(quiet && quiet.alive, 'idle scene keeps the quiet fast path');
  const walked = idleProbe(false);
  assert.ok(!walked || walked.alive === false, 'flag OFF still walks clocks');
  setLifetimeSweepQuietClocksSkipForBench(true);
});
