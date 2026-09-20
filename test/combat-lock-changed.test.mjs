import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { weapons } from '../src/systems/weapons.js';

function boot() {
  const bus = createBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 1,
    player: { targetId: null, tether: { targetId: null } },
    meta: { seed: 17 },
    entities,
    entityList,
    combat: { beams: [], entities: {} },
    input: { fire: false, actions: {} },
  };
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, radius: 8,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
    data: { weapons: [], combat: { targetId: null, lockTarget: null, lockProgress: 0 } },
    flags: {},
  };
  const hunter = {
    id: 2, type: 'ship', team: 1, alive: true, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      weapons: [{ defId: 'wpn_test_lock', tracking: 'homing', lockTimeS: 0.01, _cooldown: 0, _heat: 0 }],
      combat: { targetId: 1, lockTarget: null, lockProgress: 0 },
    },
    flags: {},
  };
  entities.set(1, player);
  entities.set(2, hunter);
  entityList.push(player, hunter);
  const system = Object.create(weapons);
  system.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      getEntity: (id) => entities.get(id) || null,
    },
  });
  return { bus, state, system, hunter };
}

test('incoming missile lock emits combat:lockChanged so jump lock and the HUD alert can fire', () => {
  const { bus, state, system, hunter } = boot();
  const events = [];
  bus.on('combat:lockChanged', (p) => events.push(p));

  for (let i = 0; i < 8; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockProgress >= 1, true, 'lock completes across the 0.05s floor');
  assert.equal(hunter.data.combat.lockTarget, 1);
  assert.equal(events.length, 1, 'lock edge emits once');
  assert.deepEqual(events[0], { locked: true, targetId: 1, shooterId: 2 });

  system.update(1 / 60, state);
  assert.equal(events.length, 1, 'held lock does not re-emit');

  hunter.data.combat.targetId = null;
  hunter.rot = Math.PI;
  for (let i = 0; i < 8; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null);
  assert.equal(events.at(-1)?.locked, false, 'lost lock clears the alert / jump interdiction');
});
