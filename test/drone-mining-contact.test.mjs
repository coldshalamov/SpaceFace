import assert from 'node:assert/strict';
import { test } from 'node:test';
import { automation } from '../src/systems/automation.js';

function fixture() {
  const rock = { id: 20, alive: true, type: 'asteroid', pos: { x: 100, z: 80 }, radius: 24, hull: 100, data: { oreHP: 100, oreHPMax: 100 } };
  const drone = { id: 30, alive: true, type: 'drone', pos: { x: 100, z: 130 }, rot: -Math.PI / 2, data: { groupId: 'group-a' } };
  const events = [];
  const system = Object.assign(Object.create(automation), {
    state: { simTime: 10, entities: new Map([[20, rock], [30, drone]]) },
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  return { system, rock, drone, events };
}

test('drone chips originate on its own rock surface with explicit cutter and target identity', () => {
  const { system, rock, drone, events } = fixture();
  const mined = system._chipAsteroid(rock, { mineRate: 1 }, 0.5, drone);
  assert.equal(mined, 7);
  assert.equal(rock.data.oreHP, 93);
  assert.deepEqual(events[0], {
    name: 'mining:tick',
    payload: { sourceEntityId: 30, targetId: 20, contactPos: { x: 100, z: 104 }, oreType: 'cmdty_ore_iron' },
  });
});

test('remote or destroyed drones cannot fabricate player-origin mining effects', () => {
  const { system, rock, drone, events } = fixture();
  system._chipAsteroid(rock, { mineRate: 1 }, 0.5);
  drone.alive = false;
  system._chipAsteroid(rock, { mineRate: 1 }, 0.5, drone);
  assert.equal(rock.data.oreHP, 86, 'depletion remains authoritative for the operation');
  assert.equal(events.length, 0, 'no visible cutter means no cosmetic contact');
});

test('programmed mining uses the actual group drone and rejects recycled foreign identities', () => {
  const { system, rock, drone, events } = fixture();
  const foreign = { ...drone, id: 31, data: { groupId: 'other-group' }, pos: { x: -500, z: -500 } };
  system.state.entities.set(foreign.id, foreign);
  const group = { id: 'group-a', entityIds: [31, 30], count: 1, fuel: 100, bufferCap: 40 };
  system._programMineIntoCargo(group, { mineRate: 1, fuelRate: 1 }, 0.5, rock);
  assert.equal(events[0].payload.sourceEntityId, drone.id);
  assert.equal(events[0].payload.targetId, rock.id);
  assert.deepEqual(events[0].payload.contactPos, { x: 100, z: 104 });
});
