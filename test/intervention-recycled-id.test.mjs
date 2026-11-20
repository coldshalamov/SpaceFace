/**
 * Regression: entity ids recycle through freeIds while entity:destroyed receipts queue.
 * intervention.js resolves records by bare entity id: a wreck or claim-jumper that dies and
 * has its id retaken before the next update must not be adopted — the jumper would steer a
 * foreign hull (data.intent writes) and stripOneUnit would drain a foreign data.salvagePool.
 * Marker stamps (data.interventionId on the wreck, data.interventionJumper on the jumper)
 * are the proof the resolved body still belongs to the record.
 *
 * Drives the real intervention system with the real bus on createGameState(seed), mirroring
 * test/intervention-honest-loss.test.mjs and test/pod-hunt-recycled-id.test.mjs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { intervention } from '../src/systems/intervention.js';

function boot() {
  const state = createGameState(77);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 100;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_a';
  state.world.sectors = {
    sector_a: { id: 'sector_a', name: 'Sector A', security: 0.8 },
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const id = nextId++;
      const entity = {
        id,
        alive: true,
        type: spec.type || 'ship',
        team: spec.team ?? 0,
        factionId: spec.factionId || null,
        pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
        vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
        rot: 0,
        radius: spec.radius || 6,
        mass: spec.mass || 1,
        hull: spec.hull ?? 10,
        hullMax: spec.hullMax ?? 10,
        data: spec.data || {},
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
    },
  };
  const system = Object.create(intervention);
  system.init({ state, bus, helpers });
  return { state, bus, system, player, helpers };
}

function teardown(system, bus) {
  bus.clear();
}

function remove(state, entity) {
  entity.alive = false;
  state.entities.delete(entity.id);
  const at = state.entityList.indexOf(entity);
  if (at >= 0) state.entityList.splice(at, 1);
}

function foreignHullAt(state, id, pos, data = {}) {
  const entity = {
    id, type: 'ship', alive: true, team: 1,
    pos: { x: pos.x, y: 0, z: pos.z }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 10, mass: 10, hull: 60, hullMax: 60, data,
  };
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

test('a recycled wreck id closes the site instead of feeding a foreign pool to the jumper', () => {
  const { state, bus, system } = boot();
  try {
    const closed = [];
    bus.on('intervention:closed', (p) => closed.push(p));
    bus.emit('automation:assetLost', { kind: 'trader', id: 't-r1', value: 560, sectorId: 'sector_a' });
    const rec = system.active()[0];
    const wreck = state.entities.get(rec.wreckEntityId);
    const wreckId = wreck.id;

    // The wreck dies; a new hull takes the id before the next update sweep — carrying a
    // salvage pool the ghost site must never touch.
    remove(state, wreck);
    const foreign = foreignHullAt(state, wreckId, wreck.pos, {
      salvagePool: { cmdty_scrap_metal: 5 },
    });
    // Park the real jumper beside the recycled body: the pre-fix code would strip it.
    const jumper = state.entities.get(rec.jumper.entityId);
    jumper.pos.x = foreign.pos.x + 50;
    jumper.pos.z = foreign.pos.z;

    system.update(1 / 60, state);

    assert.equal(system.active().length, 0, 'site closed once the wreck occupant is gone');
    assert.equal(closed.length, 1);
    assert.equal(closed[0].id, rec.id);
    assert.equal(foreign.data.salvagePool.cmdty_scrap_metal, 5, 'foreign pool never drained');
    assert.equal(foreign.data._salvaged, undefined, 'foreign hull never tagged');
    assert.equal(foreign.data.intent, undefined, 'foreign hull never steered');
  } finally {
    teardown(system, bus);
  }
});

test('a recycled jumper id is gone to the record and is never steered or ripped', () => {
  const { state, bus, system } = boot();
  try {
    bus.emit('automation:assetLost', { kind: 'trader', id: 't-r2', value: 560, sectorId: 'sector_a' });
    const rec = system.active()[0];
    const wreck = state.entities.get(rec.wreckEntityId);
    const poolBefore = Object.values(wreck.data.salvagePool).reduce((s, n) => s + n, 0);
    const oldJumper = state.entities.get(rec.jumper.entityId);
    const jumperId = oldJumper.id;

    // The jumper dies beside the wreck; a fresh hull takes its id.
    remove(state, oldJumper);
    const foreign = foreignHullAt(state, jumperId,
      { x: wreck.pos.x + 50, z: wreck.pos.z });

    system.update(1 / 60, state);
    state.simTime += 3;
    system.update(1 / 60, state);

    assert.equal(rec.jumper.phase, 'gone', 'recycled occupant never inherits the beat');
    assert.equal(foreign.data.intent, undefined, 'no intent written on a foreign hull');
    assert.equal(rec.jumper.stolen, 0, 'ghost jumper never strips');
    const poolAfter = Object.values(wreck.data.salvagePool).reduce((s, n) => s + n, 0);
    assert.equal(poolAfter, poolBefore, 'wreck pool untouched');
  } finally {
    teardown(system, bus);
  }
});
