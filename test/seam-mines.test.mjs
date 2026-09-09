import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MINE_ARM_DELAY_S, MINE_OWNER_CAP, MINE_TYPE, mines } from '../src/systems/mines.js';

function bootMines() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const owner = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
  };
  const victim = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 20, z: 0 }, hull: 80, hullMax: 80,
  };
  state.entities.set(1, owner);
  state.entities.set(2, victim);
  state.entityList = [owner, victim];
  const bus = createBus();
  const routed = [];
  const placed = [];
  const triggered = [];
  bus.on('mines:placed', (p) => placed.push(p));
  bus.on('mines:triggered', (p) => triggered.push(p));
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: spec.hull, hullMax: spec.hullMax, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { routed.push(req); return { ok: true }; },
  };
  const system = Object.create(mines);
  system.init({ state, bus, helpers });
  return { state, bus, system, routed, placed, triggered, victim };
}

test('a placed mine arms on sim time then blasts a nearby hostile through combat damage', () => {
  const { state, bus, system, routed, placed, triggered, victim } = bootMines();
  try {
    const mine = system.placeMine({
      ownerId: 1,
      pos: { x: 18, z: 0 },
      team: 0,
      armDelayS: MINE_ARM_DELAY_S,
    });
    assert.ok(mine);
    assert.equal(mine.type, MINE_TYPE);
    assert.equal(mine.data.armed, false);
    assert.equal(placed.length, 1);

    state.simTime = MINE_ARM_DELAY_S - 0.1;
    system.update(1 / 60, state);
    assert.equal(mine.data.armed, false);
    assert.equal(triggered.length, 0);

    state.simTime = MINE_ARM_DELAY_S;
    system.update(1 / 60, state);
    assert.equal(mine.data.armed, true);
    assert.equal(triggered.length, 1);
    assert.equal(triggered[0].targetId, victim.id);
    assert.equal(routed.length, 1);
    assert.equal(routed[0].targetId, victim.id);
    assert.equal(routed[0].origin.kind, 'mine');
    assert.equal(mine.alive, false);
  } finally {
    bus.clear();
  }
});

test('an owner cannot exceed the live mine cap', () => {
  const { state, bus, system } = bootMines();
  try {
    let last = null;
    for (let i = 0; i < MINE_OWNER_CAP; i++) {
      last = system.placeMine({ ownerId: 1, pos: { x: i * 10, z: 40 }, team: 0, telegraph: false });
      assert.ok(last);
    }
    const overflow = system.placeMine({ ownerId: 1, pos: { x: 99, z: 40 }, team: 0, telegraph: false });
    assert.equal(overflow, null);
  } finally {
    bus.clear();
  }
});
