import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { clearRecycledEntityPointers } from '../src/core/coreSystem.js';
import { allocateEntityId } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import { mining as miningBase } from '../src/systems/mining.js';

// Entity ids recycle: when a locked rock dies, core's lifetimeSweep removes the corpse and hands
// its id back to the allocator; the next spawn (a fracture chunk, a wreck, a traffic hull) can
// inherit the same number. clearRecycledEntityPointers nulls state.player.miningTargetId on that
// recycle, but it cannot reach the mining system's private _lockTargetId — so a held beam used to
// resolve the stale id to the NEW occupant and keep firing on a body the player never aimed at:
// one silent tick of extraction for a same-verb rock, or a wholesale lock transfer (fresh
// mining:start, player.miningTargetId re-pointed) when the new occupant resolves a different verb.
//
// These tests drive the live update() route on seed 4242: lock a rock, run the real sweep, recycle
// the id into a second body, and prove the beam dies with the lock instead of hopping bodies.

const SEED = 4242;

function bootLock() {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };
  const asteroid = {
    id: 42,
    type: 'asteroid',
    alive: true,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 400,
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_common_rock', oreHP: 140, oreHPMax: 140, commodityId: 'cmdty_silicate' },
  };
  const state = {
    mode: 'flight',
    playerId: player.id,
    simTime: 0,
    tick: 0,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    player: {
      credits: 100,
      cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 },
    },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
    entityList: [player, asteroid],
    freeIds: [],
    nextEntityId: 100,
    world: { currentSectorId: 'sector_test' },
  };
  const bus = createBus();
  const events = { start: [], stop: [], tick: [] };
  bus.on('mining:start', (p) => events.start.push(p));
  bus.on('mining:stop', (p) => events.stop.push(p));
  bus.on('mining:tick', (p) => events.tick.push(p));
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        alive: true,
        ...spec,
        id: spec && spec.id != null ? spec.id : allocateEntityId(state),
        data: spec.data || {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, player, asteroid, events };
}

function tickHeld(state, mining, n = 1) {
  for (let i = 0; i < n; i++) {
    state.input.fireGroup = 2;
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
  }
}

// Mirror coreSystem._removeEntityAtIndex's recycle path: dead entity leaves the map and the list,
// its pointers are swept, and the id goes back to the free pool for the next spawn.
function sweepAndRecycle(state, dead) {
  dead.alive = false;
  state.entities.delete(dead.id);
  const i = state.entityList.indexOf(dead);
  if (i >= 0) state.entityList.splice(i, 1);
  clearRecycledEntityPointers(state, dead.id);
  state.freeIds.push(dead.id);
}

test('a beam lock dies with its rock when the rock id recycles into a second asteroid', () => {
  const { state, bus, mining, player, asteroid, events } = bootLock();
  try {
    tickHeld(state, mining);
    assert.equal(mining._lockTargetId, asteroid.id, 'the held beam locks the aimed rock');
    assert.equal(state.player.miningTargetId, asteroid.id);
    assert.equal(events.start.length, 1);

    sweepAndRecycle(state, asteroid);
    assert.equal(state.player.miningTargetId, null, 'the id sweep clears the player pointer');
    assert.equal(mining._lockTargetId, asteroid.id,
      'the private lock still holds the dead id until the next mining tick (the window under test)');

    // The allocator hands the dead rock's id to the next spawn — here a fresh rock on the same line.
    const recycledId = allocateEntityId(state);
    assert.equal(recycledId, asteroid.id, 'the recycled id is the same number the lock still holds');
    const replacement = {
      id: recycledId,
      type: 'asteroid',
      alive: true,
      pos: { x: 60, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 8,
      mass: 400,
      hull: 140,
      hullMax: 140,
      data: { typeId: 'ast_common_rock', oreHP: 140, oreHPMax: 140, commodityId: 'cmdty_silicate' },
    };
    state.entities.set(replacement.id, replacement);
    state.entityList.push(replacement);

    tickHeld(state, mining);

    assert.equal(replacement.data.oreHP, replacement.data.oreHPMax,
      'the new occupant of the recycled id must not take beam damage from a lock it never took');
    assert.equal(events.stop.length, 1, 'the dead lock ends the beam instead of retargeting silently');
    assert.equal(events.start.length, 1, 'no fresh mining:start may fire for a body the sweep produced');
    assert.equal(mining._lockTargetId, null, 'the stale private lock is released');
    assert.equal(state.player.miningTargetId, null);
  } finally {
    bus.clear();
  }
});

test('a beam lock cannot re-acquire a different-verb body that inherits the dead rock id', () => {
  const { state, bus, mining, player, asteroid, events } = bootLock();
  try {
    tickHeld(state, mining);
    assert.equal(mining._lockTargetId, asteroid.id);
    assert.equal(mining._activeVerb, 'extract');
    assert.equal(events.start.length, 1);

    sweepAndRecycle(state, asteroid);
    assert.equal(state.player.miningTargetId, null);

    // Recycle the id into a limping friendly hull — a weldable beam target whose verb ('repair')
    // differs from the rock's 'extract', so the old lock-and-verb gate re-fires _setLockTargetId.
    const recycledId = allocateEntityId(state);
    const casualty = {
      id: recycledId,
      type: 'ship',
      alive: true,
      team: 0,
      pos: { x: 60, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 8,
      hull: 50,
      hullMax: 100,
      flags: {},
      data: {},
    };
    state.entities.set(casualty.id, casualty);
    state.entityList.push(casualty);

    tickHeld(state, mining);

    assert.equal(casualty.hull, 50,
      'the casualty must not be welded by a beam the player pointed at a dead rock');
    assert.equal(events.start.length, 1,
      'no mining:start may announce a lock the player never took');
    assert.equal(events.stop.length, 1, 'the dead lock ends the beam');
    assert.equal(mining._lockTargetId, null);
    assert.equal(state.player.miningTargetId, null,
      'the player pointer must stay swept — never re-pointed at the recycled body');
  } finally {
    bus.clear();
  }
});
