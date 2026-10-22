// Jettisoned living samples tick a hull they strike. Seed 4242.
// Iron ore stays inert. Fuel cells stay explosive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { volatileClassOf } from '../src/data/commodityVolatileClasses.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE, lootShards } from '../src/systems/lootShards.js';

test('seed 4242: a dumped spore pod eats hull, and ore does not become volatile', () => {
  assert.equal(4242, 4242);
  assert.equal(volatileClassOf('cmdty_spore_catalyst').id, 'corrosive');
  assert.equal(volatileClassOf('cmdty_live_specimen').lamp, 'green');
  assert.equal(volatileClassOf('cmdty_filament_sample').slam, 'hull_tick');
  assert.equal(volatileClassOf('cmdty_ore_iron'), null);
  assert.equal(volatileClassOf('cmdty_gate_handshake'), null);
  assert.equal(volatileClassOf('cmdty_fuel_cells').id, 'explosive');

  const ship = {
    id: 1, type: 'ship', alive: true, hull: 100, hullMax: 100,
    pos: { x: 0, y: 0, z: 0 },
  };
  const pod = {
    id: 9, type: 'payload', alive: true,
    pos: { x: 4, y: 0, z: 0 },
    data: {
      payloadType: JETTISONED_CARGO_PAYLOAD_TYPE,
      commodityId: 'cmdty_spore_catalyst',
      amount: 2,
    },
  };
  const entities = new Map([[1, ship], [9, pod]]);
  const state = {
    simTime: 80,
    tick: 4800,
    meta: { seed: 4242 },
    entities,
    entityList: [ship, pod],
  };
  const heard = [];
  const bus = createBus();
  bus.on('cargo:volatileCorrosive', (payload) => heard.push(payload));
  const system = Object.create(lootShards);
  system.state = state;
  system.bus = bus;
  system.helpers = {
    routeCombatDamage({ targetId }) {
      const target = entities.get(targetId);
      target.hull -= 12;
      return { applied: 12 };
    },
  };
  system._onVolatileImpact({ aId: 9, bId: 1, pos: { x: 2, z: 0 }, dp: 40 });
  assert.equal(heard.length, 1);
  assert.equal(heard[0].class, 'corrosive');
  assert.equal(heard[0].podId, 9);
  assert.equal(heard[0].targetId, 1);
  assert.equal(heard[0].hullTick, 12);
  assert.equal(ship.hull, 88);

  system._onVolatileImpact({ aId: 9, bId: 1, pos: { x: 2, z: 0 }, dp: 40 });
  assert.equal(heard.length, 1, 'the same contact does not tick twice inside the cooldown');
  assert.equal(ship.hull, 88);
});
